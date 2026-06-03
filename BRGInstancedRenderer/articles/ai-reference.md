# AI Reference

---

<button id="copy-ai-docs" class="copy-ai-docs-btn" onclick="copyAIDocs(this)">Copy contents to clipboard</button>

<script>
function copyAIDocs(btn) {
  fetch('ai-reference.md')
    .then(r => { if (!r.ok) throw new Error('HTTP ' + r.status); return r.text(); })
    .then(t => navigator.clipboard.writeText(t))
    .then(() => {
      const original = btn.textContent;
      btn.textContent = 'Copied!';
      btn.disabled = true;
      setTimeout(() => { btn.textContent = original; btn.disabled = false; }, 1500);
    })
    .catch(err => {
      btn.textContent = 'Copy failed';
      setTimeout(() => { btn.textContent = 'Copy contents to clipboard'; }, 1500);
      console.error('AI docs copy failed:', err);
    });
}
</script>

A condensed router for AI tools working with BRG Instanced Renderer. The package singleton is `BRGRenderer` (accessed via `BRGRenderer.Instance`). There are two entry points for registering instances: subclass `BRGRegisterer` (MonoBehaviour) or use `BRGRegistrationTracker` directly (non-MonoBehaviour). This doc points you at authoritative source and docs rather than duplicating them — read the linked files for full detail.

## Where to look

All paths below are inside the BRGInstancedRenderer package folder in the Unity project.

| What you need | Read |
|---------------|------|
| Tracker API + struct shapes (`InstanceData`, `InstanceLink`, `ChunkLink`, `RenderSignature`) | `Runtime/Scripts/Registerers/BRGRegistrationTracker.cs` (its MonoBehaviour wrapper lives in `Runtime/Scripts/Registerers/BRGRegisterer.cs`) |
| MonoBehaviour subclass API + protected forwarders | `Runtime/Scripts/Registerers/BRGRegisterer.cs` |
| Singleton (`BRGRenderer`) full API | `Runtime/Scripts/Core/BRGInstancedRenderer.cs` + partials (`.Batches.cs`, `.Chunks.cs`, `.Culling.cs`, `.Debug.cs`, `.HZB.cs`, `.Prototypes.cs`, `.SpeedTree.cs`, `.Upload.cs`) |
| Working custom-registerer example (uses `Stage*` patterns) | `Examples/Scripts/BRGRegistererExample.cs` |
| Per-instance color via `InstanceLink` on a real terrain (uses `GetInstanceLink` + `*Unsafe`) | `Examples/Scripts/TreeRandomColor.cs` |
| Reference terrain implementation | `Runtime/Scripts/Registerers/Terrain/TerrainBRGRegisterer.cs` + `.Trees.cs` / `.Details.cs` / `.Details.Extraction.cs` partials |
| Reference GameObject-group implementation | `Runtime/Scripts/Registerers/GameObjects/BRGGameObjectGroup.cs` |
| Config schema (every serialized field + tooltips) | `Runtime/Scripts/Config/BRGInstancedRendererConfig.cs` |
| Per-prototype shadow / LOD / density overrides | `Runtime/Scripts/Config/BRGPrototypeExtraData.cs` |
| Unity 6.2+ Mesh LOD setup | `Runtime/Scripts/Config/BRGMeshLodData.cs` |
| Per-camera LOD bias and crossfade snap | `Runtime/Scripts/Config/BRGCameraSettings.cs` |
| Terrain detail prototype override | `Runtime/Scripts/Registerers/Terrain/BRGTerrainDetailOverride.cs` |

## Non-obvious concepts

These are not visible from reading any single file. State them explicitly to avoid generating wrong code.

