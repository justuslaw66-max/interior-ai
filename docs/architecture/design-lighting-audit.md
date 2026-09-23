# Central lighting audit and implementation

## Scope and findings

The audit covered the canonical `/design` editor, saved lighting state,
product/GLB materials, screenshots and exports, plus share, read-only, legacy
designer, isolated product-preview, admin, and developer renderers.

Before the refactor, the editor split renderer configuration from its light
rig, the physical resolver calculated sources that were not mounted, several
controls changed saved values without changing pixels, every imported mesh
cast a shadow, and share/read-only viewers used unrelated warm rigs. Earlier
attempts also introduced analytical sky, sun, window, preview, and fixture
sources at once, double-counted exterior illumination, and exposed extensive
asset-specific material compensation. Those conflicts explain the unstable
orange/blue casts and hot spots reported in the original scene.

## Final ownership

| Responsibility | Owner |
| --- | --- |
| Global editor/viewer light composition | `components/editor/design-page/lighting/LightingSystem.tsx` |
| Typed Design, Daylight, Evening, and Presentation intentions | `lighting/lightingPresets.ts` and `lighting/lightingTypes.ts` |
| sRGB output, ACES tone mapping, fixed exposure | `lighting/ExposureController.tsx` |
| One neutral procedural environment and failure fallback | `lighting/EnvironmentController.tsx` |
| One geographic/fixed directional sun and fitted shadow camera | `lighting/SunController.tsx` |
| Measured diffuse window apertures | `lighting/WindowLightManager.tsx` |
| Registered functional fixtures and light/shadow limits | `lighting/FixtureLightManager.tsx` |
| Object shadow eligibility | `lighting/ShadowBudgetManager.ts` |
| Subtle, one-pass contact grounding | `lighting/ContactShadowController.tsx` |
| Physical sun, window, and fixture conversion | `lib/resolve-lighting-scene.ts` |
| Versioned migration and saved defaults | `lib/design-lighting-settings.ts` |

`DesignSceneCanvas` mounts exactly one `LightingSystem` in 3D and none in 2D.
`ViewerLighting` adapts the same contract for Share, Read-only, and the legacy
Designer canvas. Individual rooms and furniture no longer own global lights.

The cabinetry preview remains an intentionally isolated product turntable.
The admin model viewer and `/hugg-test` remain explicit model-calibration
tools, not application/design renderers. Their independent diagnostic rigs do
not mount with the editor or customer viewers.

## Modes and budgets

| Mode | Global intent | Fixtures | Windows | Shadows/effects |
| --- | --- | --- | --- | --- |
| Design | neutral environment, one fixed key, restrained ambient | off | off | one sun shadow, subtle contact shadow |
| Daylight | lower environment, geographic sun from date/time/location/north | off | up to 4 diffuse apertures | one sun shadow |
| Evening | low neutral environment, no sun | up to 4, one shadow | off | localized warm fixtures only |
| Presentation | saved scene appearance with temporary high-quality settings | up to 8 when the source scene enables fixtures | up to 6 when Daylight is selected | 4096 fitted maps, up to two fixture shadows, subtle contact shadow |

Low quality reduces aperture/fixture counts, disables fixture shadows and
contact shadows, and disables all shadow maps. Medium caps functional sources
and uses at most one fixture shadow. Presentation resolves to High unless the
user explicitly selected Lite. All budgets are deterministic and selected
fixtures receive first priority, followed by fixtures in the active room and
verified photometric sources.

Window area lights use only diffuse sky luminance and never cast shadows.
Direct sun appears once through `SunController`; it is not multiplied by the
number of windows.

Estimated floor/table lamps use a single 100° full-width downward cone with
conservative direct-output defaults from `lib/fixture-lighting-defaults.ts`.
This replaces the legacy 800-lumen omnidirectional estimate that could create
wall-sized hot spots. Manufacturer and photometric distributions are preserved
unchanged, and saved beam widths are full cone angles converted to the
half-angle expected by Three.js.

## Renderer and material colour

Three.js 0.182 uses the modern physically based lighting behavior; no removed
`physicallyCorrectLights`/legacy-light flag is assigned. `ExposureController`
is the sole runtime owner of:

```ts
renderer.outputColorSpace = THREE.SRGBColorSpace;
renderer.toneMapping = THREE.ACESFilmicToneMapping;
renderer.toneMappingExposure = resolvedPresetExposure;
```

GLTFLoader retains glTF colour-space semantics. Application-loaded base-colour
textures are explicitly sRGB. Normal, roughness, metalness, AO, and other data
maps retain the default non-colour space. The lighting refactor does not apply
new material colour multipliers. Existing product-specific GLB calibration is
preserved because changing those values would be a separate asset migration.

The environment is procedural and cached by the existing Drei/Three PMREM
path, so it has no network dependency and cannot display an outdoor image
inside a room. Suspense preserves direct/ambient usability while it resolves;
an error boundary leaves those same sources active if environment generation
fails.

## UX and persistence

Consumer Mode exposes only Bright & Clear, Natural Daylight, and Evening.

Pro disclosure adds only implemented controls: exposure, shadows, time, date,
plan north, latitude/longitude, fixture master power/brightness, and the
existing renderer quality preference. Selecting a functional fixture in Pro
adds saved on/off, dimmer, CCT, and spot-beam width. Presentation is temporary
viewport state entered by Present & Export; its selected source scene remains
project state and its higher render quality is used by image/PDF capture.

Compatibility IDs remain `studio`, `daylight`, and `warm`. The version-1
lighting object and legacy `lightingPreset` mirror are both maintained.
Missing or invalid old data receives clamped defaults. Beam width is an
optional per-item field, validated from 5–180 degrees, so old projects require
no migration.

State placement is:

- project: source scene, exposure, shadows, daylight inputs, fixture master;
- fixture item: power, dimmer, CCT, beam width;
- user/device viewport: renderer quality/Lite;
- temporary viewport: Presentation override.

## Calibration and diagnostics

`/lighting-reference` is deterministic and includes light/dark walls, wood
floor and furniture, rug, fabric sofa, metal, glass, a floor lamp, a ceiling
fixture, and a measured window. It compares all four modes. In development it
shows mode, exposure, environment intensity, active/shadow light counts,
shadow resolution, tone mapping, and quality. The overlay is absent from
production.

The main canvas exposes equivalent non-visual data attributes for automated
integration checks. Existing scene QA markers provide FPS, draw calls,
triangles, geometries, and textures without per-frame React state added by the
lighting system.

## Preserved risks and future work

Saved screenshots can change because central exposure and shadow policy now
apply consistently. GLB calibration remains a visual dependency and should be
changed only with asset-specific baselines. A 4096 Presentation shadow is
temporary but still device-sensitive; explicit Lite remains available.

IES rendering, external HDR/EXR selection, SSAO/GTAO, bloom, WebGPU,
path-tracing, and cloud rendering are intentionally not introduced. The typed
fixture metadata and Presentation boundary leave room for those later without
another global-light architecture.
