import { test, expect } from "../fixtures";
import { dismissBlockingPrompt, mockPlan, openDetailedProStudio } from "./helpers";

export function registerDetailedTests() {
  test.describe("Custom Millwork Studio detailed", () => {
    test.setTimeout(600000);

    test("Pro designer can enter Detailed mode and validate the template catalog", async ({
      page,
    }) => {
      await mockPlan(page, "pro");
      await page.goto("/design?mode=designer");

      const commandBar = page.getByTestId("editor-command-bar");
      const workspaceTrigger = commandBar.getByTestId("editor-command-workspace");
      await expect(workspaceTrigger).toBeVisible({ timeout: 30000 });
      await dismissBlockingPrompt(page);
      await workspaceTrigger.click();
      const workflow = commandBar.getByTestId("editor-command-workspace-menu");
      const openStudio = commandBar.getByTestId("open-custom-millwork-studio");
      await expect(openStudio).toBeVisible();
      await expect(openStudio).toContainText("Millwork");
      await expect(page.getByTestId("open-custom-millwork-studio")).toHaveCount(1);
      await expect(page.getByTestId("design-controls-panel").getByTestId("open-custom-millwork-studio")).toHaveCount(0);
      await expect(workflow.locator("button")).toHaveCount(6);
      await expect(workflow.locator("button").nth(0)).toHaveAttribute("data-testid", "editor-workflow-plan");
      await expect(workflow.locator("button").nth(1)).toHaveAttribute("data-testid", "editor-workflow-millwork");
      await expect(workflow.locator("button").nth(2)).toHaveAttribute("data-testid", "editor-workflow-furnish");
      await openStudio.click();

      await expect(page.getByTestId("custom-millwork-studio")).toBeVisible({ timeout: 15000 });
      await expect(page.getByTestId("editor-workflow-millwork")).toHaveAttribute("data-active", "true");
      await expect(page.getByTestId("editor-workflow-plan")).toHaveAttribute("data-active", "false");
      await expect(page.getByRole("heading", { name: "Custom Millwork Studio" })).toBeVisible();
      await expect(page.getByTestId("custom-millwork-studio")).toHaveAttribute("data-experience", "guided");
      await expect(page.getByTestId("cabinet-template-search")).toBeVisible();
      await page.getByTestId("cabinet-template-search").fill("wardrobe");
      await expect(page.getByTestId("cabinet-preset-wardrobe")).toBeVisible();
      await page.getByTestId("cabinet-template-search").fill("");
      await page.getByTestId("cabinet-experience-detailed").click();
      await expect(page.getByTestId("custom-millwork-studio")).toHaveAttribute("data-experience", "detailed");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-validation-policy", "errors_block_warnings_allow");
      await page.getByTestId("cabinet-module-options-toggle").click();
      await expect(page.getByTestId("cabinet-module-options")).toBeVisible();
      await page.getByTestId("cabinet-property-search-input").fill("plinth recess");
      const toeKickSearchResult = page
        .getByTestId("cabinet-property-search-result")
        .filter({ hasText: "Floor-base setback" });
      await expect(toeKickSearchResult).toBeVisible();
      await toeKickSearchResult.click();
      await expect(page.getByTestId("cabinet-input-toe-kick-setback")).toBeFocused();
      await page.getByTestId("cabinet-property-search-input").fill("custom shelf heights");
      const shelfSpacingSearchResult = page.locator(
        '[data-testid="cabinet-property-search-result"][data-property-id="module.shelfPositionsMm"]'
      );
      await expect(shelfSpacingSearchResult).toBeVisible();
      await shelfSpacingSearchResult.click();
      await expect(page.getByTestId("cabinet-shelf-spacing-custom")).toBeFocused();
      await page.getByTestId("cabinet-property-search-input").fill("");
      await expect(page.getByTestId("cabinet-overall-dimension-handles")).toBeVisible();
      await expect(page.getByTestId("cabinet-output-tabs")).toBeVisible();
      const issuesTab = page.getByTestId("cabinet-output-tab-issues");
      const bomTab = page.getByTestId("cabinet-output-tab-bom");
      await issuesTab.focus();
      await issuesTab.press("ArrowRight");
      await expect(bomTab).toBeFocused();
      await expect(bomTab).toHaveAttribute("aria-selected", "true");
      await bomTab.press("Home");
      await expect(page.getByTestId("cabinet-output-tab-overview")).toBeFocused();
      await page.getByTestId("cabinet-output-tab-overview").press("End");
      await expect(page.getByTestId("cabinet-output-tab-outputs")).toBeFocused();
      await issuesTab.click();
      for (const preset of [
        "base",
        "wall",
        "tall",
        "vanity",
        "cabinet_run",
        "media_wall",
        "murphy_bed",
        "fold_down_desk",
        "platform_storage_bed",
        "under_stair_storage",
        "room_divider_storage",
        "mudroom_storage",
        "laundry_room",
        "home_office_built_in",
        "library_wall",
        "window_seat",
        "banquette",
        "home_bar",
        "kitchen_island",
        "pantry_system",
        "wine_storage",
        "pet_built_in",
        "kids_storage",
        "hobby_storage",
        "wall_paneling",
        "ceiling_beams",
        "coffered_ceiling",
        "fireplace_surround",
        "trim_package",
      ]) {
        await page.getByTestId(`cabinet-preset-${preset}`).click();
        await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      }
    });

    test("Pro designer can configure core and architectural construction controls", async ({
      page,
    }) => {
      await openDetailedProStudio(page);
      await page.getByTestId("cabinet-preset-base").click();
      await expect(page.getByTestId("cabinet-input-drawer-box-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-drawer-box-side-thickness")).toHaveValue("12");
      await expect(page.getByTestId("cabinet-input-drawer-box-bottom-thickness")).toHaveValue("6");
      await expect(page.getByTestId("cabinet-input-drawer-box-height-clearance")).toHaveValue("45");
      await expect(page.getByTestId("cabinet-input-drawer-box-back-clearance")).toHaveValue("20");
      await page.getByTestId("cabinet-input-drawer-box-side-thickness").fill("13");
      await page.getByTestId("cabinet-input-drawer-box-bottom-thickness").fill("9");
      await page.getByTestId("cabinet-input-drawer-box-height-clearance").fill("50");
      await page.getByTestId("cabinet-input-drawer-box-back-clearance").fill("25");
      await expect(page.getByTestId("cabinet-input-drawer-box-side-thickness")).toHaveValue("13");
      await expect(page.getByTestId("cabinet-input-drawer-slide-hardware-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-drawer-slide-length")).toHaveValue("500");
      await expect(page.getByTestId("cabinet-input-drawer-slide-clearance")).toHaveValue("13");
      await page.getByTestId("cabinet-input-drawer-slide-length").fill("480");
      await page.getByTestId("cabinet-input-drawer-slide-clearance").fill("15");
      await expect(page.getByTestId("cabinet-input-drawer-slide-length")).toHaveValue("480");
      await expect(page.getByTestId("cabinet-input-drawer-slide-clearance")).toHaveValue("15");
      await expect(page.getByTestId("cabinet-handle-placement-automatic")).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("cabinet-handle-placement-custom").click();
      await page.getByTestId("cabinet-input-handle-offset-x").fill("25");
      await page.getByTestId("cabinet-input-handle-offset-x").press("Enter");
      await page.getByTestId("cabinet-input-handle-offset-y").fill("-15");
      await page.getByTestId("cabinet-input-handle-offset-y").press("Enter");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByTestId("cabinet-handle-placement-automatic").click();
      await expect(page.getByTestId("cabinet-input-handle-offset-x")).toBeHidden();
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByTestId("cabinet-preset-wall").click();
      await expect(page.getByTestId("cabinet-input-installation-cleat-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-installation-cleat-height")).toHaveValue("80");
      await expect(page.getByTestId("cabinet-input-installation-cleat-thickness")).toHaveValue("18");
      await expect(page.getByTestId("cabinet-input-installation-cleat-inset")).toHaveValue("70");
      await page.getByTestId("cabinet-input-installation-cleat-height").fill("90");
      await page.getByTestId("cabinet-input-installation-cleat-thickness").fill("20");
      await page.getByTestId("cabinet-input-installation-cleat-inset").fill("75");
      await expect(page.getByTestId("cabinet-input-installation-cleat-height")).toHaveValue("90");
      await expect(page.getByTestId("cabinet-input-door-hinge-hardware-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-door-hinge-count")).toHaveValue("2");
      await expect(page.getByTestId("cabinet-input-door-hinge-inset")).toHaveValue("90");
      await page.getByTestId("cabinet-input-door-hinge-count").fill("3");
      await page.getByTestId("cabinet-input-door-hinge-inset").fill("110");
      await expect(page.getByTestId("cabinet-input-door-hinge-count")).toHaveValue("3");
      await expect(page.getByTestId("cabinet-input-door-hinge-inset")).toHaveValue("110");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByTestId("cabinet-preset-tall").click();
      await expect(page.getByTestId("cabinet-input-anti-tip-anchor-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-anti-tip-anchor-count")).toHaveValue("2");
      await expect(page.getByTestId("cabinet-input-anti-tip-anchor-height")).toHaveValue("2020");
      await expect(page.getByTestId("cabinet-input-anti-tip-anchor-inset")).toHaveValue("90");
      await page.getByTestId("cabinet-input-anti-tip-anchor-count").fill("1");
      await page.getByTestId("cabinet-input-anti-tip-anchor-height").fill("2000");
      await page.getByTestId("cabinet-input-anti-tip-anchor-inset").fill("100");
      await expect(page.getByTestId("cabinet-input-anti-tip-anchor-count")).toHaveValue("1");
      await expect(page.getByTestId("cabinet-input-anti-tip-anchor-height")).toHaveValue("2000");
      await expect(page.getByTestId("cabinet-input-anti-tip-anchor-inset")).toHaveValue("100");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByTestId("cabinet-preset-vanity").click();
      await expect(page.getByTestId("cabinet-input-sink-cutout-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-sink-cutout-width")).toHaveValue("480");
      await expect(page.getByTestId("cabinet-input-sink-cutout-depth")).toHaveValue("340");
      await expect(page.getByTestId("cabinet-input-sink-cutout-offset-x")).toHaveValue("0");
      await expect(page.getByTestId("cabinet-input-sink-cutout-offset-z")).toHaveValue("250");
      await expect(page.getByTestId("cabinet-input-plumbing-chase-width")).toHaveValue("360");
      await expect(page.getByTestId("cabinet-input-plumbing-chase-height")).toHaveValue("420");
      await expect(page.getByTestId("cabinet-input-plumbing-chase-depth")).toHaveValue("90");
      await page.getByTestId("cabinet-input-sink-cutout-width").fill("460");
      await page.getByTestId("cabinet-input-sink-cutout-depth").fill("320");
      await page.getByTestId("cabinet-input-sink-cutout-offset-z").fill("240");
      await page.getByTestId("cabinet-input-plumbing-chase-width").fill("340");
      await page.getByTestId("cabinet-input-plumbing-chase-height").fill("400");
      await page.getByTestId("cabinet-input-plumbing-chase-depth").fill("100");
      await expect(page.getByTestId("cabinet-input-sink-cutout-width")).toHaveValue("460");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByTestId("cabinet-preset-slat_wall").click();
      await page.getByTestId("cabinet-input-slats").fill("3");
      await page.getByTestId("cabinet-input-slat-width").fill("32");
      await page.getByTestId("cabinet-input-slat-depth").fill("38");
      await page.getByTestId("cabinet-input-slat-spacing").fill("24");
      await expect(page.getByTestId("cabinet-input-slats")).toHaveValue("3");
      await page.getByTestId("cabinet-preset-wall_paneling").click();
      await page.getByTestId("cabinet-input-panel-columns").fill("2");
      await page.getByTestId("cabinet-input-panel-rows").fill("1");
      await page.getByTestId("cabinet-input-panel-frame-width").fill("55");
      await page.getByTestId("cabinet-input-panel-frame-depth").fill("18");
      await expect(page.getByTestId("cabinet-input-panel-columns")).toHaveValue("2");
      await page.getByTestId("cabinet-preset-ceiling_beams").click();
      await expect(page.getByTestId("cabinet-input-component-type")).toHaveValue("ceiling_beam_array");
      await expect(page.getByTestId("cabinet-input-ceiling-beams")).toHaveValue("4");
      await page.getByTestId("cabinet-input-ceiling-beams").fill("3");
      await page.getByTestId("cabinet-input-ceiling-beam-width").fill("150");
      await page.getByTestId("cabinet-input-ceiling-beam-depth").fill("180");
      await page.getByTestId("cabinet-input-ceiling-beam-orientation").selectOption("z");
      await expect(page.getByTestId("cabinet-input-ceiling-beams")).toHaveValue("3");
      await page.getByTestId("cabinet-preset-coffered_ceiling").click();
      await expect(page.getByTestId("cabinet-input-component-type")).toHaveValue("coffered_ceiling_grid");
      await page.getByTestId("cabinet-input-ceiling-grid-columns").fill("3");
      await page.getByTestId("cabinet-input-ceiling-grid-rows").fill("3");
      await expect(page.getByTestId("cabinet-input-ceiling-grid-columns")).toHaveValue("3");
      await page.getByTestId("cabinet-preset-trim_package").click();
      await expect(page.getByTestId("cabinet-input-component-type")).toHaveValue("trim_run");
      await page.getByTestId("cabinet-input-trim-members").fill("4");
      await page.getByTestId("cabinet-input-trim-profile-width").fill("160");
      await page.getByTestId("cabinet-input-trim-profile-depth").fill("24");
      await page.getByTestId("cabinet-input-trim-orientation").selectOption("x");
      await expect(page.getByTestId("cabinet-input-trim-placement")).toHaveValue("baseboard");
      await page.getByTestId("cabinet-input-trim-placement").selectOption("baseboard");
      await page.getByTestId("cabinet-input-trim-setout-height").fill("0");
      await expect(page.getByTestId("cabinet-input-trim-left-end-treatment")).toHaveValue("butt");
      await expect(page.getByTestId("cabinet-input-trim-right-end-treatment")).toHaveValue("butt");
      await page.getByTestId("cabinet-input-trim-left-end-treatment").selectOption("mitered_return");
      await page.getByTestId("cabinet-input-trim-right-end-treatment").selectOption("mitered_return");
      await page.getByTestId("cabinet-input-trim-return-depth").fill("120");
      await page.getByTestId("cabinet-input-trim-miter-angle").fill("45");
      await page.getByTestId("cabinet-input-trim-reveal-strip-enabled").check();
      await page.getByTestId("cabinet-input-trim-reveal-strip-height").fill("22");
      await page.getByTestId("cabinet-input-trim-reveal-strip-depth").fill("14");
      await page.getByTestId("cabinet-input-trim-reveal-strip-inset").fill("8");
      await expect(page.getByTestId("cabinet-input-trim-members")).toHaveValue("4");
      await expect(page.getByTestId("cabinet-input-trim-setout-height")).toHaveValue("0");
      await expect(page.getByTestId("cabinet-input-trim-return-depth")).toHaveValue("120");
      await expect(page.getByTestId("cabinet-input-trim-miter-angle")).toHaveValue("45");
      await expect(page.getByTestId("cabinet-input-trim-reveal-strip-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-trim-reveal-strip-depth")).toHaveValue("14");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByTestId("cabinet-preset-fireplace_surround").click();
      await expect(page.getByTestId("cabinet-input-component-type")).toHaveValue("fireplace_surround_frame");
      await page.getByTestId("cabinet-input-fireplace-opening-width").fill("1100");
      await page.getByTestId("cabinet-input-fireplace-opening-height").fill("900");
      await page.getByTestId("cabinet-input-fireplace-leg-width").fill("180");
      await page.getByTestId("cabinet-input-fireplace-header-height").fill("220");
      await page.getByTestId("cabinet-input-fireplace-mantel-height").fill("120");
      await page.getByTestId("cabinet-input-fireplace-mantel-depth").fill("300");
      await expect(page.getByTestId("cabinet-input-fireplace-mantel-depth")).toHaveValue("300");
      await page.getByTestId("cabinet-preset-murphy_bed").click();
      await page.getByTestId("cabinet-module-2").click();
      await expect(page.getByTestId("cabinet-input-component-type")).toHaveValue("wall_bed_panel");
      await page.getByTestId("cabinet-input-convertible-panel-thickness").fill("42");
      await page.getByTestId("cabinet-input-convertible-panel-height").fill("2200");
      await page.getByTestId("cabinet-input-convertible-open-depth").fill("2050");
      await page.getByTestId("cabinet-input-convertible-hinge-height").fill("90");
      await page.getByTestId("cabinet-input-convertible-support-legs").fill("2");
      await page.getByTestId("cabinet-input-convertible-support-leg-width").fill("45");
      await page.getByTestId("cabinet-input-convertible-support-leg-depth").fill("45");
      await expect(page.getByTestId("cabinet-input-convertible-open-depth")).toHaveValue("2050");
      await expect(page.getByTestId("cabinet-wall-bed-mattress-double")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("cabinet-wall-bed-orientation-vertical")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("cabinet-wall-bed-state-closed")).toHaveAttribute("aria-pressed", "true");
      await expect(page.getByTestId("cabinet-wall-bed-clearance-visible")).toBeChecked();
      await expect(page.getByTestId("cabinet-wall-bed-side-storage")).toHaveValue("both");
      for (const [query, label] of [
        ["mattress size", "Wall-bed mattress size"],
        ["bed orientation", "Wall-bed orientation"],
        ["preview state", "Wall-bed preview state"],
        ["floor clearance", "Wall-bed clearance display"],
        ["side storage", "Wall-bed side storage"],
      ] as const) {
        await page.getByTestId("cabinet-property-search-input").fill(query);
        await expect(
          page.getByTestId("cabinet-property-search-result").filter({ hasText: label })
        ).toBeVisible();
      }
      await page.getByTestId("cabinet-property-search-input").fill("mattress size");
      await page
        .getByTestId("cabinet-property-search-result")
        .filter({ hasText: "Wall-bed mattress size" })
        .click();
      await expect(page.getByTestId("cabinet-wall-bed-mattress-double")).toBeFocused();
      await page.getByTestId("cabinet-wall-bed-state-open").click();
      await expect(page.getByTestId("cabinet-wall-bed-state-open")).toHaveAttribute("aria-pressed", "true");
      await page.getByTestId("cabinet-preset-fold_down_desk").click();
      await expect(page.getByTestId("cabinet-input-component-type")).toHaveValue("fold_down_worksurface");
      await page.getByTestId("cabinet-property-search-input").fill("mattress size");
      await expect(page.getByTestId("cabinet-property-search-result")).toHaveCount(0);
      await page.getByTestId("cabinet-property-search-input").fill("");
      await page.getByTestId("cabinet-input-convertible-panel-thickness").fill("30");
      await page.getByTestId("cabinet-input-convertible-panel-height").fill("720");
      await page.getByTestId("cabinet-input-convertible-open-depth").fill("650");
      await page.getByTestId("cabinet-input-convertible-hinge-height").fill("740");
      await expect(page.getByTestId("cabinet-input-convertible-hinge-height")).toHaveValue("740");
    });

    test("Pro designer can configure built-in storage and room-system controls", async ({
      page,
    }) => {
      await openDetailedProStudio(page);
      await page.getByTestId("cabinet-preset-platform_storage_bed").click();
      await expect(page.getByTestId("cabinet-input-module-type")).toHaveValue("base");
      await expect(page.getByTestId("cabinet-input-front-type")).toHaveValue("drawer_stack");
      await expect(page.getByTestId("cabinet-input-platform-deck-thickness")).toHaveValue("24");
      await expect(page.getByTestId("cabinet-input-platform-support-ribs")).toHaveValue("3");
      await page.getByTestId("cabinet-input-platform-deck-thickness").fill("30");
      await page.getByTestId("cabinet-input-platform-deck-overhang-front").fill("30");
      await page.getByTestId("cabinet-input-platform-deck-overhang-back").fill("25");
      await page.getByTestId("cabinet-input-platform-support-ribs").fill("4");
      await page.getByTestId("cabinet-input-platform-support-rib-width").fill("75");
      await page.getByTestId("cabinet-input-platform-support-rib-height").fill("100");
      await expect(page.getByTestId("cabinet-input-platform-support-ribs")).toHaveValue("4");
      await page.getByTestId("cabinet-preset-under_stair_storage").click();
      await page.getByTestId("cabinet-module-2").click();
      await expect(page.getByTestId("cabinet-input-stair-scribe-steps")).toHaveValue("3");
      await expect(page.getByTestId("cabinet-input-stair-scribe-high-height")).toHaveValue("1800");
      await expect(page.getByTestId("cabinet-input-stair-scribe-low-height")).toHaveValue("1500");
      await page.getByTestId("cabinet-input-stair-scribe-steps").fill("4");
      await page.getByTestId("cabinet-input-stair-scribe-high-height").fill("1750");
      await page.getByTestId("cabinet-input-stair-scribe-low-height").fill("1450");
      await page.getByTestId("cabinet-input-stair-scribe-depth").fill("30");
      await page.getByTestId("cabinet-input-stair-scribe-direction").selectOption("rises_right");
      await expect(page.getByTestId("cabinet-input-stair-scribe-direction")).toHaveValue("rises_right");
      await page.getByTestId("cabinet-preset-room_divider_storage").click();
      await expect(page.getByTestId("cabinet-input-room-divider-finished-back")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-room-divider-back-panels")).toHaveValue("2");
      await expect(page.getByTestId("cabinet-input-room-divider-stabilizer-feet")).toHaveValue("2");
      await page.getByTestId("cabinet-input-room-divider-back-panels").fill("3");
      await page.getByTestId("cabinet-input-room-divider-back-panel-thickness").fill("20");
      await page.getByTestId("cabinet-input-room-divider-stabilizer-feet").fill("3");
      await page.getByTestId("cabinet-input-room-divider-stabilizer-foot-width").fill("80");
      await page.getByTestId("cabinet-input-room-divider-stabilizer-foot-height").fill("50");
      await page.getByTestId("cabinet-input-room-divider-stabilizer-foot-depth").fill("340");
      await expect(page.getByTestId("cabinet-input-room-divider-stabilizer-feet")).toHaveValue("3");
      await page.getByTestId("cabinet-preset-mudroom_storage").click();
      await page.getByTestId("cabinet-module-2").click();
      await expect(page.getByTestId("cabinet-input-mudroom-hooks")).toHaveValue("4");
      await expect(page.getByTestId("cabinet-input-mudroom-hook-rail-height")).toHaveValue("1450");
      await expect(page.getByTestId("cabinet-input-mudroom-hook-projection")).toHaveValue("55");
      await expect(page.getByTestId("cabinet-input-shoe-cubbies")).toHaveValue("4");
      await expect(page.getByTestId("cabinet-input-shoe-cubby-height")).toHaveValue("170");
      await expect(page.getByTestId("cabinet-input-shoe-cubby-depth")).toHaveValue("360");
      await expect(page.getByTestId("cabinet-input-shoe-cubby-divider-thickness")).toHaveValue("18");
      await page.getByTestId("cabinet-input-mudroom-hooks").fill("5");
      await page.getByTestId("cabinet-input-mudroom-hook-rail-height").fill("1500");
      await page.getByTestId("cabinet-input-mudroom-hook-projection").fill("60");
      await page.getByTestId("cabinet-input-shoe-cubbies").fill("5");
      await page.getByTestId("cabinet-input-shoe-cubby-height").fill("180");
      await page.getByTestId("cabinet-input-shoe-cubby-depth").fill("370");
      await page.getByTestId("cabinet-input-shoe-cubby-divider-thickness").fill("20");
      await expect(page.getByTestId("cabinet-input-mudroom-hooks")).toHaveValue("5");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByTestId("cabinet-preset-laundry_room").click();
      await page.getByTestId("cabinet-module-2").click();
      await expect(page.getByTestId("cabinet-input-laundry-appliance-bay-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-laundry-appliance-kind")).toHaveValue("washer_dryer");
      await expect(page.getByTestId("cabinet-input-laundry-appliances")).toHaveValue("2");
      await expect(page.getByTestId("cabinet-input-laundry-appliance-width")).toHaveValue("570");
      await expect(page.getByTestId("cabinet-input-laundry-appliance-height")).toHaveValue("850");
      await expect(page.getByTestId("cabinet-input-laundry-appliance-depth")).toHaveValue("560");
      await expect(page.getByTestId("cabinet-input-laundry-appliance-side-clearance")).toHaveValue("20");
      await expect(page.getByTestId("cabinet-input-laundry-appliance-top-clearance")).toHaveValue("40");
      await expect(page.getByTestId("cabinet-input-laundry-appliance-back-clearance")).toHaveValue("40");
      await expect(page.getByTestId("cabinet-input-laundry-utility-chase-height")).toHaveValue("180");
      await expect(page.getByTestId("cabinet-input-laundry-utility-chase-depth")).toHaveValue("80");
      await page.getByTestId("cabinet-input-laundry-appliance-width").fill("560");
      await page.getByTestId("cabinet-input-laundry-appliance-height").fill("840");
      await page.getByTestId("cabinet-input-laundry-appliance-depth").fill("550");
      await page.getByTestId("cabinet-input-laundry-appliance-side-clearance").fill("25");
      await page.getByTestId("cabinet-input-laundry-appliance-top-clearance").fill("45");
      await page.getByTestId("cabinet-input-laundry-appliance-back-clearance").fill("45");
      await page.getByTestId("cabinet-input-laundry-utility-chase-height").fill("200");
      await page.getByTestId("cabinet-input-laundry-utility-chase-depth").fill("90");
      await expect(page.getByTestId("cabinet-input-laundry-appliance-width")).toHaveValue("560");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByTestId("cabinet-preset-home_office_built_in").click();
      await page.getByTestId("cabinet-module-2").click();
      await expect(page.getByTestId("cabinet-input-office-worksurface-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-office-worksurface-thickness")).toHaveValue("36");
      await expect(page.getByTestId("cabinet-input-office-worksurface-depth")).toHaveValue("650");
      await expect(page.getByTestId("cabinet-input-office-worksurface-overhang-front")).toHaveValue("100");
      await expect(page.getByTestId("cabinet-input-cable-grommets")).toHaveValue("3");
      await expect(page.getByTestId("cabinet-input-cable-grommet-diameter")).toHaveValue("80");
      await expect(page.getByTestId("cabinet-input-cable-grommet-offset-from-back")).toHaveValue("110");
      await expect(page.getByTestId("cabinet-input-desk-power-chase-height")).toHaveValue("120");
      await expect(page.getByTestId("cabinet-input-desk-power-chase-depth")).toHaveValue("60");
      await page.getByTestId("cabinet-input-office-worksurface-thickness").fill("38");
      await page.getByTestId("cabinet-input-office-worksurface-depth").fill("660");
      await page.getByTestId("cabinet-input-office-worksurface-overhang-front").fill("110");
      await page.getByTestId("cabinet-input-cable-grommets").fill("2");
      await page.getByTestId("cabinet-input-cable-grommet-diameter").fill("90");
      await page.getByTestId("cabinet-input-cable-grommet-offset-from-back").fill("120");
      await page.getByTestId("cabinet-input-desk-power-chase-height").fill("130");
      await page.getByTestId("cabinet-input-desk-power-chase-depth").fill("70");
      await expect(page.getByTestId("cabinet-input-office-worksurface-thickness")).toHaveValue("38");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByTestId("cabinet-preset-media_wall").click();
      await page.getByTestId("cabinet-module-2").click();
      await expect(page.getByTestId("cabinet-input-media-wall-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-media-tv-opening-width")).toHaveValue("1400");
      await expect(page.getByTestId("cabinet-input-media-tv-opening-height")).toHaveValue("850");
      await expect(page.getByTestId("cabinet-input-media-tv-mount-height")).toHaveValue("1200");
      await expect(page.getByTestId("cabinet-input-media-tv-blocking-thickness")).toHaveValue("18");
      await expect(page.getByTestId("cabinet-input-media-cable-chase-width")).toHaveValue("120");
      await expect(page.getByTestId("cabinet-input-media-cable-chase-height")).toHaveValue("700");
      await expect(page.getByTestId("cabinet-input-media-cable-chase-depth")).toHaveValue("60");
      await expect(page.getByTestId("cabinet-input-media-vent-slots")).toHaveValue("4");
      await expect(page.getByTestId("cabinet-input-media-vent-slot-width")).toHaveValue("220");
      await expect(page.getByTestId("cabinet-input-media-vent-slot-height")).toHaveValue("24");
      await expect(page.getByTestId("cabinet-input-media-vent-slot-spacing")).toHaveValue("24");
      await page.getByTestId("cabinet-input-media-tv-opening-width").fill("1500");
      await page.getByTestId("cabinet-input-media-tv-opening-height").fill("820");
      await page.getByTestId("cabinet-input-media-tv-mount-height").fill("1250");
      await page.getByTestId("cabinet-input-media-cable-chase-width").fill("140");
      await page.getByTestId("cabinet-input-media-cable-chase-height").fill("680");
      await page.getByTestId("cabinet-input-media-cable-chase-depth").fill("70");
      await page.getByTestId("cabinet-input-media-vent-slots").fill("3");
      await page.getByTestId("cabinet-input-media-vent-slot-width").fill("240");
      await page.getByTestId("cabinet-input-media-vent-slot-height").fill("26");
      await page.getByTestId("cabinet-input-media-vent-slot-spacing").fill("30");
      await expect(page.getByTestId("cabinet-input-media-tv-opening-width")).toHaveValue("1500");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByTestId("cabinet-preset-library_wall").click();
      await page.getByTestId("cabinet-module-1").click();
      await expect(page.getByTestId("cabinet-input-library-ladder-rail-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-library-ladder-rail-height")).toHaveValue("2140");
      await expect(page.getByTestId("cabinet-input-library-ladder-rail-diameter")).toHaveValue("32");
      await expect(page.getByTestId("cabinet-input-library-ladder-rail-projection")).toHaveValue("55");
      await expect(page.getByTestId("cabinet-input-library-ladder-standoffs")).toHaveValue("3");
      await expect(page.getByTestId("cabinet-input-library-ladder-standoff-diameter")).toHaveValue("28");
      await expect(page.getByTestId("cabinet-input-lighting-channel-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-lighting-channel-count")).toHaveValue("3");
      await expect(page.getByTestId("cabinet-input-lighting-channel-depth")).toHaveValue("18");
      await expect(page.getByTestId("cabinet-input-lighting-channel-height")).toHaveValue("8");
      await expect(page.getByTestId("cabinet-input-lighting-channel-inset")).toHaveValue("45");
      await expect(page.getByTestId("cabinet-input-shelf-pin-rows-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-shelf-pin-row-pairs")).toHaveValue("2");
      await expect(page.getByTestId("cabinet-input-shelf-pin-holes")).toHaveValue("12");
      await expect(page.getByTestId("cabinet-input-shelf-pin-spacing")).toHaveValue("32");
      await expect(page.getByTestId("cabinet-input-shelf-pin-inset")).toHaveValue("55");
      await expect(page.getByTestId("cabinet-input-shelf-pin-start-height")).toHaveValue("300");
      await page.getByTestId("cabinet-input-library-ladder-rail-height").fill("2160");
      await page.getByTestId("cabinet-input-library-ladder-rail-diameter").fill("34");
      await page.getByTestId("cabinet-input-library-ladder-rail-projection").fill("60");
      await page.getByTestId("cabinet-input-library-ladder-standoffs").fill("4");
      await page.getByTestId("cabinet-input-library-ladder-standoff-diameter").fill("30");
      await page.getByTestId("cabinet-input-lighting-channel-count").fill("4");
      await page.getByTestId("cabinet-input-lighting-channel-depth").fill("20");
      await page.getByTestId("cabinet-input-lighting-channel-height").fill("10");
      await page.getByTestId("cabinet-input-lighting-channel-inset").fill("50");
      await page.getByTestId("cabinet-input-shelf-pin-row-pairs").fill("2");
      await page.getByTestId("cabinet-input-shelf-pin-holes").fill("10");
      await page.getByTestId("cabinet-input-shelf-pin-spacing").fill("40");
      await page.getByTestId("cabinet-input-shelf-pin-inset").fill("60");
      await page.getByTestId("cabinet-input-shelf-pin-start-height").fill("320");
      await expect(page.getByTestId("cabinet-input-library-ladder-standoffs")).toHaveValue("4");
      await expect(page.getByTestId("cabinet-input-lighting-channel-count")).toHaveValue("4");
      await expect(page.getByTestId("cabinet-input-shelf-pin-spacing")).toHaveValue("40");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
    });

    test("Pro designer can configure lifestyle, hospitality, and seating controls", async ({
      page,
    }) => {
      await openDetailedProStudio(page);
      await page.getByTestId("cabinet-preset-pet_built_in").click();
      await page.getByTestId("cabinet-module-2").click();
      await expect(page.getByTestId("cabinet-input-lifestyle-insert-kind")).toHaveValue("pet_bed");
      await expect(page.getByTestId("cabinet-input-lifestyle-insert-count")).toHaveValue("1");
      await page.getByTestId("cabinet-input-lifestyle-insert-depth").fill("430");
      await page.getByTestId("cabinet-input-lifestyle-insert-deck-height").fill("30");
      await page.getByTestId("cabinet-input-lifestyle-insert-lip-height").fill("90");
      await expect(page.getByTestId("cabinet-input-lifestyle-insert-depth")).toHaveValue("430");
      await page.getByTestId("cabinet-preset-kids_storage").click();
      await expect(page.getByTestId("cabinet-input-lifestyle-insert-kind")).toHaveValue("toy_bin");
      await page.getByTestId("cabinet-input-lifestyle-insert-count").fill("3");
      await expect(page.getByTestId("cabinet-input-lifestyle-insert-count")).toHaveValue("3");
      await page.getByTestId("cabinet-preset-hobby_storage").click();
      await page.getByTestId("cabinet-module-3").click();
      await expect(page.getByTestId("cabinet-input-lifestyle-insert-kind")).toHaveValue("hobby_tray");
      await page.getByTestId("cabinet-input-lifestyle-insert-lip-height").fill("75");
      await expect(page.getByTestId("cabinet-input-lifestyle-insert-lip-height")).toHaveValue("75");
      await page.getByTestId("cabinet-preset-wine_storage").click();
      await page.getByTestId("cabinet-module-2").click();
      await expect(page.getByTestId("cabinet-input-wine-rack-columns")).toHaveValue("3");
      await expect(page.getByTestId("cabinet-input-wine-rack-rows")).toHaveValue("6");
      await expect(page.getByTestId("cabinet-input-wine-rack-depth")).toHaveValue("420");
      await expect(page.getByTestId("cabinet-input-wine-rack-divider-thickness")).toHaveValue("18");
      await page.getByTestId("cabinet-input-wine-rack-columns").fill("4");
      await page.getByTestId("cabinet-input-wine-rack-rows").fill("5");
      await page.getByTestId("cabinet-input-wine-rack-depth").fill("410");
      await page.getByTestId("cabinet-input-wine-rack-divider-thickness").fill("20");
      await expect(page.getByTestId("cabinet-input-wine-rack-columns")).toHaveValue("4");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByTestId("cabinet-preset-home_bar").click();
      await page.getByTestId("cabinet-module-1").click();
      await expect(page.getByTestId("cabinet-input-stemware-rack-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-stemware-rack-lanes")).toHaveValue("3");
      await expect(page.getByTestId("cabinet-input-stemware-rack-depth")).toHaveValue("360");
      await expect(page.getByTestId("cabinet-input-stemware-rack-rail-width")).toHaveValue("14");
      await expect(page.getByTestId("cabinet-input-stemware-rack-lane-spacing")).toHaveValue("70");
      await expect(page.getByTestId("cabinet-input-stemware-rack-mount-height")).toHaveValue("1760");
      await page.getByTestId("cabinet-input-stemware-rack-lanes").fill("4");
      await page.getByTestId("cabinet-input-stemware-rack-depth").fill("340");
      await page.getByTestId("cabinet-input-stemware-rack-rail-width").fill("16");
      await page.getByTestId("cabinet-input-stemware-rack-lane-spacing").fill("75");
      await page.getByTestId("cabinet-input-stemware-rack-mount-height").fill("1740");
      await expect(page.getByTestId("cabinet-input-stemware-rack-lanes")).toHaveValue("4");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByTestId("cabinet-module-3").click();
      await expect(page.getByTestId("cabinet-input-wine-rack-columns")).toHaveValue("2");
      await expect(page.getByTestId("cabinet-input-wine-rack-rows")).toHaveValue("4");
      await expect(page.getByTestId("cabinet-input-wine-rack-depth")).toHaveValue("460");
      await page.getByTestId("cabinet-preset-kitchen_island").click();
      await page.getByRole("button", { name: /Advanced/i }).click();
      await expect(page.getByTestId("cabinet-input-countertop-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-countertop-thickness")).toHaveValue("38");
      await expect(page.getByTestId("cabinet-input-countertop-overhang-back")).toHaveValue("320");
      await expect(page.getByTestId("cabinet-input-island-seating-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-island-seating-overhang-depth")).toHaveValue("320");
      await expect(page.getByTestId("cabinet-input-island-support-panels")).toHaveValue("3");
      await expect(page.getByTestId("cabinet-input-island-support-panel-thickness")).toHaveValue("36");
      await expect(page.getByTestId("cabinet-input-island-support-panel-depth")).toHaveValue("260");
      await expect(page.getByTestId("cabinet-input-island-support-panel-end-inset")).toHaveValue("180");
      await page.getByTestId("cabinet-input-island-seating-overhang-depth").fill("330");
      await page.getByTestId("cabinet-input-island-support-panels").fill("4");
      await page.getByTestId("cabinet-input-island-support-panel-thickness").fill("40");
      await page.getByTestId("cabinet-input-island-support-panel-depth").fill("250");
      await page.getByTestId("cabinet-input-island-support-panel-end-inset").fill("190");
      await expect(page.getByTestId("cabinet-input-island-support-panels")).toHaveValue("4");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByRole("button", { name: /Advanced/i }).click();
      await page.getByTestId("cabinet-preset-pantry_system").click();
      await page.getByTestId("cabinet-module-1").click();
      await expect(page.getByTestId("cabinet-input-pantry-pullouts-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-pantry-pullout-trays")).toHaveValue("4");
      await expect(page.getByTestId("cabinet-input-pantry-pullout-tray-depth")).toHaveValue("520");
      await expect(page.getByTestId("cabinet-input-pantry-pullout-front-height")).toHaveValue("70");
      await expect(page.getByTestId("cabinet-input-pantry-pullout-slide-clearance")).toHaveValue("35");
      await page.getByTestId("cabinet-input-pantry-pullout-trays").fill("5");
      await page.getByTestId("cabinet-input-pantry-pullout-tray-depth").fill("500");
      await page.getByTestId("cabinet-input-pantry-pullout-front-height").fill("80");
      await page.getByTestId("cabinet-input-pantry-pullout-slide-clearance").fill("40");
      await expect(page.getByTestId("cabinet-input-pantry-pullout-trays")).toHaveValue("5");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByTestId("cabinet-preset-window_seat").click();
      await expect(page.getByTestId("cabinet-input-seat-deck-thickness")).toHaveValue("24");
      await expect(page.getByTestId("cabinet-input-seat-cushion-thickness")).toHaveValue("75");
      await expect(page.getByTestId("cabinet-input-seat-cushion-depth")).toHaveValue("540");
      await expect(page.getByTestId("cabinet-input-seat-cushion-overhang-front")).toHaveValue("20");
      await page.getByTestId("cabinet-input-seat-cushion-thickness").fill("80");
      await page.getByTestId("cabinet-input-seat-cushion-depth").fill("550");
      await expect(page.getByTestId("cabinet-input-seat-cushion-thickness")).toHaveValue("80");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByTestId("cabinet-preset-banquette").click();
      await expect(page.getByTestId("cabinet-input-seat-back-height")).toHaveValue("420");
      await expect(page.getByTestId("cabinet-input-seat-back-thickness")).toHaveValue("24");
      await page.getByTestId("cabinet-input-seat-back-height").fill("440");
      await page.getByTestId("cabinet-input-seat-back-thickness").fill("26");
      await expect(page.getByTestId("cabinet-input-seat-back-height")).toHaveValue("440");
      await page.getByTestId("cabinet-preset-wardrobe").click();
      await page.getByTestId("cabinet-input-hanging-rods").fill("1");
      await page.getByTestId("cabinet-input-hanging-rod-height").fill("1500");
      await page.getByTestId("cabinet-input-hanging-rod-spacing").fill("800");
      await expect(page.getByTestId("cabinet-input-hanging-rods")).toHaveValue("1");
      await expect(page.getByTestId("cabinet-input-hamper-pullout-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-hamper-baskets")).toHaveValue("2");
      await expect(page.getByTestId("cabinet-input-hamper-basket-depth")).toHaveValue("520");
      await expect(page.getByTestId("cabinet-input-hamper-basket-height")).toHaveValue("360");
      await expect(page.getByTestId("cabinet-input-hamper-slide-clearance")).toHaveValue("35");
      await page.getByTestId("cabinet-input-hamper-baskets").fill("1");
      await page.getByTestId("cabinet-input-hamper-basket-depth").fill("500");
      await page.getByTestId("cabinet-input-hamper-basket-height").fill("340");
      await page.getByTestId("cabinet-input-hamper-slide-clearance").fill("40");
      await expect(page.getByTestId("cabinet-input-hamper-baskets")).toHaveValue("1");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-warning-count", /[1-9]\d*/);
    });

    test("Pro designer can configure detailed base-cabinet construction options", async ({
      page,
    }) => {
      await openDetailedProStudio(page);
      await page.getByTestId("cabinet-preset-base").click();
      await expect(page.getByTestId("cabinet-input-module-type")).toHaveValue("base");
      await page.getByTestId("cabinet-input-module-type").selectOption("wall");
      await expect(page.getByTestId("cabinet-input-module-type")).toHaveValue("wall");
      await page.getByTestId("cabinet-input-module-type").selectOption("base");
      await page.getByTestId("cabinet-input-dividers").fill("2");
      await expect(page.getByTestId("cabinet-input-dividers")).toHaveValue("2");
      await page.getByTestId("cabinet-input-front-type").selectOption("single_door");
      await page.getByTestId("cabinet-door-layout-manual").click();
      await page.getByTestId("cabinet-input-doors").fill("1");
      await page.getByTestId("cabinet-input-hinge-side").selectOption("right");
      await expect(page.getByTestId("cabinet-input-hinge-side")).toHaveValue("right");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await page.getByRole("button", { name: /Advanced/i }).click();
      await page.getByTestId("cabinet-input-toe-kick-setback").fill("75");
      const toeKickDepth = page.getByTestId("cabinet-input-toe-kick-depth");
      await toeKickDepth.focus();
      await toeKickDepth.press("ControlOrMeta+A");
      await toeKickDepth.pressSequentially("360");
      await toeKickDepth.press("Enter");
      await expect(page.getByTestId("cabinet-input-toe-kick-setback")).toHaveValue("75");
      await expect(page.getByTestId("cabinet-input-toe-kick-depth")).toHaveValue("360");
      await page.getByTestId("cabinet-input-leveling-feet-enabled").check();
      await page.getByTestId("cabinet-input-leveling-foot-count").fill("4");
      await page.getByTestId("cabinet-input-leveling-foot-height").fill("90");
      await page.getByTestId("cabinet-input-leveling-foot-diameter").fill("35");
      await page.getByTestId("cabinet-input-leveling-foot-side-inset").fill("80");
      await page.getByTestId("cabinet-input-leveling-foot-front-back-inset").fill("70");
      await expect(page.getByTestId("cabinet-input-leveling-feet-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-leveling-foot-height")).toHaveValue("90");
      await page.getByTestId("cabinet-input-face-frame-enabled").check();
      await page.getByTestId("cabinet-input-face-frame-stile-width").fill("42");
      await page.getByTestId("cabinet-input-face-frame-rail-height").fill("50");
      await page.getByTestId("cabinet-input-face-frame-depth").fill("20");
      await page.getByTestId("cabinet-input-face-frame-material").selectOption("walnut_veneer");
      await expect(page.getByTestId("cabinet-input-face-frame-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-face-frame-stile-width")).toHaveValue("42");
      await page.getByTestId("cabinet-input-left-filler").fill("50");
      await page.getByTestId("cabinet-input-right-filler").fill("75");
      await expect(page.getByTestId("cabinet-parameter-source-leftFillerWidth")).toContainText("User Overridden");
      await page.getByTestId("cabinet-reset-parameter-leftFillerWidth").click();
      await expect(page.getByTestId("cabinet-parameter-source-leftFillerWidth")).toContainText("Automatic");
      await page.getByTestId("cabinet-input-left-filler-scribe-allowance").fill("12");
      await page.getByTestId("cabinet-input-right-filler-scribe-allowance").fill("18");
      await expect(page.getByTestId("cabinet-input-left-filler-scribe-allowance")).toHaveValue("12");
      await expect(page.getByTestId("cabinet-input-right-filler-scribe-allowance")).toHaveValue("18");
      await page.getByTestId("cabinet-input-left-end-panel").check();
      await page.getByTestId("cabinet-input-right-end-panel").check();
      await page.getByTestId("cabinet-input-left-end-panel-thickness").fill("24");
      await page.getByTestId("cabinet-input-right-end-panel-thickness").fill("30");
      await expect(page.getByTestId("cabinet-input-left-end-panel-thickness")).toHaveValue("24");
      await expect(page.getByTestId("cabinet-input-right-end-panel-thickness")).toHaveValue("30");
      await page.getByTestId("cabinet-input-countertop-enabled").check();
      await page.getByTestId("cabinet-input-countertop-thickness").fill("40");
      await page.getByTestId("cabinet-input-countertop-overhang-left").fill("30");
      await page.getByTestId("cabinet-input-countertop-overhang-right").fill("30");
      await page.getByTestId("cabinet-input-countertop-overhang-front").fill("35");
      await page.getByTestId("cabinet-input-countertop-overhang-back").fill("5");
      await page.getByTestId("cabinet-input-countertop-material").selectOption("walnut_veneer");
      await page.getByTestId("cabinet-input-backsplash-enabled").check();
      await page.getByTestId("cabinet-input-backsplash-height").fill("120");
      await page.getByTestId("cabinet-input-backsplash-thickness").fill("16");
      await page.getByTestId("cabinet-input-backsplash-material").selectOption("painted_shaker_white");
      await expect(page.getByTestId("cabinet-input-backsplash-enabled")).toBeChecked();
      await expect(page.getByTestId("cabinet-input-backsplash-height")).toHaveValue("120");
      await expect(page.getByTestId("cabinet-input-backsplash-thickness")).toHaveValue("16");
      await expect(page.getByTestId("cabinet-validation")).toHaveAttribute("data-error-count", "0");
      await expect(page.getByTestId("cabinet-bom")).toHaveAttribute("data-bom-count", /\d+/);
    });

  });
}
