import * as THREE from "three";

type HuggTopTintContext = {
  isHuggModel: boolean;
  huggVariantMarker: string;
  url: string;
};

export function createHuggTopTint({
  isHuggModel,
  huggVariantMarker,
  url,
}: HuggTopTintContext) {
    const applyHuggTopTint = (
      mesh: THREE.Mesh,
      material: THREE.MeshStandardMaterial,
      tintHex: string
    ) => {
      // Only apply custom shaders for black or chestnut variants.
      // Natural/basalt variants render with the original GLB textures.
      if (!isHuggModel || !tintHex) return;
      const tintColor = new THREE.Color(tintHex);
      const tintLuma = 0.2126 * tintColor.r + 0.7152 * tintColor.g + 0.0722 * tintColor.b;
      const isBlackVariant = huggVariantMarker.includes("black") || tintLuma < 0.16;
      const isChestnutVariant = huggVariantMarker.includes("chestnut");
      const isHuggClosedLayout = huggVariantMarker.includes("closed") || String(url).toLowerCase().includes("closed");
      const tintStrength = isBlackVariant ? 0.95 : 0.88;

      // Compute geometry bounds for all variants (needed for ottoman Z-gate).
      const natGeom = mesh.geometry as THREE.BufferGeometry;
      if (!natGeom.boundingBox) natGeom.computeBoundingBox();
      const natBounds = natGeom.boundingBox?.clone() ?? new THREE.Box3();
      const natSize = new THREE.Vector3();
      const natCenter = new THREE.Vector3();
      natBounds.getSize(natSize);
      natBounds.getCenter(natCenter);
      const natBeamZTop = natBounds.min.z + natSize.z * 0.35;
      const natClosedTopZMax = natBounds.min.z + natSize.z * 0.022;

      // ── NATURAL / OTHER: minimal ottoman inner-face normalization ─────────────
      if (!isBlackVariant && !isChestnutVariant) {
          material.customProgramCacheKey = () =>
            ["hugg-ottoman-inner-normalize-v3", natBeamZTop, natCenter.x, natCenter.y].join(":");
          material.onBeforeCompile = (shader) => {
            shader.uniforms.huggNatBeamZTop = { value: natBeamZTop };
            shader.uniforms.huggNatCenterX = { value: natCenter.x };
            shader.uniforms.huggNatCenterY = { value: natCenter.y };
            shader.vertexShader = shader.vertexShader
              .replace("#include <common>", "#include <common>\nvarying vec3 vHuggNatLocalPos;\nvarying vec3 vHuggNatObjNormal;")
              .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHuggNatLocalPos = position;\nvHuggNatObjNormal = normalize(normal);");
            shader.fragmentShader = shader.fragmentShader
              .replace(
                "#include <common>",
                "#include <common>\nvarying vec3 vHuggNatLocalPos;\nvarying vec3 vHuggNatObjNormal;\nuniform float huggNatBeamZTop;\nuniform float huggNatCenterX;\nuniform float huggNatCenterY;"
              )
              .replace(
                "#include <opaque_fragment>",
                [
                  "#include <opaque_fragment>",
                  // Gate: only ottoman pixels (Z > huggNatBeamZTop; Z-up inverted height).
                  "float huggNatOttZone = smoothstep(huggNatBeamZTop, huggNatBeamZTop + 0.12, vHuggNatLocalPos.z);",
                  // Skip seat top-face pixels.
                  "float huggNatNotTop = 1.0 - smoothstep(0.52, 0.80, -vHuggNatObjNormal.z);",
                  // Inner-facing: normal points toward the table center.
                  "vec2 huggNatPosDir = normalize(vec2(vHuggNatLocalPos.x - huggNatCenterX, vHuggNatLocalPos.y - huggNatCenterY) + vec2(0.001, 0.001));",
                  "float huggNatIsInner = clamp(-dot(huggNatPosDir, vec2(vHuggNatObjNormal.x, vHuggNatObjNormal.y)), 0.0, 1.0);",
                  // Lift dark inner-facing pixels to match outer-face brightness.
                  "float huggNatCurLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
                  // Gentle lift: only dark pixels (luma < 0.4) get up to 18% boost.
                  "float huggNatLift = 1.0 + 0.18 * (1.0 - clamp(huggNatCurLuma * 2.5, 0.0, 1.0));",
                  "vec3 huggNatLiftedColor = gl_FragColor.rgb * huggNatLift;",
                  "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggNatLiftedColor, huggNatOttZone * huggNatNotTop * huggNatIsInner * 0.70);",
                ].join("\n")
              );
          };
          return;
        }
      const huggFabricTone = (() => {
        const lowerUrl = String(url).toLowerCase();
        if (lowerUrl.includes("performance-dune")) return new THREE.Color("#d9cfbe");
        if (lowerUrl.includes("performance-basalt")) return new THREE.Color("#7a7a76");
        return new THREE.Color("#9a9a9a");
      })();

      // ── CHESTNUT: gentle grain-preserving tint (non-destructive) ──────────────
      if (isChestnutVariant) {
        material.customProgramCacheKey = () =>
          ["hugg-chestnut-grain-tint-v47", tintHex, tintStrength, natBeamZTop, natClosedTopZMax, natCenter.x, natCenter.y, natSize.x, natSize.y, isHuggClosedLayout ? 1 : 0].join(":");
        material.onBeforeCompile = (shader) => {
          shader.uniforms.huggTintColor = { value: tintColor };
          shader.uniforms.huggFabricTone = { value: huggFabricTone };
          shader.uniforms.huggTintStrength = { value: tintStrength };
          shader.uniforms.huggChestBeamZTop = { value: natBeamZTop };
          shader.uniforms.huggClosedTopZMax = { value: natClosedTopZMax };
          shader.uniforms.huggChestCenterX = { value: natCenter.x };
          shader.uniforms.huggChestCenterY = { value: natCenter.y };
          shader.uniforms.huggChestHalfFootprintX = { value: natSize.x * 0.5 };
          shader.uniforms.huggChestHalfFootprintY = { value: natSize.y * 0.5 };
          shader.vertexShader = shader.vertexShader
            .replace("#include <common>", "#include <common>\nvarying vec3 vHuggCPos;\nvarying vec3 vHuggCNorm;")
            .replace("#include <begin_vertex>", "#include <begin_vertex>\nvHuggCPos = position;\nvHuggCNorm = normalize(normal);");
          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying vec3 vHuggCPos;\nvarying vec3 vHuggCNorm;\nuniform vec3 huggTintColor;\nuniform vec3 huggFabricTone;\nuniform float huggTintStrength;\nuniform float huggChestBeamZTop;\nuniform float huggClosedTopZMax;\nuniform float huggChestCenterX;\nuniform float huggChestCenterY;\nuniform float huggChestHalfFootprintX;\nuniform float huggChestHalfFootprintY;"
            )
            .replace(
              "#include <map_fragment>",
              [
                "#include <map_fragment>",
                "vec3 huggOrigDiffuse = diffuseColor.rgb;",
                // Detect warm-oak pixels by R-B warmth (same threshold as black shader).
                "float huggRmB = diffuseColor.r - diffuseColor.b;",
                "float huggWarmMask = smoothstep(0.06, 0.14, huggRmB);",
                "float huggLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
                // Grain-preserving tint: map luma range onto the chestnut colour.
                // Light grain pixels (high luma) → light chestnut; dark grain → dark chestnut.
                // The original texture variation is retained because it drives the
                // luma multiplier, not replaced by a flat colour.
                "vec3 huggGrainTint = mix(huggTintColor * 0.55, huggTintColor * 1.45, huggLuma);",
                // Gate to the table core: the centered XY mask isolates the table/support
                // geometry from the ottomans, while the Z gate is only needed for tabletop
                // and other top-facing pixels near the seat height plane.
                "float huggChestTableZ = 1.0 - smoothstep(huggChestBeamZTop - 0.02, huggChestBeamZTop + 0.06, vHuggCPos.z);",
                "float huggChestTableX = 1.0 - smoothstep(huggChestHalfFootprintX * 0.62, huggChestHalfFootprintX * 0.78, abs(vHuggCPos.x - huggChestCenterX));",
                "float huggChestTableY = 1.0 - smoothstep(huggChestHalfFootprintY * 0.62, huggChestHalfFootprintY * 0.78, abs(vHuggCPos.y - huggChestCenterY));",
                "float huggChestSupportCore = huggChestTableX * huggChestTableY;",
                "float huggChestTableZone = huggChestTableZ * huggChestSupportCore;",
                // Top-facing upholstery can sit inside the broad XY core, so require a
                // much tighter centered ellipse for top faces and keep the broader core
                // only for non-top wood geometry like legs and the center support.
                "float huggCTopFacing = smoothstep(0.45, 0.78, -vHuggCNorm.z);",
                "vec2 huggChestTopUv = vec2((vHuggCPos.x - huggChestCenterX) / max(huggChestHalfFootprintX * 0.68, 0.001), (vHuggCPos.y - huggChestCenterY) / max(huggChestHalfFootprintY * 0.68, 0.001));",
                "float huggChestTopEllipse = 1.0 - smoothstep(0.98, 1.12, length(huggChestTopUv));",
                "float huggChestTintZone = mix(huggChestSupportCore, min(huggChestTableZone, huggChestTopEllipse), huggCTopFacing);",
                "float huggChestWoodZone = huggWarmMask * huggChestTintZone;",
                "diffuseColor.rgb = mix(diffuseColor.rgb, clamp(huggGrainTint, 0.0, 1.0), huggChestWoodZone * huggTintStrength);",
                // Normalize tabletop tone so nested/closed baked shading does not create
                // a dark disk, while preserving support-beam and seat isolation gates.
                "float huggChestTopWoodZone = huggWarmMask * huggCTopFacing * min(huggChestTableZone, huggChestTopEllipse);",
                "vec3 huggChestTopTarget = clamp(mix(huggTintColor * 0.94, huggTintColor * 1.10, 0.55), 0.0, 1.0);",
                "diffuseColor.rgb = mix(diffuseColor.rgb, huggChestTopTarget, huggChestTopWoodZone * 0.52);",
                // Closed GLB has baked AO that desaturates the tabletop center, killing
                // huggWarmMask on those pixels. Correct the top slab directly, tint warm
                // wood on the edge/supports, then restore neutral fabric pixels.
                isHuggClosedLayout
                  ? [
                      // Closed ottoman tops sit below the tabletop but still inside the
                      // broad huggChestTableZ gate. Use a stricter minZ-based tabletop
                      // slab gate so fabric is excluded while the baked-AO tabletop is
                      // still fully replaced before lighting. The tucked cushion tops can
                      // sit close in Z, so also exclude light/neutral fabric albedo pixels.
                      "float huggClosedTopSlabZ = 1.0 - smoothstep(huggClosedTopZMax - 0.002, huggClosedTopZMax + 0.003, vHuggCPos.z);",
                      "float huggClosedNeutralMask = 1.0 - smoothstep(0.025, 0.110, abs(huggRmB));",
                      "float huggClosedLightFabricMask = smoothstep(0.42, 0.62, huggLuma) * huggClosedNeutralMask;",
                      "float huggClosedTopZone = huggClosedTopSlabZ * (1.0 - huggClosedLightFabricMask);",
                      "vec3 huggClosedEvenTint = clamp(huggTintColor * 1.02, 0.0, 1.0);",
                      "diffuseColor.rgb = mix(diffuseColor.rgb, huggClosedEvenTint, huggClosedTopZone);",
                      // Some closed Hugg GLBs bake the flat shelf directly below
                      // the tabletop as neutral fabric. Keep this very close to
                      // the tabletop plane so the cushion top remains untouched.
                      "float huggClosedShelfZ = smoothstep(huggClosedTopZMax + 0.004, huggClosedTopZMax + 0.030, vHuggCPos.z) * (1.0 - smoothstep(huggChestBeamZTop - 0.150, huggChestBeamZTop - 0.055, vHuggCPos.z));",
                      "float huggClosedShelfTop = smoothstep(0.42, 0.78, -vHuggCNorm.z);",
                      "float huggClosedShelfZone = huggClosedShelfZ * huggClosedShelfTop * huggChestSupportCore;",
                      "diffuseColor.rgb = mix(diffuseColor.rgb, huggClosedEvenTint, huggClosedShelfZone * 0.96);",
                      "huggChestWoodZone = max(huggChestWoodZone, max(huggClosedTopZone, huggClosedShelfZone));",
                      "float huggClosedWoodWarmZone = huggWarmMask * (1.0 - huggClosedLightFabricMask);",
                      "diffuseColor.rgb = mix(diffuseColor.rgb, clamp(huggGrainTint, 0.0, 1.0), huggClosedWoodWarmZone * huggTintStrength);",
                      "float huggClosedFabricRestoreMask = (1.0 - max(huggClosedTopSlabZ, huggClosedShelfZone)) * (1.0 - smoothstep(0.045, 0.135, huggRmB));",
                      "diffuseColor.rgb = mix(diffuseColor.rgb, huggOrigDiffuse, huggClosedFabricRestoreMask);",
                    ].join("\n")
                  : [
                      // Open Hugg side/rectangular GLBs can bake the exposed table deck
                      // as neutral upholstery. Treat only the upper, centered,
                      // top-facing deck as wood so the pulled-out cushion remains fabric.
                      "float huggOpenNeutralDeckMask = 1.0 - smoothstep(0.025, 0.125, abs(huggRmB));",
                      "float huggOpenDeckZ = smoothstep(huggClosedTopZMax + 0.004, huggClosedTopZMax + 0.080, vHuggCPos.z) * (1.0 - smoothstep(huggChestBeamZTop - 0.140, huggChestBeamZTop + 0.010, vHuggCPos.z));",
                      "float huggOpenDeckZone = huggOpenDeckZ * huggCTopFacing * huggChestSupportCore * huggOpenNeutralDeckMask;",
                      "float huggOpenTableX = 1.0 - smoothstep(huggChestHalfFootprintX * 0.70, huggChestHalfFootprintX * 0.92, abs(vHuggCPos.x - huggChestCenterX));",
                      "float huggOpenTableY = 1.0 - smoothstep(huggChestHalfFootprintY * 0.70, huggChestHalfFootprintY * 0.92, abs(vHuggCPos.y - huggChestCenterY));",
                      "float huggOpenTableTopZone = huggCTopFacing * huggChestTableZ * huggOpenTableX * huggOpenTableY;",
                      "float huggOpenWoodTopZone = max(huggOpenDeckZone, huggOpenTableTopZone);",
                      "diffuseColor.rgb = mix(diffuseColor.rgb, huggChestTopTarget, huggOpenWoodTopZone * 0.86);",
                      "huggChestWoodZone = max(huggChestWoodZone, huggOpenWoodTopZone);",
                      "float huggClosedTopZone = 0.0;",
                    ].join("\n")
              ].join("\n")
            )
            .replace(
              "#include <metalnessmap_fragment>",
              [
                "#include <metalnessmap_fragment>",
                // Zero metalness on warm wood pixels so chrome IBL highlights don't
                // survive on chestnut-tinted surfaces (same logic as black shader).
                "float huggChestnutHighMetal = clamp((metalnessFactor - 0.35) * 5.0, 0.0, 1.0);",
                "metalnessFactor = mix(metalnessFactor, 0.0, max(huggChestWoodZone, huggChestnutHighMetal * huggChestTableZone));",
                "roughnessFactor = mix(roughnessFactor, 0.80, max(huggChestWoodZone, huggChestnutHighMetal * huggChestTableZone) * huggTintStrength);"
              ].join("\n")
            )
            .replace(
              "#include <aomap_fragment>",
              [
                // For the closed tabletop, neutralise the baked AO disk by blending
                // ambientOcclusion toward 1.0 (no occlusion) inside huggClosedTopZone.
                // Outside that zone – legs, ottomans, frame – AO is preserved as-is.
                "#ifdef USE_AOMAP",
                "  float ambientOcclusion = ( texture2D( aoMap, vAoMapUv ).r - 1.0 ) * aoMapIntensity + 1.0;",
                "  float huggEffectiveAO = mix(ambientOcclusion, 1.0, huggClosedTopZone);",
                "  reflectedLight.indirectDiffuse *= huggEffectiveAO;",
                "  #if defined( USE_CLEARCOAT )",
                "    clearcoatSpecularIndirect *= huggEffectiveAO;",
                "  #endif",
                "  #if defined( USE_SHEEN_COLOR )",
                "    sheenSpecularIndirect *= huggEffectiveAO;",
                "  #endif",
                "#endif",
              ].join("\n")
            )
            .replace(
              "#include <opaque_fragment>",
              [
                "#include <opaque_fragment>",
                // Inner-face brightness normalization for chestnut ottoman seats.
                "float huggCOttZone = smoothstep(huggChestBeamZTop, huggChestBeamZTop + 0.12, vHuggCPos.z);",
                "float huggCNotTop = 1.0 - smoothstep(0.52, 0.80, -vHuggCNorm.z);",
                "vec2 huggCPosDir = normalize(vec2(vHuggCPos.x - huggChestCenterX, vHuggCPos.y - huggChestCenterY) + vec2(0.001, 0.001));",
                "float huggCIsInner = clamp(-dot(huggCPosDir, vec2(vHuggCNorm.x, vHuggCNorm.y)), 0.0, 1.0);",
                "float huggCCurLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
                // Gentle lift: only dark pixels (luma < 0.4) get up to 18% boost.
                "float huggCLift = 1.0 + 0.18 * (1.0 - clamp(huggCCurLuma * 2.5, 0.0, 1.0));",
                "vec3 huggCLifted = gl_FragColor.rgb * huggCLift;",
                "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggCLifted, huggCOttZone * huggCNotTop * huggCIsInner * 0.70);",
                isHuggClosedLayout
                  ? [
                      "float huggCFinalTopish = smoothstep(0.55, 0.85, abs(vHuggCNorm.z));",
                      "float huggCFinalNeutralAlbedo = 1.0 - smoothstep(0.10, 0.24, abs(huggRmB));",
                      "float huggCFinalFabricGuard = (1.0 - huggClosedTopSlabZ) * huggCFinalTopish * huggCFinalNeutralAlbedo;",
                      "float huggCFinalFabricLuma = max(dot(huggFabricTone, vec3(0.2126, 0.7152, 0.0722)), 0.001);",
                      "float huggCFinalCurLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
                      "vec3 huggCFinalFabricTone = huggFabricTone * clamp(huggCFinalCurLuma / huggCFinalFabricLuma, 0.45, 1.25);",
                      "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggCFinalFabricTone, huggCFinalFabricGuard * 0.92);",
                    ].join("\n")
                  : "",
                "",
              ].join("\n")
            );
        };
        return;
      }

      // ── BLACK: full dark shader (continues below) ─────────────────────────────
      const geometry = mesh.geometry as THREE.BufferGeometry;
      if (!geometry.boundingBox) {
        geometry.computeBoundingBox();
      }
      const huggBounds = geometry.boundingBox?.clone() ?? new THREE.Box3();
      const huggSize = new THREE.Vector3();
      const huggCenter = new THREE.Vector3();
      huggBounds.getSize(huggSize);
      huggBounds.getCenter(huggCenter);

      const huggBeamHalfWidthX = Math.max(huggSize.x * 0.12, 0.048);

      // The Hugg GLB stores mesh geometry in Blender Z-up local space (not converted
      // to GLTF Y-up in vertex data). In this model:
      //   Z_local is INVERTED HEIGHT: minZ ≈ -0.39 = tabletop top, maxZ ≈ +0.39 = floor.
      //   Y_local is DEPTH (front-back), X_local is left-right.
      // All height-based detection must use Z_local with inverted comparisons.
      const huggBeamZFeather = Math.max(huggSize.z * 0.04, 0.015);
      // huggBeamZTop: Z threshold where beam starts below the tabletop slab (35% from minZ).
      const huggBeamZTop = huggBounds.min.z + huggSize.z * 0.35;
      // huggTabletopZMax: upper Z bound for the tabletop face zone (top 10% of Z range).
      const huggTabletopZMax = huggBounds.min.z + huggSize.z * 0.10;
      const huggClosedTopZMax = huggBounds.min.z + huggSize.z * 0.022;
      // Corner-post detection: half-footprint dimensions (bounding box includes ottomans).
      // Corner posts are at |X|≈50% and |Y|≈50% of the half-footprint simultaneously.
      // Side ottomans are large in only ONE axis, so the product X×Y filters them out.
      const huggHalfFootprintX = huggSize.x * 0.5;
      const huggHalfFootprintY = huggSize.y * 0.5;
      const huggBeamCenterY = huggCenter.y;

      // Simplified black path: match chestnut structure/readability, but with
      // black wood/table treatment and no global upholstery flattening passes.
      if (isBlackVariant) {
        material.customProgramCacheKey = () =>
          [
            "hugg-black-preserve-fabric-v79",
            tintHex,
            tintStrength,
            huggTabletopZMax,
            huggClosedTopZMax,
            huggBeamZTop,
            isHuggClosedLayout ? 1 : 0,
          ].join(":");
        material.onBeforeCompile = (shader) => {
          shader.uniforms.huggTintColor = { value: tintColor };
          shader.uniforms.huggFabricTone = { value: huggFabricTone };
          shader.uniforms.huggTabletopZMax = { value: huggTabletopZMax };
          shader.uniforms.huggClosedTopZMax = { value: huggClosedTopZMax };
          shader.uniforms.huggTintStrength = { value: tintStrength };
          shader.uniforms.huggBeamZTop = { value: huggBeamZTop };
          shader.uniforms.huggBeamCenterX = { value: huggCenter.x };
          shader.uniforms.huggBeamCenterY = { value: huggBeamCenterY };
          shader.uniforms.huggHalfFootprintX = { value: huggHalfFootprintX };
          shader.uniforms.huggHalfFootprintY = { value: huggHalfFootprintY };

          shader.vertexShader = shader.vertexShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying vec3 vHuggLocalPos;\nvarying vec3 vHuggObjNormal;"
            )
            .replace(
              "#include <begin_vertex>",
              "#include <begin_vertex>\nvHuggLocalPos = position;\nvHuggObjNormal = normalize(normal);"
            );

          shader.fragmentShader = shader.fragmentShader
            .replace(
              "#include <common>",
              "#include <common>\nvarying vec3 vHuggLocalPos;\nvarying vec3 vHuggObjNormal;\nuniform vec3 huggTintColor;\nuniform vec3 huggFabricTone;\nuniform float huggTintStrength;\nuniform float huggTabletopZMax;\nuniform float huggClosedTopZMax;\nuniform float huggBeamZTop;\nuniform float huggBeamCenterX;\nuniform float huggBeamCenterY;\nuniform float huggHalfFootprintX;\nuniform float huggHalfFootprintY;"
            )
            .replace(
              "#include <map_fragment>",
              [
                "#include <map_fragment>",
                "vec3 huggOrigDiffuse = diffuseColor.rgb;",
                "float huggRmB = diffuseColor.r - diffuseColor.b;",
                "float huggWarmMask = smoothstep(0.06, 0.14, huggRmB);",
                "float huggLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
                // Z-up local space note: tabletop top at low/negative Z.
                "float huggIsTopFacing = smoothstep(0.52, 0.82, -vHuggObjNormal.z);",
                "float huggIsTopArea = 1.0 - smoothstep(huggTabletopZMax - 0.02, huggTabletopZMax + 0.004, vHuggLocalPos.z);",
                // Tabletop mask uses a center XY footprint box, which captures the whole
                // table surface while excluding off-center seat tops.
                "float huggTableX = 1.0 - smoothstep(huggHalfFootprintX * 0.62, huggHalfFootprintX * 0.78, abs(vHuggLocalPos.x - huggBeamCenterX));",
                "float huggTableY = 1.0 - smoothstep(huggHalfFootprintY * 0.62, huggHalfFootprintY * 0.78, abs(vHuggLocalPos.y - huggBeamCenterY));",
                "float huggTableXYMask = huggTableX * huggTableY;",
                "float huggTopSurfaceMask = huggIsTopFacing * huggIsTopArea * huggTableXYMask;",
                isHuggClosedLayout
                  ? "float huggBOpenShelfZone = 0.0;"
                  : [
                      "float huggBOpenNeutralDeckMask = 1.0 - smoothstep(0.025, 0.125, abs(huggRmB));",
                      "float huggBOpenDeckZ = smoothstep(huggClosedTopZMax + 0.004, huggClosedTopZMax + 0.080, vHuggLocalPos.z) * (1.0 - smoothstep(huggBeamZTop - 0.140, huggBeamZTop + 0.010, vHuggLocalPos.z));",
                      "float huggBOpenShelfZone = huggBOpenDeckZ * huggIsTopFacing * huggTableXYMask * huggBOpenNeutralDeckMask;",
                    ].join("\n"),
                "float huggOttomanZoneMap = smoothstep(huggBeamZTop - 0.08, huggBeamZTop + 0.14, vHuggLocalPos.z);",
                "float huggLegCoreX = 1.0 - smoothstep(huggHalfFootprintX * 0.08, huggHalfFootprintX * 0.18, abs(vHuggLocalPos.x - huggBeamCenterX));",
                "float huggLegCoreY = 1.0 - smoothstep(huggHalfFootprintY * 0.08, huggHalfFootprintY * 0.18, abs(vHuggLocalPos.y - huggBeamCenterY));",
                "float huggCrossReachXMap = 1.0 - smoothstep(huggHalfFootprintX * 0.64, huggHalfFootprintX * 0.88, abs(vHuggLocalPos.x - huggBeamCenterX));",
                "float huggCrossReachYMap = 1.0 - smoothstep(huggHalfFootprintY * 0.64, huggHalfFootprintY * 0.88, abs(vHuggLocalPos.y - huggBeamCenterY));",
                "float huggCrossArmXMap = huggLegCoreX * huggCrossReachYMap;",
                "float huggCrossArmYMap = huggLegCoreY * huggCrossReachXMap;",
                "float huggCrossStructureMaskMap = max(huggCrossArmXMap, huggCrossArmYMap);",
                "float huggWoodMaskMap = huggWarmMask * huggCrossStructureMaskMap * (1.0 - huggOttomanZoneMap);",
                "float huggLegCross = max(huggLegCoreX, huggLegCoreY);",
                "float huggSeatPerimeterBlock = max(smoothstep(huggHalfFootprintX * 0.50, huggHalfFootprintX * 0.78, abs(vHuggLocalPos.x - huggBeamCenterX)), smoothstep(huggHalfFootprintY * 0.50, huggHalfFootprintY * 0.78, abs(vHuggLocalPos.y - huggBeamCenterY)));",
                "float huggCenterWoodAlbedoMask = max(huggWarmMask * (1.0 - smoothstep(0.42, 0.62, huggLuma)), 1.0 - smoothstep(0.10, 0.24, huggLuma));",
                "float huggCenterLegWoodMask = huggLegCross * (1.0 - huggSeatPerimeterBlock) * huggCenterWoodAlbedoMask;",
                "float huggWoodMaskFinal = max(huggWoodMaskMap, huggCenterLegWoodMask);",
                // Apply black grain tint to wood-like warm pixels; leaves upholstery intact.
                "vec3 huggBlackTint = vec3(0.055);",
                "diffuseColor.rgb = mix(diffuseColor.rgb, huggBlackTint, huggWoodMaskFinal * huggTintStrength * 0.98);",
                // Force true tabletop black regardless of base texture warmth.
                "vec3 huggTopBlackTint = vec3(0.030);",
                "diffuseColor.rgb = mix(diffuseColor.rgb, huggTopBlackTint, max(huggTopSurfaceMask, huggBOpenShelfZone) * 0.985);",
                isHuggClosedLayout
                  ? [
                      "float huggBClosedTopSlabZ = 1.0 - smoothstep(huggClosedTopZMax - 0.002, huggClosedTopZMax + 0.003, vHuggLocalPos.z);",
                      "float huggBClosedNeutralMask = 1.0 - smoothstep(0.025, 0.110, abs(huggRmB));",
                      "float huggBClosedLightFabricMask = smoothstep(0.42, 0.62, huggLuma) * huggBClosedNeutralMask;",
                      "vec3 huggBClosedBlackGrain = mix(vec3(0.010), vec3(0.060), smoothstep(0.10, 0.84, clamp(pow(huggLuma, 0.70), 0.0, 1.0)));",
                      "vec3 huggBClosedCleanTop = vec3(0.030);",
                      "float huggBClosedTopZone = huggBClosedTopSlabZ * (1.0 - huggBClosedLightFabricMask);",
                      "diffuseColor.rgb = mix(diffuseColor.rgb, huggBClosedCleanTop, huggBClosedTopZone);",
                      "float huggBClosedShelfZ = smoothstep(huggClosedTopZMax + 0.004, huggClosedTopZMax + 0.030, vHuggLocalPos.z) * (1.0 - smoothstep(huggBeamZTop - 0.150, huggBeamZTop - 0.055, vHuggLocalPos.z));",
                      "float huggBClosedShelfTop = smoothstep(0.42, 0.78, -vHuggObjNormal.z);",
                      "float huggBClosedShelfZone = huggBClosedShelfZ * huggBClosedShelfTop * huggTableXYMask;",
                      "diffuseColor.rgb = mix(diffuseColor.rgb, huggBClosedCleanTop, huggBClosedShelfZone * 0.98);",
                      "float huggBClosedUpperWoodZ = 1.0 - smoothstep(huggBeamZTop - 0.08, huggBeamZTop + 0.02, vHuggLocalPos.z);",
                      "float huggBClosedWoodZone = huggBClosedUpperWoodZ * huggWarmMask * (1.0 - huggBClosedLightFabricMask);",
                      "diffuseColor.rgb = mix(diffuseColor.rgb, huggBClosedBlackGrain, huggBClosedWoodZone * 0.96);",
                      "float huggBClosedFabricRestoreMask = (1.0 - max(huggBClosedTopSlabZ, huggBClosedShelfZone)) * (1.0 - smoothstep(0.045, 0.135, huggRmB));",
                      "diffuseColor.rgb = mix(diffuseColor.rgb, huggOrigDiffuse, huggBClosedFabricRestoreMask);",
                    ].join("\n")
                  : [
                      "float huggBClosedTopSlabZ = 0.0;",
                      "float huggBClosedTopZone = 0.0;",
                      "float huggBClosedShelfZone = 0.0;",
                      "float huggBClosedLightFabricMask = 0.0;",
                    ].join("\n"),
              ].join("\n")
            )
            .replace(
              "#include <metalnessmap_fragment>",
              [
                "#include <metalnessmap_fragment>",
                // Keep black wood matte and suppress metallic sheen on tinted pixels.
                "float huggRmB2 = diffuseColor.r - diffuseColor.b;",
                "float huggWarmMask2 = smoothstep(0.06, 0.14, huggRmB2);",
                "float huggTopFacing2 = smoothstep(0.52, 0.82, -vHuggObjNormal.z);",
                "float huggTopArea2 = 1.0 - smoothstep(huggTabletopZMax - 0.02, huggTabletopZMax + 0.004, vHuggLocalPos.z);",
                "float huggTableX2 = 1.0 - smoothstep(huggHalfFootprintX * 0.62, huggHalfFootprintX * 0.78, abs(vHuggLocalPos.x - huggBeamCenterX));",
                "float huggTableY2 = 1.0 - smoothstep(huggHalfFootprintY * 0.62, huggHalfFootprintY * 0.78, abs(vHuggLocalPos.y - huggBeamCenterY));",
                "float huggTableXYMask2 = huggTableX2 * huggTableY2;",
                "float huggTopMask2 = huggTopFacing2 * huggTopArea2 * huggTableXYMask2;",
                "float huggOttomanZone2 = smoothstep(huggBeamZTop - 0.08, huggBeamZTop + 0.14, vHuggLocalPos.z);",
                "float huggLegCoreX2 = 1.0 - smoothstep(huggHalfFootprintX * 0.08, huggHalfFootprintX * 0.18, abs(vHuggLocalPos.x - huggBeamCenterX));",
                "float huggLegCoreY2 = 1.0 - smoothstep(huggHalfFootprintY * 0.08, huggHalfFootprintY * 0.18, abs(vHuggLocalPos.y - huggBeamCenterY));",
                "float huggCrossReachX2 = 1.0 - smoothstep(huggHalfFootprintX * 0.64, huggHalfFootprintX * 0.88, abs(vHuggLocalPos.x - huggBeamCenterX));",
                "float huggCrossReachY2 = 1.0 - smoothstep(huggHalfFootprintY * 0.64, huggHalfFootprintY * 0.88, abs(vHuggLocalPos.y - huggBeamCenterY));",
                "float huggCrossArmX2 = huggLegCoreX2 * huggCrossReachY2;",
                "float huggCrossArmY2 = huggLegCoreY2 * huggCrossReachX2;",
                "float huggCrossStructureMask2 = max(huggCrossArmX2, huggCrossArmY2);",
                "float huggLegCross2 = max(huggLegCoreX2, huggLegCoreY2);",
                "float huggSeatPerimeterBlock2 = max(smoothstep(huggHalfFootprintX * 0.50, huggHalfFootprintX * 0.78, abs(vHuggLocalPos.x - huggBeamCenterX)), smoothstep(huggHalfFootprintY * 0.50, huggHalfFootprintY * 0.78, abs(vHuggLocalPos.y - huggBeamCenterY)));",
                "float huggCenterLegWoodMask2 = huggLegCross2 * (1.0 - huggSeatPerimeterBlock2);",
                "float huggWoodMask2 = max(max(max(huggWarmMask2 * huggCrossStructureMask2 * (1.0 - huggOttomanZone2), huggCenterLegWoodMask2), huggTopMask2), huggBOpenShelfZone);",
                "metalnessFactor = mix(metalnessFactor, 0.0, huggWoodMask2);",
                "roughnessFactor = mix(roughnessFactor, 0.78, huggWarmMask2 * huggTintStrength);",
                "roughnessFactor = mix(roughnessFactor, 0.86, huggTopMask2);",
              ].join("\n")
            )
            .replace(
              "#include <opaque_fragment>",
              [
                "#include <opaque_fragment>",
                // Post-lighting tabletop normalization for black finish.
                // This removes residual multi-shade patches from IBL/specular/AO.
                "float huggTopFacingF = smoothstep(0.52, 0.82, -vHuggObjNormal.z);",
                "float huggTopAreaF = 1.0 - smoothstep(huggTabletopZMax - 0.02, huggTabletopZMax + 0.004, vHuggLocalPos.z);",
                "float huggTableXF = 1.0 - smoothstep(huggHalfFootprintX * 0.62, huggHalfFootprintX * 0.78, abs(vHuggLocalPos.x - huggBeamCenterX));",
                "float huggTableYF = 1.0 - smoothstep(huggHalfFootprintY * 0.62, huggHalfFootprintY * 0.78, abs(vHuggLocalPos.y - huggBeamCenterY));",
                "float huggTableXYMaskF = huggTableXF * huggTableYF;",
                "float huggTopMaskF = huggTopFacingF * huggTopAreaF * huggTableXYMaskF;",
                // Hard-lock full table structure (top + cross arms + center leg) to one black.
                "float huggCrossCoreX = 1.0 - smoothstep(huggHalfFootprintX * 0.08, huggHalfFootprintX * 0.18, abs(vHuggLocalPos.x - huggBeamCenterX));",
                "float huggCrossCoreY = 1.0 - smoothstep(huggHalfFootprintY * 0.08, huggHalfFootprintY * 0.18, abs(vHuggLocalPos.y - huggBeamCenterY));",
                "float huggCrossReachX = 1.0 - smoothstep(huggHalfFootprintX * 0.64, huggHalfFootprintX * 0.88, abs(vHuggLocalPos.x - huggBeamCenterX));",
                "float huggCrossReachY = 1.0 - smoothstep(huggHalfFootprintY * 0.64, huggHalfFootprintY * 0.88, abs(vHuggLocalPos.y - huggBeamCenterY));",
                "float huggCrossArmX = huggCrossCoreX * huggCrossReachY;",
                "float huggCrossArmY = huggCrossCoreY * huggCrossReachX;",
                "float huggCrossMask = max(huggCrossArmX, huggCrossArmY);",
                "float huggCenterLegCore = huggCrossCoreX * huggCrossCoreY;",
                // Catch tabletop side rim just below the top face.
                "float huggTopRimZ = 1.0 - smoothstep(huggTabletopZMax + 0.01, huggTabletopZMax + 0.08, vHuggLocalPos.z);",
                "float huggTopRimMask = huggTableXYMaskF * (1.0 - huggTopFacingF) * huggTopRimZ;",
                "float huggClosedRimWideX = 1.0 - smoothstep(huggHalfFootprintX * 0.84, huggHalfFootprintX * 1.02, abs(vHuggLocalPos.x - huggBeamCenterX));",
                "float huggClosedRimWideY = 1.0 - smoothstep(huggHalfFootprintY * 0.84, huggHalfFootprintY * 1.02, abs(vHuggLocalPos.y - huggBeamCenterY));",
                "float huggClosedUpperRimZ = 1.0 - smoothstep(huggBeamZTop - 0.10, huggBeamZTop + 0.22, vHuggLocalPos.z);",
                "float huggClosedTopApronZ = 1.0 - smoothstep(huggTabletopZMax + 0.018, huggBeamZTop + 0.018, vHuggLocalPos.z);",
                "float huggClosedTopApronSide = 1.0 - smoothstep(0.24, 0.56, abs(vHuggObjNormal.z));",
                "float huggClosedTopApronMask = 0.0;",
                "float huggClosedShelfMaskF = max(huggBClosedShelfZone, huggBOpenShelfZone);",
                "float huggClosedRimWideMask = huggClosedRimWideX * huggClosedRimWideY * (1.0 - huggTopMaskF) * max(huggTopRimZ, huggClosedUpperRimZ);",
                // Z-up local note: higher local Z moves toward ottoman bottoms; exclude that zone.
                // Gate structure mask out at the ottoman boundary so nested seat tops never get blacked.
                "float huggStructureZGate = 1.0;",
                "float huggStructureWoodAlbedoMask = max(huggWarmMask * (1.0 - smoothstep(0.42, 0.62, huggLuma)), 1.0 - smoothstep(0.10, 0.24, huggLuma));",
                "float huggStructureBodyMask = max(huggCrossMask, huggCenterLegCore) * huggStructureZGate * (1.0 - huggTopMaskF) * huggStructureWoodAlbedoMask;",
                "float huggClosedCornerPostX = smoothstep(huggHalfFootprintX * 0.78, huggHalfFootprintX * 0.94, abs(vHuggLocalPos.x - huggBeamCenterX));",
                "float huggClosedCornerPostY = smoothstep(huggHalfFootprintY * 0.78, huggHalfFootprintY * 0.94, abs(vHuggLocalPos.y - huggBeamCenterY));",
                "float huggClosedCornerPostZ = 1.0 - smoothstep(huggBeamZTop - 0.07, huggBeamZTop + 0.08, vHuggLocalPos.z);",
                "float huggClosedVerticalSide = 1.0 - smoothstep(0.28, 0.58, abs(vHuggObjNormal.z));",
                "float huggClosedCornerPostMask = clamp(huggClosedCornerPostX * huggClosedCornerPostY * 2.2, 0.0, 1.0) * huggClosedCornerPostZ * huggClosedVerticalSide * (1.0 - huggTopMaskF);",
                "float huggClosedSideRailMask = 0.0;",
                "float huggTableStructureMask = max(max(max(max(huggTopMaskF, huggTopRimMask), huggClosedTopApronMask), huggClosedShelfMaskF), max(max(huggStructureBodyMask, huggClosedCornerPostMask), huggClosedSideRailMask));",
                "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.030), huggTableStructureMask);",
                // Hard fabric protection for ottoman zone in black finish.
                "float huggOttomanZoneAllF = smoothstep(huggBeamZTop - 0.10, huggBeamZTop + 0.14, vHuggLocalPos.z);",
                "float huggCenterLegMaskF = huggStructureBodyMask;",
                "float huggSeatRecoverMaskAll = huggOttomanZoneAllF * (1.0 - huggCenterLegMaskF) * (1.0 - huggTableStructureMask);",
                "float huggSeatRecoverCurLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
                "float huggSeatRecoverBaseLuma = max(dot(huggFabricTone, vec3(0.2126, 0.7152, 0.0722)), 0.001);",
                "float huggSeatRecoverWarmGate = smoothstep(0.04, 0.12, huggRmB);",
                "vec3 huggSeatRecoverTintAll = huggFabricTone * clamp(huggSeatRecoverCurLuma / huggSeatRecoverBaseLuma, 0.55, 1.18);",
                "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggSeatRecoverTintAll, huggSeatRecoverMaskAll * huggSeatRecoverWarmGate * 0.85);",
                // Final seat-top recovery: keep ottoman top caps in fabric tone
                // even if tiny mask overlaps happen in table darkening.
                "float huggOttomanZoneF = smoothstep(huggBeamZTop - 0.08, huggBeamZTop + 0.12, vHuggLocalPos.z);",
                "float huggSeatTopRecoverMask = huggTopFacingF * huggOttomanZoneF * (1.0 - huggTopMaskF) * (1.0 - huggTableStructureMask);",
                "float huggSeatTopRecoverCurLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
                "vec3 huggSeatTopRecoverTint = huggFabricTone * clamp(huggSeatTopRecoverCurLuma / huggSeatRecoverBaseLuma, 0.62, 1.15);",
                "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggSeatTopRecoverTint, huggSeatTopRecoverMask * huggSeatRecoverWarmGate * 0.7);",
                // Final perimeter-seat cleanup: removes any remaining dark contamination
                // on inner ottoman faces while preserving table structure.
                "float huggSeatXf = smoothstep(huggHalfFootprintX * 0.56, huggHalfFootprintX * 0.90, abs(vHuggLocalPos.x - huggBeamCenterX));",
                "float huggSeatYf = smoothstep(huggHalfFootprintY * 0.56, huggHalfFootprintY * 0.90, abs(vHuggLocalPos.y - huggBeamCenterY));",
                "float huggSeatPerimeterF = max(huggSeatXf, huggSeatYf);",
                "float huggSeatBodyZoneF = smoothstep(huggBeamZTop - 0.10, huggBeamZTop + 0.20, vHuggLocalPos.z);",
                "float huggSeatBodyRecoverMask = huggSeatPerimeterF * huggSeatBodyZoneF * (1.0 - huggTableStructureMask);",
                "float huggFinalLumaF = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
                "vec3 huggSeatBodyRecoverTint = huggFabricTone * clamp(huggFinalLumaF / huggSeatRecoverBaseLuma, 0.58, 1.12);",
                "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggSeatBodyRecoverTint, huggSeatBodyRecoverMask * huggSeatRecoverWarmGate * 0.75);",
                // Absolute final safety net: perimeter ottoman pixels must remain fabric.
                "float huggSeatHardX = smoothstep(huggHalfFootprintX * 0.42, huggHalfFootprintX * 0.82, abs(vHuggLocalPos.x - huggBeamCenterX));",
                "float huggSeatHardY = smoothstep(huggHalfFootprintY * 0.42, huggHalfFootprintY * 0.82, abs(vHuggLocalPos.y - huggBeamCenterY));",
                "float huggSeatHardPerimeter = max(huggSeatHardX, huggSeatHardY);",
                "float huggSeatHardZone = smoothstep(huggBeamZTop - 0.12, huggBeamZTop + 0.22, vHuggLocalPos.z);",
                "float huggSeatHardMask = huggSeatHardPerimeter * huggSeatHardZone * (1.0 - huggTableStructureMask);",
                "float huggSeatHardLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
                "vec3 huggSeatHardTint = huggFabricTone * clamp(huggSeatHardLuma / huggSeatRecoverBaseLuma, 0.58, 1.12);",
                "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggSeatHardTint, huggSeatHardMask * huggSeatRecoverWarmGate * 0.65);",
                "float huggClosedUpperWarmWoodMask = smoothstep(0.045, 0.115, huggRmB) * (1.0 - smoothstep(0.42, 0.58, huggLuma)) * (1.0 - huggBClosedLightFabricMask);",
                "float huggClosedUpperWoodLipMask = huggClosedUpperRimZ * (1.0 - huggTopMaskF) * huggClosedUpperWarmWoodMask;",
                "float huggClosedWarmRimMask = huggClosedRimWideMask * huggClosedUpperWarmWoodMask;",
                "float huggClosedSupportReassertMask = max(max(max(max(huggClosedWarmRimMask, huggClosedTopApronMask), huggClosedCornerPostMask), huggClosedSideRailMask), max(huggStructureBodyMask, huggClosedUpperWoodLipMask));",
                "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.030), huggClosedSupportReassertMask);",
                "float huggBFinalWarmGlow = smoothstep(0.015, 0.065, gl_FragColor.r - gl_FragColor.b);",
                "float huggBFinalSideFace = 1.0 - smoothstep(0.30, 0.62, abs(vHuggObjNormal.z));",
                "float huggBFinalSourceNotBright = 1.0 - smoothstep(0.54, 0.72, huggLuma);",
                "float huggBFinalSupportZ = 1.0 - smoothstep(huggBeamZTop - 0.08, huggBeamZTop + 0.018, vHuggLocalPos.z);",
                "float huggBFinalWarmSupportMask = huggBFinalWarmGlow * huggBFinalSourceNotBright * huggBFinalSupportZ * huggBFinalSideFace * (1.0 - huggTopMaskF);",
                "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.030), huggBFinalWarmSupportMask);",
                "float huggBFinalTopish = smoothstep(0.55, 0.85, abs(vHuggObjNormal.z));",
                "float huggBFinalNeutralAlbedo = 1.0 - smoothstep(0.10, 0.24, abs(huggRmB));",
                "float huggBFinalFabricGuard = (1.0 - huggBClosedTopSlabZ) * huggBFinalTopish * huggBFinalNeutralAlbedo;",
                "float huggBFinalFabricLuma = max(dot(huggFabricTone, vec3(0.2126, 0.7152, 0.0722)), 0.001);",
                "float huggBFinalCurLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
                "vec3 huggBFinalFabricTone = huggFabricTone * clamp(huggBFinalCurLuma / huggBFinalFabricLuma, 0.45, 1.25);",
                "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggBFinalFabricTone, huggBFinalFabricGuard * 0.0);",
                "float huggFinalSolidStructureMask = max(max(max(max(huggTopMaskF, huggTopRimMask), huggClosedTopApronMask), huggClosedShelfMaskF), max(max(huggStructureBodyMask, huggClosedCornerPostMask), huggClosedSideRailMask));",
                "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.030), huggFinalSolidStructureMask);",
                // The rectangular closed model has a narrow central wood divider
                // between the two tucked ottomans. Clean only that strip; wider
                // fabric-side repainting makes the whole item look unlike the GLB.
                "float huggBCenterSupportX = 1.0 - smoothstep(huggHalfFootprintX * 0.050, huggHalfFootprintX * 0.130, abs(vHuggLocalPos.x - huggBeamCenterX));",
                "float huggBCenterSupportSide = 1.0 - smoothstep(0.24, 0.62, abs(vHuggObjNormal.z));",
                "float huggBCenterSupportMask = huggBCenterSupportX * huggBCenterSupportSide * (1.0 - huggTopMaskF);",
                "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.024), huggBCenterSupportMask * 0.86);",
              ].join("\n")
            );
        };
        return;
      }

      material.customProgramCacheKey = () =>
        [
          "hugg-wood-warmth-metal-tint-v34o",
          tintHex,
          tintStrength,
          huggBeamHalfWidthX,
          huggBeamZTop,
          huggBeamZFeather,
          huggTabletopZMax,
          huggHalfFootprintX,
          huggHalfFootprintY,
        ].join(":");

      material.onBeforeCompile = (shader) => {
        shader.uniforms.huggTintColor = { value: tintColor };
        shader.uniforms.huggFabricTone = { value: huggFabricTone };
        shader.uniforms.huggTabletopZMax = { value: huggTabletopZMax };
        shader.uniforms.huggTintStrength = { value: tintStrength };
        shader.uniforms.huggBeamCenterX = { value: huggCenter.x };
        shader.uniforms.huggBeamHalfWidthX = { value: huggBeamHalfWidthX };
        shader.uniforms.huggBeamZTop = { value: huggBeamZTop };
        shader.uniforms.huggBeamZFeather = { value: huggBeamZFeather };
        shader.uniforms.huggHalfFootprintX = { value: huggHalfFootprintX };
        shader.uniforms.huggHalfFootprintY = { value: huggHalfFootprintY };
        shader.uniforms.huggBeamCenterY = { value: huggBeamCenterY };

        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vHuggLocalPos;\nvarying vec3 vHuggObjNormal;"
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvHuggLocalPos = position;\nvHuggObjNormal = normalize(normal);"
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vHuggLocalPos;\nvarying vec3 vHuggObjNormal;\nuniform vec3 huggTintColor;\nuniform vec3 huggFabricTone;\nuniform float huggTintStrength;\nuniform float huggBeamCenterX;\nuniform float huggBeamHalfWidthX;\nuniform float huggBeamZTop;\nuniform float huggBeamZFeather;\nuniform float huggTabletopZMax;\nuniform float huggHalfFootprintX;\nuniform float huggHalfFootprintY;\nuniform float huggBeamCenterY;"
          )
          .replace(
            // Pass 1 (albedo): warm-coloured pixels (oak tabletop, rim, frame) are
            // caught by R-B warmth and tinted. Save original diffuse + luma for re-use
            // in the metalness pass below.
            "#include <map_fragment>",
            [
              "#include <map_fragment>",
              "float huggRmB = diffuseColor.r - diffuseColor.b;",
              // smoothstep(0.06, 0.14): full mask at R-B ≥ 0.14, zero at R-B ≤ 0.06.
              // Catches warm-painted posts and frame apron (R-B ≈ 0.08-0.25).
              "float huggWarmMask = smoothstep(0.06, 0.14, huggRmB);",
              "float huggLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
              "vec3 huggOrigDiffuse = diffuseColor.rgb;",
              // Black frame veneer is neutral-dark in texture (R-B ≈ 0, warmMask ≈ 0).
              // No fabricGuard needed: warmth detection never fires on the neutral black frame.
              // Hugg GLB geometry is in Blender Z-up local space: Z is INVERTED height
              // (minZ ≈ -0.39 = tabletop top, maxZ ≈ +0.39 = floor). The "up" direction
              // is therefore -Z_local.  A flat tabletop face has normal.z ≈ -1.0.
              "float huggIsTopFacing = smoothstep(0.55, 0.85, -vHuggObjNormal.z);",
              // Tabletop face is in the top 10% of Z range from minZ.
              // Gate: Z_local < huggTabletopZMax  (tabletop is at low/negative Z).
              "float huggIsTopArea = 1.0 - smoothstep(huggTabletopZMax, huggTabletopZMax + 0.02, vHuggLocalPos.z);",
              // Tabletop surface mask: upward-facing AND in the top Z zone of the mesh
              "float huggTopSurfaceMask = huggIsTopFacing * huggIsTopArea;",
              // Corner-post geometric mask: detects the four vertical corner posts by
              // their position at the OUTER CORNERS of the table footprint (large |X|
              // AND large |Y| simultaneously).  Side ottomans are only large in one
              // axis so the product X_frac×Y_frac stays near zero for them.
              // Amplified ×3 so corner posts (both fracs ≈ 0.75) reach the 1.0 clamp.
              "float huggCornerXFrac = smoothstep(huggHalfFootprintX * 0.36, huggHalfFootprintX * 0.60, abs(vHuggLocalPos.x - huggBeamCenterX));",
              "float huggCornerYFrac = smoothstep(huggHalfFootprintY * 0.36, huggHalfFootprintY * 0.60, abs(vHuggLocalPos.y - huggBeamCenterY));",
              // Z height gate: corner posts only need darkening in the upper section of the
              // model. huggBeamZTop (at 35% from top ≈ -0.117) is already ABOVE the ottoman
              // top surface (≈ -0.05). Setting the gate to reach 0.0 exactly at huggBeamZTop
              // guarantees ALL ottoman pixels (Z ≥ huggBeamZTop) have gate = 0.
              // The upper corner-post zone (Z < huggBeamZTop - 0.10 ≈ -0.217) stays fully lit.
              "float huggCornerZGate = 1.0 - smoothstep(huggBeamZTop - 0.10, huggBeamZTop, vHuggLocalPos.z);",
              "float huggCornerPostMask = clamp(huggCornerXFrac * huggCornerYFrac * 3.0, 0.0, 1.0) * (1.0 - huggIsTopFacing) * huggCornerZGate;",
              // Side-rail mask: for Black variant the frame is neutral-dark (warmMask ≈ 0)
              // so warmMask detection provides no benefit for the frame and would fire
              // on warm fabrics (Performance Dune, warmMask = 1.0). Set to 0.
              // Outer-perimeter darkening at the transition zone (Z ≈ 0) is handled by
              // huggOuterFrameMask which is Z-gated and not warmth-dependent.
              "float huggSideRailMask = 0.0;",
              // Ottoman zone flag: 0 in the upper frame/apron area (Z < huggBeamZTop),
              // 1 in the lower ottoman area (Z > huggBeamZTop + 0.10).  Used to switch
              // the top-facing protection logic between frame zone and ottoman zone.
              // Uses adaptive huggBeamZTop so GLBs with different mesh origins work correctly
              // (e.g., dune-closed.glb has origin at floor so all Z values are negative).
              "float huggOttomanZone = smoothstep(huggBeamZTop, huggBeamZTop + 0.10, vHuggLocalPos.z);",
              // Wider seat zone that includes the transition band just above ottomanZone,
              // preventing black frame darkening from bleeding into upper fabric sides.
              "float huggSeatZone = smoothstep(huggBeamZTop - 0.20, huggBeamZTop + 0.12, vHuggLocalPos.z);",
              // Outer-frame structural mask: Z-gated for apron (Z < huggBeamZTop).
              // Catches outer perimeter pixels in the frame apron zone that show warm IBL glow.
              // Uses adaptive huggBeamZTop to avoid darkening ottoman fabric on GLBs where
              // the ottoman bodies sit entirely at negative Z (e.g., dune-closed.glb).
              "float huggOuterFrameZGate = 1.0 - smoothstep(huggBeamZTop, huggBeamZTop + 0.05, vHuggLocalPos.z);",
              "float huggOuterFrameMask = max(huggCornerXFrac, huggCornerYFrac) * huggOuterFrameZGate * (1.0 - huggIsTopFacing);",
              // Black frame veneer is neutral-dark (R-B ≈ 0) → warmMask ≈ 0 → warmth detection
              // provides no benefit for catching the black frame but HARMS warm fabrics:
              // Performance Dune has R-B ≈ 0.15 (warmMask = 1.0) so warmMaskWood would darken it.
              // Geometric masks (cornerPost, outerFrame, sideRail) handle all Black-frame darkening.
              "float huggWarmMaskWood = 0.0;",
              "float huggFrameMask = max(max(max(huggWarmMaskWood, huggCornerPostMask), huggSideRailMask), huggOuterFrameMask);",
              "float huggCornerProduct = clamp(huggCornerXFrac * huggCornerYFrac * 3.0, 0.0, 1.0);",
              "float huggSeatFabricProtect = huggSeatZone * (1.0 - huggCornerProduct);",
              // Combined mask for the non-destructive grain-tint step: warm pixels + tabletop face.
              "float huggCombinedMask = max(huggWarmMaskWood, huggTopSurfaceMask);",
              // Top-facing seat caps should remain fabric in black variants.
              "float huggSeatTopProtect = huggIsTopFacing * huggSeatZone * (1.0 - huggTopSurfaceMask);",
              "vec3 huggGrainTint = mix(vec3(0.010), vec3(0.34), smoothstep(0.10, 0.72, clamp(pow(huggLuma, 0.78), 0.0, 1.0)));",
              "diffuseColor.rgb = mix(diffuseColor.rgb, clamp(huggGrainTint, 0.0, 1.0), huggTintStrength * huggCombinedMask);",
              // Hard dark override, Z-conditional top-facing gate:
              // - Frame zone (Z < -0.10, ottomanZone ≈ 0): full-strength override (mix weight = 1.0).
              //   Frame apron top edges are slightly top-facing but MUST still go dark.
              // - Ottoman zone (Z > 0, ottomanZone ≈ 1.0): gate with (1-isTopFacing) so cushion
              //   tops and bevels are excluded.  Side faces (isTopFacing ≈ 0) are unaffected.
              "diffuseColor.rgb = mix(diffuseColor.rgb, clamp(huggGrainTint * 0.92, 0.0, 1.0), huggFrameMask * (1.0 - huggSeatFabricProtect) * (1.0 - huggSeatTopProtect) * 0.90 * mix(1.0, (1.0 - huggIsTopFacing), huggOttomanZone));",
              // Hard override for the tabletop face: handles neutral/white base colour
              // (warm mask = 0 when texture R-B < 0.06) ensuring the surface goes dark.
              "vec3 huggTopBlackTint = mix(vec3(0.010), vec3(0.22), smoothstep(0.10, 0.86, clamp(pow(huggLuma, 0.68), 0.0, 1.0)));",
              "diffuseColor.rgb = mix(diffuseColor.rgb, huggTopBlackTint, huggTopSurfaceMask * 0.84);",
              // Axis-agnostic fabric recolor for black wood variant.
              // Some Hugg GLBs have axis/layout differences that make pure Z-gating
              // miss ottoman side panels, leaving silver/chrome-looking baked albedo.
              // Recolor non-top mid/high-luma body regions directly to the fabric tone.
              "float huggBodyFabricMask = smoothstep(0.30, 0.78, huggLuma) * (1.0 - huggTopSurfaceMask);",
              "vec3 huggBodyFabricTint = mix(huggFabricTone * 0.90, huggFabricTone * 1.05, clamp(huggLuma, 0.0, 1.0));",
              "diffuseColor.rgb = mix(diffuseColor.rgb, huggBodyFabricTint, huggBodyFabricMask * 0.96);",
              // Keep lower center beam as black wood colour (not fabric recolor).
              "float huggCenterBottomX = 1.0 - smoothstep(huggBeamHalfWidthX * 0.90, huggBeamHalfWidthX * 2.00, abs(vHuggLocalPos.x - huggBeamCenterX));",
              "float huggCenterBottomMask = huggCenterBottomX * huggOttomanZone * (1.0 - huggIsTopFacing);",
              "diffuseColor.rgb = mix(diffuseColor.rgb, clamp(huggGrainTint * 0.92, 0.0, 1.0), huggCenterBottomMask * 0.90);",
              // v33u: corner product + not-diagonal normal + ottoman zone targets the corner post
              // flat face visible in the gap between ottoman bodies.
              // Corner post face has axis-aligned normal ((0,1,0) or (1,0,0))
              // → abs(nx)×abs(ny) ≈ 0 → notDiag = 1.0 → CAUGHT.
              // Curved otto body corners (wrapping from one face to adjacent face)
              // → diagonal normal (nx≈ny≈0.7) → abs(nx)×abs(ny)×6 ≥ 1 → notDiag = 0 → PROTECTED.
              // FabricGuard protects bright cream fabric (luma > 0.78) that happens to be
              // at the flat face ends near the corner gap (axis-aligned, corner product zone).
              "float huggNotDiag = 1.0 - clamp(abs(vHuggObjNormal.x) * abs(vHuggObjNormal.y) * 6.0, 0.0, 1.0);",
              // v33v: switched to (1-warmMask) as fabric discriminator instead of (1-fabricGuard).
              // Golden strip has neutral baked texture (R-B < 0.06) → warmMask = 0 → (1-warmMask) = 1.0
              // → FULL suppression regardless of luma.
              // Cream fabric has warm baked texture (R-B > 0.10) → warmMask ≥ 0.5 → protected.
              // Even AO-shadowed cream fabric retains R-B > 0.06 unless in very deep shadow.
              "float huggLowerPostMask = huggCornerProduct * (1.0 - huggIsTopFacing) * huggOttomanZone * huggNotDiag * (1.0 - huggWarmMask);",
              "diffuseColor.rgb = mix(diffuseColor.rgb, clamp(huggGrainTint * 0.90, 0.0, 1.0), huggLowerPostMask * 0.88);",
            ].join("\n")
          )
          .replace(
            // Raise roughness for warm (wood) pixels → matte finish, not glossy.
            "#include <roughnessmap_fragment>",
            [
              "#include <roughnessmap_fragment>",
              // Raise roughness for beam/frame wood pixels only. Exclude the tabletop
              // face (huggIsTopFacing) so the baked lacquer roughness is preserved there.
              "roughnessFactor = mix(roughnessFactor, 0.72, huggFrameMask * (1.0 - huggIsTopFacing) * huggTintStrength * 0.9);"
            ].join("\n")
          )
          .replace(
            // Pass 2 (metalness): the centre support beam has high per-texel metalness
            // in the baked GLB even though its albedo R-B may be low. Catch those pixels
            // here, tint them and strip the metalness so the IBL gold sheen disappears.
            "#include <metalnessmap_fragment>",
            [
              "#include <metalnessmap_fragment>",
              "float huggHighMetalMask = clamp((metalnessFactor - 0.35) * 5.0, 0.0, 1.0);",
              "float huggMetalNeighborhood = metalnessFactor;",
              // Expand high-metalness detection in UV space to remove small untinted
              // holes on the centre support where baked textures can have micro dropouts.
              "#ifdef USE_METALNESSMAP",
              "vec2 huggUvStep = max(fwidth(vMetalnessMapUv) * 3.0, vec2(0.0012));",
              "float huggMetalCenter = texture2D(metalnessMap, vMetalnessMapUv).b;",
              "float huggMetalPosX = texture2D(metalnessMap, vMetalnessMapUv + vec2(huggUvStep.x, 0.0)).b;",
              "float huggMetalNegX = texture2D(metalnessMap, vMetalnessMapUv - vec2(huggUvStep.x, 0.0)).b;",
              "float huggMetalPosY = texture2D(metalnessMap, vMetalnessMapUv + vec2(0.0, huggUvStep.y)).b;",
              "float huggMetalNegY = texture2D(metalnessMap, vMetalnessMapUv - vec2(0.0, huggUvStep.y)).b;",
              "float huggMetalDiagPP = texture2D(metalnessMap, vMetalnessMapUv + vec2(huggUvStep.x, huggUvStep.y)).b;",
              "float huggMetalDiagPN = texture2D(metalnessMap, vMetalnessMapUv + vec2(huggUvStep.x, -huggUvStep.y)).b;",
              "float huggMetalDiagNP = texture2D(metalnessMap, vMetalnessMapUv + vec2(-huggUvStep.x, huggUvStep.y)).b;",
              "float huggMetalDiagNN = texture2D(metalnessMap, vMetalnessMapUv - vec2(huggUvStep.x, huggUvStep.y)).b;",
              "float huggMetalFarPosX = texture2D(metalnessMap, vMetalnessMapUv + vec2(huggUvStep.x * 2.0, 0.0)).b;",
              "float huggMetalFarNegX = texture2D(metalnessMap, vMetalnessMapUv - vec2(huggUvStep.x * 2.0, 0.0)).b;",
              "float huggMetalFarPosY = texture2D(metalnessMap, vMetalnessMapUv + vec2(0.0, huggUvStep.y * 2.0)).b;",
              "float huggMetalFarNegY = texture2D(metalnessMap, vMetalnessMapUv - vec2(0.0, huggUvStep.y * 2.0)).b;",
              "huggMetalNeighborhood = max(huggMetalCenter, max(max(huggMetalPosX, huggMetalNegX), max(huggMetalPosY, huggMetalNegY)));",
              "huggMetalNeighborhood = max(huggMetalNeighborhood, max(max(huggMetalDiagPP, huggMetalDiagPN), max(huggMetalDiagNP, huggMetalDiagNN)));",
              "huggMetalNeighborhood = max(huggMetalNeighborhood, max(max(huggMetalFarPosX, huggMetalFarNegX), max(huggMetalFarPosY, huggMetalFarNegY)));",
              "float huggExpandedMetalMask = clamp((huggMetalNeighborhood - 0.17) * 5.6, 0.0, 1.0);",
              "huggHighMetalMask = max(huggHighMetalMask, huggExpandedMetalMask);",
              "#endif",
              // Geometry fill: X strip + Z height gate.
              // X gate (12% of width) targets the centre support beam.
              // Z gate: beam starts below the tabletop (Z > huggBeamZTop since Z is inverted height).
              "float huggCenterStripMask = 1.0 - smoothstep(huggBeamHalfWidthX, huggBeamHalfWidthX * 1.5, abs(vHuggLocalPos.x - huggBeamCenterX));",
              // Z gate: beam pixels are in the UPPER zone (near tabletop, more negative Z).
              // 1.0 - smoothstep ensures gate = 1 for Z < huggBeamZTop and 0 for Z > huggBeamZTop,
              // which EXCLUDES the ottomans (positive Z) and INCLUDES only beam-level pixels.
              "float huggCenterZMask = 1.0 - smoothstep(huggBeamZTop - huggBeamZFeather, huggBeamZTop, vHuggLocalPos.z);",
              "float huggCenterBeamMask = clamp(huggCenterStripMask * huggCenterZMask * (1.0 - huggIsTopFacing), 0.0, 1.0);",
              // Merge geometry fill into metal mask so beam pixels not caught by texture
              // metalness sampling are still tinted.
              "huggHighMetalMask = max(huggHighMetalMask, huggCenterBeamMask);",
              // Tint metallic pixels that were NOT already covered by the warm mask.
              "float huggMetalLuma = dot(huggOrigDiffuse, vec3(0.2126, 0.7152, 0.0722));",
              "vec3 huggMetalTint = mix(huggTintColor * 0.65, huggTintColor * 1.1, clamp(huggMetalLuma * 1.1, 0.0, 1.0));",
              "diffuseColor.rgb = mix(diffuseColor.rgb, clamp(huggMetalTint, 0.0, 1.0), huggTintStrength * huggHighMetalMask * (1.0 - huggWarmMask));",
              // Strong smooth override for confirmed beam pixels — no hard threshold,
              // so there's no visible edge artefact on the tabletop surface.
              "diffuseColor.rgb = mix(diffuseColor.rgb, clamp(huggTintColor * 0.9, 0.0, 1.0), huggCenterBeamMask * 0.97);",
              // huggWarmMask used here (not huggCombinedMask) to avoid desaturating the
              // top surface via the roughness pass — top surface roughness is already
              // handled by huggCombinedMask in the roughnessmap pass above.
              "float huggFullWoodMask = max(huggWarmMask, huggHighMetalMask);",
              "metalnessFactor = mix(metalnessFactor, 0.0, huggFullWoodMask);",
              "roughnessFactor = mix(roughnessFactor, 0.82, huggHighMetalMask * huggTintStrength * 0.9);",
              "metalnessFactor = mix(metalnessFactor, 0.0, huggCenterBeamMask);",
              "roughnessFactor = mix(roughnessFactor, 0.90, huggCenterBeamMask);",
              // Fabric material correction: zero metalness and raise roughness for the
              // ottoman-zone pixels (the fabric body).  This eliminates any
              // residual metallic sheen from baked metalness values in the Hugg GLB
              // fabric UV regions.  Uses adaptive huggBeamZTop so the transition zone
              // aligns with the actual frame/ottoman boundary regardless of mesh origin.
              // NOTE: (1-huggWarmMask) is intentionally NOT used here — warm fabrics like
              // Performance Dune have huggWarmMask ≈ 1.0, which would make fabricZone = 0
              // and leave their metalness un-zeroed, causing metallic chrome reflections.
              // The Z-gate (smoothstep from huggBeamZTop) is sufficient to exclude the
              // cross-beam / frame wood pixels that sit below the ottoman zone.
              "float huggFabricZone = smoothstep(huggBeamZTop, huggBeamZTop + 0.10, vHuggLocalPos.z);",
              // Force ottoman body to the expected fabric palette for black wood variants.
              // This avoids silver/chrome-looking baked albedo patches on Basalt/Dune GLBs.
              // Use full ottoman-zone coverage so high-metal baked texels cannot bypass recolor.
              "float huggFabricBodyMask = huggFabricZone;",
              "vec3 huggFabricTint = mix(huggFabricTone * 0.92, huggFabricTone * 1.04, clamp(huggLuma, 0.0, 1.0));",
              "diffuseColor.rgb = mix(diffuseColor.rgb, huggFabricTint, huggFabricBodyMask * 0.16);",
              "metalnessFactor = mix(metalnessFactor, 0.0, huggFabricZone);",
              "roughnessFactor = mix(roughnessFactor, 0.93, huggFabricZone);",
              // Final: hard-clear metalness on the tabletop face regardless of UV
              // expansion bleed — ensures no dark metallic reflections on the surface.
              "metalnessFactor = mix(metalnessFactor, 0.0, huggIsTopFacing);",
              // Force uniform roughness across the tabletop face. The baked UV mapping
              // puts the table-centre near the beam's UV region which has higher roughness,
              // creating a matte dark rectangle contrasting with the glossy outer rim.
              // 0.55 = semi-matte lacquer finish balanced between rim gloss and centre matte.
              "roughnessFactor = mix(roughnessFactor, 0.42, huggTopSurfaceMask);"
            ].join("\n")
          )
          .replace(
            // Side-facing warm pixels (corner legs) retain a golden IBL specular sheen
            // even with near-zero diffuse and metalness=0.  The legs have lower original
            // roughness than the frame (~0.2-0.4 vs ~0.6) so after the warmMask roughness
            // boost they end up at ~0.63 vs ~0.70 — still enough for visible f0=0.08
            // dielectric specular in the warm apartment env.
            // Fix: cap the linear outgoingLight for side-facing warm pixels so IBL
            // specular cannot produce values that render as golden.
            // 0.04 linear ≈ sRGB #24-#28 after typical tone mapping, matching the
            // "very dark" appearance of the already-correctly-dark tabletop.
            // Only side-facing warm pixels are capped (huggTopSurfaceMask excludes
            // the tabletop face, which has its own calibrated diffuse override).
            "#include <opaque_fragment>",
            [
              "#include <opaque_fragment>",
              // Suppress IBL warm-env specular on side-facing warm pixels (corner legs,
              // frame). Even with metalness=0 and near-zero diffuse, the warm apartment
              // env gives a golden IBL specular glow at ~0.13 linear on smooth dielectric
              // surfaces. Mix toward a dark neutral target (0.024 linear ≈ sRGB #1f after
              // ACES filmic tone mapping). The 4× amplification of the partial mask catches
              // bevel/chamfer transition pixels (sideWarmMask ≈ 0.05–0.3) that a simple
              // linear mix would leave noticeably golden.
              // Amplified rail specular mask: for Black variant the frame rail is neutral
              // (warmMask ≈ 0) so warmMask detection fires on warm fabrics (Dune) not the
              // frame. Set to 0; huggOuterFrameMask via huggSideWarmMask handles the frame.
              "float huggRailSpecMask = 0.0;",
              "float huggSideWarmMask = max(max(huggFrameMask, huggRailSpecMask), huggOuterFrameMask) * (1.0 - mix(huggTopSurfaceMask, huggIsTopFacing, huggOttomanZone)) * (1.0 - huggSeatFabricProtect);",
              // Specular multiplier 2.0 (was 4.0): prevents low warmMask values (warm fabric,
              // warmMask 0.1-0.25) from being amplified to near-full suppression.
              // Wood warmMask >= 0.5 still clamps to 1.0 so appearance is unchanged.
              // Rail spec mask is already clamped to [0,1] so 2× just means it stays full.
              "float huggSpecularBlend = clamp(huggSideWarmMask * 2.0, 0.0, 1.0) * 0.97;",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.024), huggSpecularBlend);",
              // Corner post specular suppress (complements diffuse override in map_fragment).
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.05), huggLowerPostMask * 0.80);",
              // v33be: protect both high-luma neutral fabric (basalt, texFabricProtect=1)
              // AND warm-tinted fabric (dune, warmMask=1.0) from the outer warm mask.
              // Black frame rail is neutral-dark: warmMask≈0, luma<0.15 → protect=0 → caught.
              "float huggFinalRmB = gl_FragColor.r - gl_FragColor.b;",
              "float huggFinalWarm = smoothstep(0.04, 0.11, huggFinalRmB);",
              "float huggTexFabricProtect = smoothstep(0.15, 0.35, huggLuma);",
              "float huggOuterWarmMask = max(huggCornerXFrac, huggCornerYFrac) * (1.0 - huggIsTopFacing) * huggFinalWarm * (1.0 - max(huggTexFabricProtect, huggWarmMask));",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.024), huggOuterWarmMask * 0.97);",
              // Final black-variant rescue pass: recolor bright low-chroma side pixels
              // (silver/chrome-looking upholstery texels) toward the configured fabric tone.
              // Keeps top-facing areas (tabletop) and high-chroma metals mostly untouched.
              "float huggFinalLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
              "float huggFinalMaxC = max(max(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);",
              "float huggFinalMinC = min(min(gl_FragColor.r, gl_FragColor.g), gl_FragColor.b);",
              "float huggFinalChroma = huggFinalMaxC - huggFinalMinC;",
              "float huggNonTableSurface = 1.0 - huggTopSurfaceMask;",
              "float huggLowChromaMask = 1.0 - smoothstep(0.10, 0.30, huggFinalChroma);",
              "float huggSideLumaMask = smoothstep(0.01, 0.09, huggFinalLuma);",
              "float huggRescueMask = huggLowChromaMask * huggSideLumaMask * huggNonTableSurface;",
              "vec3 huggRescueTint = mix(huggFabricTone * 0.90, huggFabricTone * 1.03, clamp(huggFinalLuma * 2.0, 0.0, 1.0));",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggRescueTint, huggRescueMask * 0.18);",
              // Hard fallback: for black variant upholstery, aggressively flatten any
              // bright non-top side pixels into the expected fabric tone.
              "float huggUltraFabricMask = huggNonTableSurface * smoothstep(0.10, 0.22, huggFinalLuma);",
              "vec3 huggUltraFabricTint = mix(huggFabricTone * 0.86, huggFabricTone * 1.04, clamp(huggFinalLuma * 1.8, 0.0, 1.0));",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggUltraFabricTint, huggUltraFabricMask * 0.0);",
              // Absolute fallback: flatten almost all non-top regions to fabric tone,
              // then restore black frame silhouette using huggFrameMask.
              "vec3 huggFullFabricTint = mix(huggFabricTone * 0.90, huggFabricTone * 1.03, clamp(huggFinalLuma * 2.2, 0.0, 1.0));",
              "float huggFullFabricMask = huggNonTableSurface * smoothstep(0.02, 0.10, huggFinalLuma);",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggFullFabricTint, huggFullFabricMask * 0.0);",
              // Matte flatten: reduce residual side-surface highlight contrast so the
              // upholstery reads as cloth rather than coated/metallic.
              "float huggMatteFlattenMask = huggNonTableSurface * smoothstep(0.02, 0.08, huggFinalLuma);",
              "vec3 huggMatteFabric = huggFabricTone * 0.93;",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggMatteFabric, huggMatteFlattenMask * 0.0);",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.024), huggFrameMask * (1.0 - huggSeatFabricProtect) * (1.0 - huggIsTopFacing) * 0.98);",
              // Restore warm connector accents after black-variant map stripping.
              // Target bright low-chroma non-top pixels in the upper (non-ottoman) zone.
              "float huggConnectorMask = (1.0 - huggIsTopFacing) * (1.0 - huggOttomanZone) * smoothstep(0.28, 0.70, huggFinalLuma) * (1.0 - smoothstep(0.10, 0.30, huggFinalChroma));",
              "vec3 huggConnectorTint = mix(vec3(0.50, 0.43, 0.33), vec3(0.70, 0.61, 0.48), clamp(huggFinalLuma * 1.6, 0.0, 1.0));",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggConnectorTint, huggConnectorMask * 0.86);",
              // Fabric zone: suppress specular (chrome) by blending toward diffuse-only result.
              // roughnessFactor=0.93 alone isn't enough to eliminate chrome reflections from
              // the bright apartment IBL at grazing angles (Fresnel pushes F to 1.0 regardless
              // of F0 at low dotNV). Directly replace with totalDiffuse (no specular contribution).
              // Scale by 0.65 to compensate for the very bright apartment irradiance — without
              // scaling, totalDiffuse for light-albedo fabrics (basalt/dune) renders near-white.
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, clamp(huggFabricTone * 1.03 + totalEmissiveRadiance * 0.05, 0.0, 1.0), huggFabricZone * 0.10);",
              // Final seat-side correction: ensure upper ottoman side band keeps fabric tone
              // instead of inheriting black frame darkening.
              "float huggBeamBottomXFinal = 1.0 - smoothstep(huggHalfFootprintX * 0.12, huggHalfFootprintX * 0.22, abs(vHuggLocalPos.x - huggBeamCenterX));",
              "float huggSeatSideMask = huggNonTableSurface * (1.0 - huggBeamBottomXFinal);",
              "vec3 huggSeatSideTint = huggFabricTone * 0.95;",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggSeatSideTint, huggSeatSideMask * 0.08);",
              // Re-assert lower center beam in black wood tone after seat recolor.
              "float huggBeamBottomMaskFinal = huggBeamBottomXFinal * huggOttomanZone * (1.0 - huggIsTopFacing);",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.024), huggBeamBottomMaskFinal * 0.97);",
              // Final upholstery readability pass: force seat bodies to stay visibly
              // fabric-toned against black wood, while excluding frame and tabletop.
              "float huggOuterBand = max(huggCornerXFrac, huggCornerYFrac);",
              "float huggSeatPerimeterMask = clamp(huggOuterBand - huggCornerProduct * 0.85, 0.0, 1.0);",
              "float huggSeatReadableMask = huggSeatPerimeterMask * (1.0 - huggTopSurfaceMask);",
              "float huggSeatFinalLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
              "vec3 huggSeatReadableTint = mix(huggFabricTone * 0.72, huggFabricTone * 0.95, clamp(huggSeatFinalLuma * 1.5, 0.0, 1.0));",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggSeatReadableTint, huggSeatReadableMask * 0.10);",
              // Strong global upholstery fallback for single-mesh Hugg GLBs:
              // lift all non-tabletop body surfaces toward fabric, then restore
              // only the structural frame regions as black.
              "float huggBodyFallbackMask = (1.0 - huggTopSurfaceMask) * 0.65;",
              "vec3 huggBodyFallbackTint = mix(huggFabricTone * 0.70, huggFabricTone * 0.90, clamp(huggSeatFinalLuma * 1.35, 0.0, 1.0));",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggBodyFallbackTint, huggBodyFallbackMask * 0.0);",
              "float huggFrameReassertMask = huggFrameMask * (1.0 - huggSeatPerimeterMask * 0.85) * (1.0 - huggIsTopFacing);",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.024), huggFrameReassertMask * 0.96);",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, vec3(0.024), huggBeamBottomMaskFinal * 0.98);",
              // Keep ottoman top faces reading as fabric (like chestnut structure),
              // while the true tabletop remains controlled by huggTopSurfaceMask.
              "float huggSeatTopMask = huggIsTopFacing * huggSeatZone * (1.0 - huggTopSurfaceMask);",
              "vec3 huggSeatTopTint = mix(huggFabricTone * 1.00, huggFabricTone * 1.20, clamp(huggSeatFinalLuma * 1.9, 0.0, 1.0));",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggSeatTopTint, huggSeatTopMask * 0.0);",
              // Final post-lighting black-top normalization: preserve streak contrast
              // while keeping the top in the swatch luminance range under bright ambient.
              "float huggTopFinalLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
              "vec3 huggTopFinalTint = mix(vec3(0.012), vec3(0.26), smoothstep(0.10, 0.84, clamp(pow(huggTopFinalLuma, 0.70), 0.0, 1.0)));",
              "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggTopFinalTint, huggTopSurfaceMask * 0.90);",
              isHuggClosedLayout
                ? [
                    "vec3 huggBClosedFinalTopBlack = mix(vec3(0.012), vec3(0.052), smoothstep(0.10, 0.86, clamp(pow(huggLuma, 0.72), 0.0, 1.0)));",
                    "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggBClosedFinalTopBlack, huggBClosedTopZone);",
                    "float huggBFinalClosedTopish = smoothstep(0.50, 0.82, abs(vHuggObjNormal.z));",
                    "float huggBFinalClosedNeutral = 1.0 - smoothstep(0.065, 0.180, abs(huggRmB));",
                    "float huggBFinalClosedLightFabric = smoothstep(0.22, 0.48, huggLuma);",
                    "float huggBFinalClosedFabricAlbedo = max(huggBFinalClosedNeutral * smoothstep(0.10, 0.28, huggLuma), huggBFinalClosedLightFabric);",
                    "float huggBFinalClosedFabricTop = (1.0 - max(huggTopSurfaceMask, huggBClosedTopZone)) * huggBFinalClosedTopish * huggBFinalClosedFabricAlbedo;",
                    "float huggBFinalClosedFabricLuma = dot(gl_FragColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
                    "vec3 huggBFinalClosedFabricTone = mix(huggFabricTone * 0.92, huggFabricTone * 1.08, clamp(huggBFinalClosedFabricLuma * 1.55, 0.0, 1.0));",
                    "gl_FragColor.rgb = mix(gl_FragColor.rgb, huggBFinalClosedFabricTone, huggBFinalClosedFabricTop * 0.98);",
                  ].join("\n")
                : "",

            ].join("\n")
          );
      };
    };
  return applyHuggTopTint;
}
