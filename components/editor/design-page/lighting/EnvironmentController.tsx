"use client";

import { Environment } from "@react-three/drei/core/Environment";
import { Lightformer } from "@react-three/drei/core/Lightformer";
import {
  Component,
  Suspense,
  useMemo,
  type ErrorInfo,
  type ReactNode,
} from "react";

import type { ResolvedEditorLighting } from "./lightingTypes";

const ENVIRONMENT_KEY = "#ffffff";
const ENVIRONMENT_FILL = "#f3f5f7";

class EnvironmentFailureBoundary extends Component<
  { children: ReactNode; resetKey: string },
  { failed: boolean; resetKey: string }
> {
  state = { failed: false, resetKey: this.props.resetKey };

  static getDerivedStateFromError() {
    return { failed: true };
  }

  static getDerivedStateFromProps(
    props: { resetKey: string },
    state: { failed: boolean; resetKey: string }
  ) {
    return props.resetKey === state.resetKey
      ? null
      : { failed: false, resetKey: props.resetKey };
  }

  componentDidCatch(error: Error, info: ErrorInfo) {
    console.warn("[LightingSystem] Environment unavailable; using direct and ambient fallback.", {
      error,
      componentStack: info.componentStack,
    });
  }

  render() {
    return this.state.failed ? null : this.props.children;
  }
}

export function EnvironmentController({
  lighting,
}: {
  lighting: ResolvedEditorLighting;
}) {
  const { intensity, keyPosition, fillIntensity, fillPosition } =
    lighting.environment;
  // drei re-renders the environment cube and its PMREM whenever these
  // children change identity, so rebuild them only when their inputs change.
  const lightformers = useMemo(
    () => (
      <>
        <Lightformer
          intensity={intensity}
          color={ENVIRONMENT_KEY}
          position={keyPosition ?? [5, 6, 4]}
          rotation={keyPosition ? undefined : [0, Math.PI / 4, 0]}
          scale={[8, 8, 1]}
        />
        <Lightformer
          intensity={fillIntensity ?? intensity * 0.35}
          color={ENVIRONMENT_FILL}
          position={fillPosition ?? [-4, 3, -3]}
          rotation={fillPosition ? undefined : [0, -Math.PI / 6, 0]}
          scale={[6, 6, 1]}
        />
      </>
    ),
    [fillIntensity, fillPosition, intensity, keyPosition]
  );
  if (!lighting.environment.enabled) return null;

  return (
    <EnvironmentFailureBoundary
      resetKey={`${lighting.id}:${lighting.environment.resolution}`}
    >
      <Suspense fallback={null}>
        <Environment
          background={lighting.environment.backgroundVisible}
          resolution={lighting.environment.resolution}
        >
          {lightformers}
        </Environment>
      </Suspense>
    </EnvironmentFailureBoundary>
  );
}
