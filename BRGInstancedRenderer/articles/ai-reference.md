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
| Per-instance color via `InstanceLink` on a real terrain (uses `GetInstanceLink` + `*Unsafe`) | `Examples/Scripts/TerrainTreeRandomColor.cs` |
| Full runtime add/remove pattern — click to chop trees (`StageRemove`) or plant new prototypes at runtime (`RegisterRenderSignatureFromPrefab` + `AddInstance` + `StageColor`) | `Examples/Scripts/TerrainTreeChopper.cs` (paired scene: `Examples/Demos/Terrain Tree Chopper.unity`) |
| **All three per-frame submission paths side by side** (Simple `Stage*` / per-instance `*Unsafe` / Burst-job-fed `Set*BatchUnsafe`), plus `OnChunkWritten` link caching and bounds padding for animated instances | `Examples/Demos/Scripts/InstanceLinkWaveDemo.cs` |
| Reference terrain implementation | `Runtime/Scripts/Registerers/Terrain/TerrainBRGRegisterer.cs` + `.Trees.cs` / `.Details.cs` / `.Details.Extraction.cs` partials |
| Reference GameObject-group implementation (kept-source, transform-tracked) | `Runtime/Scripts/Registerers/GameObjects/BRGGameObjectGroup.cs` |
| Reference baked-instance group implementation (destroyed-source, packed blob) | `Runtime/Scripts/Registerers/Baked/BRGInstanceGroup.cs` + `.Bake.cs` |
| Config schema (every serialized field + tooltips) | `Runtime/Scripts/Config/BRGInstancedRendererConfig.cs` |
| Per-prototype shadow / LOD / density overrides | `Runtime/Scripts/Config/BRGPrototypeExtraData.cs` |
| Per-group runtime LOD bias + density control (ScriptableObject) | `Runtime/Scripts/Config/BRGPrototypeGroup.cs` |
| Unity 6.2+ Mesh LOD setup | `Runtime/Scripts/Config/BRGMeshLodData.cs` |
| Per-camera LOD bias and crossfade snap | `Runtime/Scripts/Config/BRGCameraSettings.cs` |
| Terrain detail prototype override | `Runtime/Scripts/Registerers/Terrain/BRGTerrainDetailOverride.cs` |

## Non-obvious concepts

These are not visible from reading any single file. State them explicitly to avoid generating wrong code.

- The singleton class is `BRGRenderer`, not `BRGInstancedRenderer`. Access it via `BRGRenderer.Instance`.
- A **chunk** holds a mix of any number of render signatures. Chunks are not per-signature.
- A **pool** also holds a mix of any number of render signatures. Pools are fixed-size GPU memory blocks of **16 instance slots each**. Runtime-hard-coded, but source-configurable in exactly one place: the C# `kPoolSize` constant in `Runtime/Scripts/Core/BRGInstancedRenderer.cs` **must** match `_PoolSizeShift` in `Runtime/Scripts/Core/Compute/BRG_Common.hlsl` (`_PoolSize` and `_PoolSizeMask` are derived from the shift).
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

**Reference patterns:**
- `Examples/Scripts/BRGRegistererExample.cs` — stores `InstanceLink`s in a list as instances are added (`AddInstance` return value) and modifies them later with `Stage*` calls for batch updates.
- `Examples/Scripts/TerrainTreeRandomColor.cs` — sits next to a `TerrainBRGRegisterer`, subscribes to `OnTreeChunkWritten(ChunkLink, NativeArray<int>)`, then uses `Registration.GetInstanceLink(chunk, i)` + `Registration.SetColorUnsafe(link, color)` to apply a one-shot random color per tree.
- `Examples/Scripts/TerrainTreeChopper.cs` — the fullest runtime add/remove example. Caches `InstanceLink`s per chunk on `OnTreeChunkWritten`, uses `StageRemove(link)` to chop trees inside a click radius, and on right-click plants a new instance via `Registration.RegisterRenderSignatureFromPrefab` + `Registration.AddInstance` + `StageColor`. Also demonstrates `UnregisterRenderSignature` cleanup on disable. Paired scene: `Examples/Demos/Terrain Tree Chopper.unity`.
- `Examples/Demos/Scripts/InstanceLinkWaveDemo.cs` — the per-frame animation reference. Resolves links in `OnChunkWritten` into a `NativeArray<int>` of global slots (compacting out invalid ones), then animates them every frame from a Burst job. Implements all three submission paths behind an `UpdateMode` enum so they can be profiled against each other. Also shows the bounds-padding pattern for moving instances.

## The three submission paths

There are **three** ways to modify existing instances. `Examples/Demos/Scripts/InstanceLinkWaveDemo.cs` implements all three behind an `UpdateMode` enum on identical data — read it when choosing.

