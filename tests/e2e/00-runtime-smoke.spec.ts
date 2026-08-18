import { expect, test } from "./fixtures";
import { confirmPlanTemplateReplacementIfNeeded } from "./plan-template-test-utils";
import { getSelectedItemPanel } from "./variant-test-utils";
import {
  FURNISHED_TEMPLATE_PHASE_CONTRACTS,
  FURNISHED_TEMPLATE_RELOAD_CONTRACT,
  RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT,
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS,
  RuntimeSmokeOperationAttemptTimeoutError,
  RuntimeSmokeOperationTimeoutError,
  RuntimeSmokeTerminalError,
  createRuntimeSmokeOperationDeadline,
  createRuntimeSmokePhaseRecorder,
  runRuntimeSmokeBoundedOperation,
  runtimeSmokeAggregateLifecycleState,
  runtimeSmokeOperationAttempt,
  waitForRuntimeSmokeOperationDeadline,
} from "../../scripts/runtime-smoke-phase-budget.mjs";
import {
  captureImmediatePostReadinessSnapshot,
  runRuntimeSmokePostReadinessOperation,
} from "../../scripts/runtime-smoke-post-readiness.mjs";
import {
  createRuntimeSmokeReadinessObservation,
  evaluateRuntimeSmokeActiveRequiredModels,
} from "../../scripts/runtime-smoke-readiness-diagnostics.mjs";
import {
  projectRuntimeSmokeBrowserCallbackMilestone,
  projectRuntimeSmokeBrowserHeartbeat,
} from "../../scripts/runtime-smoke-browser-diagnostics.mjs";
import {
  RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_ATTACHMENT,
  createRuntimeSmokeTelemetryBootstrapEvidence,
  validateRuntimeSmokeTelemetryBootstrapEvidence,
} from "../../scripts/runtime-smoke-telemetry-bootstrap-contract.mjs";
import type { GLBRequiredSnapshot } from "../../components/scene/glb-scaled-model/glbRequiredSnapshot";
import type { GLBMainThreadTelemetrySnapshot } from "../../components/scene/glb-scaled-model/glbMainThreadTelemetry";
import { calculateGLBRequiredSnapshotTransportTiming } from "../../components/scene/glb-scaled-model/glbSnapshotTiming";

test.use({
  trace: "off",
  video: "off",
});

const DESIGN_STORAGE_KEY = "interior-ai:v1:livingroom-design";
const EXPECTED_ACTIVE_REQUIRED_MODEL_COUNT = 8;

type RuntimeSmokeCheckpoint = (
  name: string,
  lifecycleState?: string,
) => void;

function reloadOperationTimeout(name: string): number {
  const operation = FURNISHED_TEMPLATE_RELOAD_CONTRACT.operations.find(
    (candidate) => candidate.name === name,
  );
  if (!operation) throw new Error(`Unknown reload operation: ${name}`);
  return operation.timeoutMs;
}

function phaseOperationTimeout(
  phaseName: keyof typeof FURNISHED_TEMPLATE_PHASE_CONTRACTS,
  operationName: string,
): number {
  const operation = FURNISHED_TEMPLATE_PHASE_CONTRACTS[
    phaseName
  ].operations.find((candidate) => candidate.name === operationName);
  if (!operation) {
    throw new Error(`Unknown ${phaseName} operation: ${operationName}`);
  }
  return operation.timeoutMs;
}

const MODEL_FIXTURES = [
  {
    id: "sofa-real-castlery-dawson-ottoman",
    title: "Dawson Ottoman",
    dimensionsMm: { w: 930, d: 930, h: 450 },
    position: [-1.2, 0, 1.1] as [number, number, number],
    modelPath: "/assets/models/sofa-real-castlery-dawson-ottoman.glb",
    modelPathHash: "fnv1a-09942d68",
  },
  {
    id: "sofa-real-castlery-jaron-3s",
    title: "Jaron Recliner Sofa",
    dimensionsMm: { w: 2200, d: 1150, h: 770 },
    position: [0, 0, 1.1] as [number, number, number],
    modelPath: "/assets/models/sofa-real-castlery-jaron-3s.glb",
    modelPathHash: "fnv1a-a7623e72",
  },
  {
    id: "sofa-real-castlery-auburn-performance-fabric-3-seater-sofa",
    title: "Auburn Performance Fabric 3 Seater Sofa",
    dimensionsMm: { w: 2310, d: 915, h: 765 },
    position: [1.1, 0, -0.9] as [number, number, number],
    modelPath:
      "/assets/models/sofa-real-castlery-auburn-performance-fabric-3-seater-sofa.glb",
    modelPathHash: "fnv1a-3fa7f0e6",
  },
] as const;

