import * as THREE from "three";

import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { GLBCalibration } from "@/lib/design-page-calibration";
import type { ConfigurableNodeTransform } from "@/lib/design-page-types";
import {
  calculatePendantCableDeformation,
  type PendantCableAdjustment,
} from "@/lib/pendant-light-adjustment";
import { createHuggTopTint } from "./huggMaterial";

export type GLBUpholsteryTextures = {
  baseColorMap?: THREE.Texture;
  normalMap?: THREE.Texture;
  roughnessMap?: THREE.Texture;
};

export type NormalizeGLBSceneInput = {
  loadedScene: THREE.Object3D | null;
  width: number;
  height: number;
  depth: number;
  nodeTransforms?: Record<string, ConfigurableNodeTransform>;
  calibration?: GLBCalibration;
  variantColorHex?: string;
  upholsteryTextures: GLBUpholsteryTextures;
  variantRenderAssets?: CatalogItemSchema["variants"][number]["renderAssets"];
  url: string;
  variantName?: string;
  productId?: string;
  variantId?: string;
  pendantCableAdjustment?: PendantCableAdjustment | null;
  castShadow: boolean;
};

const UPPER_UPHOLSTERY_COMPONENT_MASK_ATTRIBUTE =
  "upperUpholsteryComponentMask";

export function applyUpperUpholsteryConnectedComponentMask(
  mesh: THREE.Mesh,
  maxPreservedHeightFraction: number,
  maxPreservedFloorOffsetFraction: number
): boolean {
  const geometry = mesh.geometry as THREE.BufferGeometry;
  const position = geometry.getAttribute("position");
  const index = geometry.getIndex();
  if (!position || !index || position.count === 0 || index.count < 3) {
    return false;
  }
  if (geometry.getAttribute(UPPER_UPHOLSTERY_COMPONENT_MASK_ATTRIBUTE)) {
    return true;
  }

  const parent = Int32Array.from(
    { length: position.count },
    (_, vertexIndex) => vertexIndex
  );
  const rank = new Uint8Array(position.count);
  const findRoot = (vertexIndex: number): number => {
    let root = vertexIndex;
    while (parent[root] !== root) {
      root = parent[root];
    }
    while (parent[vertexIndex] !== vertexIndex) {
      const next = parent[vertexIndex];
      parent[vertexIndex] = root;
      vertexIndex = next;
    }
    return root;
  };
  const union = (leftVertex: number, rightVertex: number) => {
    let leftRoot = findRoot(leftVertex);
    let rightRoot = findRoot(rightVertex);
    if (leftRoot === rightRoot) return;
    if (rank[leftRoot] < rank[rightRoot]) {
      [leftRoot, rightRoot] = [rightRoot, leftRoot];
    }
    parent[rightRoot] = leftRoot;
    if (rank[leftRoot] === rank[rightRoot]) {
      rank[leftRoot] += 1;
    }
  };

  for (let offset = 0; offset + 2 < index.count; offset += 3) {
    const a = index.getX(offset);
    const b = index.getX(offset + 1);
    const c = index.getX(offset + 2);
    union(a, b);
    union(a, c);
  }

  mesh.updateWorldMatrix(true, false);
  const minWorldYByRoot = new Float32Array(position.count);
  minWorldYByRoot.fill(Number.POSITIVE_INFINITY);
  const maxWorldYByRoot = new Float32Array(position.count);
  maxWorldYByRoot.fill(Number.NEGATIVE_INFINITY);
  const point = new THREE.Vector3();
  let minWorldY = Number.POSITIVE_INFINITY;
  let maxWorldY = Number.NEGATIVE_INFINITY;

  for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
    point.fromBufferAttribute(position, vertexIndex).applyMatrix4(mesh.matrixWorld);
    minWorldY = Math.min(minWorldY, point.y);
    maxWorldY = Math.max(maxWorldY, point.y);
    const root = findRoot(vertexIndex);
    minWorldYByRoot[root] = Math.min(minWorldYByRoot[root], point.y);
    maxWorldYByRoot[root] = Math.max(maxWorldYByRoot[root], point.y);
  }

  const worldHeight = Math.max(maxWorldY - minWorldY, 0.0001);
  const clampedHeightFraction = Math.max(
    0,
    Math.min(1, maxPreservedHeightFraction)
  );
  const preservedComponentCeiling =
    minWorldY + worldHeight * clampedHeightFraction;
  const clampedFloorOffsetFraction = Math.max(
    0,
    Math.min(1, maxPreservedFloorOffsetFraction)
  );
  const preservedComponentFloorLimit =
    minWorldY + worldHeight * clampedFloorOffsetFraction;
  const mask = new Float32Array(position.count);
  for (let vertexIndex = 0; vertexIndex < position.count; vertexIndex += 1) {
    const root = findRoot(vertexIndex);
    const componentMinWorldY = minWorldYByRoot[root];
    const componentMaxWorldY = maxWorldYByRoot[root];
    const isLowerAssemblyComponent =
      componentMinWorldY <= preservedComponentFloorLimit &&
      componentMaxWorldY <= preservedComponentCeiling;
    mask[vertexIndex] =
      isLowerAssemblyComponent ? 0 : 1;
  }

  geometry.setAttribute(
    UPPER_UPHOLSTERY_COMPONENT_MASK_ATTRIBUTE,
    new THREE.Float32BufferAttribute(mask, 1)
  );
  return true;
}

