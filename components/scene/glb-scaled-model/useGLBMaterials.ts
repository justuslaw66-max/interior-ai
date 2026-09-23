import * as THREE from "three";
import { useEffect, useState } from "react";

import type { CatalogItemSchema } from "@/lib/catalog-schema";
import type { GLBUpholsteryTextures } from "./normalizeGLBScene";
import { measureGLBMainThreadWork } from "./glbMainThreadTelemetryFacade";

type RenderAssets = CatalogItemSchema["variants"][number]["renderAssets"];
type MaterialControl = { cancelled: boolean; ownedTextures: THREE.Texture[] };
type MaterialState = {
  identity: string;
  textures: GLBUpholsteryTextures;
  error: boolean;
};

function loadUpholsteryTexture(
  loader: THREE.TextureLoader,
  url: string | undefined,
  repeat: [number, number],
  colorSpace?: THREE.ColorSpace
) {
  return new Promise<THREE.Texture | undefined>((resolve, reject) => {
    if (!url) return resolve(undefined);
    loader.load(
      url,
      (texture) => {
        try {
          texture.wrapS = THREE.RepeatWrapping;
          texture.wrapT = THREE.RepeatWrapping;
          texture.repeat.set(repeat[0], repeat[1]);
          if (colorSpace) texture.colorSpace = colorSpace;
          texture.needsUpdate = true;
          resolve(texture);
        } catch {
          texture.dispose();
          reject(new Error("glb-material-setup-failed"));
        }
      },
      undefined,
      () => resolve(undefined)
    );
  });
}

function loadMaterialTextures(
  loader: THREE.TextureLoader,
  renderAssets: RenderAssets | undefined,
  repeat: [number, number]
) {
  return Promise.allSettled([
    loadUpholsteryTexture(
      loader,
      renderAssets?.baseColorMap,
      repeat,
      THREE.SRGBColorSpace
    ),
    loadUpholsteryTexture(loader, renderAssets?.normalMap, repeat),
    loadUpholsteryTexture(loader, renderAssets?.roughnessMap, repeat),
  ]);
}

function finishMaterialLoad({
  results,
  control,
  diagnosticKey,
  identity,
  publish,
}: {
  results: Awaited<ReturnType<typeof loadMaterialTextures>>;
  control: MaterialControl;
  diagnosticKey: string;
  identity: string;
  publish: (state: MaterialState) => void;
}) {
  control.ownedTextures = results.flatMap((result) =>
    result.status === "fulfilled" && result.value ? [result.value] : []
  );
  if (control.cancelled) {
    control.ownedTextures.forEach((texture) => texture.dispose());
    control.ownedTextures = [];
    return;
  }
  if (results.some((result) => result.status === "rejected")) {
    control.ownedTextures.forEach((texture) => texture.dispose());
    control.ownedTextures = [];
    console.warn("[GLBScaledModel] Material setup failed", {
      diagnosticKey,
      errorCode: "glb-material-setup-failed",
    });
    publish({ identity, textures: {}, error: true });
    return;
  }
  const [baseColorMap, normalMap, roughnessMap] = results.map((result) =>
    result.status === "fulfilled" ? result.value : undefined
  );
  publish({
    identity,
    textures: { baseColorMap, normalMap, roughnessMap },
    error: false,
  });
}

export function useGLBMaterials({
  renderAssets,
  materialKey,
  diagnosticKey,
}: {
  renderAssets: RenderAssets | undefined;
  materialKey: string;
  diagnosticKey: string;
}) {
  const [state, setState] = useState<MaterialState | null>(null);
  useEffect(() => {
    const control: MaterialControl = { cancelled: false, ownedTextures: [] };
    const repeat: [number, number] = [
      renderAssets?.tileScale?.x ?? 1,
      renderAssets?.tileScale?.y ?? 1,
    ];
    void loadMaterialTextures(
      new THREE.TextureLoader(),
      renderAssets,
      repeat
    ).then((results) =>
      measureGLBMainThreadWork("material-texture-setup", () =>
        finishMaterialLoad({
          results,
          control,
          diagnosticKey,
          identity: materialKey,
          publish: setState,
        }),
      ),
    );
    return () => {
      control.cancelled = true;
      control.ownedTextures.forEach((texture) => texture.dispose());
      control.ownedTextures = [];
    };
  }, [diagnosticKey, materialKey, renderAssets]);
  return {
    materialError: state?.identity === materialKey && state.error,
    materialsReady: state?.identity === materialKey && !state.error,
    upholsteryTextures: state?.identity === materialKey ? state.textures : {},
  };
}
