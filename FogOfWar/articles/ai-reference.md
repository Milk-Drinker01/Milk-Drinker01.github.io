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

A condensed router for AI tools working with **Pixel-Perfect Fog Of War**. All types live in the `FOW` namespace. The package manager is the `FogOfWarWorld` singleton, accessed via `FogOfWarWorld.instance`. There is exactly one in the scene.

## Core model

- **`FogOfWarWorld`** — singleton manager. Owns all global fog settings, drives revealer/hider updates, renders the fog. Access via `FogOfWarWorld.instance`.
- **`FogOfWarRevealer`** — abstract base. Concrete components are **`FogOfWarRevealer3D`** (3D physics) and **`FogOfWarRevealer2D`** (2D physics), both via `RaycastRevealer`. Revealers carve line of sight using Burst-jobified raycasting.
- **`FogOfWarHider`** — marks an object hidden when outside all lines of sight. Pair with a **`HiderBehavior`** subclass (`HiderDisableObjects`, `HiderDisableRenderers`, `HiderToggleObjects`).
- Built-In RP draws fog via **`FowImageEffectOpaque`** (3D) / **`FowImageEffect`** (2D). URP/HDRP use a render feature / volume.

## Where to look (source)

Paths are inside `Assets/FogOfWar/` in the Unity project.

| What you need | Read |
|---------------|------|
| All global settings + every enum (`FogSampleMode`, `FogOfWarAppearance`, `FogOfWarType`, `FogOfWarFadeType`, `FogOfWarBlendMode`, `RevealerUpdateMethod`, `FowUpdateMethod`, `GamePlane`) + full public API | `Scripts/FogOfWarWorld.cs` |
| Revealer base properties, events, static/manual control | `Scripts/Revealers/FogOfWarRevealer.cs` |
| Raycast revealer settings + `RaycastRevealerOcclusionQualityPreset` enum | `Scripts/Revealers/RaycastRevealer.cs` |
| 3D / 2D revealer specifics | `Scripts/Revealers/FogOfWarRevealer3D.cs`, `FogOfWarRevealer2D.cs` |
| Hider properties, observers, `OnActiveChanged` | `Scripts/Hiders/FogOfWarHider.cs` |
| Hider behavior base (`OnReveal`/`OnHide`) | `Scripts/Hiders/HiderBehavior.cs` |
| Built-in hider behaviors | `Scripts/Hiders/HiderDisableObjects.cs`, `HiderDisableRenderers.cs`, `HiderToggleObjects.cs` |
| Built-In RP image effects | `Scripts/Built-In (legacy) RP/FowImageEffect.cs`, `FowImageEffectOpaque.cs` |
| Fog appearance / logic shaders | `Shaders/FogOfWarAppearance.hlsl`, `Shaders/FogOfWarLogic.hlsl`, `Shaders/Resources/FOW_Fog.shader`, `FOW_RT.shader` |

## Non-obvious concepts

- **Sample mode gates features.** `Pixel_Perfect` is per-pixel and supports unlimited world size, but **cannot** do temporal effects (regrow/memory). `Texture` is render-texture backed, **enables regrow**, but is resolution-bound and needs **World Bounds** set. `Both` runs both.
- **World Bounds are required** for: Texture sampling, the minimap, and the world-bounds black-out — independently of each other.
- **Two ways to test visibility in code:** `FogOfWarWorld.TestPointVisibility(point)` queries revealers directly (works in Pixel-Perfect). `FogOfWarWorld.SampleFogTextureAtPoint(point)` samples the fog texture (Texture mode, needs World Bounds).
- **Hiders detect; behaviors act.** `FogOfWarHider` only raises visibility changes. A `HiderBehavior` (or the `OnActiveChanged` event) does the showing/hiding. For *per-revealer* sightings, use `FogOfWarRevealer.OnHiderVisibilityChanged` (`Action<FogOfWarHider,bool>`).
- **Static revealers** stop auto-recalculating. Set via `StartRevealerAsStatic` (inspector) or `SetRevealerAsStatic(bool)`; force a one-off update with `ManualCalculateLineOfSight()`.
- **Update modes:** `RevealerUpdateMode` = `Every_Frame` / `N_Per_Frame` (uses `MaxNumRevealersPerFrame`) / `Controlled_ElseWhere` (you call updates). `UpdateMethod` controls *where* in the frame (Update / LateUpdate / StartInUpdateFinishInLateUpdate).
- **Buffer limits are pre-sized:** `MaxPossibleRevealers`, `MaxPossibleSegmentsPerRevealer`, `MaxPossibleHiders`. Exceeding segments throws a console error telling you to raise the limit.
- **Occlusion quality** is a per-revealer preset (`RaycastRevealerOcclusionQualityPreset`: ExtraLargeScaleRTS → OverkillResolution, or Custom). Disable `UseOcclusion` for thousands of cheap non-blocking revealers.
- **Save/load** uses `GetFowTextureSaveData()` → `byte[]` (PNG) and `LoadFowTextureData(byte[])` (Texture mode only). `ClearFowTexture()` resets exploration. `GetFOWRT()` returns the fog RenderTexture (minimap).
- **Game plane:** 3D fog is computed on `GamePlaneOrientation` (XZ default / XY / ZY). 2D uses `is2D` and the XY plane.
