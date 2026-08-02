import { test, expect } from "../fixtures";
import { EDITOR_STORAGE_KEY, dismissBlockingPrompt, placeCabinetRun } from "./helpers";

export function registerPlacementTests() {
  test.describe("Custom Millwork Studio placement", () => {
    test.setTimeout(600000);

    test("Pro designer can place a cabinet run with complete project metadata", async ({
      page,
    }) => {
      const { placedCabinet, beforePosition, beforeRotation } = await placeCabinetRun(page);

      await expect(placedCabinet).toHaveAttribute("data-family", "cabinetry");
      await expect(placedCabinet).toHaveAttribute("data-assembly-type", "cabinet_run");
      await expect(placedCabinet).toHaveAttribute("data-definition-schema", "custom_millwork.definition.v1");
      await expect(placedCabinet).toHaveAttribute("data-source-type", "cabinet_definition");
      await expect(placedCabinet).toHaveAttribute("data-source-definition-id", /cabinet-/);
      await expect(placedCabinet).toHaveAttribute("data-definition-version", "1");
      await expect(placedCabinet).toHaveAttribute("data-asset-manifest-schema", "custom_millwork.asset_manifest.v1");
      await expect(placedCabinet).toHaveAttribute("data-asset-manifest-version", "1");
      await expect(placedCabinet).toHaveAttribute("data-asset-manifest-source-definition-version", "1");
      await expect(placedCabinet).toHaveAttribute("data-generated-output-kind", "glb");
      await expect(placedCabinet).toHaveAttribute("data-generated-output-durable", "false");
      await expect(placedCabinet).toHaveAttribute("data-material-count", /\d+/);
      await expect(placedCabinet).toHaveAttribute("data-hardware-count", /\d+/);
      await expect(placedCabinet).toHaveAttribute("data-module-count", "3");
      await expect(placedCabinet).toHaveAttribute("data-material-schedule-count", "4");
      await expect(placedCabinet).toHaveAttribute("data-hardware-schedule-count", "3");
      await expect(placedCabinet).toHaveAttribute("data-edge-banding-schedule-count", "4");
      await expect(placedCabinet).toHaveAttribute("data-edge-banding-total-m", "28.23");
      await expect(placedCabinet).toHaveAttribute("data-cut-list-count", "30");
      await expect(placedCabinet).toHaveAttribute("data-dimension-schedule-count", "4");
      await expect(placedCabinet).toHaveAttribute("data-drawing-view-schedule-count", "9");
      await expect(placedCabinet).toHaveAttribute("data-installer-note-count", /\d+/);
      await expect(placedCabinet).toHaveAttribute("data-release-checklist-count", "7");
      await expect(placedCabinet).toHaveAttribute("data-release-blocker-count", "0");
      await expect(placedCabinet).toHaveAttribute("data-quote-total", /\d+/);
      await expect(placedCabinet).toHaveAttribute("data-quote-line-count", /\d+/);
      await expect(placedCabinet).toHaveAttribute("data-supplier-readiness-status", "ready_for_fabricator_review");
      await expect(placedCabinet).toHaveAttribute("data-supplier-sku-mapping-count", "10");
      await expect(placedCabinet).toHaveAttribute("data-mapped-sku-count", "7");
      await expect(placedCabinet).toHaveAttribute("data-missing-sku-count", "0");
      await expect(placedCabinet).toHaveAttribute("data-custom-quote-required-count", "3");
      await expect(placedCabinet).toHaveAttribute("data-fabrication-release-status", "needs_review");
      await expect(placedCabinet).toHaveAttribute("data-fabrication-release-required-count", "7");
      await expect(placedCabinet).toHaveAttribute("data-fabrication-release-blocker-count", "0");
      await expect(placedCabinet).toHaveAttribute("data-transform-position", beforePosition!);
      await expect(placedCabinet).toHaveAttribute("data-transform-rotation-y", beforeRotation!);
      await expect(placedCabinet).toHaveAttribute("data-asset-manifest-transform-position", beforePosition!);
      await expect(placedCabinet).toHaveAttribute("data-asset-manifest-transform-rotation-y", beforeRotation!);
      await expect(placedCabinet).toHaveAttribute("data-assembly-profile-schema", "custom_millwork.assembly_profile.v1");
      await expect(placedCabinet).toHaveAttribute("data-assembly-profile-label", "Cabinet run");
      await expect(placedCabinet).toHaveAttribute("data-assembly-profile-phase", "mvp");
      await expect(placedCabinet).toHaveAttribute("data-assembly-profile-placement-kind", "built_in_wall");
      await expect(placedCabinet).toHaveAttribute("data-assembly-profile-complexity", "moderate");
      const projectSchedule = page.getByTestId("project-millwork-schedule");
      await expect(projectSchedule).toHaveAttribute("data-schema", "custom_millwork.project_schedule.v1");
      await expect(projectSchedule).toHaveAttribute("data-source-type", "placed_parametric_cabinet_project");
      await expect(projectSchedule).toHaveAttribute("data-room-count", "1");
      await expect(projectSchedule).toHaveAttribute("data-asset-count", "1");
      await expect(projectSchedule).toHaveAttribute("data-module-count", "3");
      await expect(projectSchedule).toHaveAttribute("data-edge-banding-schedule-count", "4");
      await expect(projectSchedule).toHaveAttribute("data-edge-banding-total-m", "28.23");
      await expect(projectSchedule).toHaveAttribute("data-cut-list-count", "30");
      const projectReadiness = page.getByTestId("project-millwork-readiness");
      await expect(projectReadiness).toHaveAttribute("data-schema", "custom_millwork.project_handoff_package.v1");
      await expect(projectReadiness).toHaveAttribute("data-handoff-status", "needs_review");
      await expect(projectReadiness).toHaveAttribute("data-asset-count", "1");
      await expect(projectReadiness).toHaveAttribute("data-package-count", "15");
      await expect(projectReadiness).toHaveAttribute("data-scope-schema", "custom_millwork.project_scope.v1");
      await expect(projectReadiness).toHaveAttribute("data-scope-family-count", "1");
      await expect(projectReadiness).toHaveAttribute("data-scope-assembly-type-count", "1");
      await expect(projectReadiness).toHaveAttribute("data-scope-phase-represented-count", "3");
      await expect(projectReadiness).toHaveAttribute("data-quote-status", "needs_supplier_quote");
      await expect(projectReadiness).toHaveAttribute("data-purchase-readiness", "needs_quote");
      await expect(projectReadiness).toHaveAttribute("data-fabrication-release-status", "needs_review");
      await expect(projectReadiness).toHaveAttribute("data-field-verification-status", "field_verification_required");
      await expect(projectReadiness).toHaveAttribute("data-installation-readiness", "needs_review");
      await expect(projectReadiness).toHaveAttribute("data-approval-status", "needs_review");
      await expect(projectReadiness).toHaveAttribute("data-release-blocker-count", "0");
      await expect(projectReadiness).toHaveAttribute("data-required-approval-count", "7");
      await expect(projectReadiness).toHaveAttribute("data-custom-quote-required-count", "3");
      await expect(projectReadiness).toHaveAttribute("data-can-issue-client", "true");
      await expect(projectReadiness).toHaveAttribute("data-can-issue-fabricator", "true");
      await expect(projectReadiness).toHaveAttribute("data-can-issue-installer", "true");
      await expect(projectReadiness).toHaveAttribute("data-can-issue-purchase-review", "true");

      await dismissBlockingPrompt(page);
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-bom-count", /\d+/);
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-material-schedule-count", "4");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-hardware-schedule-count", "3");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-edge-banding-schedule-count", "4");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-edge-banding-total-m", "28.23");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-cut-list-count", "30");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-dimension-schedule-count", "4");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-drawing-view-schedule-count", "9");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-release-checklist-count", "7");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-release-blocker-count", "0");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-supplier-readiness-status", "ready_for_fabricator_review");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-supplier-sku-mapping-count", "10");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-fabrication-release-status", "needs_review");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-fabrication-release-required-count", "7");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-fabrication-release-blocker-count", "0");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-assembly-profile-schema", "custom_millwork.assembly_profile.v1");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-assembly-profile-placement-kind", "built_in_wall");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-assembly-profile-complexity", "moderate");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-asset-manifest-schema", "custom_millwork.asset_manifest.v1");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-asset-manifest-version", "1");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-generated-output-kind", "glb");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-generated-output-durable", "false");
      const selectedProjectReadiness = page.getByTestId("selected-cabinet-project-readiness");
      await expect(selectedProjectReadiness).toBeVisible({ timeout: 15000 });
      await expect(selectedProjectReadiness).toHaveAttribute("data-schema", "custom_millwork.project_handoff_package.v1");
      await expect(selectedProjectReadiness).toHaveAttribute("data-handoff-status", "needs_review");
      await expect(selectedProjectReadiness).toHaveAttribute("data-scope-schema", "custom_millwork.project_scope.v1");
      await expect(selectedProjectReadiness).toHaveAttribute("data-quote-status", "needs_supplier_quote");
      await expect(selectedProjectReadiness).toHaveAttribute("data-purchase-readiness", "needs_quote");
      await expect(selectedProjectReadiness).toHaveAttribute("data-fabrication-release-status", "needs_review");
      await expect(selectedProjectReadiness).toHaveAttribute("data-field-verification-status", "field_verification_required");
      await expect(selectedProjectReadiness).toHaveAttribute("data-installation-readiness", "needs_review");
      await expect(selectedProjectReadiness).toHaveAttribute("data-approval-status", "needs_review");
      await expect(selectedProjectReadiness).toHaveAttribute("data-can-issue-purchase-review", "true");
      await expect(page.getByTestId("selected-cabinet-material-row")).toHaveCount(4);
      await expect(page.getByTestId("selected-cabinet-hardware-row")).toHaveCount(3);
    });

    test("Pro designer can transform, edit, persist, and restore a placed cabinet run", async ({
      page,
    }) => {
      const placed = await placeCabinetRun(page);
      const { placedCabinet, instanceId } = placed;
      let { beforePosition, beforeRotation } = placed;
      const projectSchedule = page.getByTestId("project-millwork-schedule");
      const projectReadiness = page.getByTestId("project-millwork-readiness");

      await expect(page.getByTestId("selected-cabinet-placement-controls")).toBeVisible({ timeout: 15000 });
      await page.getByTestId("selected-cabinet-nudge-right").click();
      await expect(placedCabinet).not.toHaveAttribute("data-position", beforePosition!);
      const movedPosition = await placedCabinet.getAttribute("data-position");
      expect(movedPosition).toBeTruthy();
      await expect(placedCabinet).toHaveAttribute("data-transform-position", movedPosition!);
      await expect(placedCabinet).toHaveAttribute("data-asset-manifest-transform-position", movedPosition!);
      beforePosition = movedPosition;

      await page.getByTestId("selected-cabinet-rotate-quarter").click();
      await expect(placedCabinet).not.toHaveAttribute("data-rotation-y", beforeRotation!);
      const movedRotation = await placedCabinet.getAttribute("data-rotation-y");
      expect(movedRotation).toBeTruthy();
      await expect(placedCabinet).toHaveAttribute("data-transform-rotation-y", movedRotation!);
      await expect(placedCabinet).toHaveAttribute("data-asset-manifest-transform-rotation-y", movedRotation!);
      beforeRotation = movedRotation;

      await page.getByTestId("selected-cabinet-snap-wall").click();
      const snappedPosition = await placedCabinet.getAttribute("data-position");
      expect(snappedPosition).toBeTruthy();
      await expect(placedCabinet).toHaveAttribute("data-transform-position", snappedPosition!);
      await expect(placedCabinet).toHaveAttribute("data-asset-manifest-transform-position", snappedPosition!);
      beforePosition = snappedPosition;

      await expect(page.getByTestId("edit-placed-millwork")).toBeVisible({ timeout: 15000 });
      await page.getByTestId("edit-placed-millwork").click();
      await expect(page.getByTestId("custom-millwork-studio")).toHaveAttribute("data-mode", "edit");
      await page.getByTestId("cabinet-dimension-width").fill("1200");
      await page.getByTestId("cabinet-input-front-material").selectOption("matte_black_laminate");
      const updatePlacedMillwork = page.getByRole("button", {
        name: "Update Placed Millwork",
        exact: true,
      });
      await expect(updatePlacedMillwork).toBeEnabled();
      await updatePlacedMillwork.focus();
      await updatePlacedMillwork.press("Enter");

      await expect(page.getByTestId("custom-millwork-studio"))
        .toBeHidden({ timeout: 30000 })
        .catch(async (error) => {
          const actionErrors = await page.getByTestId("cabinet-action-error").allTextContents();
          const actionSuccesses = await page.getByTestId("cabinet-action-success").allTextContents();
          throw new Error(
            `Updated Studio did not close. Action errors: ${actionErrors.join(" | ") || "none"}. ` +
              `Action successes: ${actionSuccesses.join(" | ") || "none"}\n${String(error)}`
          );
        });
      await expect(placedCabinet).toHaveAttribute("data-instance-id", instanceId!);
      await expect(placedCabinet).toHaveAttribute("data-width-mm", "2800");
      await expect(placedCabinet).toHaveAttribute("data-module-count", "3");
      await expect(placedCabinet).toHaveAttribute("data-cut-list-count", "30");
      await expect(placedCabinet).toHaveAttribute("data-dimension-schedule-count", "4");
      await expect(placedCabinet).toHaveAttribute("data-drawing-view-schedule-count", "9");
      await expect(placedCabinet).toHaveAttribute("data-release-checklist-count", "7");
      await expect(placedCabinet).toHaveAttribute("data-release-blocker-count", "0");
      await expect(placedCabinet).toHaveAttribute("data-supplier-readiness-status", "ready_for_fabricator_review");
      await expect(placedCabinet).toHaveAttribute("data-supplier-sku-mapping-count", "10");
      await expect(placedCabinet).toHaveAttribute("data-edge-banding-schedule-count", "4");
      await expect(placedCabinet).toHaveAttribute("data-edge-banding-total-m", "32.23");
      await expect(placedCabinet).toHaveAttribute("data-fabrication-release-status", "needs_review");
      await expect(placedCabinet).toHaveAttribute("data-assembly-profile-schema", "custom_millwork.assembly_profile.v1");
      await expect(placedCabinet).toHaveAttribute("data-assembly-profile-placement-kind", "built_in_wall");
      await expect(placedCabinet).toHaveAttribute("data-assembly-profile-complexity", "moderate");
      await expect(projectSchedule).toHaveAttribute("data-asset-count", "1");
      await expect(projectSchedule).toHaveAttribute("data-module-count", "3");
      await expect(projectSchedule).toHaveAttribute("data-edge-banding-total-m", "32.23");
      await expect(projectSchedule).toHaveAttribute("data-cut-list-count", "30");
      await expect(projectReadiness).toHaveAttribute("data-schema", "custom_millwork.project_handoff_package.v1");
      await expect(projectReadiness).toHaveAttribute("data-handoff-status", "needs_review");
      await expect(projectReadiness).toHaveAttribute("data-asset-count", "1");
      await expect(projectReadiness).toHaveAttribute("data-scope-family-count", "1");
      await expect(projectReadiness).toHaveAttribute("data-scope-assembly-type-count", "1");
      await expect(projectReadiness).toHaveAttribute("data-quote-status", "needs_supplier_quote");
      await expect(projectReadiness).toHaveAttribute("data-purchase-readiness", "needs_quote");
      await expect(projectReadiness).toHaveAttribute("data-fabrication-release-status", "needs_review");
      await expect(projectReadiness).toHaveAttribute("data-installation-readiness", "needs_review");
      await expect(projectReadiness).toHaveAttribute("data-custom-quote-required-count", "3");
      await expect(placedCabinet).toHaveAttribute("data-asset-manifest-schema", "custom_millwork.asset_manifest.v1");
      await expect(placedCabinet).toHaveAttribute("data-asset-manifest-source-definition-version", "1");
      await expect(placedCabinet).toHaveAttribute("data-generated-output-kind", "glb");
      await expect(placedCabinet).toHaveAttribute("data-generated-output-durable", "false");
      await expect(placedCabinet).toHaveAttribute("data-position", beforePosition!);
      await expect(placedCabinet).toHaveAttribute("data-rotation-y", beforeRotation!);
      await expect(placedCabinet).toHaveAttribute("data-transform-position", beforePosition!);
      await expect(placedCabinet).toHaveAttribute("data-transform-rotation-y", beforeRotation!);
      await expect(placedCabinet).toHaveAttribute("data-asset-manifest-transform-position", beforePosition!);
      await expect(placedCabinet).toHaveAttribute("data-asset-manifest-transform-rotation-y", beforeRotation!);
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-cut-list-count", "30");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-edge-banding-schedule-count", "4");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-edge-banding-total-m", "32.23");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-supplier-readiness-status", "ready_for_fabricator_review");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-fabrication-release-status", "needs_review");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-assembly-profile-schema", "custom_millwork.assembly_profile.v1");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-assembly-profile-placement-kind", "built_in_wall");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-assembly-profile-complexity", "moderate");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-asset-manifest-schema", "custom_millwork.asset_manifest.v1");
      await expect(page.getByTestId("selected-cabinet-documentation-summary")).toHaveAttribute("data-generated-output-kind", "glb");
      const saveStatus = page.getByTestId("save-status");
      await expect(saveStatus).toHaveAttribute("data-status", "saved", { timeout: 30000 });
      await expect(saveStatus).toHaveAttribute("data-source", "local");
      await page.waitForFunction(
        ({ key, instanceId: expectedInstanceId }) => {
          if (!expectedInstanceId) return false;
          const raw = window.localStorage.getItem(key);
          if (!raw) return false;
          try {
            const stored = JSON.parse(raw);
            const cabinets = (stored.rooms ?? []).flatMap((room: { items?: unknown[] }) => room.items ?? []);
            const cabinet = cabinets.find(
              (item: { instanceId?: string; assetType?: string }) =>
                item.instanceId === expectedInstanceId && item.assetType === "parametric_cabinet"
            ) as
              | {
                  cabinetDefinition?: { totalWidth?: number; modules?: unknown[] };
                  bomSnapshot?: unknown[];
                  cutListSnapshot?: unknown[];
                  transform?: { position?: unknown[]; rotationY?: number };
                  glbAssetUrl?: string;
                  millworkAssetManifest?: { generatedOutput?: { url?: string; kind?: string; durable?: boolean } };
                  includeInCheckout?: boolean;
                }
              | undefined;

            return Boolean(
                cabinet &&
                cabinet.cabinetDefinition?.totalWidth === 2800 &&
                cabinet.cabinetDefinition.modules?.length === 3 &&
                (cabinet.bomSnapshot?.length ?? 0) > 0 &&
                cabinet.cutListSnapshot?.length === 30 &&
                Array.isArray(cabinet.transform?.position) &&
                cabinet.glbAssetUrl === undefined &&
                !cabinet.millworkAssetManifest?.generatedOutput?.url?.startsWith("blob:") &&
                cabinet.millworkAssetManifest?.generatedOutput?.kind === "glb" &&
                cabinet.millworkAssetManifest?.generatedOutput?.durable === false &&
                cabinet.includeInCheckout === false
            );
          } catch {
            return false;
          }
        },
        { key: EDITOR_STORAGE_KEY, instanceId },
        { timeout: 15000 }
      );
      const storedCabinetSnapshot = await page.evaluate(
        ({ key, instanceId: expectedInstanceId }) => {
          const stored = JSON.parse(window.localStorage.getItem(key) || "{}");
          const cabinets = (stored.rooms ?? []).flatMap((room: { items?: unknown[] }) => room.items ?? []);
          const cabinet = cabinets.find(
            (item: { instanceId?: string; assetType?: string }) =>
              item.instanceId === expectedInstanceId && item.assetType === "parametric_cabinet"
          ) as {
            assetType?: string;
            cabinetDefinition?: { totalWidth?: number; id?: string };
            bomSnapshot?: unknown[];
            cutListSnapshot?: unknown[];
            transform?: { position?: unknown[]; rotationY?: number };
            glbAssetUrl?: string;
            millworkDefinition?: {
              assemblyProfile?: { schema?: string; assemblyType?: string; placementKind?: string };
            };
            millworkAssetManifest?: { schema?: string; generatedOutput?: { kind?: string; url?: string; durable?: boolean } };
            includeInCheckout?: boolean;
          };

          return {
            assetType: cabinet?.assetType,
            widthMm: cabinet?.cabinetDefinition?.totalWidth,
            definitionId: cabinet?.cabinetDefinition?.id,
            bomCount: cabinet?.bomSnapshot?.length ?? 0,
            cutListCount: cabinet?.cutListSnapshot?.length ?? 0,
            transformPosition: cabinet?.transform?.position?.join(",") ?? "",
            transformRotationY: String(cabinet?.transform?.rotationY ?? ""),
            glbAssetUrl: cabinet?.glbAssetUrl ?? null,
            assemblyProfileSchema: cabinet?.millworkDefinition?.assemblyProfile?.schema,
            assemblyProfileAssemblyType: cabinet?.millworkDefinition?.assemblyProfile?.assemblyType,
            assemblyProfilePlacementKind: cabinet?.millworkDefinition?.assemblyProfile?.placementKind,
            manifestSchema: cabinet?.millworkAssetManifest?.schema,
            generatedOutputKind: cabinet?.millworkAssetManifest?.generatedOutput?.kind,
            generatedOutputUrl: cabinet?.millworkAssetManifest?.generatedOutput?.url ?? null,
            generatedOutputDurable: cabinet?.millworkAssetManifest?.generatedOutput?.durable,
            includeInCheckout: cabinet?.includeInCheckout,
          };
        },
        { key: EDITOR_STORAGE_KEY, instanceId }
      );
      expect(storedCabinetSnapshot).toMatchObject({
        assetType: "parametric_cabinet",
        widthMm: 2800,
        cutListCount: 30,
        transformPosition: beforePosition,
        transformRotationY: beforeRotation,
        glbAssetUrl: null,
        assemblyProfileSchema: "custom_millwork.assembly_profile.v1",
        assemblyProfileAssemblyType: "cabinet_run",
        assemblyProfilePlacementKind: "built_in_wall",
        manifestSchema: "custom_millwork.asset_manifest.v1",
        generatedOutputKind: "glb",
        generatedOutputUrl: null,
        generatedOutputDurable: false,
        includeInCheckout: false,
      });
      expect(storedCabinetSnapshot.bomCount).toBeGreaterThan(0);

      await page.reload({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("open-custom-millwork-studio")).toBeVisible({ timeout: 30000 });
      const restoredCabinet = page.getByTestId("placed-millwork-asset").first();
      await expect(restoredCabinet).toHaveCount(1, { timeout: 30000 });

      await expect(restoredCabinet).toHaveAttribute("data-width-mm", "2800");
      await expect(restoredCabinet).toHaveAttribute("data-module-count", "3");
      await expect(restoredCabinet).toHaveAttribute("data-cut-list-count", "30");
      await expect(restoredCabinet).toHaveAttribute("data-dimension-schedule-count", "4");
      await expect(restoredCabinet).toHaveAttribute("data-drawing-view-schedule-count", "9");
      await expect(restoredCabinet).toHaveAttribute("data-release-checklist-count", "7");
      await expect(restoredCabinet).toHaveAttribute("data-release-blocker-count", "0");
      await expect(restoredCabinet).toHaveAttribute("data-edge-banding-schedule-count", "4");
      await expect(restoredCabinet).toHaveAttribute("data-edge-banding-total-m", "32.23");
      await expect(restoredCabinet).toHaveAttribute("data-fabrication-release-status", "needs_review");
      await expect(restoredCabinet).toHaveAttribute("data-assembly-profile-schema", "custom_millwork.assembly_profile.v1");
      await expect(restoredCabinet).toHaveAttribute("data-assembly-profile-placement-kind", "built_in_wall");
      await expect(restoredCabinet).toHaveAttribute("data-assembly-profile-complexity", "moderate");
      const restoredProjectSchedule = page.getByTestId("project-millwork-schedule");
      await expect(restoredProjectSchedule).toHaveAttribute("data-schema", "custom_millwork.project_schedule.v1");
      await expect(restoredProjectSchedule).toHaveAttribute("data-asset-count", "1");
      await expect(restoredProjectSchedule).toHaveAttribute("data-edge-banding-total-m", "32.23");
      const restoredProjectReadiness = page.getByTestId("project-millwork-readiness");
      await expect(restoredProjectReadiness).toHaveAttribute("data-schema", "custom_millwork.project_handoff_package.v1");
      await expect(restoredProjectReadiness).toHaveAttribute("data-handoff-status", "needs_review");
      await expect(restoredProjectReadiness).toHaveAttribute("data-scope-schema", "custom_millwork.project_scope.v1");
      await expect(restoredProjectReadiness).toHaveAttribute("data-quote-status", "needs_supplier_quote");
      await expect(restoredProjectReadiness).toHaveAttribute("data-purchase-readiness", "needs_quote");
      await expect(restoredProjectReadiness).toHaveAttribute("data-fabrication-release-status", "needs_review");
      await expect(restoredProjectReadiness).toHaveAttribute("data-installation-readiness", "needs_review");
      await expect(restoredCabinet).toHaveAttribute("data-asset-manifest-schema", "custom_millwork.asset_manifest.v1");
      await expect(restoredCabinet).toHaveAttribute("data-asset-manifest-source-definition-version", "1");
      await expect(restoredCabinet).toHaveAttribute("data-generated-output-kind", "glb");
      await expect(restoredCabinet).toHaveAttribute("data-position", beforePosition!);
      await expect(restoredCabinet).toHaveAttribute("data-rotation-y", beforeRotation!);
      await expect(restoredCabinet).toHaveAttribute("data-transform-position", beforePosition!);
      await expect(restoredCabinet).toHaveAttribute("data-transform-rotation-y", beforeRotation!);
      await expect(restoredCabinet).toHaveAttribute("data-asset-manifest-transform-position", beforePosition!);
      await expect(restoredCabinet).toHaveAttribute("data-asset-manifest-transform-rotation-y", beforeRotation!);
    });

    test("placed millwork can be repositioned by dragging it in the 3D canvas", async ({
      page,
    }) => {
      const { placedCabinet, beforePosition } = await placeCabinetRun(page);
      const sceneCanvases = page.getByTestId("scene-canvas");
      await expect(sceneCanvases).toHaveCount(1);
      const sceneCanvas = sceneCanvases.first();
      const canvasBox = await sceneCanvas.boundingBox();
      expect(canvasBox).toBeTruthy();

      const startX = canvasBox!.x + canvasBox!.width * 0.5;
      const startY = canvasBox!.y + canvasBox!.height * 0.45;
      await page.mouse.move(startX, startY);
      await page.mouse.down();
      await page.mouse.move(startX - 90, startY + 30, { steps: 8 });
      await page.mouse.up();

      await expect(placedCabinet).not.toHaveAttribute(
        "data-position",
        beforePosition
      );
      const draggedPosition = await placedCabinet.getAttribute("data-position");
      expect(draggedPosition).toBeTruthy();
      await expect(placedCabinet).toHaveAttribute(
        "data-transform-position",
        draggedPosition!
      );
      await expect(placedCabinet).toHaveAttribute(
        "data-asset-manifest-transform-position",
        draggedPosition!
      );
    });

    test("placed cabinet identity and transform stay consistent between 2D and 3D", async ({
      page,
    }) => {
      const { placedCabinet, instanceId, beforePosition, beforeRotation } =
        await placeCabinetRun(page);
      const layoutDebug = page.getByTestId("qa-design-layout-debug");

      await expect(layoutDebug).toHaveAttribute("data-view-mode", "3d");
      await expect(placedCabinet).toHaveAttribute("data-instance-id", instanceId);
      await expect(placedCabinet).toHaveAttribute("data-position", beforePosition);
      await expect(placedCabinet).toHaveAttribute("data-rotation-y", beforeRotation);

      await page.getByRole("button", { name: "2D Plan", exact: true }).click();
      await expect(layoutDebug).toHaveAttribute("data-view-mode", "2d");
      await expect(layoutDebug).toHaveAttribute("data-plan-2d-camera-valid", "true");
      await expect(page.getByTestId("scene-canvas").first()).toHaveAttribute(
        "data-plan-2d-camera-valid",
        "true"
      );
      await expect(placedCabinet).toHaveAttribute("data-instance-id", instanceId);
      await expect(placedCabinet).toHaveAttribute("data-position", beforePosition);
      await expect(placedCabinet).toHaveAttribute("data-rotation-y", beforeRotation);
      await expect(placedCabinet).toHaveAttribute("data-transform-position", beforePosition);
      await expect(placedCabinet).toHaveAttribute("data-transform-rotation-y", beforeRotation);

      await page.getByRole("button", { name: "3D", exact: true }).click();
      await expect(layoutDebug).toHaveAttribute("data-view-mode", "3d");
      await expect(placedCabinet).toHaveAttribute("data-instance-id", instanceId);
      await expect(placedCabinet).toHaveAttribute("data-position", beforePosition);
      await expect(placedCabinet).toHaveAttribute("data-rotation-y", beforeRotation);
      await expect(placedCabinet).toHaveAttribute("data-transform-position", beforePosition);
      await expect(placedCabinet).toHaveAttribute("data-transform-rotation-y", beforeRotation);
    });

  });
}