- The singleton class is `BRGRenderer`, not `BRGInstancedRenderer`. Access it via `BRGRenderer.Instance`.
- A **chunk** holds a mix of any number of render signatures. Chunks are not per-signature.
- A **pool** also holds a mix of any number of render signatures. Pools are fixed-size GPU memory blocks of **64 instance slots each** (hard-coded — not configurable).
- A **prototype index** is the global handle returned by `RegisterRenderSignature*`. A **`RenderSignature`** is the full data (asset + render config). These are different things.
- Instances spatially overlapping with a chunk don't have to belong to it. Each instance belongs to exactly one chunk, but multiple chunks can spatially overlap.
- Spatially large chunks are fine. Chunk culling is an optimization, not a requirement — culling a few extra instances that survive chunk-level culling is cheap on the GPU.
- `InstanceLink` is a **passive handle** (just `ChunkId` + `GlobalBRGSlotIndex`). All per-instance mutation lives on the tracker/registerer via `Stage*` or `*Unsafe` methods — there are no methods directly on `InstanceLink`.
- `ChunkLink` carries an ABA-safe **generation counter**. Use `ChunkLink.IsAlive` (not just `IsValid`) before operating on a stored link.
- **Overflow chunks** are allocated automatically when `WriteChunk` or `AddInstance` exceeds `MaxInstancesPerChunk`. They share the primary's culling bounds. `GetInstanceLink`, `GetTotalChunkInstanceCount`, `ReleaseChunk`, and the `ChunkWritten` event all span primary + overflows transparently.
- The **`ChunkWritten`** event fires once per primary chunk after the primary AND all its overflow sub-chunks have completed their GPU writes. Use it to safely call `GetInstanceLink` after `WriteChunk`.
- `WriteChunk` is a one-shot bulk write. For runtime instance mutation use `AddInstance` / `Stage*` / `*Unsafe`.
- `BRGRegistrationTracker` is the non-MonoBehaviour entry point — wire `InitializeCallback` / `ShutdownCallback` for setup/teardown logic instead of subclassing.

## Using InstanceLinks

An `InstanceLink` is the handle you pass to every per-instance modification call. It's just `ChunkId` + `GlobalBRGSlotIndex` — no methods on it directly.

**How to obtain one:**
- Returned by `AddInstance(chunk, instanceData)` and `AddInstances(chunk, array, count)` when you grow a chunk one or many instances at a time.
- Returned by `MoveInstanceToChunk(source, dest, instanceData)` when moving between chunks.
- Looked up by logical index via `GetInstanceLink(chunkLink, localIndex)` — where `localIndex` is `0..GetTotalChunkInstanceCount(chunkLink) - 1` and spans primary + overflow chunks transparently. Use this for chunks populated by `WriteChunk` (not `AddInstance`), or any time you need the link for the Nth instance in a chunk.

**How to use one:** pass to any `Stage*` or `*Unsafe` method on the tracker (or, inside a registerer subclass, on `this`). Examples: `tracker.StageColor(link, color)`, `tracker.SetPositionUnsafe(link, pos)`, `tracker.StageRemove(link)`.

**Timing:** `WriteChunk` does not necessarily complete its GPU upload on the same frame — the write can be deferred (e.g. for a buffer resize). Do **not** call `GetInstanceLink` immediately after `WriteChunk` and assume the link is valid; the slot indices aren't guaranteed to exist yet. Instead, grab links from **inside the `ChunkWritten` event handler** (or `OnChunkWritten(int chunkId)` override in a subclass), which fires once per primary chunk after primary + all overflow sub-chunks have finished writing. That's the only path that's guaranteed safe. If you really need a link before the callback fires, check `link.IsValid` before using it.

**Two reference patterns:**
- `Examples/Scripts/BRGRegistererExample.cs` — stores `InstanceLink`s in a list as instances are added (`AddInstance` return value) and modifies them later with `Stage*` calls for batch updates.
- `Examples/Scripts/TreeRandomColor.cs` — sits next to a `TerrainBRGRegisterer`, subscribes to `OnTreeChunkWritten`, then uses `Registration.GetInstanceLink(chunk, i)` + `Registration.SetColorUnsafe(link, color)` to apply a one-shot random color per tree.