**1. `Stage*` (Simple) — the safe default.** Keeps a per-slot dictionary on the tracker. Repeated writes to the same slot (or to different fields of the same slot) are merged into a single entry, then bulk-uploaded to `BRGRenderer` when the tracker flushes each frame. Use this if your code might touch the same slot more than once per frame — dedup is handled for you. Slowest of the three, because of the per-instance call + dictionary insert.

```csharp
StagePosition(slot, pos);
StageColor(slot, color);
```

**2. `*Unsafe` (per-instance direct).** Bypasses the tracker dictionary and forwards each call straight to `BRGRenderer`. You must guarantee **at most one write per slot per frame** yourself. Faster than `Stage*` but still one call per instance.

```csharp
SetPositionUnsafe(slot, pos);
SetColorUnsafe(slot, color);
```

**3. `Set*BatchUnsafe` (batched direct) — fastest at scale.** Submits a whole `NativeArray` of pre-built entries in a single call, skipping both the per-instance call overhead and the merge dictionary. Designed to be fed directly by a Burst job. Same one-write-per-slot contract as mode 2 — and additionally, the array must not contain two entries with the same `slotIndex`.

```csharp
SetTRSBatchUnsafe(patches, slots, count);   // slots[i] MUST match patches[i].slotIndex
SetColorBatchUnsafe(colorEntries, count);
```

There are also **tracked batch** overloads — `StageTRSBatch(entries, count)` and `StageColorBatch(entries, count)` — which take the same arrays but route them through the merging path. Use these when you want array-submission ergonomics but still need per-slot dedup.

**Entry structs** (on `BRGRenderer`, both Burst-compatible so a job can write them):
- `GPUTRSPatchEntry { uint slotIndex; uint flags; float3 position; float4 rotation; float3 scale; }` — 48 bytes. `flags` uses `BRGRegistrationTracker.kPatchPosition` (1), `kPatchRotation` (2), `kPatchScale` (4). Set only the bits you're writing.
- `GPUColorEntry { uint slotIndex; uint packedColor; }` — pack via `BRGRegistrationTracker.PackColor(in Color32)`.

**Rules that apply across all paths:** mixing `Stage*` and `*Unsafe` on the same slot in one frame is undefined; two direct/unsafe writes to one slot in one frame race (arbitrary winner, and partial-flag TRS writes can lose components). Default to `Stage*` for gameplay code; reach for the batch paths when you're updating thousands of instances per frame from a job.

## Public API surface

**Names only — do NOT infer signatures from names.** Before calling any method, open the source file (see *Where to look*) and read its actual signature. Common pitfalls: `AllocChunk()` takes no arguments (bounds go in `WriteChunk`, not `AllocChunk`); `WriteChunk(link, instances, bounds, cullDistance, instanceCullDistance)` takes a `ChunkLink` and a `NativeArray<InstanceData>`, not a chunk id and a managed array; the `InstanceData` field is `signatureIndex` (not `prototypeIndex`).

**`BRGRenderer`** (singleton, via `BRGRenderer.Instance`)
- Lifecycle: `Instance`, `HasInstance`, `IsInitialized`, `Dispose`, `Shutdown`, `Reinitialize`, `RuntimeRefresh`
- Registration: `RegisterRenderSignatureFromPrefab`, `RegisterRenderSignaturesFromPrefab`, `RegisterRenderSignature`, `UnregisterRenderSignature`, `PurgeUnusedPrototypes`, `GetPrototype`, `GetPrototypeRefCount`, `GetPrototypeInstanceCount`
- Chunks: `AllocateChunk`, `WriteChunk`, `FreeChunk`, `IsChunkValid`, `GetChunkGeneration`, `GetChunkInstanceCount`, `GetChunkBounds`, `GetChunkPoolCount`, `GetChunkPoolIndex`, `GetPoolOccupancy`, `RecalculateChunkBounds`, `SetChunkEnabled`, `GetChunkEnabled`
- Direct instance modification: `SetInstancePosition`, `SetInstanceRotation`, `SetInstanceScale`, `MoveAndRotateInstance`, `MoveInstance`, `SetInstanceColor`, `SetInstanceEnabled`, `IsInstanceEnabled`, `SampleInstanceLightProbe`, `AddInstance`, `AppendInstances`, `RemoveInstance`
- Buffer / memory: `CompactBuffers`, `ShiftInstances`, `FlushStagedUploads`, `GetMemoryBreakdown`, `AllocatedBufferMemory`
- Crossfade / probes: `SnapAllCrossfadeStates`, `SnapCrossfadeState`, `CrossfadeTimeScale`, `ResampleAllLightProbes` (runtime density and LOD-bias scaling are now per-group via `BRGPrototypeGroup`, not on the singleton)

