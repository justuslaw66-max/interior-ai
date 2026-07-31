"use client";

import { Environment } from "@react-three/drei/core/Environment";
import { Lightformer } from "@react-three/drei/core/Lightformer";
import {
  Component,
  Suspense,
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
          <Lightformer
            intensity={lighting.environment.intensity}
            color={ENVIRONMENT_KEY}
            position={[5, 6, 4]}
            rotation={[0, Math.PI / 4, 0]}
            scale={[8, 8, 1]}
          />
          <Lightformer
            intensity={lighting.environment.intensity * 0.35}
            color={ENVIRONMENT_FILL}
            position={[-4, 3, -3]}
            rotation={[0, -Math.PI / 6, 0]}
            scale={[6, 6, 1]}
          />
        </Environment>
      </Suspense>
    </EnvironmentFailureBoundary>
  );
}