## Stage* vs *Unsafe

There are two paths for modifying existing instances:

- **`Stage*`** — keeps a per-slot dictionary on the tracker. Repeated writes to the same slot (or to different fields of the same slot) are merged into a single entry, then bulk-uploaded to `BRGRenderer` when the tracker flushes each frame. Use this if your code might touch the same slot more than once per frame — dedup is handled for you.
- **`*Unsafe`** — bypasses the tracker and forwards each call directly to `BRGRenderer`. You must guarantee at most one write per slot per frame yourself. Two `*Unsafe` calls on the same slot in the same frame, or mixing `Stage*` and `*Unsafe` on the same slot, both produce undefined results.

Default to `Stage*`. Only reach for `*Unsafe` in code paths where you've already deduplicated writes per slot.

## Public API surface

**Names only — do NOT infer signatures from names.** Before calling any method, open the source file (see *Where to look*) and read its actual signature. Common pitfalls: `AllocChunk()` takes no arguments (bounds go in `WriteChunk`, not `AllocChunk`); `WriteChunk(link, instances, bounds, cullDistance, instanceCullDistance)` takes a `ChunkLink` and a `NativeArray<InstanceData>`, not a chunk id and a managed array; the `InstanceData` field is `signatureIndex` (not `prototypeIndex`).

**`BRGRenderer`** (singleton, via `BRGRenderer.Instance`)
- Lifecycle: `Instance`, `HasInstance`, `IsInitialized`, `Dispose`, `Shutdown`, `Reinitialize`, `RuntimeRefresh`
- Registration: `RegisterRenderSignatureFromPrefab`, `RegisterRenderSignaturesFromPrefab`, `RegisterRenderSignature`, `UnregisterRenderSignature`, `PurgeUnusedPrototypes`, `GetPrototype`, `GetPrototypeRefCount`, `GetPrototypeInstanceCount`
- Chunks: `AllocateChunk`, `WriteChunk`, `FreeChunk`, `IsChunkValid`, `GetChunkGeneration`, `GetChunkInstanceCount`, `GetChunkBounds`, `GetChunkPoolCount`, `GetChunkPoolIndex`, `GetPoolOccupancy`, `RecalculateChunkBounds`, `SetChunkEnabled`, `GetChunkEnabled`
- Direct instance modification: `SetInstancePosition`, `SetInstanceRotation`, `SetInstanceScale`, `MoveAndRotateInstance`, `MoveInstance`, `SetInstanceColor`, `SetInstanceEnabled`, `IsInstanceEnabled`, `SampleInstanceLightProbe`, `AddInstance`, `AppendInstances`, `RemoveInstance`
- Buffer / memory: `CompactBuffers`, `ShiftInstances`, `FlushStagedUploads`, `GetMemoryBreakdown`, `AllocatedBufferMemory`
- Crossfade / density / probes: `SnapAllCrossfadeStates`, `SnapCrossfadeState`, `CrossfadeTimeScale`, `SetGlobalDensity`, `ResampleAllLightProbes`