**`BRGRegistrationTracker`** (non-MonoBehaviour entry point)
- Lifecycle: `Initialize`, `Shutdown`, `InitializeCallback`, `ShutdownCallback`, `BRGSystem`, `IsRegistered`, `Name`
- Events: `ChunkWritten`
- Registration: `ExtractRenderSignature`, `RegisterRenderSignatureFromPrefab`, `RegisterRenderSignaturesFromPrefab`, `RegisterRenderSignature`, `UnregisterRenderSignature`
- Chunks: `MaxInstancesPerChunk`, `AllocChunk`, `WriteChunk`, `ReleaseChunk`, `RecalculateChunkBounds`, `SetChunkEnabled`, `GetChunkEnabled`, `SetRenderEnabled`
- Instance lifecycle: `AddInstance`, `AddInstances`, `MoveInstanceToChunk`
- Lookups: `GetInstanceLink`, `GetTotalChunkInstanceCount`, `GetOverflowChunkCount`, `GetPerChunkInstanceCounts`
- Staged writes: `StagePosition`, `StageRotation`, `StageScale`, `StageMoveAndRotate`, `StageMove`, `StageColor`, `StageSetEnabled`, `StageRemove`
- Staged batch writes: `StageTRSBatch`, `StageColorBatch`
- Unsafe direct writes: `SetPositionUnsafe`, `SetRotationUnsafe`, `SetScaleUnsafe`, `MoveAndRotateUnsafe`, `MoveUnsafe`, `SetColorUnsafe`, `SetEnabledUnsafe`, `RemoveUnsafe`, `SampleLightProbeUnsafe`
- Unsafe batch writes: `SetTRSBatchUnsafe`, `SetColorBatchUnsafe`
- Batch helpers: `kPatchPosition` / `kPatchRotation` / `kPatchScale` (const uint flag bits), `PackColor(in Color32)` (static, Burst-compatible)

**`BRGRegisterer`** (MonoBehaviour subclass entry point)
- Implement: `OnInitialize`, `OnShutdown` (abstract); `OnChunkWritten(int chunkId)` (virtual)
- Lifecycle: `Initialize`, `Shutdown`, `Registration` (the underlying tracker)
- Protected (for use inside your subclass): all tracker methods above for registration / chunks / instance lifecycle / lookups
- Public (also callable from outside): `SetChunkEnabled`, `GetChunkEnabled`, `SetRenderEnabled`, all `Stage*` / `Stage*Batch` / `*Unsafe` / `Set*BatchUnsafe` methods

**Components users add in the editor**
- `BRGInstancedRendererConfig` — singleton config asset (auto-created at `Assets/BRGInstancedRenderer/BRGIRConfig.asset`, auto-added to Preloaded Assets)
- `BRGGameObjectGroup` + `BRGGameObjectLink` — GameObject batch conversion with native transform tracking (source GameObjects kept, renderers disabled)
- `BRGInstanceGroup` — alternative baked path that **destroys** the source GameObjects after baking, storing transforms + render signatures on the component. Smaller storage, zero per-instance GameObject overhead, no automatic transform tracking. `Bake()` / `ExpandToGameObjects()` editor methods, `IsBaked` / `InstanceCount` / `PrototypeCount` runtime properties.
- `TerrainBRGRegisterer` + `BRGTerrainDetailOverride` — terrain tree/detail registration with optional LOD-group detail prototypes
- `BRGPrototypeExtraData` — per-prefab shadow cascade / shadow LOD / density / screen-size / LOD-fade overrides; also carries the optional `prototypeGroup` reference
- `BRGPrototypeGroup` — ScriptableObject grouping prototypes for shared LOD bias, density, and shadow culling. **Replaces the removed `BRGRenderer.SetGlobalDensity`.** Two value categories: **runtime-only** (`lodBias`, `density`, `forceDisableShadows` — not serialized, reset to defaults each session, set via `SetLodBias(float)` / `SetDensity(float)` / `SetShadowsEnabled(bool)`) and **authored/serialized** shadow culling fields (`useImproperShadowFrustumCulling`, `improperShadowFrustumPadding`, `useShadowCasterDistanceCulling`, `useSceneShadowDistance`, `maxShadowDistance` — set via `SetImproperShadowFrustumCulling(bool, float?)` / `SetShadowCasterDistanceCulling(bool)` / `SetMaxShadowDistance(float, bool useScene = false)`). Note `SetShadowsEnabled(bool)` takes *enabled*, inverting the underlying `forceDisableShadows` field. The shadow setters trigger rebuilds — call on settings changes, not per frame.
- `BRGMeshLodData` — Unity 6.2+ Mesh LOD level config (alternative to LOD Groups)
- `BRGCameraSettings` — per-camera LOD bias multiplier and `SnapCrossfade()`

## Footguns

