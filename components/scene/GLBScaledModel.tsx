"use client";

import * as THREE from "three";
import { useEffect, useMemo, useState } from "react";
import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { GLBCalibration } from "@/lib/design-page-calibration";
import type { ConfigurableNodeTransform } from "@/lib/design-page-types";

export function GLBScaledModel({
  url,
  width,
  height,
  depth,
  nodeTransforms,
  calibration,
  variantColorHex,
  variantName,
  variantRenderAssets,
  onLoadStateChange,
}: {
  url: string;
  width: number;
  height: number;
  depth: number;
  nodeTransforms?: Record<string, ConfigurableNodeTransform>;
  calibration?: GLBCalibration;
  variantColorHex?: string;
  variantName?: string;
  variantRenderAssets?: CatalogItemSchema["variants"][number]["renderAssets"];
  onLoadStateChange?: (state: "loading" | "ready" | "error") => void;
}) {
  const [loadedScene, setLoadedScene] = useState<THREE.Object3D | null>(null);
  const [upholsteryTextures, setUpholsteryTextures] = useState<{
    baseColorMap?: THREE.Texture;
    normalMap?: THREE.Texture;
    roughnessMap?: THREE.Texture;
  }>({});

  useEffect(() => {
    let cancelled = false;
    const loader = new THREE.TextureLoader();
    const tileX = variantRenderAssets?.tileScale?.x ?? 1;
    const tileY = variantRenderAssets?.tileScale?.y ?? 1;

    const loadTexture = (url: string | undefined, colorSpace?: THREE.ColorSpace) =>
      new Promise<THREE.Texture | undefined>((resolve) => {
        if (!url) {
          resolve(undefined);
          return;
        }
        loader.load(
          url,
          (texture) => {
            texture.wrapS = THREE.RepeatWrapping;
            texture.wrapT = THREE.RepeatWrapping;
            texture.repeat.set(tileX, tileY);
            if (colorSpace) {
              texture.colorSpace = colorSpace;
            }
            texture.needsUpdate = true;
            resolve(texture);
          },
          undefined,
          () => {
            resolve(undefined);
          }
        );
      });

    Promise.all([
      loadTexture(variantRenderAssets?.baseColorMap, THREE.SRGBColorSpace),
      loadTexture(variantRenderAssets?.normalMap),
      loadTexture(variantRenderAssets?.roughnessMap),
    ]).then(([baseColorMap, normalMap, roughnessMap]) => {
      if (cancelled) return;
      setUpholsteryTextures({ baseColorMap, normalMap, roughnessMap });
    });

    return () => {
      cancelled = true;
    };
  }, [
    variantRenderAssets?.baseColorMap,
    variantRenderAssets?.normalMap,
    variantRenderAssets?.roughnessMap,
    variantRenderAssets?.tileScale?.x,
    variantRenderAssets?.tileScale?.y,
  ]);

  useEffect(() => {
    let cancelled = false;
    setLoadedScene(null);
    onLoadStateChange?.("loading");

    (async () => {
      try {
        const { GLTFLoader } = await import("three-stdlib");
        if (cancelled) return;

        const loader = new GLTFLoader();
        try {
          const meshoptModule = (await import("meshoptimizer")) as {
            MeshoptDecoder?: { ready?: Promise<unknown> };
          };
          const MeshoptDecoder = meshoptModule.MeshoptDecoder;
          if (MeshoptDecoder?.ready) {
            await MeshoptDecoder.ready;
          }
          const loaderWithMeshopt = loader as typeof loader & {
            setMeshoptDecoder?: (decoder: unknown) => void;
          };
          if (typeof loaderWithMeshopt.setMeshoptDecoder === "function" && MeshoptDecoder) {
            loaderWithMeshopt.setMeshoptDecoder(MeshoptDecoder);
          }
        } catch (decoderError) {
          // Keep fallback box visible if decoder setup fails.
          console.warn("[GLBScaledModel] Meshopt decoder unavailable", { decoderError });
        }
        loader.load(
          url,
          (gltf) => {
            if (cancelled) return;
            setLoadedScene(gltf.scene.clone(true));
            onLoadStateChange?.("ready");
          },
          undefined,
          (error) => {
            if (cancelled) return;
            console.warn("[GLBScaledModel] Failed to load", { url, error });
            setLoadedScene(null);
            onLoadStateChange?.("error");
          }
        );
      } catch (error) {
        if (cancelled) return;
        console.warn("[GLBScaledModel] Failed to import GLTFLoader", { error });
        setLoadedScene(null);
        onLoadStateChange?.("error");
      }
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [url]);

  const normalizedModel = useMemo(() => {
    if (!loadedScene) return null;

    const scene = loadedScene.clone(true);
    const bbox = new THREE.Box3().setFromObject(scene);
    const size = new THREE.Vector3();
    const center = new THREE.Vector3();
    bbox.getSize(size);
    bbox.getCenter(center);

    const targetWidth = calibration?.swapWidthDepthAxes ? depth : width;
    const targetDepth = calibration?.swapWidthDepthAxes ? width : depth;

    let sx = size.x > 0 ? targetWidth / size.x : 1;
    let sy = size.y > 0 ? height / size.y : 1;
    let sz = size.z > 0 ? targetDepth / size.z : 1;

    if (calibration?.uniformScale) {
      const uniform = Math.min(sx, sy, sz);
      sx = uniform;
      sy = uniform;
      sz = uniform;
    }

    scene.scale.set(sx, sy, sz);

    const minYScaled = bbox.min.y * sy;
    scene.position.set(-center.x * sx, -height / 2 - minYScaled, -center.z * sz);
    if (calibration?.swapWidthDepthAxes) {
      scene.rotation.y = Math.PI / 2;
    }

    if (nodeTransforms) {
      Object.entries(nodeTransforms).forEach(([nodeName, transform]) => {
        const node = scene.getObjectByName(nodeName);
        if (!node) return;
        if (transform.position) {
          const [x, y, z] = transform.position;
          node.position.set(
            sx !== 0 ? x / sx : x,
            sy !== 0 ? y / sy : y,
            sz !== 0 ? z / sz : z
          );
        }
        if (transform.rotation) {
          node.rotation.set(transform.rotation[0], transform.rotation[1], transform.rotation[2]);
        }
        if (transform.scale) {
          node.scale.set(transform.scale[0], transform.scale[1], transform.scale[2]);
        }
        if (typeof transform.visible === "boolean") {
          node.visible = transform.visible;
        }
      });
    }

    const applyPhysicalMaterialClamps = (material: THREE.MeshStandardMaterial) => {
      material.roughness = Math.max(0, Math.min(1, material.roughness));
      material.metalness = Math.max(0, Math.min(1, material.metalness));
      material.emissiveIntensity = Math.max(0, Math.min(1, material.emissiveIntensity));

      const physicalMat = material as THREE.MeshPhysicalMaterial;
      if (physicalMat.specularIntensity !== undefined) {
        physicalMat.specularIntensity = Math.max(0, Math.min(1, physicalMat.specularIntensity));
      }
      if (physicalMat.clearcoat !== undefined) {
        physicalMat.clearcoat = Math.max(0, Math.min(1, physicalMat.clearcoat));
      }
      if (physicalMat.clearcoatRoughness !== undefined) {
        physicalMat.clearcoatRoughness = Math.max(0, Math.min(1, physicalMat.clearcoatRoughness));
      }
      if (physicalMat.specularColor?.isColor) {
        physicalMat.specularColor.r = Math.max(0, Math.min(1, physicalMat.specularColor.r));
        physicalMat.specularColor.g = Math.max(0, Math.min(1, physicalMat.specularColor.g));
        physicalMat.specularColor.b = Math.max(0, Math.min(1, physicalMat.specularColor.b));
      }
    };

    const applyLowerAssemblyTint = (
      mesh: THREE.Mesh,
      material: THREE.MeshStandardMaterial
    ) => {
      if (!calibration?.lowerAssemblyTintHex) return;
      mesh.updateWorldMatrix(true, false);
      const bbox = new THREE.Box3().setFromObject(mesh);
      if (!bbox) return;

      const minY = bbox.min.y;
      const maxY = bbox.max.y;
      const heightRange = Math.max(maxY - minY, 0.0001);
      // GLBScaledModel is rendered inside Furniture group at y = height / 2.
      // Shader uses final world-space y, so include this offset in mask thresholds.
      const furnitureGroupYOffset = height * 0.5;
      const fadeStart =
        minY + heightRange * (calibration.lowerAssemblyFadeStart ?? 0.44) + furnitureGroupYOffset;
      const fadeEnd =
        minY + heightRange * (calibration.lowerAssemblyFadeEnd ?? 0.68) + furnitureGroupYOffset;
      const tintStrength = calibration.lowerAssemblyTintStrength ?? 0.82;
      const tintColor = new THREE.Color(calibration.lowerAssemblyTintHex);

      material.customProgramCacheKey = () =>
        [
          "kelsey-lower-assembly-tint",
          calibration.lowerAssemblyTintHex,
          tintStrength,
          fadeStart,
          fadeEnd,
        ].join(":");

      material.onBeforeCompile = (shader) => {
        shader.uniforms.kelseyLowerTintColor = { value: tintColor };
        shader.uniforms.kelseyLowerTintStrength = { value: tintStrength };
        shader.uniforms.kelseyLowerTintStart = { value: fadeStart };
        shader.uniforms.kelseyLowerTintEnd = { value: fadeEnd };

        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>\nvarying float vKelseyWorldY;`
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>\nvKelseyWorldY = (modelMatrix * vec4(position, 1.0)).y;`
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>\nvarying float vKelseyWorldY;\nuniform vec3 kelseyLowerTintColor;\nuniform float kelseyLowerTintStrength;\nuniform float kelseyLowerTintStart;\nuniform float kelseyLowerTintEnd;`
          )
          .replace(
            "#include <map_fragment>",
            `#include <map_fragment>\nfloat kelseyLowerMask = 1.0 - smoothstep(kelseyLowerTintStart, kelseyLowerTintEnd, vKelseyWorldY);\nvec3 kelseyLowerTinted = diffuseColor.rgb * mix(vec3(1.0), kelseyLowerTintColor * 1.18, kelseyLowerTintStrength);\ndiffuseColor.rgb = mix(diffuseColor.rgb, kelseyLowerTinted, clamp(kelseyLowerMask, 0.0, 1.0));`
          );
      };
    };

    const applyHuggTopTint = (
      mesh: THREE.Mesh,
      material: THREE.MeshStandardMaterial,
      tintHex: string
    ) => {
      if (!isHuggModel || !tintHex) return;
      mesh.updateWorldMatrix(true, false);
      const bbox = new THREE.Box3().setFromObject(mesh);
      const minY = bbox.min.y;
      const maxY = bbox.max.y;
      const heightRange = Math.max(maxY - minY, 0.0001);
      const centerX = (bbox.min.x + bbox.max.x) * 0.5;
      const centerZ = (bbox.min.z + bbox.max.z) * 0.5;
      // Keep tint tightly on tabletop cap to avoid bleed onto ottomans/sides.
      const radiusX = Math.max(width * 0.16, (bbox.max.x - bbox.min.x) * 0.11);
      const radiusZ = Math.max(depth * 0.16, (bbox.max.z - bbox.min.z) * 0.11);
      const yStart = minY + heightRange * 0.8;
      const yEnd = minY + heightRange * 0.985;
      const tintStrength = 0.88;
      const tintColor = new THREE.Color(tintHex);

      material.customProgramCacheKey = () =>
        [
          "hugg-top-tint",
          tintHex,
          tintStrength,
          yStart,
          yEnd,
          radiusX,
          radiusZ,
          centerX,
          centerZ,
        ].join(":");

      material.onBeforeCompile = (shader) => {
        shader.uniforms.huggTintColor = { value: tintColor };
        shader.uniforms.huggTintStrength = { value: tintStrength };
        shader.uniforms.huggTintYStart = { value: yStart };
        shader.uniforms.huggTintYEnd = { value: yEnd };
        shader.uniforms.huggTintCenterX = { value: centerX };
        shader.uniforms.huggTintCenterZ = { value: centerZ };
        shader.uniforms.huggTintRadiusX = { value: radiusX };
        shader.uniforms.huggTintRadiusZ = { value: radiusZ };

        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vHuggWorldPos;\nvarying vec3 vHuggWorldNormal;"
          )
          .replace(
            "#include <begin_vertex>",
            "#include <begin_vertex>\nvHuggWorldPos = (modelMatrix * vec4(position, 1.0)).xyz;\nvHuggWorldNormal = normalize(mat3(modelMatrix) * normal);"
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            "#include <common>\nvarying vec3 vHuggWorldPos;\nvarying vec3 vHuggWorldNormal;\nuniform vec3 huggTintColor;\nuniform float huggTintStrength;\nuniform float huggTintYStart;\nuniform float huggTintYEnd;\nuniform float huggTintCenterX;\nuniform float huggTintCenterZ;\nuniform float huggTintRadiusX;\nuniform float huggTintRadiusZ;"
          )
          .replace(
            "#include <map_fragment>",
            "#include <map_fragment>\nfloat huggYMask = smoothstep(huggTintYStart, huggTintYEnd, vHuggWorldPos.y);\nfloat huggXMask = 1.0 - smoothstep(huggTintRadiusX * 0.62, huggTintRadiusX * 0.92, abs(vHuggWorldPos.x - huggTintCenterX));\nfloat huggZMask = 1.0 - smoothstep(huggTintRadiusZ * 0.62, huggTintRadiusZ * 0.92, abs(vHuggWorldPos.z - huggTintCenterZ));\nfloat huggUpMask = smoothstep(0.58, 0.9, vHuggWorldNormal.y);\nfloat huggTopMask = clamp(pow(huggYMask, 1.7) * huggXMask * huggZMask * huggUpMask, 0.0, 1.0);\nvec3 huggTinted = diffuseColor.rgb * mix(vec3(1.0), huggTintColor * 1.08, huggTintStrength);\ndiffuseColor.rgb = mix(diffuseColor.rgb, huggTinted, huggTopMask);"
          );
      };
    };

    // Madison family keeps real wood leg materials; avoid upholstery overrides on those parts.
    const WOOD_LEG_PART_REGEX = /\b(leg|legs|foot|feet|wood|walnut|oak|beech|birch|rubberwood|timber)\b/i;
    const KELSEY_WOOD_BASE_PART_REGEX = /\b(leg|legs|base|support|stretcher|frame|foot|feet|wood|walnut|oak)\b/i;
    const HARPER_WOOD_BASE_PART_REGEX = /\b(base|pedestal|fluted|column|support|wood|oak|veneer)\b/i;
    const OTTOMAN_UPHOLSTERY_REGEX = /\b(ottoman|seat|stool|cushion|upholstery|fabric|arms?|back)\b/i;
    const HUGG_WOOD_PART_REGEX = /\b(table|top|base|frame|support|stretcher|leg|legs|foot|feet|wood|timber|veneer|oak|walnut)\b/i;
    const meshLegLikeCache = new Map<string, boolean>();
    const huggTableLikeCache = new Map<string, boolean>();
    const huggOttomanLikeCache = new Map<string, boolean>();
    const isHuggModel = /\bhugg\b/i.test(url);
    const huggVariantMarker = String(variantName ?? "").toLowerCase();
    const resolvedVariantColorHex = (() => {
      if (!isHuggModel) return variantColorHex;
      if (huggVariantMarker.includes("black")) return "#1f1f1f";
      if (huggVariantMarker.includes("chestnut")) return "#8B6F47";
      if (huggVariantMarker.includes("natural")) return "#a89070";
      return variantColorHex;
    })();

    const getMeshBounds = (mesh: THREE.Mesh) => {
      const box = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      return { size, center };
    };

    const isLikelyHuggTableMesh = (mesh: THREE.Mesh) => {
      if (!isHuggModel) return false;
      const cached = huggTableLikeCache.get(mesh.uuid);
      if (cached !== undefined) return cached;

      const { size, center } = getMeshBounds(mesh);
      const totalArea = Math.max(width * depth, 0.0001);
      const areaRatio = (size.x * size.z) / totalArea;
      const nearCenter = Math.abs(center.x) <= width * 0.2 && Math.abs(center.z) <= depth * 0.2;
      const likely = areaRatio >= 0.14 && nearCenter && size.y <= height * 0.8;

      huggTableLikeCache.set(mesh.uuid, likely);
      return likely;
    };

    const isLikelyHuggOttomanMesh = (mesh: THREE.Mesh) => {
      if (!isHuggModel) return false;
      const cached = huggOttomanLikeCache.get(mesh.uuid);
      if (cached !== undefined) return cached;

      const { size, center } = getMeshBounds(mesh);
      const compactFootprint = size.x <= width * 0.45 && size.z <= depth * 0.45;
      const offsetFromCenter = Math.abs(center.x) >= width * 0.08 || Math.abs(center.z) >= depth * 0.08;
      const likely = compactFootprint && offsetFromCenter && size.y <= height * 0.75;

      huggOttomanLikeCache.set(mesh.uuid, likely);
      return likely;
    };

    const isLikelyLegMesh = (mesh: THREE.Mesh) => {
      if (!calibration?.preserveWoodLegMaterials) return false;
      const cached = meshLegLikeCache.get(mesh.uuid);
      if (cached !== undefined) return cached;

      const box = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      box.getSize(size);

      const touchesFloor = box.min.y <= -height / 2 + height * 0.08;
      const nearBottom = box.max.y <= -height / 2 + height * 0.4;
      const slenderX = size.x > 0 && size.x <= width * 0.2;
      const slenderZ = size.z > 0 && size.z <= depth * 0.2;
      const shortEnough = size.y > 0 && size.y <= height * 0.45;

      let likelyLeg = touchesFloor && nearBottom && slenderX && slenderZ && shortEnough;

      if (!likelyLeg && calibration?.woodLegDetectionMode === "kelsey") {
        const lowerAssembly =
          box.min.y <= -height / 2 + height * 0.14 &&
          box.max.y <= -height / 2 + height * 0.78;
        const supportLike =
          (size.y >= height * 0.12 && (size.x <= width * 0.34 || size.z <= depth * 0.34)) ||
          (size.y <= height * 0.2 && box.max.y <= -height / 2 + height * 0.58);
        likelyLeg = lowerAssembly && supportLike;
      }

      if (!likelyLeg && calibration?.woodLegDetectionMode === "harper") {
        const lowerAssembly =
          box.min.y <= -height / 2 + height * 0.12 &&
          box.max.y <= -height / 2 + height * 0.86;
        const pedestalLike =
          size.y >= height * 0.22 &&
          size.y <= height * 0.9 &&
          ((size.x <= width * 0.72 && size.z <= depth * 0.72) ||
            (size.x <= width * 0.5 || size.z <= depth * 0.5));
        likelyLeg = lowerAssembly && pedestalLike;
      }

      meshLegLikeCache.set(mesh.uuid, likelyLeg);
      return likelyLeg;
    };

    const shouldPreserveWoodLegMaterial = (
      mesh: THREE.Mesh,
      material: THREE.MeshStandardMaterial
    ) => {
      if (!calibration?.preserveWoodLegMaterials) return false;
      const parentName = mesh.parent?.name ?? "";
      const partNames = `${mesh.name} ${parentName} ${material.name}`;
      if (isHuggModel) {
        if (isOttomanUpholsteryMesh(mesh)) return false;
        return isHuggWoodMesh(mesh, material);
      }
      if (calibration?.woodLegDetectionMode === "kelsey" && KELSEY_WOOD_BASE_PART_REGEX.test(partNames)) {
        return true;
      }
      if (calibration?.woodLegDetectionMode === "harper" && HARPER_WOOD_BASE_PART_REGEX.test(partNames)) {
        return true;
      }
      if (WOOD_LEG_PART_REGEX.test(partNames)) return true;
      return isLikelyLegMesh(mesh);
    };
    const isOttomanUpholsteryMesh = (mesh: THREE.Mesh) => {
      const parentName = mesh.parent?.name ?? "";
      const partNames = `${mesh.name} ${parentName}`;
      return OTTOMAN_UPHOLSTERY_REGEX.test(partNames) || isLikelyHuggOttomanMesh(mesh);
    };

    const isHuggWoodMesh = (mesh: THREE.Mesh, material: THREE.MeshStandardMaterial) => {
      const parentName = mesh.parent?.name ?? "";
      const partNames = `${mesh.name} ${parentName} ${material.name}`;
      return HUGG_WOOD_PART_REGEX.test(partNames) || isLikelyHuggTableMesh(mesh);
    };

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = false;
      mesh.receiveShadow = false;

      // Madison GLBs can reuse one material across body + legs.
      // Clone per mesh so upholstery overrides do not bleed into leg parts.
      if (calibration?.preserveWoodLegMaterials) {
        if (Array.isArray(mesh.material)) {
          mesh.material = mesh.material.map((m) => (m ? m.clone() : m));
        } else if (mesh.material) {
          mesh.material = mesh.material.clone();
        }
      }

      const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
      if (Array.isArray(mat)) {
        mat.forEach((m) => {
          if (!m) return;
          const hasUpholsteryShadingMaps = Boolean(
            upholsteryTextures.normalMap || upholsteryTextures.roughnessMap
          );
          applyPhysicalMaterialClamps(m);
          if (shouldPreserveWoodLegMaterial(mesh, m)) {
            const woodColorHex = calibration?.preserveWoodLegColorHex ?? resolvedVariantColorHex;
            if (woodColorHex) {
              m.color = new THREE.Color(woodColorHex);
            }
            if (calibration?.preserveWoodLegDisableBaseColorMap) {
              m.map = null;
            }
            m.emissive = new THREE.Color(0x000000);
            m.emissiveIntensity = 0;
            m.metalness = Math.min(m.metalness, 0.1);
            m.roughness = Math.max(m.roughness, 0.65);
            if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
            applyLowerAssemblyTint(mesh, m);
            m.needsUpdate = true;
            return;
          }
          // Hugg: only allow wood/table parts to receive finish color tint.
          const isHuggOttoman = isHuggModel && isOttomanUpholsteryMesh(mesh);
          const allowVariantColor = calibration?.useVariantColor ?? true;
          const huggFinishColorHex = isHuggModel ? resolvedVariantColorHex : undefined;
          const colorHex =
            calibration?.forceBaseColorHex ??
              (allowVariantColor && (!isHuggModel && !isHuggOttoman)
                ? resolvedVariantColorHex
                : undefined);
          const shouldUseImportedUpholsteryOverride = Boolean(variantRenderAssets);
          if (shouldUseImportedUpholsteryOverride) {
            // Imported upholstery variants should not inherit baked GLB maps.
            m.map = null;
            m.normalMap = null;
            m.roughnessMap = null;
            m.metalnessMap = null;
            m.aoMap = null;
            m.aoMapIntensity = 0;
            m.lightMap = null;
            m.emissiveMap = null;
            m.bumpMap = null;
            m.alphaMap = null;
            m.displacementMap = null;
            m.emissive = new THREE.Color(0x000000);
            m.emissiveIntensity = 0;
            // Vertex colors baked into the GLB create organic-pattern artifacts.
            m.vertexColors = false;
          }
          const shouldClearInheritedBaseMap = Boolean(
            variantRenderAssets && !upholsteryTextures.baseColorMap
          );
          if (shouldClearInheritedBaseMap) {
            m.map = null;
          }
          if (upholsteryTextures.baseColorMap) {
            m.map = upholsteryTextures.baseColorMap;
            if (colorHex) {
              m.color = new THREE.Color("#ffffff").lerp(
                new THREE.Color(colorHex),
                Math.max(0, Math.min(1, calibration?.variantMapTintStrength ?? 0.85))
              );
            } else {
              m.color = new THREE.Color("#ffffff");
            }
          } else if (colorHex) {
            m.color = new THREE.Color(colorHex);
          }
          if (upholsteryTextures.normalMap) {
            m.normalMap = upholsteryTextures.normalMap;
            // Very low scale — just enough micro-texture to read as fabric, not leather.
            const importedNormalScale = shouldUseImportedUpholsteryOverride
              ? (calibration?.importedNormalScale ?? 0.06)
              : (calibration?.normalScale ?? 0.06);
            m.normalScale = new THREE.Vector2(importedNormalScale, importedNormalScale);
          }
          if (upholsteryTextures.roughnessMap) {
            m.roughnessMap = upholsteryTextures.roughnessMap;
          }
          if (calibration?.disableVertexColors) {
            m.vertexColors = false;
          }
          if (calibration?.disableBaseColorMap) {
            m.map = null;
          }
          if (calibration?.disableShadingMaps && !upholsteryTextures.normalMap && !upholsteryTextures.roughnessMap) {
            m.normalMap = null;
            m.roughnessMap = null;
            m.metalnessMap = null;
            m.aoMap = null;
            m.aoMapIntensity = 0;
            m.lightMap = null;
          }
          if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
          if (calibration?.brightness !== undefined) {
            m.color.multiplyScalar(calibration.brightness);
          }
          if (calibration?.saturation !== undefined) {
            const hsl = { h: 0, s: 0, l: 0 };
            m.color.getHSL(hsl);
            m.color.setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s * calibration.saturation)), hsl.l);
          }
          if (calibration?.roughnessScale !== undefined) {
            m.roughness = Math.max(0, Math.min(1, m.roughness * calibration.roughnessScale));
          }
          if (calibration?.roughnessOverride !== undefined) {
            m.roughness = Math.max(0, Math.min(1, calibration.roughnessOverride));
          }
          if (calibration?.metalnessOverride !== undefined) {
            m.metalness = Math.max(0, Math.min(1, calibration.metalnessOverride));
          }
          // For imported upholstery: force fabric-like roughness/metalness after all overrides,
          // so calibration or residual GLB values cannot make it appear leather-like.
          if (shouldUseImportedUpholsteryOverride) {
            m.roughness = 0.92;
            m.metalness = 0.0;
          }
          if (calibration?.disableAoMap) {
            m.aoMap = null;
            m.aoMapIntensity = 0;
          }
          if (m.aoMap && calibration?.aoMapIntensity !== undefined) {
            m.aoMapIntensity = calibration.aoMapIntensity;
          }
          // Upgrade MeshStandardMaterial → MeshPhysicalMaterial when clearcoat or
          // specularIntensity overrides are requested so those properties actually exist.
          let physicalMat: THREE.MeshPhysicalMaterial;
          if (
            (calibration?.clearcoatOverride !== undefined || calibration?.specularIntensityOverride !== undefined) &&
            !(m instanceof THREE.MeshPhysicalMaterial)
          ) {
            physicalMat = new THREE.MeshPhysicalMaterial();
            physicalMat.copy(m);
            const matArr = mesh.material as THREE.MeshStandardMaterial[];
            const idx = matArr.indexOf(m);
            if (idx >= 0) matArr[idx] = physicalMat;
          } else {
            physicalMat = m as THREE.MeshPhysicalMaterial;
          }
          if (calibration?.specularIntensityOverride !== undefined) {
            physicalMat.specularIntensity = Math.max(0, calibration.specularIntensityOverride);
          }
          if (calibration?.clearcoatOverride !== undefined) {
            physicalMat.clearcoat = Math.max(0, Math.min(1, calibration.clearcoatOverride));
          }
          if (calibration?.clearcoatRoughnessOverride !== undefined) {
            physicalMat.clearcoatRoughness = Math.max(
              0,
              Math.min(1, calibration.clearcoatRoughnessOverride)
            );
          }
          if (calibration?.emissiveBoost !== undefined) {
            physicalMat.emissive = physicalMat.color.clone();
            physicalMat.emissiveIntensity = calibration.emissiveBoost;
          }
          if (huggFinishColorHex) {
            applyHuggTopTint(mesh, physicalMat, huggFinishColorHex);
          }
          applyLowerAssemblyTint(mesh, physicalMat);
          physicalMat.needsUpdate = true;
        });
      } else if (mat) {
        const hasUpholsteryShadingMaps = Boolean(
          upholsteryTextures.normalMap || upholsteryTextures.roughnessMap
        );
        applyPhysicalMaterialClamps(mat);
        if (shouldPreserveWoodLegMaterial(mesh, mat)) {
          const woodColorHex = calibration?.preserveWoodLegColorHex ?? resolvedVariantColorHex;
          if (woodColorHex) {
            mat.color = new THREE.Color(woodColorHex);
          }
          if (calibration?.preserveWoodLegDisableBaseColorMap) {
            mat.map = null;
          }
          mat.emissive = new THREE.Color(0x000000);
          mat.emissiveIntensity = 0;
          mat.metalness = Math.min(mat.metalness, 0.1);
          mat.roughness = Math.max(mat.roughness, 0.65);
          if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
          applyLowerAssemblyTint(mesh, mat);
          mat.needsUpdate = true;
          return;
        }
        const isHuggOttoman = isHuggModel && isOttomanUpholsteryMesh(mesh);
        const allowVariantColor = calibration?.useVariantColor ?? true;
        const huggFinishColorHex = isHuggModel ? resolvedVariantColorHex : undefined;
        const colorHex =
          calibration?.forceBaseColorHex ??
          (allowVariantColor && (!isHuggModel && !isHuggOttoman)
            ? resolvedVariantColorHex
            : undefined);
        const shouldUseImportedUpholsteryOverride = Boolean(variantRenderAssets);
        if (shouldUseImportedUpholsteryOverride) {
          // Imported upholstery variants should not inherit baked GLB maps.
          mat.map = null;
          mat.normalMap = null;
          mat.roughnessMap = null;
          mat.metalnessMap = null;
          mat.aoMap = null;
          mat.aoMapIntensity = 0;
          mat.lightMap = null;
          mat.emissiveMap = null;
          mat.bumpMap = null;
          mat.alphaMap = null;
          mat.displacementMap = null;
          mat.emissive = new THREE.Color(0x000000);
          mat.emissiveIntensity = 0;
          // Vertex colors baked into the GLB create organic-pattern artifacts.
          mat.vertexColors = false;
        }
        const shouldClearInheritedBaseMap = Boolean(
          variantRenderAssets && !upholsteryTextures.baseColorMap
        );
        if (shouldClearInheritedBaseMap) {
          mat.map = null;
        }
        if (upholsteryTextures.baseColorMap) {
          mat.map = upholsteryTextures.baseColorMap;
          if (colorHex) {
            mat.color = new THREE.Color("#ffffff").lerp(
              new THREE.Color(colorHex),
              Math.max(0, Math.min(1, calibration?.variantMapTintStrength ?? 0.85))
            );
          } else {
            mat.color = new THREE.Color("#ffffff");
          }
        } else if (colorHex) {
          mat.color = new THREE.Color(colorHex);
        }
        if (upholsteryTextures.normalMap) {
          mat.normalMap = upholsteryTextures.normalMap;
          // Very low scale — just enough micro-texture to read as fabric, not leather.
          const importedNormalScale = shouldUseImportedUpholsteryOverride
            ? (calibration?.importedNormalScale ?? 0.06)
            : (calibration?.normalScale ?? 0.06);
          mat.normalScale = new THREE.Vector2(importedNormalScale, importedNormalScale);
        }
        if (upholsteryTextures.roughnessMap) {
          mat.roughnessMap = upholsteryTextures.roughnessMap;
        }
        if (calibration?.disableVertexColors) {
          mat.vertexColors = false;
        }
        if (calibration?.disableBaseColorMap) {
          mat.map = null;
        }
        if (calibration?.disableShadingMaps && !upholsteryTextures.normalMap && !upholsteryTextures.roughnessMap) {
          mat.normalMap = null;
          mat.roughnessMap = null;
          mat.metalnessMap = null;
          mat.aoMap = null;
          mat.aoMapIntensity = 0;
          mat.lightMap = null;
        }
        if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
        if (calibration?.brightness !== undefined) {
          mat.color.multiplyScalar(calibration.brightness);
        }
        if (calibration?.saturation !== undefined) {
          const hsl = { h: 0, s: 0, l: 0 };
          mat.color.getHSL(hsl);
          mat.color.setHSL(hsl.h, Math.max(0, Math.min(1, hsl.s * calibration.saturation)), hsl.l);
        }
        if (calibration?.roughnessScale !== undefined) {
          mat.roughness = Math.max(0, Math.min(1, mat.roughness * calibration.roughnessScale));
        }
        if (calibration?.roughnessOverride !== undefined) {
          mat.roughness = Math.max(0, Math.min(1, calibration.roughnessOverride));
        }
        if (calibration?.metalnessOverride !== undefined) {
          mat.metalness = Math.max(0, Math.min(1, calibration.metalnessOverride));
        }
        // For imported upholstery: force fabric-like roughness/metalness after all overrides.
        if (shouldUseImportedUpholsteryOverride) {
          mat.roughness = 0.92;
          mat.metalness = 0.0;
        }
        if (calibration?.disableAoMap) {
          mat.aoMap = null;
          mat.aoMapIntensity = 0;
        }
        if (mat.aoMap && calibration?.aoMapIntensity !== undefined) {
          mat.aoMapIntensity = calibration.aoMapIntensity;
        }
        // Upgrade MeshStandardMaterial → MeshPhysicalMaterial when clearcoat or
        // specularIntensity overrides are requested so those properties actually exist.
        let physicalMat: THREE.MeshPhysicalMaterial;
        if (
          (calibration?.clearcoatOverride !== undefined || calibration?.specularIntensityOverride !== undefined) &&
          !(mat instanceof THREE.MeshPhysicalMaterial)
        ) {
          physicalMat = new THREE.MeshPhysicalMaterial();
          physicalMat.copy(mat);
          mesh.material = physicalMat;
        } else {
          physicalMat = mat as THREE.MeshPhysicalMaterial;
        }
        if (calibration?.specularIntensityOverride !== undefined) {
          physicalMat.specularIntensity = Math.max(0, calibration.specularIntensityOverride);
        }
        if (calibration?.clearcoatOverride !== undefined) {
          physicalMat.clearcoat = Math.max(0, Math.min(1, calibration.clearcoatOverride));
        }
        if (calibration?.clearcoatRoughnessOverride !== undefined) {
          physicalMat.clearcoatRoughness = Math.max(
            0,
            Math.min(1, calibration.clearcoatRoughnessOverride)
          );
        }
        if (calibration?.emissiveBoost !== undefined) {
          physicalMat.emissive = physicalMat.color.clone();
          physicalMat.emissiveIntensity = calibration.emissiveBoost;
        }
        if (huggFinishColorHex) {
          applyHuggTopTint(mesh, physicalMat, huggFinishColorHex);
        }
        applyLowerAssemblyTint(mesh, physicalMat);
        physicalMat.needsUpdate = true;
      }
    });

    return scene;
  }, [loadedScene, width, height, depth, nodeTransforms, calibration, variantColorHex, upholsteryTextures, variantRenderAssets]);

  if (!normalizedModel) return null;

  return <primitive object={normalizedModel} />;
}

