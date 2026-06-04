"use client";

import { Canvas } from "@react-three/fiber";
import { OrbitControls, Environment } from "@react-three/drei";
import { Suspense } from "react";
import { GLBScaledModel } from "@/components/scene/GLBScaledModel";

const HUGG_URL =
  "/assets/models/coffee-real-castlery-hugg-nesting-square-performance-basalt-closed.glb";
const HUGG_DUNE_URL =
  "/assets/models/coffee-real-castlery-hugg-nesting-square-performance-dune-closed.glb";

const W = 1.1;
const H = 0.43;
const D = 1.1;

const CALIB = {
  brightness: 1,
  saturation: 1,
  roughnessOverride: 0.78,
  metalnessOverride: 0,
  aoMapIntensity: 0.18,
  emissiveBoost: 0,
  specularIntensityOverride: 0.08,
  disableAoMap: false,
  disableVertexColors: false,
  useVariantColor: false,
  preserveWoodLegMaterials: false,
  preserveWoodLegDisableBaseColorMap: false,
};

function HuggScene({ url, variantName, colorHex }: { url: string; variantName: string; colorHex: string }) {
  return (
    <GLBScaledModel
      url={url}
      width={W}
      height={H}
      depth={D}
      variantColorHex={colorHex}
      variantName={variantName}
      calibration={CALIB}
    />
  );
}

export default function HuggTestClient() {
  return (
    <div style={{ width: "100vw", height: "100vh", background: "#f5f5f5", display: "flex" }}>
      <div
        data-testid="hugg-test-ready"
        style={{
          position: "absolute",
          top: 8,
          left: 8,
          zIndex: 10,
          background: "white",
          padding: "4px 8px",
          fontSize: 12,
          fontFamily: "monospace",
          borderRadius: 4,
        }}
      >
        Hugg Shader Test - black variant
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 10,
            background: "white",
            padding: "2px 6px",
            fontSize: 11,
            fontFamily: "monospace",
            borderRadius: 4,
          }}
        >
          Basalt
        </div>
        <Canvas
          gl={{ preserveDrawingBuffer: true }}
          camera={{ position: [1.2, 0.9, 1.4], fov: 45, near: 0.01, far: 50 }}
          style={{ width: "100%", height: "100%" }}
        >
          <ambientLight intensity={1.2} />
          <directionalLight position={[3, 8, 4]} intensity={2.5} castShadow />
          <directionalLight position={[-3, 4, -2]} intensity={0.8} />
          <pointLight position={[0, 3, 0]} intensity={1.0} />
          <Suspense fallback={null}>
            <Environment preset="apartment" />
            <HuggScene url={HUGG_URL} variantName="black" colorHex="#1f1f1f" />
          </Suspense>
          <OrbitControls target={[0, 0.15, 0]} />
        </Canvas>
      </div>
      <div style={{ flex: 1, position: "relative" }}>
        <div
          style={{
            position: "absolute",
            top: 8,
            left: 8,
            zIndex: 10,
            background: "white",
            padding: "2px 6px",
            fontSize: 11,
            fontFamily: "monospace",
            borderRadius: 4,
          }}
        >
          Dune
        </div>
        <Canvas
          gl={{ preserveDrawingBuffer: true }}
          camera={{ position: [1.2, 0.9, 1.4], fov: 45, near: 0.01, far: 50 }}
          style={{ width: "100%", height: "100%" }}
        >
          <ambientLight intensity={1.2} />
          <directionalLight position={[3, 8, 4]} intensity={2.5} castShadow />
          <directionalLight position={[-3, 4, -2]} intensity={0.8} />
          <pointLight position={[0, 3, 0]} intensity={1.0} />
          <Suspense fallback={null}>
            <Environment preset="apartment" />
            <HuggScene url={HUGG_DUNE_URL} variantName="black" colorHex="#1f1f1f" />
          </Suspense>
          <OrbitControls target={[0, 0.15, 0]} />
        </Canvas>
      </div>
    </div>
  );
}