**`BRGRegistrationTracker`** (non-MonoBehaviour entry point)
- Lifecycle: `Initialize`, `Shutdown`, `InitializeCallback`, `ShutdownCallback`, `BRGSystem`, `IsRegistered`, `Name`
- Events: `ChunkWritten`
- Registration: `ExtractRenderSignature`, `RegisterRenderSignatureFromPrefab`, `RegisterRenderSignaturesFromPrefab`, `RegisterRenderSignature`, `UnregisterRenderSignature`
- Chunks: `MaxInstancesPerChunk`, `AllocChunk`, `WriteChunk`, `ReleaseChunk`, `RecalculateChunkBounds`, `SetChunkEnabled`, `GetChunkEnabled`, `SetRenderEnabled`
- Instance lifecycle: `AddInstance`, `AddInstances`, `MoveInstanceToChunk`
- Lookups: `GetInstanceLink`, `GetTotalChunkInstanceCount`, `GetOverflowChunkCount`, `GetPerChunkInstanceCounts`
- Staged writes: `StagePosition`, `StageRotation`, `StageScale`, `StageMoveAndRotate`, `StageMove`, `StageColor`, `StageSetEnabled`, `StageRemove`
- Unsafe direct writes: `SetPositionUnsafe`, `SetRotationUnsafe`, `SetScaleUnsafe`, `MoveAndRotateUnsafe`, `MoveUnsafe`, `SetColorUnsafe`, `SetEnabledUnsafe`, `RemoveUnsafe`, `SampleLightProbeUnsafe`

**`BRGRegisterer`** (MonoBehaviour subclass entry point)
- Implement: `OnInitialize`, `OnShutdown` (abstract); `OnChunkWritten(int chunkId)` (virtual)
- Lifecycle: `Initialize`, `Shutdown`, `Registration` (the underlying tracker)
- Protected (for use inside your subclass): all tracker methods above for registration / chunks / instance lifecycle / lookups
- Public (also callable from outside): `SetChunkEnabled`, `GetChunkEnabled`, `SetRenderEnabled`, all `Stage*` and `*Unsafe` methods

**Components users add in the editor**
- `BRGInstancedRendererConfig` — singleton config asset (auto-created at `Assets/BRGInstancedRenderer/BRGIRConfig.asset`, auto-added to Preloaded Assets)
- `BRGGameObjectGroup` + `BRGGameObjectLink` — GameObject batch conversion with native transform tracking
- `TerrainBRGRegisterer` + `BRGTerrainDetailOverride` — terrain tree/detail registration with optional LOD-group detail prototypes
- `BRGPrototypeExtraData` — per-prefab shadow cascade / shadow LOD / density / screen-size / LOD-fade overrides
- `BRGMeshLodData` — Unity 6.2+ Mesh LOD level config (alternative to LOD Groups)
- `BRGCameraSettings` — per-camera LOD bias multiplier and `SnapCrossfade()`

## Footguns

- In `OnShutdown()`, clear only local state. The base class frees chunks and unregisters prototypes automatically — don't do it yourself or you'll double-free.
- Don't call `BRGRenderer.Instance.AllocateChunk` / `FreeChunk` / `RegisterRenderSignature` directly from inside a registerer subclass. Use the inherited protected wrappers (`AllocChunk`, `ReleaseChunk`, `RegisterRenderSignatureFromPrefab`, etc.) so the base class can track them for automatic cleanup.
- After `WriteChunk`, don't assume `GetInstanceLink` will return valid handles on the same call — the GPU write may be deferred. Subscribe to `ChunkWritten` (or override `OnChunkWritten` in your subclass) and call `GetInstanceLink` from there.
- A stored `ChunkLink` can go stale if the chunk was freed elsewhere. Use `ChunkLink.IsAlive` (which checks generation against `BRGRenderer`'s current state) before mutating through it, not just `IsValid`.
- For per-camera operations (e.g. snap crossfade after a teleport on one specific camera), add a `BRGCameraSettings` component to that camera or call `BRGRenderer.Instance.SnapCrossfadeState(camera)`. `SnapAllCrossfadeStates()` covers every camera at once.
- Pool size is hard-coded to 64. Don't try to configure it. **Max Pools Per Chunk** in the config controls how many pools a chunk may hold (= max instances per chunk).
- `Stage*` and `*Unsafe` cannot be safely used on the same slot in the same frame, and `*Unsafe` cannot be used twice on the same slot in the same frame either. See the Stage* vs *Unsafe section above.

## Closing

If you need something not covered here, read the source in `Runtime/Scripts/` (it's the authoritative truth). This file is just a router — when in doubt, open the file and read it.
