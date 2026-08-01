import { expect, test } from "./fixtures";
import { confirmPlanTemplateReplacementIfNeeded } from "./plan-template-test-utils";
import { getSelectedItemPanel } from "./variant-test-utils";
import {
  RUNTIME_SMOKE_WHOLE_TEST_TIMEOUT_MS,
  RuntimeSmokePhaseTimeoutError,
  RuntimeSmokeTerminalError,
  createRuntimeSmokePhaseRecorder,
  runtimeSmokePhaseBudget,
} from "../../scripts/runtime-smoke-phase-budget.mjs";

const DESIGN_STORAGE_KEY = "interior-ai:v1:livingroom-design";

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
    const waitForModelDiagnosticsReady = async ({
      minimumMountCount,
      phaseName,
      requireAuburnSelectionOutline = true,
    }: {
      minimumMountCount: number;
      phaseName: string;
      requireAuburnSelectionOutline?: boolean;
    }) => {
      const startedAt = Date.now();
      const timeoutMs = runtimeSmokePhaseBudget(phaseName);
      let lastDiagnostics = await readModelDiagnostics();
      while (Date.now() - startedAt < timeoutMs) {
        lastDiagnostics = await readModelDiagnostics();
        const terminalErrors = lastDiagnostics.filter(
          ({ diagnostic }) => diagnostic?.loadState === "error"
        );
        if (terminalErrors.length > 0) {
          finalLifecycleState = "error";
          throw new RuntimeSmokeTerminalError(phaseName);
        }
        const ready = lastDiagnostics.every(
          ({ key, diagnostic }) =>
            diagnostic?.loadState === "ready" &&
            diagnostic.mountCount >= minimumMountCount &&
            diagnostic.boundsMaterialChangeCount >= 1 &&
            diagnostic.boundsPublicationCount === 0 &&
            diagnostic.boundsInvalidCount === 0 &&
            diagnostic.excessiveBoundsWarningCount === 0 &&
            (!requireAuburnSelectionOutline ||
              key !== "runtime-smoke-model-3" ||
              diagnostic.selectionOutlineVisible)
        );
        if (ready) {
          finalLifecycleState = "ready";
          return lastDiagnostics;
        }
        finalLifecycleState = "loading";
        await page.waitForTimeout(500);
      }
      throw new RuntimeSmokePhaseTimeoutError(phaseName, timeoutMs);
    };
    const waitForModelDiagnosticsToSettle = async () => {
      let previous = await readModelDiagnostics();
      let stableSamples = 0;
      for (let sampleIndex = 0; sampleIndex < 20; sampleIndex += 1) {
        await page.waitForTimeout(500);
        const current = await readModelDiagnostics();
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
      throw new Error(
        `GLB diagnostics did not settle: ${JSON.stringify(previous)}`
      );
    };
    const waitForModelResponsesOrTerminal = async ({
      minimumResponseCount,
      phaseName,
    }: {
      minimumResponseCount: number;
      phaseName: string;
    }) => {
      const timeoutMs = runtimeSmokePhaseBudget(phaseName);
      const startedAt = Date.now();
      while (Date.now() - startedAt < timeoutMs) {
        const diagnostics = await readModelDiagnostics();
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
          return;
        }
        finalLifecycleState = diagnostics.some(
          ({ diagnostic }) => diagnostic?.loadState === "loading"
        )
          ? "loading"
          : finalLifecycleState;
        await page.waitForTimeout(250);
      }
      throw new RuntimeSmokePhaseTimeoutError(phaseName, timeoutMs);
    };

    await phaseRecorder.run("test-body-setup", async () => {
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
    });

    await phaseRecorder.run("initial-navigation", async () => {
      const initialResponse = await page.goto("/design", {
        waitUntil: "domcontentloaded",
      });
      expect(initialResponse?.status()).toBe(200);
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
        timeout: 30_000,
      });
    });

    await phaseRecorder.run("fixture-creation", async () => {
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

      const studioTemplate = page.getByTestId("apply-furnished-template-studio");
      if (await studioTemplate.isVisible({ timeout: 5_000 }).catch(() => false)) {
        await studioTemplate.click();
        await confirmPlanTemplateReplacementIfNeeded(page);
      }

      await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
        "4 rooms",
        { timeout: 30_000 }
      );
      await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(
        /[1-9]\d* items?/
      );

      await expect
        .poll(
          () =>
            page.evaluate(
              (storageKey) => Boolean(window.localStorage.getItem(storageKey)),
              DESIGN_STORAGE_KEY
            ),
          { timeout: 30_000 }
        )
        .toBe(true);
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
    }, () => "persisted");

    const view2d = page.locator('[data-testid="editor-view-2d"]:visible').first();
    const view3d = page.locator('[data-testid="editor-view-3d"]:visible').first();
    const layoutDebug = page.getByTestId("qa-design-layout-debug");
    const auburnPlanTarget = page
      .getByTestId("plan-item-keyboard-target")
      .filter({ hasText: "Auburn" });

    await phaseRecorder.run("fixture-reload-2d-readiness", async () => {
      const fixtureReload = await page.reload({ waitUntil: "domcontentloaded" });
      expect(fixtureReload?.status()).toBe(200);
      await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
        timeout: 30_000,
      });
      await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
        "4 rooms",
        { timeout: 30_000 }
      );
      await expect(page.getByTestId("room-setup-step-furnish-meta")).toHaveText(
        "8 items",
        { timeout: 30_000 }
      );
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
      }).toPass({ timeout: 30_000 });
      await expect(auburnPlanTarget).toBeVisible({ timeout: 30_000 });
    }, () => finalLifecycleState);

    await phaseRecorder.run("initial-glb-loading-and-selection-verification", async () => {
      await auburnPlanTarget.click();
      await expect(getSelectedItemPanel(page)).toContainText("Auburn");
      await view3d.click();
      await expect(layoutDebug).toHaveAttribute("data-view-mode", "3d");
      await waitForModelResponsesOrTerminal({
        minimumResponseCount: 1,
        phaseName: "initial-glb-loading-and-selection-verification",
      });
      expect(
        MODEL_FIXTURES.every(
          ({ modelPath }) => (modelRequestCounts.get(modelPath) ?? 0) >= 1
        )
      ).toBe(true);
      await expect(getSelectedItemPanel(page)).toContainText("Auburn");
    }, () => finalLifecycleState);

    await phaseRecorder.run("semantic-readiness", async () => {
      await waitForModelDiagnosticsReady({
        minimumMountCount: 1,
        phaseName: "semantic-readiness",
      });
    }, () => finalLifecycleState);

    let settledDiagnosticsBefore: Awaited<ReturnType<typeof readModelDiagnostics>> = [];
    let settledDiagnosticsAfter: Awaited<ReturnType<typeof readModelDiagnostics>> = [];
    await phaseRecorder.run("bounds-verification", async () => {
      settledDiagnosticsBefore = await waitForModelDiagnosticsToSettle();
      await page.waitForTimeout(1_000);
      settledDiagnosticsAfter = await readModelDiagnostics();
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
    }, () => finalLifecycleState);

    await phaseRecorder.run("render-loop-assertions", async () => {
      settledDiagnosticsAfter.forEach(({ key, diagnostic }, index) => {
        const before = settledDiagnosticsBefore[index]?.diagnostic;
        expect(
          (diagnostic?.renderCount ?? 0) - (before?.renderCount ?? 0),
          `${key} should stop React-rendering once its GLB settles`
        ).toBe(0);
      });
    }, () => finalLifecycleState);

    await phaseRecorder.run("remount", async () => {
      await view2d.click();
      await expect(layoutDebug).toHaveAttribute("data-view-mode", "2d");
      await view3d.click();
      await expect(layoutDebug).toHaveAttribute("data-view-mode", "3d");
      await expect(getSelectedItemPanel(page)).toContainText("Auburn");
      const remountedDiagnostics = await waitForModelDiagnosticsReady({
        minimumMountCount: 2,
        phaseName: "remount",
      });
      expect(
        remountedDiagnostics.every(
          ({ diagnostic }) => (diagnostic?.unmountCount ?? 0) >= 1
        )
      ).toBe(true);
    }, () => finalLifecycleState);

    for (let reloadIndex = 0; reloadIndex < 3; reloadIndex += 1) {
      const phaseName = `reload-${reloadIndex + 1}`;
      await phaseRecorder.run(phaseName, async () => {
        const reloadResponse = await page.reload({ waitUntil: "domcontentloaded" });
        expect(reloadResponse?.status()).toBe(200);
        await expect(page.getByTestId("scene-canvas").first()).toBeVisible({
          timeout: 30_000,
        });
        await expect(page.getByTestId("room-plan-status-room-count")).toHaveText(
          /^\d+ rooms?$/
        );
        const reloadedView3d = page
          .locator('[data-testid="editor-view-3d"]:visible')
          .first();
        if ((await reloadedView3d.getAttribute("aria-pressed")) !== "true") {
          await reloadedView3d.click();
        }
        await waitForModelResponsesOrTerminal({
          minimumResponseCount: reloadIndex + 2,
          phaseName,
        });
        await waitForModelDiagnosticsReady({
          minimumMountCount: 1,
          phaseName,
          requireAuburnSelectionOutline: false,
        });
        await expect(page.locator("body")).not.toContainText(
          "Maximum update depth exceeded"
        );
        const reloadSettledBefore = await waitForModelDiagnosticsToSettle();
        await page.waitForTimeout(1_000);
        const reloadSettledAfter = await readModelDiagnostics();
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
      }, () => finalLifecycleState);
    }

    await phaseRecorder.run("persistence-assertions", async () => {
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
      expect(persistedFixtureIds).toEqual(diagnosticKeys);
      finalLifecycleState = "persisted";
    }, () => finalLifecycleState);

    await phaseRecorder.run("final-body-state-assertions", async () => {
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