export function normalizeGLBScene({
  loadedScene,
  width,
  height,
  depth,
  nodeTransforms,
  calibration,
  variantColorHex,
  upholsteryTextures,
  variantRenderAssets,
  url,
  variantName,
  productId,
  variantId,
  pendantCableAdjustment,
  castShadow,
}: NormalizeGLBSceneInput): THREE.Object3D | null {
    if (!loadedScene) return null;

    const scene = loadedScene.clone(true);
    scene.traverse((object) => {
      if (!(object instanceof THREE.Mesh)) return;
      object.geometry = object.geometry.clone();
      object.material = Array.isArray(object.material)
        ? object.material.map((material) => material.clone())
        : object.material.clone();
    });
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

    if (pendantCableAdjustment) {
      // Preserve the canopy and globe proportions. Overall height is changed
      // by deforming only the straight central cable below.
      sy = (sx + sz) / 2;
    } else if (calibration?.lockVerticalScaleToFootprint) {
      sy = (sx + sz) / 2;
    }

    if (calibration?.uniformScale) {
      const uniform = Math.min(sx, sy, sz);
      sx = uniform;
      sy = uniform;
      sz = uniform;
    }

    const rootTransform = nodeTransforms?.__root__;
    if (rootTransform?.scale) {
      sx *= rootTransform.scale[0];
      sy *= rootTransform.scale[1];
      sz *= rootTransform.scale[2];
    }

    scene.scale.set(sx, sy, sz);

    const minYScaled = bbox.min.y * sy;
    const maxYScaled = bbox.max.y * sy;
    scene.position.set(
      -center.x * sx,
      pendantCableAdjustment ? height / 2 - maxYScaled : -height / 2 - minYScaled,
      -center.z * sz
    );
    if (calibration?.swapWidthDepthAxes) {
      scene.rotation.y = Math.PI / 2;
    }
    if (rootTransform?.position) {
      scene.position.x += rootTransform.position[0];
      scene.position.y += rootTransform.position[1];
      scene.position.z += rootTransform.position[2];
    }
    if (rootTransform?.rotation) {
      scene.rotation.x += rootTransform.rotation[0];
      scene.rotation.y += rootTransform.rotation[1];
      scene.rotation.z += rootTransform.rotation[2];
    }
    if (typeof rootTransform?.visible === "boolean") {
      scene.visible = rootTransform.visible;
    }

    if (pendantCableAdjustment && size.y > 0) {
      const naturalHeightMeters = size.y * sy;
      scene.traverse((object) => {
        if (!(object instanceof THREE.Mesh)) return;
        const geometry = object.geometry;
        const sourcePosition = geometry.getAttribute("position");
        if (
          !(sourcePosition instanceof THREE.BufferAttribute) &&
          !(sourcePosition instanceof THREE.InterleavedBufferAttribute)
        ) {
          return;
        }
        const expandedPositions = new Float32Array(sourcePosition.count * 3);
        for (let index = 0; index < sourcePosition.count; index += 1) {
          expandedPositions[index * 3] = sourcePosition.getX(index);
          expandedPositions[index * 3 + 1] = sourcePosition.getY(index);
          expandedPositions[index * 3 + 2] = sourcePosition.getZ(index);
        }
        const positionAttribute = new THREE.BufferAttribute(expandedPositions, 3);
        geometry.setAttribute("position", positionAttribute);

        geometry.computeBoundingBox();
        const geometryBounds = geometry.boundingBox;
        if (!geometryBounds) return;
        const axisLength = geometryBounds.max.z - geometryBounds.min.z;
        if (!(axisLength > 0)) return;

        const deformation = calculatePendantCableDeformation({
          adjustment: pendantCableAdjustment,
          naturalHeightMeters,
          axisMin: geometryBounds.min.z,
          axisLength,
        });
        if (!deformation) return;
        const { cableStart, cableEnd, cableDelta, cableScale } = deformation;

        for (let index = 0; index < positionAttribute.count; index += 1) {
          const z = positionAttribute.getZ(index);
          if (z >= cableEnd) {
            positionAttribute.setZ(index, z + cableDelta);
          } else if (z > cableStart) {
            positionAttribute.setZ(index, cableStart + (z - cableStart) * cableScale);
          }
        }

        positionAttribute.needsUpdate = true;
        geometry.computeBoundingBox();
        geometry.computeBoundingSphere();
        object.geometry = geometry;
      });
    }

    if (nodeTransforms) {
      Object.entries(nodeTransforms).forEach(([nodeName, transform]) => {
        if (nodeName === "__root__") return;
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

    const applyUpperUpholsteryTint = (
      mesh: THREE.Mesh,
      material: THREE.MeshStandardMaterial,
      tintHex: string | undefined
    ) => {
      if (!calibration?.upperUpholsteryTint || !tintHex) return;
      const geometry = mesh.geometry as THREE.BufferGeometry;
      if (!geometry.attributes.position) return;
      mesh.updateWorldMatrix(true, false);
      const bounds = new THREE.Box3().setFromObject(mesh);
      const worldHeight = Math.max(bounds.max.y - bounds.min.y, 0.0001);
      // The imported Owen meshes are authored Z-up and rotated at the node.
      // Use final vertical world position instead of raw local Y, then include
      // the containing Furniture group's height/2 offset used at render time.
      const furnitureGroupYOffset = height * 0.5;
      const fadeStart =
        bounds.min.y +
        worldHeight * (calibration.upperUpholsteryFadeStart ?? 0.18) +
        furnitureGroupYOffset;
      const fadeEnd =
        bounds.min.y +
        worldHeight * (calibration.upperUpholsteryFadeEnd ?? 0.28) +
        furnitureGroupYOffset;
      const tintStrength = Math.max(0, Math.min(1, calibration.upperUpholsteryTintStrength ?? 0.8));
      const preserveWarmWood = calibration.upperUpholsteryPreserveWarmWood ? 1 : 0;
      const preserveSourceLuma = (calibration.upperUpholsteryPreserveSourceLuma ?? true) ? 1 : 0;
      const lowerComponentMaxHeight = Math.max(
        0,
        Math.min(1, calibration.upperUpholsteryLowerComponentMaxHeight ?? 0.4)
      );
      const lowerComponentMaxFloorOffset = Math.max(
        0,
        Math.min(
          1,
          calibration.upperUpholsteryLowerComponentMaxFloorOffset ?? 0.12
        )
      );
      const componentMaskApplied = calibration.upperUpholsteryPreserveLowerComponents
        ? applyUpperUpholsteryConnectedComponentMask(
            mesh,
            lowerComponentMaxHeight,
            lowerComponentMaxFloorOffset
          )
        : false;
      const tintColor = new THREE.Color(tintHex);
      const tintLuma = Math.max(
        0.001,
        0.2126 * tintColor.r + 0.7152 * tintColor.g + 0.0722 * tintColor.b
      );
      const componentMaskVertexDeclaration = componentMaskApplied
        ? `\nattribute float ${UPPER_UPHOLSTERY_COMPONENT_MASK_ATTRIBUTE};\nvarying float vUpperUpholsteryComponentMask;`
        : "";
      const componentMaskVertexAssignment = componentMaskApplied
        ? `\nvUpperUpholsteryComponentMask = ${UPPER_UPHOLSTERY_COMPONENT_MASK_ATTRIBUTE};`
        : "";
      const componentMaskFragmentDeclaration = componentMaskApplied
        ? "\nvarying float vUpperUpholsteryComponentMask;"
        : "";
      const componentMaskFragmentApplication = componentMaskApplied
        ? "upperUpholsteryMask *= clamp(vUpperUpholsteryComponentMask, 0.0, 1.0);"
        : "";

      material.customProgramCacheKey = () =>
        [
          "upper-upholstery-tint",
          tintHex,
          tintStrength,
          fadeStart,
          fadeEnd,
          preserveWarmWood,
          preserveSourceLuma,
          componentMaskApplied
            ? `${lowerComponentMaxHeight}-${lowerComponentMaxFloorOffset}`
            : "no-component-mask",
        ].join(":");
      material.onBeforeCompile = (shader) => {
        shader.uniforms.upperUpholsteryTintColor = { value: tintColor };
        shader.uniforms.upperUpholsteryTintStrength = { value: tintStrength };
        shader.uniforms.upperUpholsteryTintStart = { value: fadeStart };
        shader.uniforms.upperUpholsteryTintEnd = { value: fadeEnd };
        shader.uniforms.upperUpholsteryTintLuma = { value: tintLuma };
        shader.uniforms.upperUpholsteryPreserveWarmWood = { value: preserveWarmWood };
        shader.uniforms.upperUpholsteryPreserveSourceLuma = { value: preserveSourceLuma };

        shader.vertexShader = shader.vertexShader
          .replace(
            "#include <common>",
            `#include <common>\nvarying float vUpperUpholsteryWorldY;${componentMaskVertexDeclaration}`
          )
          .replace(
            "#include <begin_vertex>",
            `#include <begin_vertex>\nvUpperUpholsteryWorldY = (modelMatrix * vec4(position, 1.0)).y;${componentMaskVertexAssignment}`
          );

        shader.fragmentShader = shader.fragmentShader
          .replace(
            "#include <common>",
            `#include <common>\nvarying float vUpperUpholsteryWorldY;${componentMaskFragmentDeclaration}\nuniform vec3 upperUpholsteryTintColor;\nuniform float upperUpholsteryTintStrength;\nuniform float upperUpholsteryTintStart;\nuniform float upperUpholsteryTintEnd;\nuniform float upperUpholsteryTintLuma;\nuniform float upperUpholsteryPreserveWarmWood;\nuniform float upperUpholsteryPreserveSourceLuma;`
          )
          .replace(
            "#include <map_fragment>",
            [
              "#include <map_fragment>",
              "float upperUpholsteryMask = smoothstep(upperUpholsteryTintStart, upperUpholsteryTintEnd, vUpperUpholsteryWorldY);",
              componentMaskFragmentApplication,
              "float upperUpholsteryLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
              "float upperUpholsteryWarmDelta = diffuseColor.r - diffuseColor.b;",
              "float upperUpholsteryWarmWoodMask = upperUpholsteryPreserveWarmWood * smoothstep(0.045, 0.13, upperUpholsteryWarmDelta) * smoothstep(0.12, 0.72, upperUpholsteryLuma);",
              "float upperUpholsteryDarkWoodMask = upperUpholsteryPreserveWarmWood * (1.0 - smoothstep(0.055, 0.18, upperUpholsteryLuma));",
              "upperUpholsteryMask *= 1.0 - clamp(max(upperUpholsteryWarmWoodMask, upperUpholsteryDarkWoodMask), 0.0, 1.0);",
              "float upperUpholsteryLumaScale = mix(1.0, clamp(upperUpholsteryLuma / upperUpholsteryTintLuma, 0.55, 1.35), upperUpholsteryPreserveSourceLuma);",
              "vec3 upperUpholsteryToned = upperUpholsteryTintColor * upperUpholsteryLumaScale;",
              "diffuseColor.rgb = mix(diffuseColor.rgb, clamp(upperUpholsteryToned, 0.0, 1.0), upperUpholsteryMask * upperUpholsteryTintStrength);",
            ].join("\n")
          );
      };
    };

    const applyHuggBlackPreserveGrain = (material: THREE.MeshStandardMaterial) => {
      if (!isHuggBlackVariant) return;
      material.customProgramCacheKey = () => "hugg-black-preserve-grain-v1";
      material.onBeforeCompile = (shader) => {
        shader.fragmentShader = shader.fragmentShader.replace(
          "#include <map_fragment>",
          [
            "#include <map_fragment>",
            "float huggKeepLuma = dot(diffuseColor.rgb, vec3(0.2126, 0.7152, 0.0722));",
            "float huggKeepContrast = smoothstep(0.12, 0.86, clamp(pow(huggKeepLuma, 0.82), 0.0, 1.0));",
            "vec3 huggKeepGrain = mix(vec3(0.010), vec3(0.30), huggKeepContrast);",
            "diffuseColor.rgb = mix(diffuseColor.rgb, huggKeepGrain, 0.86);"
          ].join("\n")
        );
      };
    };


    // Madison family keeps real wood leg materials; avoid upholstery overrides on those parts.
    const WOOD_LEG_PART_REGEX = /\b(leg|legs|foot|feet|wood|walnut|oak|beech|birch|rubberwood|timber)\b/i;
    const KELSEY_WOOD_BASE_PART_REGEX = /\b(leg|legs|base|support|stretcher|frame|foot|feet|wood|walnut|oak)\b/i;
    const HARPER_WOOD_BASE_PART_REGEX = /\b(base|pedestal|fluted|column|support|wood|oak|veneer)\b/i;
    const OTTOMAN_UPHOLSTERY_REGEX = /\b(ottoman|seat|stool|cushion|upholstery|fabric|arms?|back)\b/i;
    const meshLegLikeCache = new Map<string, boolean>();
    const huggOttomanLikeCache = new Map<string, boolean>();
    const isHuggModel = /\bhugg\b/i.test(url) || /\bhugg\b/i.test(String(productId ?? ""));
    const preserveImportedModelMaterials =
      productId === "bed-real-castlery-joseph" ||
      productId === "bed-real-castlery-rochelle-boucle" ||
      productId === "bed-real-castlery-seb" ||
      productId === "bed-real-castlery-dalton" ||
      productId === "bed-real-castlery-claude" ||
      productId === "bed-real-castlery-dawson" ||
      /^accessory-real-castlery-.*lamp/i.test(String(productId ?? "")) ||
      /bed-real-castlery-joseph/i.test(url) ||
      /bed-real-castlery-rochelle/i.test(url) ||
      /bed-real-castlery-seb/i.test(url) ||
      /bed-real-castlery-dalton/i.test(url) ||
      /bed-real-castlery-claude/i.test(url) ||
      /bed-real-castlery-dawson/i.test(url) ||
      /accessory-real-castlery-.*lamp/i.test(url);
    const huggVariantMarker = `${String(variantName ?? "")} ${String(variantId ?? "")}`.toLowerCase();
    const normalizedVariantHex = String(variantColorHex ?? "").trim().toLowerCase();
    const isBlackVariantHex = ["#1f1f1f", "#090909", "#000000", "#111111"].includes(normalizedVariantHex);
    const isHuggBlackVariant = isHuggModel && (huggVariantMarker.includes("black") || isBlackVariantHex);
    const resolvedVariantColorHex = (() => {
      if (!isHuggModel) return variantColorHex;
      if (huggVariantMarker.includes("black")) return "#090909";
      if (huggVariantMarker.includes("chestnut")) return "#8B6F47";
      if (huggVariantMarker.includes("natural")) return "#a89070";
      return variantColorHex;
    })();
    const applyHuggTopTint = createHuggTopTint({
      isHuggModel,
      huggVariantMarker,
      url,
    });

    const getMeshBounds = (mesh: THREE.Mesh) => {
      const box = new THREE.Box3().setFromObject(mesh);
      const size = new THREE.Vector3();
      const center = new THREE.Vector3();
      box.getSize(size);
      box.getCenter(center);
      return { size, center };
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
        return false;
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

    scene.traverse((obj) => {
      const mesh = obj as THREE.Mesh;
      if (!mesh.isMesh) return;
      mesh.castShadow = castShadow;
      // Imported meshes often contain dense or discontinuous topology that
      // produces visible self-shadow triangles. Let furniture cast onto the
      // room while floors and walls remain the shadow receivers.
      mesh.receiveShadow = false;
      if (preserveImportedModelMaterials) return;

      const mat = mesh.material as THREE.MeshStandardMaterial | THREE.MeshStandardMaterial[];
      if (Array.isArray(mat)) {
        mat.forEach((m) => {
          if (!m) return;
          const _hasUpholsteryShadingMaps = Boolean(
            upholsteryTextures.normalMap || upholsteryTextures.roughnessMap
          );
          applyPhysicalMaterialClamps(m);
          if (shouldPreserveWoodLegMaterial(mesh, m)) {
            const shouldKeepOriginalLegColor = calibration?.preserveWoodLegOriginalColor ?? false;
            const woodColorHex = shouldKeepOriginalLegColor
              ? undefined
              : calibration?.preserveWoodLegColorHex ??
                (isHuggBlackVariant && !calibration?.preserveWoodLegDisableBaseColorMap
                  ? "#0e0e0d"
                  : resolvedVariantColorHex);
            if (woodColorHex) {
              m.color = new THREE.Color(woodColorHex);
            }
            if (!shouldKeepOriginalLegColor && calibration?.preserveWoodLegDisableBaseColorMap) {
              m.map = null;
            }
            m.emissive = new THREE.Color(0x000000);
            m.emissiveIntensity = 0;
            if (!shouldKeepOriginalLegColor) {
              m.metalness = Math.min(m.metalness, isHuggBlackVariant ? 0.02 : 0.1);
              m.roughness = Math.max(m.roughness, isHuggBlackVariant ? 0.78 : 0.65);
            }
            if (m.map) m.map.colorSpace = THREE.SRGBColorSpace;
            if (!shouldKeepOriginalLegColor) {
              applyHuggBlackPreserveGrain(m);
              applyLowerAssemblyTint(mesh, m);
            }
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
          const shouldUseUpperUpholsteryTint = Boolean(calibration?.upperUpholsteryTint && colorHex);
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
              m.color = shouldUseUpperUpholsteryTint
                ? new THREE.Color("#ffffff")
                : new THREE.Color("#ffffff").lerp(
                    new THREE.Color(colorHex),
                    Math.max(0, Math.min(1, calibration?.variantMapTintStrength ?? 0.85))
                  );
            } else {
              m.color = new THREE.Color("#ffffff");
            }
          } else if (colorHex) {
            m.color = shouldUseUpperUpholsteryTint
              ? new THREE.Color("#ffffff")
              : new THREE.Color(colorHex);
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
            physicalMat.emissive =
              shouldUseUpperUpholsteryTint && colorHex
                ? new THREE.Color(colorHex)
                : physicalMat.color.clone();
            physicalMat.emissiveIntensity = calibration.emissiveBoost;
          }
          if (isHuggBlackVariant) {
            physicalMat.specularIntensity = 0;
            physicalMat.envMapIntensity = 0;
          }
          if (isHuggBlackVariant && isHuggOttoman) {
            // Hard clamp for black Hugg ottoman upholstery: prevent any residual
            // chrome-like highlights on pixels that fall outside shader fabric masks.
            physicalMat.metalnessMap = null;
            physicalMat.metalness = 0;
            physicalMat.roughness = Math.max(physicalMat.roughness, 0.86);
            physicalMat.specularIntensity = 0.02;
          }
        if (huggFinishColorHex) {
            applyHuggTopTint(mesh, physicalMat, huggFinishColorHex);
          }
          applyUpperUpholsteryTint(
            mesh,
            physicalMat,
            shouldUseUpperUpholsteryTint ? colorHex : undefined
          );
          applyLowerAssemblyTint(mesh, physicalMat);
          physicalMat.needsUpdate = true;
        });
      } else if (mat) {
        const _hasUpholsteryShadingMaps = Boolean(
          upholsteryTextures.normalMap || upholsteryTextures.roughnessMap
        );
        applyPhysicalMaterialClamps(mat);
        if (shouldPreserveWoodLegMaterial(mesh, mat)) {
          const shouldKeepOriginalLegColor = calibration?.preserveWoodLegOriginalColor ?? false;
          const woodColorHex = shouldKeepOriginalLegColor
            ? undefined
            : calibration?.preserveWoodLegColorHex ??
              (isHuggBlackVariant && !calibration?.preserveWoodLegDisableBaseColorMap
                ? "#0e0e0d"
                : resolvedVariantColorHex);
          if (woodColorHex) {
            mat.color = new THREE.Color(woodColorHex);
          }
          if (!shouldKeepOriginalLegColor && calibration?.preserveWoodLegDisableBaseColorMap) {
            mat.map = null;
          }
          mat.emissive = new THREE.Color(0x000000);
          mat.emissiveIntensity = 0;
          if (!shouldKeepOriginalLegColor) {
            mat.metalness = Math.min(mat.metalness, isHuggBlackVariant ? 0.02 : 0.1);
            mat.roughness = Math.max(mat.roughness, isHuggBlackVariant ? 0.78 : 0.65);
          }
          if (mat.map) mat.map.colorSpace = THREE.SRGBColorSpace;
          if (!shouldKeepOriginalLegColor) {
            applyHuggBlackPreserveGrain(mat);
            applyLowerAssemblyTint(mesh, mat);
          }
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
        const shouldUseUpperUpholsteryTint = Boolean(calibration?.upperUpholsteryTint && colorHex);
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
            mat.color = shouldUseUpperUpholsteryTint
              ? new THREE.Color("#ffffff")
              : new THREE.Color("#ffffff").lerp(
                  new THREE.Color(colorHex),
                  Math.max(0, Math.min(1, calibration?.variantMapTintStrength ?? 0.85))
                );
          } else {
            mat.color = new THREE.Color("#ffffff");
          }
        } else if (colorHex) {
          mat.color = shouldUseUpperUpholsteryTint
            ? new THREE.Color("#ffffff")
            : new THREE.Color(colorHex);
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
          mat.dispose();
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
          physicalMat.emissive =
            shouldUseUpperUpholsteryTint && colorHex
              ? new THREE.Color(colorHex)
              : physicalMat.color.clone();
          physicalMat.emissiveIntensity = calibration.emissiveBoost;
        }
        if (isHuggBlackVariant) {
          physicalMat.specularIntensity = 0;
          physicalMat.envMapIntensity = 0;
        }
        if (isHuggBlackVariant && isHuggOttoman) {
          // Hard clamp for black Hugg ottoman upholstery: prevent any residual
          // chrome-like highlights on pixels that fall outside shader fabric masks.
          physicalMat.metalnessMap = null;
          physicalMat.metalness = 0;
          physicalMat.roughness = Math.max(physicalMat.roughness, 0.86);
          physicalMat.specularIntensity = 0.02;
        }
        if (huggFinishColorHex) {
          applyHuggTopTint(mesh, physicalMat, huggFinishColorHex);
        }
        applyUpperUpholsteryTint(
          mesh,
          physicalMat,
          shouldUseUpperUpholsteryTint ? colorHex : undefined
        );
        applyLowerAssemblyTint(mesh, physicalMat);
        physicalMat.needsUpdate = true;
      }
    });

    return scene;
}