- In `OnShutdown()`, clear only local state. The base class frees chunks and unregisters prototypes automatically — don't do it yourself or you'll double-free.
- Don't call `BRGRenderer.Instance.AllocateChunk` / `FreeChunk` / `RegisterRenderSignature` directly from inside a registerer subclass. Use the inherited protected wrappers (`AllocChunk`, `ReleaseChunk`, `RegisterRenderSignatureFromPrefab`, etc.) so the base class can track them for automatic cleanup.
- After `WriteChunk`, don't assume `GetInstanceLink` will return valid handles on the same call — the GPU write may be deferred. Subscribe to `ChunkWritten` (or override `OnChunkWritten` in your subclass) and call `GetInstanceLink` from there.
- A stored `ChunkLink` can go stale if the chunk was freed elsewhere. Use `ChunkLink.IsAlive` (which checks generation against `BRGRenderer`'s current state) before mutating through it, not just `IsValid`.
- For per-camera operations (e.g. snap crossfade after a teleport on one specific camera), add a `BRGCameraSettings` component to that camera or call `BRGRenderer.Instance.SnapCrossfadeState(camera)`. `SnapAllCrossfadeStates()` covers every camera at once.
- Pool size is hard-coded to 16 at runtime (see the C#/HLSL sync note in *Non-obvious concepts*). **Max Pool Refs Per Chunk** in the config (`maxPoolRefsPerChunk`, default 128) controls how many pools a chunk may hold — default max instances per chunk is 128 × 16 = 2048.
- **Same-path duplicate writes are unsafe too.** Two `*Unsafe` calls on the same slot in one frame, or two direct `BRGRenderer.SetInstance*` calls on the same slot in one frame, race — the direct/unsafe path is append-only, so both writes land in a single GPU dispatch with an arbitrary winner (partial-flag TRS writes can also lose components). The `Stage*` path deduplicates for you and is safe against this.
- **Removed slots don't inherit stale writes.** `RemoveInstance` / `RemoveUnsafe` flushes any pending direct TRS patches, color writes, and sig overrides onto the dying instance before the slot can be reused, so a same-frame remove → re-add always receives only the new instance's data. This is a floor guarantee ("writes never outlive a slot"), not per-frame dedup on the direct path.
- **Terrain tree index arrays are non-owning views.** `TerrainBRGRegisterer.GetChunkOwnedTrees(chunkId)` and the `NativeArray<int>` passed to `OnTreeChunkWritten` are sub-array views into internal storage, **not** copies. Never dispose them, and don't cache them across frames — they're invalidated by the next tree rebuild. Always check `.IsCreated` before use (they return `default` when trees aren't registered or the chunk is unknown). The array's order matches the chunk's `InstanceLink` order, so index `i` in the array corresponds to `GetInstanceLink(chunk, i)`; its values index into `CachedTreeInstanceData` / `TerrainData.treeInstances`.
- **GPU upload validator (editor-only debug tool).** Toggle **Debug Validate Uploads** on the Config (session-only — resets on editor restart). A CPU mirror replays every upload / clear / patch / override / color command at dispatch time and compares against GPU readbacks every `DebugUploadValidationInterval` flush passes (0 = manual via `DebugValidateUploadsNow()`). Mismatches log the pool / chunk / proto and the slot's last two writers (op + render cycle). Verifies `rotScale`, sig bits, color, and pool refs; deliberately skips matrix-derived fields (`positionOrBoundsCenter`, `padOrMaxScale`) and masks slots hit by duplicate same-dispatch writes. GPU readback cost is nontrivial — leave off unless investigating a write-correctness bug.
- **The `color` field on `InstanceData` is NOT uploaded by `WriteChunk`, `AddInstance`, or `AppendInstances`.** All three paths only upload `position` / `rotation` / `scale` / `signatureIndex` (verified: they share the same `GPUStagedInstanceData` packing which has no color slot). Setting `color` on `InstanceData` is silently ignored. To apply per-instance color, call `StageColor(link, color)` (or `SetColorUnsafe(link, color)`) after the chunk is written — typically from `OnChunkWritten`. Per-instance color also requires **Enable Per-Instance Color** in the [Config](../configuration/rendering.md).
- For instances that move at runtime, pad your `WriteChunk` bounds by the maximum displacement they'll travel. Otherwise instances will get chunk-culled at peak motion (rising above or falling below the tight initial bounds). See `Examples/Demos/Scripts/InstanceLinkWaveDemo.cs` for the pattern (`new Bounds(center, new Vector3(w, amplitude*2+1, d))`).
- `Stage*` and `*Unsafe` cannot be safely used on the same slot in the same frame, and `*Unsafe` cannot be used twice on the same slot in the same frame either. See the Stage* vs *Unsafe section above.

## Closing

If you need something not covered here, read the source in `Runtime/Scripts/` (it's the authoritative truth). This file is just a router — when in doubt, open the file and read it.
