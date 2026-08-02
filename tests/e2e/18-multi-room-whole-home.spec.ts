import { test } from "./fixtures";
import { registerDrawingTests } from "./multi-room/drawing";
import { registerEditingTests } from "./multi-room/editing";
import { registerStartAndFloorTests } from "./multi-room/start-and-floors";
import { registerTemplateTests } from "./multi-room/templates";
import { registerUploadTests } from "./multi-room/upload";
import { registerViewportNavigationTests } from "./multi-room/viewport-navigation";
import { registerWorkspaceTests } from "./multi-room/workspace";

test.describe("18. Multi-Room Whole Home", () => {
  test.describe.configure({ mode: "serial" });

  test.beforeEach(async ({ page }) => {
    await page.addInitScript(() => {
      const clearSentinel = "__e2e_multi_room_storage_cleared";
      if (window.localStorage.getItem(clearSentinel) === "1") return;
      window.localStorage.clear();
      window.sessionStorage.clear();
      window.localStorage.setItem(clearSentinel, "1");
    });
  });

  registerViewportNavigationTests();
  registerStartAndFloorTests();
  registerDrawingTests();
  registerWorkspaceTests();
  registerEditingTests();
  registerTemplateTests();
  registerUploadTests();
});
