import { expect, test } from "./fixtures";
import { confirmPlanTemplateReplacementIfNeeded } from "./plan-template-test-utils";
import { getSelectedItemPanel } from "./variant-test-utils";
import {
  FURNISHED_TEMPLATE_PHASE_CONTRACTS,
  FURNISHED_TEMPLATE_RELOAD_CONTRACT,
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS,
  RuntimeSmokePhaseTimeoutError,
  RuntimeSmokeTerminalError,
  createRuntimeSmokePhaseRecorder,
  runRuntimeSmokeBoundedOperation,
  runtimeSmokeAggregateLifecycleState,
  runtimeSmokePhaseBudget,
} from "../../scripts/runtime-smoke-phase-budget.mjs";

const DESIGN_STORAGE_KEY = "interior-ai:v1:livingroom-design";

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

function remainingOperationTimeout(
  phaseName: string,
  startedAt: number,
  timeoutMs: number,
): number {
  const remainingMs = timeoutMs - (Date.now() - startedAt);
  if (remainingMs <= 0) {
    throw new RuntimeSmokePhaseTimeoutError(phaseName, timeoutMs);
  }
  return remainingMs;
}

const MODEL_FIXTURES = [
  {
    id: "sofa-real-castlery-dawson-ottoman",
    title: "Dawson Ottoman",
    dimensionsMm: { w: 930, d: 930, h: 450 },
    position: [-1.2, 0, 1.1] as [number, number, number],
    modelPath: "/assets/models/sofa-real-castlery-dawson-ottoman.glb",
  },
  {
    id: "sofa-real-castlery-jaron-3s",
    title: "Jaron Recliner Sofa",
    dimensionsMm: { w: 2200, d: 1150, h: 770 },
    position: [0, 0, 1.1] as [number, number, number],
    modelPath: "/assets/models/sofa-real-castlery-jaron-3s.glb",
  },
  {
    id: "sofa-real-castlery-auburn-performance-fabric-3-seater-sofa",
    title: "Auburn Performance Fabric 3 Seater Sofa",
    dimensionsMm: { w: 2310, d: 915, h: 765 },
    position: [1.1, 0, -0.9] as [number, number, number],
    modelPath:
      "/assets/models/sofa-real-castlery-auburn-performance-fabric-3-seater-sofa.glb",
  },
] as const;