test.describe("00. Runtime smoke", () => {
  test("furnished template remains stable without a render loop", async ({ page }, testInfo) => {
    test.setTimeout(RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS);
    let finalLifecycleState = "not-observed";
    const phaseRecorder = createRuntimeSmokePhaseRecorder({
      repositoryRoot: process.cwd(),
      timingPath: process.env.RUNTIME_SMOKE_PHASE_TIMINGS_PATH?.trim(),
    });
    const fatalErrors: string[] = [];
    const modelRequestCounts = new Map(
      MODEL_FIXTURES.map(({ modelPath }) => [modelPath, 0])
    );
    const modelResponseCounts = new Map(
      MODEL_FIXTURES.map(({ modelPath }) => [modelPath, 0])
    );
    const diagnosticKeys = MODEL_FIXTURES.map(
      (_, index) => `runtime-smoke-model-${index + 1}`
    );
    type RequiredSnapshotTiming = {
      hostRequestStartedAtUnixMs: number;
      callbackEnteredAtUnixMs: number;
      computationStartedAtUnixMs: number;
      computationCompletedAtUnixMs: number;
      serializationCompletedAtUnixMs: number;
      hostResultReceivedAtUnixMs: number;
      schedulingDelayMs: number;
      computationDurationMs: number;
      serializationDurationMs: number;
      transferDurationMs: number;
    };
    type RequiredSnapshotMilestone = {
      hostRequestStartedAtUnixMs: number;
      callbackEnteredAtUnixMs: number;
      computationStartedAtUnixMs: number;
      computationCompletedAtUnixMs?: number;
      serializationCompletedAtUnixMs?: number;
    };
    type BrowserCallbackMilestone = {
      schema: "interior-ai.runtime-smoke-browser-callback.v1";
      phaseName: string;
      operationName: string;
      requestId: number;
      stage:
        | "entered-browser"
        | "snapshot-complete"
        | "callback-exited"
        | "serialization-complete";
    };
    type BrowserHeartbeat = {
      schema: "interior-ai.runtime-smoke-browser-heartbeat.v1";
      kind: "started" | "interval";
      sequence: number;
      observedAtMs: number;
      eventLoopDelayMs: number;
      maximumEventLoopDelayMs: number;
    };
    type BodyStateObservation = {
      hasMaximumDepthError: boolean;
      hostRequestStartedAt: number;
      hostTiming: {
        requestStartedMs: 0;
        browserCallInvokedMs: number;
        browserCallbackEnteredMs: number | null;
        browserCallbackExitedMs: number | null;
        serializationCompletedMs: number | null;
        resultReceivedMs: number;
      };
      browserTiming: {
        callbackEnteredMs: 0;
        callbackExitedMs: number;
        serializationCompletedMs: number;
        bodyStateComputationMs: number;
      };
    };
    type MainThreadTelemetrySummary = {
      schema: "interior-ai.glb-main-thread-telemetry-summary.v1";
      timingCount: number;
      timingAggregates: Record<
        string,
        { count: number; totalDurationMs: number; maximumDurationMs: number }
      >;
      longTaskCount: number;
      heartbeatGapCount: number;
      frameGapCount: number;
      maximumTiming: { category: string; durationMs: number } | null;
      maximumLongTask: {
        category: string;
        durationMs: number;
        startRelativeMs: number;
        reloadGeneration: number;
        activeRequiredCount: number;
        modelStageCounts: Record<string, number>;
      } | null;
      maximumHeartbeatGapMs: number;
      maximumFrameGapMs: number;
      maximumSynchronousOperationsActive: number;
      counters: Record<string, number>;
      maximumTelemetryCallbackDurationMs: number;
    };
    let lastRequiredSnapshot: GLBRequiredSnapshot | null = null;
    let lastRequiredSnapshotTiming: RequiredSnapshotTiming | null = null;
    let requiredSnapshotMilestoneCheckpoint: RuntimeSmokeCheckpoint | null = null;
    let activeBrowserCallbackTiming: {
      phaseName: string;
      operationName: string;
      requestId: number;
      hostStartedAt: number;
      browserCallInvokedAt: number;
      milestones: Partial<
        Record<BrowserCallbackMilestone["stage"], number>
      >;
    } | null = null;
    let lastBrowserHeartbeat: BrowserHeartbeat | null = null;
    let diagnosticSnapshotRequestSequence = 0;
    let lastBodyStateObservation: BodyStateObservation | null = null;
    let lastMainThreadTelemetrySummary: MainThreadTelemetrySummary | null = null;
    const immediatePostReadinessSnapshots: GLBRequiredSnapshot[] = [];
    const recordTelemetryBootstrapEvidence = async ({
      phaseName,
      expectedCollectorActivationGeneration,
      observedReadyModelCount,
    }: {
      phaseName: string;
      expectedCollectorActivationGeneration: number;
      observedReadyModelCount: number;
    }) => {
      const telemetry = await page.evaluate(() => {
        type TelemetryState = Pick<
          GLBMainThreadTelemetrySnapshot,
          | "schema"
          | "collectorImportState"
          | "collectorActivationMode"
          | "collectorActivationGeneration"
          | "bootstrapRecordsQueuedAtActivation"
          | "bootstrapEventsFlushed"
          | "bootstrapFlushCompleted"
          | "directModeActive"
          | "directTelemetryObserved"
          | "timings"
          | "counters"
        >;
        const telemetryGlobal = globalThis as typeof globalThis & {
          __INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?: () => TelemetryState;
        };
        const snapshotHook =
          telemetryGlobal.__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__;
        const snapshot = snapshotHook?.();
        return {
          schema: snapshot?.schema ?? null,
          snapshotHookPresent: typeof snapshotHook === "function",
          collectorImportState:
            snapshot?.collectorImportState ?? "not-requested",
          collectorActivationMode: snapshot?.collectorActivationMode ?? null,
          collectorActivationGeneration:
            snapshot?.collectorActivationGeneration ?? 0,
          bootstrapRecordsQueuedAtActivation:
            snapshot?.bootstrapRecordsQueuedAtActivation ?? 0,
          bootstrapEventsFlushed: snapshot?.bootstrapEventsFlushed ?? 0,
          bootstrapFlushCompleted: snapshot?.bootstrapFlushCompleted ?? false,
          directModeActive: snapshot?.directModeActive ?? false,
          directTelemetryObserved:
            snapshot?.directTelemetryObserved ?? false,
          timingCount: snapshot?.timings.length ?? 0,
          counters: {
            lifecycleTransitions:
              snapshot?.counters.lifecycleTransitions ?? 0,
            diagnosticStoreUpdates:
              snapshot?.counters.diagnosticStoreUpdates ?? 0,
            reactRenders: snapshot?.counters.reactRenders ?? 0,
            sceneAttachments: snapshot?.counters.sceneAttachments ?? 0,
            rendererCalls: snapshot?.counters.rendererCalls ?? 0,
          },
        };
      });
      const evidence = createRuntimeSmokeTelemetryBootstrapEvidence({
        phaseName,
        expectedCollectorActivationGeneration,
        expectedReadyModelCount: EXPECTED_ACTIVE_REQUIRED_MODEL_COUNT,
        observedReadyModelCount,
        telemetry,
      });
      await testInfo.attach(RUNTIME_SMOKE_TELEMETRY_BOOTSTRAP_ATTACHMENT, {
        body: JSON.stringify(evidence),
        contentType: "application/json",
      });
      const validation = validateRuntimeSmokeTelemetryBootstrapEvidence(
        evidence,
      );
      console.info(
        "[runtime-smoke-telemetry-bootstrap]",
        JSON.stringify(evidence),
      );
      expect(
        validation.valid,
        JSON.stringify({
          phaseName,
          ...validation.contract.details,
          issues: validation.issues,
        }),
      ).toBe(true);
      return evidence;
    };
    const recordBrowserSnapshotMilestone = (milestone: RequiredSnapshotMilestone) => {
      const checkpoint = requiredSnapshotMilestoneCheckpoint;
      if (!checkpoint) return;
      checkpoint(
        `snapshot-callback-entered-after-${Math.max(
          0,
          milestone.callbackEnteredAtUnixMs - milestone.hostRequestStartedAtUnixMs,
        )}`,
        "ready",
      );
      checkpoint(
        `required-snapshot-entered-browser-after-${Math.max(
          0,
          milestone.callbackEnteredAtUnixMs - milestone.hostRequestStartedAtUnixMs,
        )}`,
        "ready",
      );
      if (milestone.computationCompletedAtUnixMs !== undefined) {
        checkpoint(
          `snapshot-computation-complete-${Math.max(
            0,
            milestone.computationCompletedAtUnixMs - milestone.computationStartedAtUnixMs,
          )}`,
          "ready",
        );
        checkpoint(
          `required-snapshot-callback-exited-after-${Math.max(
            0,
            milestone.computationCompletedAtUnixMs -
              milestone.hostRequestStartedAtUnixMs,
          )}`,
          "ready",
        );
      }
      if (milestone.serializationCompletedAtUnixMs !== undefined) {
        checkpoint(
          `snapshot-serialization-complete-${Math.max(
            0,
            milestone.serializationCompletedAtUnixMs -
              (milestone.computationCompletedAtUnixMs ??
                milestone.computationStartedAtUnixMs),
          )}`,
          "ready",
        );
        checkpoint(
          `required-snapshot-serialization-complete-after-${Math.max(
            0,
            milestone.serializationCompletedAtUnixMs -
              milestone.hostRequestStartedAtUnixMs,
          )}`,
          "ready",
        );
      }
    };
    const recordBrowserCallbackMilestone = (
      milestone: BrowserCallbackMilestone,
    ) => {
      const timing = activeBrowserCallbackTiming;
      if (
        !timing ||
        milestone.phaseName !== timing.phaseName ||
        milestone.operationName !== timing.operationName ||
        milestone.requestId !== timing.requestId
      ) {
        return;
      }
      timing.milestones[milestone.stage] = Math.max(
        0,
        performance.now() - timing.hostStartedAt,
      );
      console.info(
        "[runtime-smoke-browser-callback-observation]",
        JSON.stringify({
          schema: milestone.schema,
          phaseName: milestone.phaseName,
          operationName: milestone.operationName,
          requestId: milestone.requestId,
          stage: milestone.stage,
          hostObservedAfterMs: Math.round(timing.milestones[milestone.stage] ?? 0),
        }),
      );
    };
    const readModelDiagnostics = async (
      operation: { phaseName: string; operationName: string },
      milestoneCheckpoint: RuntimeSmokeCheckpoint | null = null,
    ) => {
      const hostRequestStartedAt = performance.now();
      const hostRequestStartedAtUnixMs = Date.now();
      const requestId = ++diagnosticSnapshotRequestSequence;
      requiredSnapshotMilestoneCheckpoint = milestoneCheckpoint;
      milestoneCheckpoint?.("snapshot-host-request-started", "ready");
      console.info(
        "[runtime-smoke-browser-callback-requested]",
        JSON.stringify({
          schema: "interior-ai.runtime-smoke-browser-callback-request.v1",
          phaseName: operation.phaseName,
          operationName: operation.operationName,
          requestId,
        }),
      );
      activeBrowserCallbackTiming = {
        ...operation,
        requestId,
        hostStartedAt: hostRequestStartedAt,
        browserCallInvokedAt: performance.now(),
        milestones: {},
      };
      const transfer = await page.evaluate(
        ({
          captureMilestones,
          hostRequestStartedAtUnixMs,
          operation,
          requestId,
        }) => {
          const emitMilestone = (milestone: RequiredSnapshotMilestone) => {
            if (!captureMilestones) return;
            console.info(
              "[runtime-smoke-required-snapshot-milestone]",
              JSON.stringify(milestone),
            );
          };
          const emitBrowserCallbackMilestone = (
            stage: BrowserCallbackMilestone["stage"],
          ) => {
            console.info(
              "[runtime-smoke-browser-callback-milestone]",
              JSON.stringify({
                schema: "interior-ai.runtime-smoke-browser-callback.v1",
                ...operation,
                requestId,
                stage,
              }),
            );
          };
          const callbackEnteredAt = performance.now();
          emitBrowserCallbackMilestone("entered-browser");
          const callbackEnteredAtUnixMs = Date.now();
          const computationStartedAtUnixMs = Date.now();
          emitMilestone({
            hostRequestStartedAtUnixMs,
            callbackEnteredAtUnixMs,
            computationStartedAtUnixMs,
          });
          const snapshot = (
            globalThis as typeof globalThis & {
              __INTERIOR_AI_GLB_REQUIRED_SNAPSHOT__?: () => unknown;
            }
          ).__INTERIOR_AI_GLB_REQUIRED_SNAPSHOT__?.();
          const mainThreadTelemetry = (
            globalThis as typeof globalThis & {
              __INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?: () => {
                timings: Array<{ category: string; durationMs: number }>;
                timingAggregates: Record<
                  string,
                  {
                    count: number;
                    totalDurationMs: number;
                    maximumDurationMs: number;
                  }
                >;
                longTasks: Array<{
                  category: string;
                  durationMs: number;
                  startRelativeMs: number;
                  reloadGeneration: number;
                  activeRequiredCount: number;
                  modelStageCounts: Record<string, number>;
                }>;
                heartbeatGaps: Array<{ durationMs: number }>;
                frameGaps: Array<{ durationMs: number }>;
                maximumSynchronousOperationsActive: number;
                counters: Record<string, number>;
                maximumTelemetryCallbackDurationMs: number;
              };
            }
          ).__INTERIOR_AI_GLB_MAIN_THREAD_SNAPSHOT__?.();
          const maximumByDuration = <T extends { durationMs: number }>(
            entries: T[],
          ) =>
            entries.reduce<T | null>(
              (maximum, entry) =>
                !maximum || entry.durationMs > maximum.durationMs
                  ? entry
                  : maximum,
              null,
            );
          const maximumTiming = mainThreadTelemetry
            ? maximumByDuration(mainThreadTelemetry.timings)
            : null;
          const maximumLongTask = mainThreadTelemetry
            ? maximumByDuration(mainThreadTelemetry.longTasks)
            : null;
          const telemetrySummary: MainThreadTelemetrySummary | null =
            mainThreadTelemetry
              ? {
                  schema:
                    "interior-ai.glb-main-thread-telemetry-summary.v1",
                  timingCount: mainThreadTelemetry.timings.length,
                  timingAggregates: mainThreadTelemetry.timingAggregates,
                  longTaskCount: mainThreadTelemetry.longTasks.length,
                  heartbeatGapCount:
                    mainThreadTelemetry.heartbeatGaps.length,
                  frameGapCount: mainThreadTelemetry.frameGaps.length,
                  maximumTiming: maximumTiming
                    ? {
                        category: maximumTiming.category,
                        durationMs: maximumTiming.durationMs,
                      }
                    : null,
                  maximumLongTask: maximumLongTask
                    ? {
                        category: maximumLongTask.category,
                        durationMs: maximumLongTask.durationMs,
                        startRelativeMs: maximumLongTask.startRelativeMs,
                        reloadGeneration: maximumLongTask.reloadGeneration,
                        activeRequiredCount: maximumLongTask.activeRequiredCount,
                        modelStageCounts: maximumLongTask.modelStageCounts,
                      }
                    : null,
                  maximumHeartbeatGapMs: Math.max(
                    0,
                    ...mainThreadTelemetry.heartbeatGaps.map(
                      (entry) => entry.durationMs,
                    ),
                  ),
                  maximumFrameGapMs: Math.max(
                    0,
                    ...mainThreadTelemetry.frameGaps.map(
                      (entry) => entry.durationMs,
                    ),
                  ),
                  maximumSynchronousOperationsActive:
                    mainThreadTelemetry.maximumSynchronousOperationsActive,
                  counters: mainThreadTelemetry.counters,
                  maximumTelemetryCallbackDurationMs:
                    mainThreadTelemetry.maximumTelemetryCallbackDurationMs,
                }
              : null;
          const computationCompletedAtUnixMs = Date.now();
          emitBrowserCallbackMilestone("snapshot-complete");
          emitMilestone({
            hostRequestStartedAtUnixMs,
            callbackEnteredAtUnixMs,
            computationStartedAtUnixMs,
            computationCompletedAtUnixMs,
          });
          const bodyStateComputationStartedAt = performance.now();
          const hasMaximumDepthError =
            document.body.textContent?.includes(
              "Maximum update depth exceeded",
            ) ?? false;
          const bodyStateComputationCompletedAt = performance.now();
          emitBrowserCallbackMilestone("callback-exited");
          const snapshotSerializationStartedAt = performance.now();
          const serializedSnapshot = snapshot ? JSON.stringify(snapshot) : null;
          const snapshotSerializationCompletedAt = performance.now();
          const serializationCompletedAtUnixMs = Date.now();
          emitMilestone({
            hostRequestStartedAtUnixMs,
            callbackEnteredAtUnixMs,
            computationStartedAtUnixMs,
            computationCompletedAtUnixMs,
            serializationCompletedAtUnixMs,
          });
          emitBrowserCallbackMilestone("serialization-complete");
          return {
            hostRequestStartedAtUnixMs,
            callbackEnteredAtUnixMs,
            computationStartedAtUnixMs,
            computationCompletedAtUnixMs,
            serializationCompletedAtUnixMs,
            serializedSnapshot,
            telemetrySummary,
            hasMaximumDepthError,
            browserCallbackDurationMs: Math.max(
              0,
              bodyStateComputationCompletedAt - callbackEnteredAt,
            ),
            bodyStateComputationMs: Math.max(
              0,
              bodyStateComputationCompletedAt - bodyStateComputationStartedAt,
            ),
            snapshotSerializationDurationMs: Math.max(
              0,
              snapshotSerializationCompletedAt - snapshotSerializationStartedAt,
            ),
          };
        },
        {
          captureMilestones: milestoneCheckpoint !== null,
          hostRequestStartedAtUnixMs,
          operation,
          requestId,
        },
      );
      const hostResultReceivedAt = performance.now();
      const hostResultReceivedAtUnixMs = Date.now();
      requiredSnapshotMilestoneCheckpoint = null;
      const browserTiming = activeBrowserCallbackTiming;
      activeBrowserCallbackTiming = null;
      const {
        serializedSnapshot,
        telemetrySummary,
        hasMaximumDepthError,
        browserCallbackDurationMs,
        bodyStateComputationMs,
        snapshotSerializationDurationMs,
        ...transferMilestones
      } = transfer;
      lastBodyStateObservation = {
        hasMaximumDepthError,
        hostRequestStartedAt,
        hostTiming: {
          requestStartedMs: 0,
          browserCallInvokedMs: Math.max(
            0,
            (browserTiming?.browserCallInvokedAt ?? hostRequestStartedAt) -
              hostRequestStartedAt,
          ),
          browserCallbackEnteredMs:
            browserTiming?.milestones["entered-browser"] ?? null,
          browserCallbackExitedMs:
            browserTiming?.milestones["callback-exited"] ?? null,
          serializationCompletedMs:
            browserTiming?.milestones["serialization-complete"] ?? null,
          resultReceivedMs: Math.max(
            0,
            hostResultReceivedAt - hostRequestStartedAt,
          ),
        },
        browserTiming: {
          callbackEnteredMs: 0,
          callbackExitedMs: browserCallbackDurationMs,
          serializationCompletedMs:
            browserCallbackDurationMs + snapshotSerializationDurationMs,
          bodyStateComputationMs,
        },
      };
      lastMainThreadTelemetrySummary = telemetrySummary;
      lastRequiredSnapshotTiming = {
        ...transferMilestones,
        hostResultReceivedAtUnixMs,
        ...calculateGLBRequiredSnapshotTransportTiming({
          ...transferMilestones,
          hostResultReceivedAtUnixMs,
        }),
      };
      console.info(
        "[runtime-smoke-browser-callback-timing]",
        JSON.stringify({
          schema: "interior-ai.runtime-smoke-browser-callback-timing.v1",
          ...operation,
          requestId,
          hostTiming: {
            callbackEnteredAfterMs:
              browserTiming?.milestones["entered-browser"] === undefined
                ? null
                : Math.round(browserTiming.milestones["entered-browser"]),
            snapshotCompletedAfterMs:
              browserTiming?.milestones["snapshot-complete"] === undefined
                ? null
                : Math.round(browserTiming.milestones["snapshot-complete"]),
            callbackExitedAfterMs:
              browserTiming?.milestones["callback-exited"] === undefined
                ? null
                : Math.round(browserTiming.milestones["callback-exited"]),
            serializationCompletedAfterMs:
              browserTiming?.milestones["serialization-complete"] === undefined
                ? null
                : Math.round(browserTiming.milestones["serialization-complete"]),
            resultReceivedAfterMs: Math.round(
              Math.max(0, hostResultReceivedAt - hostRequestStartedAt),
            ),
          },
          browserTiming: {
            callbackDurationMs: Math.round(browserCallbackDurationMs),
            bodyStateComputationMs: Math.round(bodyStateComputationMs),
            serializationDurationMs: Math.round(snapshotSerializationDurationMs),
          },
          lastHeartbeat: lastBrowserHeartbeat,
          mainThreadTelemetry: telemetrySummary,
        }),
      );
      if (!serializedSnapshot) {
        lastRequiredSnapshot = null;
        return diagnosticKeys.map((key) => ({
          key,
          diagnostic: null,
          registrySize: 0,
          activeRequiredKeys: [] as string[],
          activeRequiredDiagnostics: [] as GLBRequiredSnapshot["models"],
        }));
      }
      const snapshot = JSON.parse(
        serializedSnapshot,
      ) as GLBRequiredSnapshot;
      lastRequiredSnapshot = snapshot;
      const activeRequiredEvaluation =
        evaluateRuntimeSmokeActiveRequiredModels({
          snapshot,
          expectedModelCount: EXPECTED_ACTIVE_REQUIRED_MODEL_COUNT,
        });
      return diagnosticKeys.map((key) => ({
        key,
        diagnostic:
          snapshot.models.find((diagnostic) => diagnostic.key === key) ?? null,
        registrySize: snapshot.registryEntryCount,
        activeRequiredKeys: snapshot.activeRequiredModelIds,
        activeRequiredEvaluation,
      }));
    };
    let expectedLifecycleRegistrySize: number | null = null;
    let expectedActiveRequiredKeys: string[] | null = null;
    let expectedReloadCacheEntryCounts: {
      parsed: number;
      prepared: number;
    } | null = null;
    const expectedDiagnosticReady = (
      entry: Awaited<ReturnType<typeof readModelDiagnostics>>[number],
      index: number,
      minimumReloadGeneration = 1,
    ) => {
      const diagnostic = entry.diagnostic;
      const fixture = MODEL_FIXTURES[index];
      const expectedVariantId = `runtime-smoke-${fixture.id}`;
      const readinessSuffix = [
        entry.key,
        fixture.id,
        expectedVariantId,
        "standard",
      ].join(":");
      return Boolean(
        diagnostic?.active &&
          diagnostic.requiredForReadiness &&
          diagnostic.sceneItemId === entry.key &&
          diagnostic.productId === fixture.id &&
          diagnostic.variantId === expectedVariantId &&
          diagnostic.readinessKey?.endsWith(readinessSuffix) &&
          diagnostic.urlHash === fixture.modelPathHash &&
          /^g\d+:m\d+$/.test(diagnostic.mountInstanceId) &&
          diagnostic.reloadGeneration >= minimumReloadGeneration &&
          diagnostic.loadState === "ready" &&
          diagnostic.pendingStage === null &&
          diagnostic.requestStarted &&
          diagnostic.responseCompleted &&
          diagnostic.cacheStatus !== "unknown" &&
          diagnostic.parseDecodeState === "complete" &&
          diagnostic.normalizationState === "complete" &&
          diagnostic.materialState === "complete" &&
          diagnostic.boundsState === "complete" &&
          diagnostic.sceneAttachmentState === "complete" &&
          diagnostic.cancellationState === "active" &&
          diagnostic.terminalErrorCategory === null
      );
    };
    const activeRequiredDiagnosticsFor = (
      diagnostics: Awaited<ReturnType<typeof readModelDiagnostics>>,
    ) =>
      diagnostics[0]?.activeRequiredEvaluation?.activeRequiredDiagnostics ?? [];
    const exactRequiredRegistryReady = (
      diagnostics: Awaited<ReturnType<typeof readModelDiagnostics>>,
      minimumReloadGeneration = 1,
    ) => {
      const observedRegistrySize = diagnostics[0]?.registrySize ?? 0;
      const observedActiveRequiredKeys =
        diagnostics[0]?.activeRequiredKeys ?? [];
      const activeRequired = activeRequiredDiagnosticsFor(diagnostics);
      const activeRequiredEvaluation = lastRequiredSnapshot
        ? evaluateRuntimeSmokeActiveRequiredModels({
            snapshot: lastRequiredSnapshot,
            expectedModelCount: EXPECTED_ACTIVE_REQUIRED_MODEL_COUNT,
            minimumReloadGeneration,
          })
        : null;
      return (
        diagnostics.length === diagnosticKeys.length &&
        observedRegistrySize >= diagnosticKeys.length &&
        activeRequired.length === observedActiveRequiredKeys.length &&
        activeRequiredEvaluation?.ready === true &&
        diagnosticKeys.every((key) =>
          observedActiveRequiredKeys.includes(key),
        ) &&
        (expectedLifecycleRegistrySize === null ||
          observedRegistrySize === expectedLifecycleRegistrySize) &&
        (expectedActiveRequiredKeys === null ||
          JSON.stringify(observedActiveRequiredKeys) ===
            JSON.stringify(expectedActiveRequiredKeys)) &&
        diagnostics.every(
          ({ registrySize, activeRequiredKeys }) =>
            registrySize === observedRegistrySize &&
            JSON.stringify(activeRequiredKeys) ===
              JSON.stringify(observedActiveRequiredKeys),
        )
      );
    };
    const readModelDiagnosticsWithin = async (
      operationContext: ReturnType<typeof createRuntimeSmokeOperationDeadline>,
      maximumAttemptMs?: number,
      milestoneCheckpoint: RuntimeSmokeCheckpoint | null = null,
    ): Promise<Awaited<ReturnType<typeof readModelDiagnostics>>> =>
      (await runRuntimeSmokeBoundedOperation({
        operationAttempt: runtimeSmokeOperationAttempt(
          operationContext,
          maximumAttemptMs,
        ),
        task: () =>
          readModelDiagnostics(
            {
              phaseName: operationContext.phaseId,
              operationName: operationContext.operationId,
            },
            milestoneCheckpoint,
          ),
      })) as Awaited<ReturnType<typeof readModelDiagnostics>>;
    const readinessModelSignatures = new Map<string, Map<number, string>>();
    const recordReadinessObservation = ({
      phaseName,
      checkpoint,
      previousSignature,
      responseRequired,
      lifecycleState,
    }: {
      phaseName: string;
      checkpoint?: RuntimeSmokeCheckpoint;
      previousSignature: string;
      responseRequired: number;
      lifecycleState: string;
    }) => {
      const snapshot = lastRequiredSnapshot;
      if (!snapshot) return previousSignature;
      const responseTotal = MODEL_FIXTURES.reduce(
        (total, { modelPath }) =>
          total + (modelResponseCounts.get(modelPath) ?? 0),
        0,
      );
      const requestTotal = MODEL_FIXTURES.reduce(
        (total, { modelPath }) =>
          total + (modelRequestCounts.get(modelPath) ?? 0),
        0,
      );
      const observation = createRuntimeSmokeReadinessObservation({
        phaseName,
        snapshot,
        responseTotal,
        responseRequired,
        requestTotal,
        browserErrorCount: fatalErrors.length,
      });
      if (observation.signature === previousSignature) {
        return previousSignature;
      }
      observation.aggregateCheckpoints.forEach((name) =>
        checkpoint?.(name, lifecycleState),
      );
      const previousModelSignatures =
        readinessModelSignatures.get(phaseName) ?? new Map<number, string>();
      const nextModelSignatures = new Map<number, string>();
      observation.modelCheckpointGroups.forEach((group) => {
        nextModelSignatures.set(group.ordinal, group.signature);
        if (previousModelSignatures.get(group.ordinal) === group.signature) return;
        group.checkpoints.forEach((name) => checkpoint?.(name, lifecycleState));
      });
      readinessModelSignatures.set(phaseName, nextModelSignatures);
      console.info(
        "[runtime-smoke-readiness-observation]",
        JSON.stringify(observation.diagnostic),
      );
      return observation.signature;
    };
    const recordRequiredSnapshotProof = (
      phaseName: string,
      checkpoint: RuntimeSmokeCheckpoint,
    ) => {
      const snapshot = lastRequiredSnapshot;
      const timing = lastRequiredSnapshotTiming;
      expect(snapshot, `${phaseName} should capture the required snapshot`).not.toBeNull();
      expect(timing, `${phaseName} should capture snapshot timing`).not.toBeNull();
      if (!snapshot || !timing) return;
      expect(snapshot.schema).toBe("interior-ai.glb-required-snapshot.v1");
      expect(snapshot.registryCoherent).toBe(true);
      expect(snapshot.consistency).toEqual({
        cacheSnapshotsCoherent: true,
        cacheReferenceTotalsAgree: true,
        cacheOwnershipMatchesLifecycle: true,
        referenceCountsNonNegative: true,
        zeroReferenceRetentionWithinPolicy: true,
        activeRequiredModelsAreCurrent: true,
        activeRequiredModelsConverged: true,
      });
      expect(snapshot.activeRequiredCount).toBe(
        snapshot.activeRequiredModelIds.length,
      );
      expect(snapshot.activeRequiredCount).toBe(
        EXPECTED_ACTIVE_REQUIRED_MODEL_COUNT,
      );
      if (expectedReloadCacheEntryCounts) {
        expect(snapshot.caches.parsed.entryCount).toBe(
          expectedReloadCacheEntryCounts.parsed,
        );
        expect(snapshot.caches.prepared.entryCount).toBe(
          expectedReloadCacheEntryCounts.prepared,
        );
      } else {
        expectedReloadCacheEntryCounts = {
          parsed: snapshot.caches.parsed.entryCount,
          prepared: snapshot.caches.prepared.entryCount,
        };
      }
      const activeRequired = snapshot.models.filter(
        (model) => model.active && model.requiredForReadiness,
      );
      expect(activeRequired).toHaveLength(snapshot.activeRequiredCount);
      expect(
        activeRequired.filter((model) => model.loadState === "ready"),
      ).toHaveLength(EXPECTED_ACTIVE_REQUIRED_MODEL_COUNT);
      activeRequired.forEach((model) => {
        expect(model.generationState, `${model.key} should be current`).toBe(
          "current",
        );
        expect(model.resourceKeyHash).toMatch(/^fnv1a-[a-f0-9]{8}$/);
        expect(model.cacheEntry?.state).toBe("ready");
        expect(model.cacheEntry?.referenceCount ?? 0).toBeGreaterThan(0);
        expect(model.parsedCacheEntry?.state).toBe("ready");
        if (model.resourceKind === "prepared") {
          expect(model.preparedCacheEntry?.state).toBe("ready");
          expect(["hit", "miss"]).toContain(model.preparedCacheStatus);
          if (model.preparedCacheStatus === "miss") {
            expect(["hit", "miss"]).toContain(model.parsedCacheStatus);
          } else {
            expect(model.parsedCacheStatus).toBeNull();
          }
        } else {
          expect(["hit", "miss"]).toContain(model.parsedCacheStatus);
          expect(model.preparedCacheStatus).toBeNull();
        }
      });
      const maximumEventLoopDelayMs = Math.round(
        Math.max(
          0,
          snapshot.eventLoopProbe.maximumDelayMs,
          ...activeRequired.flatMap((model) =>
            Object.values(model.stageTimings).map(
              (stage) => stage?.eventLoopDelayMs ?? 0,
            ),
          ),
        ),
      );
      const longestSynchronousStage = activeRequired
        .flatMap((model) =>
          model.longestSynchronousStage
            ? [{ key: model.key, ...model.longestSynchronousStage }]
            : [],
        )
        .sort((left, right) => right.durationMs - left.durationMs)[0];
      const maximumSceneAttachmentMs = Math.round(
        Math.max(
          0,
          ...activeRequired.map(
            (model) => model.stageDurationsMs.sceneAttachment ?? 0,
          ),
        ),
      );
      checkpoint(
        `snapshot-wait-${timing.schedulingDelayMs}-compute-${timing.computationDurationMs}` +
          `-serialize-${timing.serializationDurationMs}-transfer-${timing.transferDurationMs}`,
        "ready",
      );
      checkpoint(
        `snapshot-cache-parsed-${snapshot.caches.parsed.entryCount}` +
          `-prepared-${snapshot.caches.prepared.entryCount}` +
          `-retained-${snapshot.caches.prepared.zeroReferenceEntryCount}`,
        "ready",
      );
      checkpoint(
        `snapshot-registry-${snapshot.registryEntryCount}-required-${snapshot.activeRequiredCount}` +
          `-parsed-refs-${snapshot.caches.parsed.activeReferenceCount}` +
          `-prepared-refs-${snapshot.caches.prepared.activeReferenceCount}`,
        "ready",
      );
      checkpoint(`snapshot-max-event-loop-delay-${maximumEventLoopDelayMs}`, "ready");
      checkpoint(
        `snapshot-max-scene-attachment-${maximumSceneAttachmentMs}`,
        "ready",
      );
      if (longestSynchronousStage) {
        const safeCategory = longestSynchronousStage.category
          .replace(/([a-z])([A-Z])/g, "$1-$2")
          .toLowerCase();
        checkpoint(
          `snapshot-longest-${safeCategory}` +
            `-${Math.round(longestSynchronousStage.durationMs)}`,
          "ready",
        );
      }
      console.info(
        "[runtime-smoke-required-snapshot]",
        JSON.stringify({
          phaseName,
          timing,
          mainThreadTelemetry: lastMainThreadTelemetrySummary,
          snapshotSummary: {
            schema: snapshot.schema,
            registryCoherent: snapshot.registryCoherent,
            registryEntryCount: snapshot.registryEntryCount,
            activeRequiredCount: snapshot.activeRequiredCount,
            lifecycle: {
              ready: activeRequired.filter((model) => model.loadState === "ready")
                .length,
              loading: activeRequired.filter(
                (model) => model.loadState === "loading",
              ).length,
              error: activeRequired.filter((model) => model.loadState === "error")
                .length,
            },
            caches: {
              parsedEntries: snapshot.caches.parsed.entryCount,
              parsedReferences: snapshot.caches.parsed.activeReferenceCount,
              preparedEntries: snapshot.caches.prepared.entryCount,
              preparedReferences:
                snapshot.caches.prepared.activeReferenceCount,
              preparedZeroReferenceEntries:
                snapshot.caches.prepared.zeroReferenceEntryCount,
            },
            consistency: snapshot.consistency,
            safeReadinessSummary: snapshot.safeReadinessSummary,
          },
        }),
      );
    };
    const waitForModelDiagnosticsReady = async ({
      minimumMountCount,
      phaseName,
      requireAuburnSelectionOutline = true,
      checkpoint,
    }: {
      minimumMountCount: number;
      phaseName: string;
      requireAuburnSelectionOutline?: boolean;
      checkpoint?: RuntimeSmokeCheckpoint;
    }) => {
      const operationContext = createRuntimeSmokeOperationDeadline({
        phaseName,
        operationName: "model-readiness",
      });
      let lastDiagnostics = await readModelDiagnosticsWithin(operationContext);
      let previousProgressSignature = "";
      while (true) {
        lastDiagnostics = await readModelDiagnosticsWithin(operationContext);
        const activeRequired = activeRequiredDiagnosticsFor(lastDiagnostics);
        const loadingModelCount = activeRequired.filter(
          (diagnostic) => diagnostic.loadState === "loading",
        ).length;
        const readyModelCount = activeRequired.filter(
          (diagnostic) => diagnostic.loadState === "ready",
        ).length;
        const terminalErrorModelCount = activeRequired.filter(
          (diagnostic) => diagnostic.loadState === "error",
        ).length;
        const diagnosticsReady =
          exactRequiredRegistryReady(lastDiagnostics) &&
          lastDiagnostics.every(
          ({ key, diagnostic }, index) =>
            expectedDiagnosticReady(lastDiagnostics[index], index) &&
            diagnostic.mountCount >= minimumMountCount &&
            diagnostic.boundsMaterialChangeCount >= 1 &&
            diagnostic.boundsPublicationCount === 0 &&
            diagnostic.boundsInvalidCount === 0 &&
            diagnostic.excessiveBoundsWarningCount === 0 &&
            (!requireAuburnSelectionOutline ||
              key !== "runtime-smoke-model-3" ||
              diagnostic.selectionOutlineVisible),
          );
        const aggregateLifecycleState = runtimeSmokeAggregateLifecycleState({
          expectedModelCount: activeRequired.length,
          readyModelCount,
          loadingModelCount,
          terminalErrorModelCount,
          combinedReadinessSatisfied: diagnosticsReady,
        });
        previousProgressSignature = recordReadinessObservation({
          phaseName,
          checkpoint,
          previousSignature: previousProgressSignature,
          responseRequired: MODEL_FIXTURES.length,
          lifecycleState: aggregateLifecycleState,
        });
        if (terminalErrorModelCount > 0) {
          finalLifecycleState = "error";
          throw new RuntimeSmokeTerminalError(phaseName);
        }
        if (diagnosticsReady) {
          finalLifecycleState = "ready";
          return {
            fixtureDiagnostics: lastDiagnostics,
            activeRequiredDiagnostics: activeRequired,
          };
        }
        finalLifecycleState = "loading";
        await page.waitForTimeout(
          runtimeSmokeOperationAttempt(operationContext, 500).attemptTimeoutMs,
        );
      }
    };
    const waitForModelDiagnosticsToSettle = async (
      phaseName: string,
      checkpoint?: RuntimeSmokeCheckpoint,
    ) => {
      const settleContext = createRuntimeSmokeOperationDeadline({
        phaseName,
        operationName: "diagnostics-settle",
      });
      const readSettleSample = async () => {
        const parentAttempt = runtimeSmokeOperationAttempt(
          settleContext,
          RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.evaluationTimeoutMs,
        );
        const evaluationContext = createRuntimeSmokeOperationDeadline({
          phaseName,
          operationName: "diagnostics-settle-evaluation",
        });
        try {
          return await readModelDiagnosticsWithin(
            evaluationContext,
            parentAttempt.attemptTimeoutMs,
          );
        } catch (error) {
          if (error instanceof RuntimeSmokeOperationAttemptTimeoutError) {
            checkpoint?.("diagnostics-settle-parent-deadline-wait-started");
            await waitForRuntimeSmokeOperationDeadline({
              operationAttempt: parentAttempt,
              cause: error,
            });
            checkpoint?.("diagnostics-settle-parent-deadline-wait-complete");
          }
          if (!(error instanceof RuntimeSmokeOperationTimeoutError)) throw error;
          if (!settleContext.deadlineReached()) throw error;
          throw new RuntimeSmokeOperationTimeoutError({
            operationAttempt: parentAttempt,
            cause: error,
          });
        }
      };
      let previous = await readSettleSample();
      let stableSamples = 0;
      let previousReadinessSignature = "";
      let previousSettleSignature = "";
      const settledResponseTotal = MODEL_FIXTURES.reduce(
        (total, { modelPath }) =>
          total + (modelResponseCounts.get(modelPath) ?? 0),
        0,
      );
      previousReadinessSignature = recordReadinessObservation({
        phaseName,
        checkpoint,
        previousSignature: previousReadinessSignature,
        responseRequired: settledResponseTotal,
        lifecycleState: finalLifecycleState,
      });
      for (let sampleIndex = 0; ; sampleIndex += 1) {
        await page.waitForTimeout(
          runtimeSmokeOperationAttempt(
            settleContext,
            RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.sampleIntervalMs,
          ).attemptTimeoutMs,
        );
        const current = await readSettleSample();
        const progressSignature = current
          .map(({ diagnostic }) =>
            diagnostic
              ? `${diagnostic.loadState}-${diagnostic.renderCount}-${diagnostic.boundsMaterialChangeCount}`
              : "missing",
          )
          .join("-");
        if (progressSignature !== previousSettleSignature) {
          previousReadinessSignature = recordReadinessObservation({
            phaseName,
            checkpoint,
            previousSignature: previousReadinessSignature,
            responseRequired: settledResponseTotal,
            lifecycleState: finalLifecycleState,
          });
          previousSettleSignature = progressSignature;
        }
        const stable = current.every(({ key, diagnostic }, index) => {
          const previousDiagnostic = previous[index]?.diagnostic;
          return (
            previous[index]?.key === key &&
            diagnostic &&
            previousDiagnostic &&
            diagnostic.boundsMaterialChangeCount >= 1 &&
            diagnostic.renderCount === previousDiagnostic.renderCount &&
            diagnostic.boundsMaterialChangeCount ===
              previousDiagnostic.boundsMaterialChangeCount
          );
        });
        stableSamples = stable ? stableSamples + 1 : 0;
        if (
          stableSamples >=
          RUNTIME_SMOKE_DIAGNOSTICS_SETTLE_CONTRACT.requiredStableSamples
        ) {
          return current;
        }
        previous = current;
      }
    };
    const verifyBodyStateAfterReadiness = async ({
      phaseName,
      checkpoint,
    }: {
      phaseName: string;
      checkpoint: RuntimeSmokeCheckpoint;
    }) =>
      runRuntimeSmokeBoundedOperation({
        operationAttempt: runtimeSmokeOperationAttempt(
          createRuntimeSmokeOperationDeadline({
            phaseName,
            operationName: "body-state-assertion",
          }),
        ),
        task: async () => {
          const observation = lastBodyStateObservation;
          expect(
            observation,
            `${phaseName} should retain the body state observed with readiness`,
          ).not.toBeNull();
          if (!observation) return;
          checkpoint("body-state-readiness-observation-available", "ready");
          checkpoint(
            `body-state-browser-call-invoked-after-${Math.round(
              observation.hostTiming.browserCallInvokedMs,
            )}`,
            "ready",
          );
          if (observation.hostTiming.browserCallbackEnteredMs !== null) {
            checkpoint(
              `body-state-entered-browser-after-${Math.round(
                observation.hostTiming.browserCallbackEnteredMs,
              )}`,
              "ready",
            );
          }
          if (observation.hostTiming.browserCallbackExitedMs !== null) {
            checkpoint(
              `body-state-callback-exited-after-${Math.round(
                observation.hostTiming.browserCallbackExitedMs,
              )}`,
              "ready",
            );
          }
          if (observation.hostTiming.serializationCompletedMs !== null) {
            checkpoint(
              `body-state-serialization-complete-after-${Math.round(
                observation.hostTiming.serializationCompletedMs,
              )}`,
              "ready",
            );
          }
          checkpoint(
            `body-state-host-result-after-${Math.max(
              0,
              Math.round(observation.hostTiming.resultReceivedMs),
            )}`,
            "ready",
          );
          checkpoint(
            `body-state-browser-compute-${Math.round(
              observation.browserTiming.callbackExitedMs,
            )}-serialize-${Math.round(
              observation.browserTiming.serializationCompletedMs -
                observation.browserTiming.callbackExitedMs,
            )}`,
            "ready",
          );
          expect(observation.hasMaximumDepthError).toBe(false);
          const assertionCompletedMs = Math.max(
            0,
            performance.now() - observation.hostRequestStartedAt,
          );
          console.info(
            "[runtime-smoke-post-readiness-timing]",
            JSON.stringify({
              phaseName,
              operationName: "coalesced-body-state-assertion",
              hostTiming: {
                ...observation.hostTiming,
                assertionCompletedMs,
              },
              browserTiming: observation.browserTiming,
            }),
          );
          checkpoint("body-state-assertion-complete", "ready");
        },
      });
    const waitForReloadModelsReady = async ({
      minimumResponseCount,
      minimumReloadGeneration,
      phaseName,
      checkpoint,
    }: {
      minimumResponseCount: number;
      minimumReloadGeneration: number;
      phaseName: string;
      checkpoint: RuntimeSmokeCheckpoint;
    }) => {
      const operationContext = createRuntimeSmokeOperationDeadline({
        phaseName,
        operationName: "model-responses-and-readiness",
      });
      let previousProgressSignature = "";
      while (true) {
        const diagnostics = await readModelDiagnosticsWithin(operationContext);
        const activeRequired = activeRequiredDiagnosticsFor(diagnostics);
        const loadingModelCount = activeRequired.filter(
          (diagnostic) => diagnostic.loadState === "loading",
        ).length;
        const readyModelCount = activeRequired.filter(
          (diagnostic) => diagnostic.loadState === "ready",
        ).length;
        const terminalErrorModelCount = activeRequired.filter(
          (diagnostic) => diagnostic.loadState === "error",
        ).length;
        const requiredResponses = MODEL_FIXTURES.length * minimumResponseCount;
        const responsesOverExpected = MODEL_FIXTURES.filter(
          ({ modelPath }) =>
            (modelResponseCounts.get(modelPath) ?? 0) > minimumResponseCount,
        );
        expect(
          responsesOverExpected,
          `${phaseName} must not create a duplicate fixture loader generation`,
        ).toEqual([]);
        const responsesReady = MODEL_FIXTURES.every(
          ({ modelPath }) =>
            (modelResponseCounts.get(modelPath) ?? 0) === minimumResponseCount,
        );
        const reloadGenerations = new Set(
          activeRequired.map((diagnostic) => diagnostic.reloadGeneration),
        );
        const diagnosticsReady =
          reloadGenerations.size === 1 &&
          exactRequiredRegistryReady(diagnostics, minimumReloadGeneration) &&
          diagnostics.every(
          ({ diagnostic }, index) =>
            expectedDiagnosticReady(
              diagnostics[index],
              index,
              minimumReloadGeneration,
            ) &&
            diagnostic.mountCount >= 1 &&
            diagnostic.boundsMaterialChangeCount >= 1 &&
            diagnostic.boundsPublicationCount === 0 &&
            diagnostic.boundsInvalidCount === 0 &&
            diagnostic.excessiveBoundsWarningCount === 0,
          );
        const combinedReadinessSatisfied = responsesReady && diagnosticsReady;
        const aggregateLifecycleState = runtimeSmokeAggregateLifecycleState({
          expectedModelCount: activeRequired.length,
          readyModelCount,
          loadingModelCount,
          terminalErrorModelCount,
          combinedReadinessSatisfied,
        });
        previousProgressSignature = recordReadinessObservation({
          phaseName,
          checkpoint,
          previousSignature: previousProgressSignature,
          responseRequired: requiredResponses,
          lifecycleState: aggregateLifecycleState,
        });
        if (terminalErrorModelCount > 0) {
          finalLifecycleState = "error";
          throw new RuntimeSmokeTerminalError(phaseName);
        }
        if (combinedReadinessSatisfied) {
          finalLifecycleState = "ready";
          checkpoint("models-ready", "ready");
          return diagnostics;
        }
        finalLifecycleState = aggregateLifecycleState;
        await page.waitForTimeout(
          runtimeSmokeOperationAttempt(operationContext, 500).attemptTimeoutMs,
        );
      }
    };
    const waitForModelResponsesOrTerminal = async ({
      minimumResponseCount,
      phaseName,
      checkpoint,
    }: {
      minimumResponseCount: number;
      phaseName: string;
      checkpoint?: RuntimeSmokeCheckpoint;
    }) => {
      const operationContext = createRuntimeSmokeOperationDeadline({
        phaseName,
        operationName: "model-responses",
      });
      let previousResponseCount = -1;
      while (true) {
        const diagnostics = await readModelDiagnosticsWithin(operationContext);
        const activeRequired = activeRequiredDiagnosticsFor(diagnostics);
        if (
          activeRequired.some((diagnostic) => diagnostic.loadState === "error")
        ) {
          finalLifecycleState = "error";
          throw new RuntimeSmokeTerminalError(phaseName);
        }
        if (
          MODEL_FIXTURES.every(
            ({ modelPath }) =>
              (modelResponseCounts.get(modelPath) ?? 0) >= minimumResponseCount
          )
        ) {
          checkpoint?.("model-responses-ready", finalLifecycleState);
          return;
        }
        const totalResponses = MODEL_FIXTURES.reduce(
          (total, { modelPath }) =>
            total + (modelResponseCounts.get(modelPath) ?? 0),
          0,
        );
        if (totalResponses !== previousResponseCount) {
          checkpoint?.(`model-responses-${totalResponses}`, finalLifecycleState);
          previousResponseCount = totalResponses;
        }
        finalLifecycleState = activeRequired.some(
          (diagnostic) => diagnostic.loadState === "loading"
        )
          ? "loading"
          : finalLifecycleState;
        await page.waitForTimeout(
          runtimeSmokeOperationAttempt(operationContext, 250).attemptTimeoutMs,
        );
      }
    };

    await phaseRecorder.run("test-body-setup", async ({ checkpoint }) => {
      page.on("pageerror", (error) => fatalErrors.push(error.message));
      page.on("console", (message) => {
        const snapshotMilestonePrefix =
          "[runtime-smoke-required-snapshot-milestone] ";
        if (message.text().startsWith(snapshotMilestonePrefix)) {
          try {
            recordBrowserSnapshotMilestone(
              JSON.parse(
                message.text().slice(snapshotMilestonePrefix.length),
              ) as RequiredSnapshotMilestone,
            );
          } catch {
            fatalErrors.push("Malformed required snapshot milestone");
          }
        }
        const browserCallbackMilestonePrefix =
          "[runtime-smoke-browser-callback-milestone] ";
        if (message.text().startsWith(browserCallbackMilestonePrefix)) {
          try {
            recordBrowserCallbackMilestone(
              projectRuntimeSmokeBrowserCallbackMilestone(
                JSON.parse(
                  message.text().slice(browserCallbackMilestonePrefix.length),
                ),
              ) as BrowserCallbackMilestone,
            );
          } catch {
            fatalErrors.push("Malformed browser callback milestone");
          }
        }
        const browserHeartbeatPrefix =
          "[runtime-smoke-browser-heartbeat] ";
        if (message.text().startsWith(browserHeartbeatPrefix)) {
          try {
            const heartbeat = projectRuntimeSmokeBrowserHeartbeat(
              JSON.parse(
                message.text().slice(browserHeartbeatPrefix.length),
              ),
            ) as BrowserHeartbeat;
            lastBrowserHeartbeat = heartbeat;
            console.info(
              "[runtime-smoke-browser-heartbeat-observation]",
              JSON.stringify(heartbeat),
            );
          } catch {
            // Heartbeats are observation-only and never fail or extend the smoke.
          }
        }
        if (message.type() === "error") {
          fatalErrors.push(message.text());
        }
        if (
          message.type() === "warning" &&
          /\[GLBScaledModel\] (?:Excessive material bounds changes|Ignoring invalid local render bounds)/.test(
            message.text()
          )
        ) {
          fatalErrors.push(message.text());
        }
      });
      page.on("request", (request) => {
        const path = new URL(request.url()).pathname;
        if (!modelRequestCounts.has(path)) return;
        modelRequestCounts.set(path, (modelRequestCounts.get(path) ?? 0) + 1);
      });
      page.on("response", (response) => {
        const path = new URL(response.url()).pathname;
        if (modelResponseCounts.has(path)) {
          if (response.status() >= 400) {
            fatalErrors.push(`${path} returned ${response.status()}`);
          } else {
            modelResponseCounts.set(
              path,
              (modelResponseCounts.get(path) ?? 0) + 1
            );
          }
        }
      });

      await page.addInitScript(() => {
        const diagnosticsGlobal = globalThis as typeof globalThis & {
          __INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__?: boolean;
          __INTERIOR_AI_RUNTIME_SMOKE_HEARTBEAT__?: boolean;
        };
        diagnosticsGlobal.__INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__ = true;
        if (!diagnosticsGlobal.__INTERIOR_AI_RUNTIME_SMOKE_HEARTBEAT__) {
          diagnosticsGlobal.__INTERIOR_AI_RUNTIME_SMOKE_HEARTBEAT__ = true;
          let sequence = 0;
          let maximumEventLoopDelayMs = 0;
          let expectedAtMs = performance.now();
          const emitHeartbeat = (kind: BrowserHeartbeat["kind"]) => {
            const observedAtMs = performance.now();
            const eventLoopDelayMs = Math.max(0, observedAtMs - expectedAtMs);
            maximumEventLoopDelayMs = Math.max(
              maximumEventLoopDelayMs,
              eventLoopDelayMs,
            );
            sequence += 1;
            console.info(
              "[runtime-smoke-browser-heartbeat]",
              JSON.stringify({
                schema: "interior-ai.runtime-smoke-browser-heartbeat.v1",
                kind,
                sequence,
                observedAtMs: Math.max(0, Math.round(observedAtMs)),
                eventLoopDelayMs: Math.max(0, Math.round(eventLoopDelayMs)),
                maximumEventLoopDelayMs: Math.max(
                  0,
                  Math.round(maximumEventLoopDelayMs),
                ),
              } satisfies BrowserHeartbeat),
            );
            expectedAtMs = observedAtMs + 1_000;
          };
          emitHeartbeat("started");
          window.setInterval(() => emitHeartbeat("interval"), 1_000);
        }
        const clearSentinel = "__e2e_runtime_smoke_storage_cleared";
        if (window.localStorage.getItem(clearSentinel) === "1") return;
        window.localStorage.clear();
        window.sessionStorage.clear();
        window.localStorage.setItem(clearSentinel, "1");
      });
      checkpoint("instrumentation-registered");
    });

    await phaseRecorder.run("initial-navigation", async ({ checkpoint }) => {
      const initialResponse = await page.goto("/design", {
        waitUntil: "domcontentloaded",
        timeout: phaseOperationTimeout("initial-navigation", "navigation"),
      });
      expect(initialResponse?.status()).toBe(200);
      checkpoint("route-design-loaded");
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
        timeout: phaseOperationTimeout("initial-navigation", "scene-readiness"),
      });
      checkpoint("scene-ready");
    });

    await phaseRecorder.run("fixture-creation", async ({ checkpoint }) => {
      const betaStartTemplate = page.getByTestId("beta-start-template");
      if (await betaStartTemplate.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await betaStartTemplate.click();
      } else if (
        await page
          .getByTestId("plan-start-template")
          .isVisible({ timeout: 5_000 })
          .catch(() => false)
      ) {
        const startTemplate = page.getByTestId("plan-start-template");
        await expect(startTemplate).toBeEnabled({ timeout: 30_000 });
        await startTemplate.evaluate((control) =>
          (control as HTMLButtonElement).click()
        );
      }
      checkpoint("entry-selected");

      const studioTemplate = page.getByTestId("apply-furnished-template-studio");
      if (await studioTemplate.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await studioTemplate.click();
        await confirmPlanTemplateReplacementIfNeeded(page);
      }
      checkpoint("template-applied");

      const fixtureReadinessTimeoutMs = phaseOperationTimeout(
        "fixture-creation",
        "room-and-item-readiness",
      );
      await Promise.all([
        expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
          "4 rooms",
          { timeout: fixtureReadinessTimeoutMs },
        ),
        expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(
          /[1-9]\d* items?/,
          { timeout: fixtureReadinessTimeoutMs },
        ),
      ]);
      checkpoint("fixture-room-items-ready");

      await expect
        .poll(
          () =>
            page.evaluate(
              (storageKey) => Boolean(window.localStorage.getItem(storageKey)),
              DESIGN_STORAGE_KEY
            ),
          {
            timeout: phaseOperationTimeout(
              "fixture-creation",
              "local-backup-readiness",
            ),
          }
        )
        .toBe(true);
      checkpoint("local-backup-ready");
      await page.evaluate(
      ({ fixtures, storageKey }) => {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) throw new Error("Furnished template backup is missing");
        const stored = JSON.parse(raw) as {
          designId?: string;
          activeRoomId: string;
          rooms: Array<{
            id: string;
            items: unknown[];
          }>;
        };
        const room =
          stored.rooms.find((entry) => entry.id === stored.activeRoomId) ??
          stored.rooms[0];
        if (!room) throw new Error("Furnished template has no rooms");

        delete stored.designId;
        room.items.push(
          ...fixtures.map((fixture, index) => {
            const variantId = `runtime-smoke-${fixture.id}`;
            return {
              instanceId: `runtime-smoke-model-${index + 1}`,
              productId: fixture.id,
              variantId,
              productSnapshot: {
                schemaVersion: 1,
                productId: fixture.id,
                variantId,
                name: fixture.title,
                category: "sofa",
                dimensionsMm: fixture.dimensionsMm,
                variantLabel: "Runtime smoke",
                assets: {
                  assetId: fixture.id,
                  modelUrl: fixture.modelPath,
                },
              },
              position: fixture.position,
              rotationY: 0,
              qty: 1,
              includeInCheckout: true,
            };
          })
        );
        window.localStorage.setItem(storageKey, JSON.stringify(stored));
        window.localStorage.setItem("scene_performance_mode", "quality");
      },
        { fixtures: MODEL_FIXTURES, storageKey: DESIGN_STORAGE_KEY }
      );
      checkpoint("fixture-models-persisted", "persisted");
    }, () => "persisted");

    const view2d = page.locator('[data-testid="editor-view-2d"]:visible').first();
    const view3d = page.locator('[data-testid="editor-view-3d"]:visible').first();
    const layoutDebug = page.getByTestId("qa-design-layout-debug");
    const auburnPlanTarget = page
      .getByTestId("plan-item-keyboard-target")
      .filter({ hasText: "Auburn" });

    await phaseRecorder.run("fixture-reload-2d-readiness", async ({ checkpoint }) => {
      const fixtureReload = await page.reload({
        waitUntil: "domcontentloaded",
        timeout: phaseOperationTimeout(
          "fixture-reload-2d-readiness",
          "navigation",
        ),
      });
      expect(fixtureReload?.status()).toBe(200);
      checkpoint("route-design-reloaded");
      const fixtureReloadReadinessMs = phaseOperationTimeout(
        "fixture-reload-2d-readiness",
        "bootstrap-readiness",
      );
      await Promise.all([
        expect(page.getByTestId("scene-canvas").first()).toBeVisible({
          timeout: fixtureReloadReadinessMs,
        }),
        expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
          "4 rooms",
          { timeout: fixtureReloadReadinessMs },
        ),
        expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(
          "8 items",
          { timeout: fixtureReloadReadinessMs },
        ),
      ]);
      checkpoint("fixture-bootstrap-ready");
      await expect(async () => {
        if ((await view2d.getAttribute("aria-pressed")) !== "true") {
          await view2d.evaluate((button) =>
            (button as HTMLButtonElement).click()
          );
        }
        await expect(view2d).toHaveAttribute("aria-pressed", "true", {
          timeout: 2_000,
        });
        await expect(layoutDebug).toHaveAttribute("data-view-mode", "2d", {
          timeout: 2_000,
        });
      }).toPass({
        timeout: phaseOperationTimeout(
          "fixture-reload-2d-readiness",
          "view-2d-readiness",
        ),
      });
      checkpoint("view-2d-ready");
      await expect(auburnPlanTarget).toBeVisible({
        timeout: phaseOperationTimeout(
          "fixture-reload-2d-readiness",
          "selection-readiness",
        ),
      });
      checkpoint("auburn-plan-item-ready");
    }, () => finalLifecycleState);

    await phaseRecorder.run("initial-glb-loading-and-selection-verification", async ({ checkpoint }) => {
      const selectionClickTimeoutMs = phaseOperationTimeout(
        "initial-glb-loading-and-selection-verification",
        "plan-selection-click",
      );
      await auburnPlanTarget.click({ timeout: selectionClickTimeoutMs });
      checkpoint("auburn-selection-clicked");
      await expect(getSelectedItemPanel(page)).toContainText("Auburn", {
        timeout: phaseOperationTimeout(
          "initial-glb-loading-and-selection-verification",
          "plan-selection-assertion",
        ),
      });
      checkpoint("auburn-selected");
      await view3d.click({
        timeout: phaseOperationTimeout(
          "initial-glb-loading-and-selection-verification",
          "view-activation-click",
        ),
      });
      checkpoint("view-3d-clicked");
      await expect(layoutDebug).toHaveAttribute("data-view-mode", "3d", {
        timeout: phaseOperationTimeout(
          "initial-glb-loading-and-selection-verification",
          "view-activation-assertion",
        ),
      });
      checkpoint("view-3d-active");
      await waitForModelResponsesOrTerminal({
        minimumResponseCount: 1,
        phaseName: "initial-glb-loading-and-selection-verification",
        checkpoint,
      });
      expect(
        MODEL_FIXTURES.every(
          ({ modelPath }) => (modelRequestCounts.get(modelPath) ?? 0) >= 1
        )
      ).toBe(true);
      await expect(getSelectedItemPanel(page)).toContainText("Auburn", {
        timeout: phaseOperationTimeout(
          "initial-glb-loading-and-selection-verification",
          "selection-verification",
        ),
      });
      checkpoint("initial-model-selection-verified");
    }, () => finalLifecycleState);

    let completedReloadGeneration = 0;
    await phaseRecorder.run("semantic-readiness", async ({ checkpoint }) => {
      const semanticDiagnostics = await waitForModelDiagnosticsReady({
        minimumMountCount: 1,
        phaseName: "semantic-readiness",
        checkpoint,
      });
      completedReloadGeneration =
        semanticDiagnostics.fixtureDiagnostics[0]?.diagnostic
          ?.reloadGeneration ?? 0;
      expectedLifecycleRegistrySize =
        semanticDiagnostics.fixtureDiagnostics[0]?.registrySize ?? null;
      expectedActiveRequiredKeys =
        semanticDiagnostics.fixtureDiagnostics[0]?.activeRequiredKeys ?? null;
      if (lastRequiredSnapshot) {
        checkpoint(
          `cache-baseline-parsed-${lastRequiredSnapshot.caches.parsed.entryCount}` +
            `-prepared-${lastRequiredSnapshot.caches.prepared.entryCount}`,
          "ready",
        );
      }
      checkpoint("semantic-models-ready", "ready");
    }, () => finalLifecycleState);

    let settledDiagnosticsBefore: Awaited<ReturnType<typeof readModelDiagnostics>> = [];
    let settledDiagnosticsAfter: Awaited<ReturnType<typeof readModelDiagnostics>> = [];
    await phaseRecorder.run("bounds-verification", async ({ checkpoint }) => {
      settledDiagnosticsBefore = await waitForModelDiagnosticsToSettle(
        "bounds-verification",
        checkpoint,
      );
      checkpoint("bounds-baseline-settled", "ready");
      await page.waitForTimeout(
        phaseOperationTimeout("bounds-verification", "post-settle-observation"),
      );
      settledDiagnosticsAfter = await readModelDiagnosticsWithin(
        createRuntimeSmokeOperationDeadline({
          phaseName: "bounds-verification",
          operationName: "diagnostic-snapshot-and-assertions",
        }),
      );
      settledDiagnosticsAfter.forEach(({ key, diagnostic }, index) => {
        const before = settledDiagnosticsBefore[index]?.diagnostic;
        expect(diagnostic, `${key} should expose model diagnostics`).not.toBeNull();
        expect(before, `${key} should have a settled baseline`).not.toBeNull();
        expect(
          (diagnostic?.boundsMaterialChangeCount ?? 0) -
            (before?.boundsMaterialChangeCount ?? 0),
          `${key} should stop changing bounds once its GLB settles`
        ).toBe(0);
      });
      finalLifecycleState = "stable";
      checkpoint("bounds-verified", "stable");
    }, () => finalLifecycleState);

    await phaseRecorder.run("render-loop-assertions", async ({ checkpoint }) => {
      settledDiagnosticsAfter.forEach(({ key, diagnostic }, index) => {
        const before = settledDiagnosticsBefore[index]?.diagnostic;
        expect(
          (diagnostic?.renderCount ?? 0) - (before?.renderCount ?? 0),
          `${key} should stop React-rendering once its GLB settles`
        ).toBe(0);
      });
      checkpoint("render-loop-stable", "stable");
    }, () => finalLifecycleState);

    await phaseRecorder.run("remount", async ({ checkpoint }) => {
      await view2d.click({
        timeout: phaseOperationTimeout("remount", "activate-2d"),
      });
      await expect(layoutDebug).toHaveAttribute("data-view-mode", "2d", {
        timeout: phaseOperationTimeout("remount", "verify-2d"),
      });
      checkpoint("view-2d-active");
      await view3d.click({
        timeout: phaseOperationTimeout("remount", "activate-3d"),
      });
      await expect(layoutDebug).toHaveAttribute("data-view-mode", "3d", {
        timeout: phaseOperationTimeout("remount", "verify-3d"),
      });
      await expect(getSelectedItemPanel(page)).toContainText("Auburn", {
        timeout: phaseOperationTimeout("remount", "verify-selection"),
      });
      checkpoint("view-3d-selection-restored");
      const remountedReadiness = await waitForModelDiagnosticsReady({
        minimumMountCount: 2,
        phaseName: "remount",
      });
      expect(
        remountedReadiness.fixtureDiagnostics.every(
          ({ diagnostic }) => (diagnostic?.unmountCount ?? 0) >= 1
        )
      ).toBe(true);
      checkpoint("models-remounted", finalLifecycleState);
      const remountGeneration =
        remountedReadiness.activeRequiredDiagnostics[0]?.reloadGeneration ?? 0;
      await recordTelemetryBootstrapEvidence({
        phaseName: "initial-document",
        expectedCollectorActivationGeneration: remountGeneration,
        observedReadyModelCount: remountedReadiness.activeRequiredDiagnostics.filter(
          (diagnostic) => diagnostic.loadState === "ready",
        ).length,
      });
      checkpoint("telemetry-contract-valid-before-reload-1", finalLifecycleState);
    }, () => finalLifecycleState);

    for (let reloadIndex = 0; reloadIndex < 3; reloadIndex += 1) {
      const phaseName = `reload-${reloadIndex + 1}`;
      finalLifecycleState = "not-observed";
      await phaseRecorder.run(phaseName, async ({ checkpoint }) => {
        lastBrowserHeartbeat = null;
        const reloadResponse = await page.reload({
          waitUntil: "domcontentloaded",
          timeout: reloadOperationTimeout("navigation"),
        });
        expect(reloadResponse?.status()).toBe(200);
        finalLifecycleState = "loading";
        checkpoint("route-design-loaded", "loading");
        const bootstrapReadinessTimeoutMs = reloadOperationTimeout(
          "bootstrap-readiness",
        );
        await Promise.all([
          expect(page.getByTestId("scene-canvas").first()).toBeVisible({
            timeout: bootstrapReadinessTimeoutMs,
          }),
          expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
            /^\d+ rooms?$/,
            { timeout: bootstrapReadinessTimeoutMs },
          ),
        ]);
        const restoredIdentity = (await runRuntimeSmokeBoundedOperation({
          operationAttempt: runtimeSmokeOperationAttempt(
            createRuntimeSmokeOperationDeadline({
              phaseName,
              operationName: "hydration-snapshot",
            }),
          ),
          task: () =>
            page.evaluate((storageKey) => {
              const raw = window.localStorage.getItem(storageKey);
              if (!raw) return { designId: null, roomCount: 0, itemCount: 0 };
              const stored = JSON.parse(raw) as {
                designId?: string;
                rooms?: Array<{ items?: unknown[] }>;
              };
              return {
                designId: stored.designId ?? null,
                roomCount: stored.rooms?.length ?? 0,
                itemCount: (stored.rooms ?? []).reduce(
                  (total, room) => total + (room.items?.length ?? 0),
                  0,
                ),
              };
            }, DESIGN_STORAGE_KEY),
        })) as { designId: string | null; roomCount: number; itemCount: number };
        expect(restoredIdentity.designId).toBeNull();
        checkpoint(
          `local-fixture-hydrated-rooms-${restoredIdentity.roomCount}` +
            `-items-${restoredIdentity.itemCount}`,
          "loading",
        );
        const reloadedView3d = page
          .locator('[data-testid="editor-view-3d"]:visible')
          .first();
        if (
          (await reloadedView3d.getAttribute("aria-pressed", {
            timeout: reloadOperationTimeout("view-state-read"),
          })) !== "true"
        ) {
          await reloadedView3d.click({
            timeout: reloadOperationTimeout("view-activation"),
          });
        }
        checkpoint("view-3d-active", "loading");
        const reloadDiagnostics = await waitForReloadModelsReady({
          minimumResponseCount: reloadIndex + 2,
          minimumReloadGeneration: completedReloadGeneration + 1,
          phaseName,
          checkpoint,
        });
        const telemetryGeneration =
          reloadDiagnostics[0]?.diagnostic?.reloadGeneration ?? 0;
        await recordTelemetryBootstrapEvidence({
          phaseName,
          expectedCollectorActivationGeneration: telemetryGeneration,
          observedReadyModelCount: reloadDiagnostics.filter(
            ({ diagnostic }) => diagnostic?.loadState === "ready",
          ).length,
        });
        checkpoint("telemetry-bootstrap-contract-valid", "ready");
        const responseTotal = MODEL_FIXTURES.reduce(
          (total, { modelPath }) =>
            total + (modelResponseCounts.get(modelPath) ?? 0),
          0,
        );
        const immediateSnapshot = captureImmediatePostReadinessSnapshot({
          checkpoint,
          phaseName,
          responseTotal,
          snapshot: lastRequiredSnapshot,
          timing: lastRequiredSnapshotTiming,
        }) as GLBRequiredSnapshot;
        immediatePostReadinessSnapshots.push(immediateSnapshot);

        checkpoint("response-total-verification-started", "ready");
        expect(responseTotal).toBe(MODEL_FIXTURES.length * (reloadIndex + 2));
        expect(
          MODEL_FIXTURES.every(
            ({ modelPath }) =>
              (modelResponseCounts.get(modelPath) ?? 0) === reloadIndex + 2,
          ),
        ).toBe(true);
        checkpoint("response-total-verification-complete", "ready");

        checkpoint("generation-verification-started", "ready");
        const observedReloadGeneration =
          reloadDiagnostics[0]?.diagnostic?.reloadGeneration;
        expect(observedReloadGeneration).toBe(immediateSnapshot.reloadGeneration);
        expect(observedReloadGeneration ?? 0).toBeGreaterThan(
          completedReloadGeneration,
        );
        completedReloadGeneration =
          observedReloadGeneration ?? completedReloadGeneration;
        checkpoint("generation-verification-complete", "ready");

        checkpoint("active-key-verification-started", "ready");
        expect(immediateSnapshot.activeRequiredModelIds).toEqual(
          expectedActiveRequiredKeys,
        );
        expect(immediateSnapshot.activeRequiredModelIds).toHaveLength(
          EXPECTED_ACTIVE_REQUIRED_MODEL_COUNT,
        );
        checkpoint("active-key-verification-complete", "ready");

        await runRuntimeSmokePostReadinessOperation({
          checkpoint,
          startedCheckpoint: "body-state-verification-started",
          completedCheckpoint: "body-state-verification-complete",
          task: () => verifyBodyStateAfterReadiness({ phaseName, checkpoint }),
        });
        const reloadSettledBefore = await runRuntimeSmokePostReadinessOperation({
          checkpoint,
          startedCheckpoint: "post-ready-settle-started",
          completedCheckpoint: "post-ready-settle-complete",
          task: () => waitForModelDiagnosticsToSettle(phaseName, checkpoint),
        });
        checkpoint("bounds-settled", "ready");
        await runRuntimeSmokePostReadinessOperation({
          checkpoint,
          startedCheckpoint: "post-settle-observation-started",
          completedCheckpoint: "post-settle-observation-complete",
          task: () =>
            page.waitForTimeout(
              reloadOperationTimeout("post-settle-observation"),
            ),
        });
        const reloadSettledAfter = await runRuntimeSmokePostReadinessOperation({
          checkpoint,
          startedCheckpoint: "required-snapshot-requested",
          completedCheckpoint: "required-snapshot-returned",
          task: () =>
            readModelDiagnosticsWithin(
              createRuntimeSmokeOperationDeadline({
                phaseName,
                operationName: "final-diagnostics-snapshot",
              }),
              undefined,
              checkpoint,
            ),
        });
        recordRequiredSnapshotProof(phaseName, checkpoint);
        expect(lastRequiredSnapshot?.reloadGeneration).toBe(
          immediateSnapshot.reloadGeneration,
        );
        checkpoint("required-snapshot-assertions-complete", "ready");
        reloadSettledAfter.forEach(({ key, diagnostic }, index) => {
          const before = reloadSettledBefore[index]?.diagnostic;
          expect(diagnostic, `${key} should remount with diagnostics`).not.toBeNull();
          expect(
            diagnostic?.boundsPublicationCount,
            `${key} should keep model-derived bounds out of parent state`
          ).toBe(0);
          expect(
            diagnostic?.excessiveBoundsWarningCount,
            `${key} should not report excessive bounds churn`
          ).toBe(0);
          expect(
            (diagnostic?.renderCount ?? 0) - (before?.renderCount ?? 0),
            `${key} should remain render-idle after reload`
          ).toBe(0);
        });
        finalLifecycleState = "stable";
        checkpoint("reload-assertions-complete", "stable");
      }, () => finalLifecycleState);
    }

    await phaseRecorder.run("persistence-assertions", async ({ checkpoint }) => {
      const persistedFixtureIds = await page.evaluate((storageKey) => {
        const raw = window.localStorage.getItem(storageKey);
        if (!raw) return [];
        const stored = JSON.parse(raw) as {
          rooms?: Array<{ items?: Array<{ instanceId?: string }> }>;
        };
        return (stored.rooms ?? [])
          .flatMap((room) => room.items ?? [])
          .map((item) => item.instanceId)
          .filter((instanceId): instanceId is string =>
            Boolean(instanceId?.startsWith("runtime-smoke-model-"))
          )
          .sort();
      }, DESIGN_STORAGE_KEY);
      checkpoint("local-backup-read", "persisted");
      expect(persistedFixtureIds).toEqual(diagnosticKeys);
      finalLifecycleState = "persisted";
      checkpoint("fixture-identities-persisted", "persisted");
    }, () => finalLifecycleState);

    await phaseRecorder.run("final-body-state-assertions", async ({ checkpoint }) => {
      expect(
        MODEL_FIXTURES.every(
          ({ modelPath }) =>
            (modelRequestCounts.get(modelPath) ?? 0) === 4 &&
            (modelResponseCounts.get(modelPath) ?? 0) === 4
        )
      ).toBe(true);
      expect(immediatePostReadinessSnapshots).toHaveLength(3);
      expect(
        immediatePostReadinessSnapshots.map(
          (snapshot) => snapshot.reloadGeneration,
        ),
      ).toEqual([1, 2, 3].map((offset) => completedReloadGeneration - 3 + offset));
      await expect(page.locator("body")).not.toContainText(
        "Maximum update depth exceeded"
      );
      expect(fatalErrors).toEqual([]);
      checkpoint("final-assertions-complete", finalLifecycleState);
    }, () => finalLifecycleState);
  });

  test("health and catalog endpoints report ready", async ({ request }) => {
    const health = await request.get("/api/health");
    expect(health.status()).toBe(200);
    const healthPayload = await health.json();
    expect(healthPayload).toMatchObject({
      service: "interior-ai",
      status: "ok",
      checks: {
        application: "ok",
        catalog: { status: "ok" },
      },
    });

    const expectedBuildId = process.env.PRODUCTION_EVIDENCE_EXPECTED_BUILD_ID;
    const expectedArtifactSha256 =
      process.env.PRODUCTION_EVIDENCE_EXPECTED_ARTIFACT_SHA256;
    const expectedCommitSha = process.env.PRODUCTION_EVIDENCE_EXPECTED_COMMIT_SHA;
    if (expectedBuildId || expectedArtifactSha256 || expectedCommitSha) {
      expect(healthPayload.productionArtifact).toEqual({
        kind: "local-production-mode-artifact",
        nextBuildId: expectedBuildId,
        artifactSha256: expectedArtifactSha256,
        sourceCommitSha: expectedCommitSha,
      });
      expect(healthPayload.build).toBe(expectedBuildId);
    }

    const catalog = await request.get("/api/catalog/live");
    expect(catalog.status()).toBe(200);
  });
});