test.describe("00. Runtime smoke", () => {
  test("furnished template remains stable without a render loop", async ({ page }) => {
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
    const readModelDiagnostics = () =>
      page.evaluate((keys) => {
        const diagnostics = (
          globalThis as typeof globalThis & {
            __INTERIOR_AI_GLB_DIAGNOSTICS__?: Record<
              string,
              {
                mountCount: number;
                unmountCount: number;
                renderCount: number;
                boundsMaterialChangeCount: number;
                boundsPublicationCount: number;
                boundsInvalidCount: number;
                excessiveBoundsWarningCount: number;
                selectionOutlineVisible: boolean;
                loadState: "loading" | "ready" | "error";
                loadErrorCode:
                  | "gltf-load-failed"
                  | "gltf-loader-import-failed"
                  | null;
              }
            >;
          }
        ).__INTERIOR_AI_GLB_DIAGNOSTICS__;
        return keys.map((key) => ({
          key,
          diagnostic: diagnostics?.[key] ?? null,
        }));
      }, diagnosticKeys);
    const readModelDiagnosticsWithin = async (
      phaseName: string,
      operationName: string,
      timeoutMs: number,
    ): Promise<Awaited<ReturnType<typeof readModelDiagnostics>>> =>
      (await runRuntimeSmokeBoundedOperation({
        phaseName,
        operationName,
        timeoutMs,
        task: readModelDiagnostics,
      })) as Awaited<ReturnType<typeof readModelDiagnostics>>;
    const waitForModelDiagnosticsReady = async ({
      minimumMountCount,
      phaseName,
      requireAuburnSelectionOutline = true,
      operationTimeoutMs,
      checkpoint,
    }: {
      minimumMountCount: number;
      phaseName: string;
      requireAuburnSelectionOutline?: boolean;
      operationTimeoutMs?: number;
      checkpoint?: RuntimeSmokeCheckpoint;
    }) => {
      const startedAt = Date.now();
      const timeoutMs = operationTimeoutMs ?? runtimeSmokePhaseBudget(phaseName);
      let lastDiagnostics = await readModelDiagnosticsWithin(
        phaseName,
        "model-readiness",
        remainingOperationTimeout(phaseName, startedAt, timeoutMs),
      );
      let previousProgressSignature = "";
      while (true) {
        lastDiagnostics = await readModelDiagnosticsWithin(
          phaseName,
          "model-readiness",
          remainingOperationTimeout(phaseName, startedAt, timeoutMs),
        );
        const progressSignature = lastDiagnostics
          .map(({ diagnostic }) =>
            diagnostic
              ? `${diagnostic.loadState}-${diagnostic.mountCount}-${diagnostic.boundsMaterialChangeCount}`
              : "missing",
          )
          .join("-");
        const loadingModelCount = lastDiagnostics.filter(
          ({ diagnostic }) => diagnostic?.loadState === "loading",
        ).length;
        const readyModelCount = lastDiagnostics.filter(
          ({ diagnostic }) => diagnostic?.loadState === "ready",
        ).length;
        const terminalErrorModelCount = lastDiagnostics.filter(
          ({ diagnostic }) => diagnostic?.loadState === "error",
        ).length;
        const diagnosticsReady = lastDiagnostics.every(
          ({ key, diagnostic }) =>
            diagnostic?.loadState === "ready" &&
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
          expectedModelCount: diagnosticKeys.length,
          readyModelCount,
          loadingModelCount,
          terminalErrorModelCount,
          combinedReadinessSatisfied: diagnosticsReady,
        });
        if (progressSignature !== previousProgressSignature) {
          checkpoint?.(
            `diagnostics-loading-${loadingModelCount}-ready-${readyModelCount}` +
              `-error-${terminalErrorModelCount}`,
            aggregateLifecycleState,
          );
          previousProgressSignature = progressSignature;
        }
        if (terminalErrorModelCount > 0) {
          finalLifecycleState = "error";
          throw new RuntimeSmokeTerminalError(phaseName);
        }
        if (diagnosticsReady) {
          finalLifecycleState = "ready";
          return lastDiagnostics;
        }
        finalLifecycleState = "loading";
        await page.waitForTimeout(
          Math.min(
            500,
            remainingOperationTimeout(phaseName, startedAt, timeoutMs),
          ),
        );
      }
    };
    const waitForModelDiagnosticsToSettle = async (
      phaseName: string,
      checkpoint?: RuntimeSmokeCheckpoint,
      timeoutMs = 10_000,
    ) => {
      const startedAt = Date.now();
      let previous = await readModelDiagnosticsWithin(
        phaseName,
        "diagnostics-settle",
        remainingOperationTimeout(phaseName, startedAt, timeoutMs),
      );
      let stableSamples = 0;
      let previousProgressSignature = "";
      for (let sampleIndex = 0; ; sampleIndex += 1) {
        await page.waitForTimeout(
          Math.min(
            500,
            remainingOperationTimeout(phaseName, startedAt, timeoutMs),
          ),
        );
        const current = await readModelDiagnosticsWithin(
          phaseName,
          "diagnostics-settle",
          remainingOperationTimeout(phaseName, startedAt, timeoutMs),
        );
        const progressSignature = current
          .map(({ diagnostic }) =>
            diagnostic
              ? `${diagnostic.loadState}-${diagnostic.renderCount}-${diagnostic.boundsMaterialChangeCount}`
              : "missing",
          )
          .join("-");
        if (progressSignature !== previousProgressSignature) {
          checkpoint?.(`diagnostics-sample-${sampleIndex + 1}`);
          previousProgressSignature = progressSignature;
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
        if (stableSamples >= 2) return current;
        previous = current;
      }
    };
    const waitForReloadModelsReady = async ({
      minimumResponseCount,
      phaseName,
      checkpoint,
    }: {
      minimumResponseCount: number;
      phaseName: string;
      checkpoint: RuntimeSmokeCheckpoint;
    }) => {
      const timeoutMs = reloadOperationTimeout("model-responses-and-readiness");
      const startedAt = Date.now();
      let previousProgressSignature = "";
      while (true) {
        const diagnostics = await readModelDiagnosticsWithin(
          phaseName,
          "model-responses-and-readiness",
          remainingOperationTimeout(phaseName, startedAt, timeoutMs),
        );
        const loadingModelCount = diagnostics.filter(
          ({ diagnostic }) => diagnostic?.loadState === "loading",
        ).length;
        const readyModelCount = diagnostics.filter(
          ({ diagnostic }) => diagnostic?.loadState === "ready",
        ).length;
        const terminalErrorModelCount = diagnostics.filter(
          ({ diagnostic }) => diagnostic?.loadState === "error",
        ).length;
        const totalResponses = MODEL_FIXTURES.reduce(
          (total, { modelPath }) =>
            total + (modelResponseCounts.get(modelPath) ?? 0),
          0,
        );
        const totalRequests = MODEL_FIXTURES.reduce(
          (total, { modelPath }) =>
            total + (modelRequestCounts.get(modelPath) ?? 0),
          0,
        );
        const requiredResponses = MODEL_FIXTURES.length * minimumResponseCount;
        const responsesReady = MODEL_FIXTURES.every(
          ({ modelPath }) =>
            (modelResponseCounts.get(modelPath) ?? 0) >= minimumResponseCount,
        );
        const diagnosticsReady = diagnostics.every(
          ({ diagnostic }) =>
            diagnostic?.loadState === "ready" &&
            diagnostic.mountCount >= 1 &&
            diagnostic.boundsMaterialChangeCount >= 1 &&
            diagnostic.boundsPublicationCount === 0 &&
            diagnostic.boundsInvalidCount === 0 &&
            diagnostic.excessiveBoundsWarningCount === 0,
        );
        const combinedReadinessSatisfied = responsesReady && diagnosticsReady;
        const aggregateLifecycleState = runtimeSmokeAggregateLifecycleState({
          expectedModelCount: MODEL_FIXTURES.length,
          readyModelCount,
          loadingModelCount,
          terminalErrorModelCount,
          combinedReadinessSatisfied,
        });
        const progressSignature = [
          loadingModelCount,
          readyModelCount,
          terminalErrorModelCount,
          totalResponses,
          totalRequests,
          fatalErrors.length,
        ].join("-");
        if (progressSignature !== previousProgressSignature) {
          checkpoint(
            `models-loading-${loadingModelCount}-ready-${readyModelCount}` +
              `-error-${terminalErrorModelCount}-responses-${totalResponses}` +
              `-required-${requiredResponses}-outstanding-${Math.max(0, totalRequests - totalResponses)}` +
              `-browser-errors-${fatalErrors.length}`,
            aggregateLifecycleState,
          );
          previousProgressSignature = progressSignature;
        }
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
          Math.min(
            500,
            remainingOperationTimeout(phaseName, startedAt, timeoutMs),
          ),
        );
      }
    };
    const waitForModelResponsesOrTerminal = async ({
      minimumResponseCount,
      phaseName,
      operationTimeoutMs,
      checkpoint,
    }: {
      minimumResponseCount: number;
      phaseName: string;
      operationTimeoutMs?: number;
      checkpoint?: RuntimeSmokeCheckpoint;
    }) => {
      const timeoutMs = operationTimeoutMs ?? runtimeSmokePhaseBudget(phaseName);
      const startedAt = Date.now();
      let previousResponseCount = -1;
      while (true) {
        const diagnostics = await readModelDiagnosticsWithin(
          phaseName,
          "model-responses",
          remainingOperationTimeout(phaseName, startedAt, timeoutMs),
        );
        if (
          diagnostics.some(
            ({ diagnostic }) => diagnostic?.loadState === "error"
          )
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
        finalLifecycleState = diagnostics.some(
          ({ diagnostic }) => diagnostic?.loadState === "loading"
        )
          ? "loading"
          : finalLifecycleState;
        await page.waitForTimeout(
          Math.min(
            250,
            remainingOperationTimeout(phaseName, startedAt, timeoutMs),
          ),
        );
      }
    };

    await phaseRecorder.run("test-body-setup", async ({ checkpoint }) => {
      page.on("pageerror", (error) => fatalErrors.push(error.message));
      page.on("console", (message) => {
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
        (
          globalThis as typeof globalThis & {
            __INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__?: boolean;
          }
        ).__INTERIOR_AI_ENABLE_GLB_DIAGNOSTICS__ = true;
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
        operationTimeoutMs: phaseOperationTimeout(
          "initial-glb-loading-and-selection-verification",
          "model-responses",
        ),
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

    await phaseRecorder.run("semantic-readiness", async ({ checkpoint }) => {
      await waitForModelDiagnosticsReady({
        minimumMountCount: 1,
        phaseName: "semantic-readiness",
        operationTimeoutMs: phaseOperationTimeout(
          "semantic-readiness",
          "model-readiness",
        ),
        checkpoint,
      });
      checkpoint("semantic-models-ready", "ready");
    }, () => finalLifecycleState);

    let settledDiagnosticsBefore: Awaited<ReturnType<typeof readModelDiagnostics>> = [];
    let settledDiagnosticsAfter: Awaited<ReturnType<typeof readModelDiagnostics>> = [];
    await phaseRecorder.run("bounds-verification", async ({ checkpoint }) => {
      settledDiagnosticsBefore = await waitForModelDiagnosticsToSettle(
        "bounds-verification",
        checkpoint,
        phaseOperationTimeout("bounds-verification", "diagnostics-settle"),
      );
      checkpoint("bounds-baseline-settled", "ready");
      await page.waitForTimeout(
        phaseOperationTimeout("bounds-verification", "post-settle-observation"),
      );
      settledDiagnosticsAfter = await readModelDiagnosticsWithin(
        "bounds-verification",
        "diagnostic-snapshot-and-assertions",
        phaseOperationTimeout(
          "bounds-verification",
          "diagnostic-snapshot-and-assertions",
        ),
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
      const remountedDiagnostics = await waitForModelDiagnosticsReady({
        minimumMountCount: 2,
        phaseName: "remount",
        operationTimeoutMs: phaseOperationTimeout("remount", "model-readiness"),
      });
      expect(
        remountedDiagnostics.every(
          ({ diagnostic }) => (diagnostic?.unmountCount ?? 0) >= 1
        )
      ).toBe(true);
      checkpoint("models-remounted", finalLifecycleState);
    }, () => finalLifecycleState);

    for (let reloadIndex = 0; reloadIndex < 3; reloadIndex += 1) {
      const phaseName = `reload-${reloadIndex + 1}`;
      finalLifecycleState = "not-observed";
      await phaseRecorder.run(phaseName, async ({ checkpoint }) => {
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
          phaseName,
          operationName: "hydration-snapshot",
          timeoutMs: reloadOperationTimeout("hydration-snapshot"),
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
        await waitForReloadModelsReady({
          minimumResponseCount: reloadIndex + 2,
          phaseName,
          checkpoint,
        });
        await expect(page.locator("body")).not.toContainText(
          "Maximum update depth exceeded",
          { timeout: reloadOperationTimeout("body-state-assertion") },
        );
        const reloadSettledBefore = await waitForModelDiagnosticsToSettle(
          phaseName,
          checkpoint,
          reloadOperationTimeout("diagnostics-settle"),
        );
        checkpoint("bounds-settled", "ready");
        await page.waitForTimeout(
          reloadOperationTimeout("post-settle-observation"),
        );
        const reloadSettledAfter = await readModelDiagnosticsWithin(
          phaseName,
          "final-diagnostics-snapshot",
          reloadOperationTimeout("final-diagnostics-snapshot"),
        );
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
            (modelRequestCounts.get(modelPath) ?? 0) >= 4 &&
            (modelResponseCounts.get(modelPath) ?? 0) >= 4
        )
      ).toBe(true);
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
