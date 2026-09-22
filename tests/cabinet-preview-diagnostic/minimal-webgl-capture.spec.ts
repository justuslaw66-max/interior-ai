// DIAGNOSTIC ONLY (branch diagnostic/cabinet-preview-webkit-blank, never merged).
// Does a WebKit page screenshot capture a WebGL canvas that is drawn once,
// drawn a few frames then left alone, redrawn every frame (cheap), or redrawn
// every frame with ~150 ms of main-thread work (like the preview on CI)?
// Each mode loads a fresh page so no script state carries over.
import { test } from "@playwright/test";
import sharp from "sharp";
import { writeFile } from "node:fs/promises";

const MODES = ["once", "burst", "loop60", "loopHeavy"] as const;

function pageFor(mode: (typeof MODES)[number], preserve: boolean) {
  return `<!doctype html><html><body style="margin:0;background:#fff">
    <canvas id="c" width="800" height="600" style="width:800px;height:600px;display:block"></canvas>
    <script>
      (() => {
        const mode = ${JSON.stringify(mode)};
        const gl = document.getElementById("c").getContext("webgl2", {
          antialias: true, preserveDrawingBuffer: ${preserve}
        });
        window.__frames = 0;
        const draw = () => {
          if (mode === "loopHeavy") { const until = performance.now() + 150; while (performance.now() < until) {} }
          gl.clearColor(0.8, 0.1, 0.1, 1);
          gl.clear(gl.COLOR_BUFFER_BIT);
          window.__frames += 1;
          if (mode === "loop60" || mode === "loopHeavy" || (mode === "burst" && window.__frames < 5)) {
            requestAnimationFrame(draw);
          }
        };
        requestAnimationFrame(draw);
      })();
    </script></body></html>`;
}

test("minimal WebGL canvas capture", async ({ page }, testInfo) => {
  const results: Record<string, { captures: number; blank: number }> = {};
  for (const preserve of [false, true]) {
    for (const mode of MODES) {
      await page.goto("about:blank");
      await page.setContent(pageFor(mode, preserve));
      await page.waitForFunction(
        (expected) => ((window as typeof window & { __frames?: number }).__frames ?? 0) >= expected,
        mode === "burst" ? 5 : mode === "once" ? 1 : 3
      );
      await page.evaluate(
        () => new Promise<void>((resolve) => requestAnimationFrame(() => requestAnimationFrame(() => resolve())))
      );
      const canvas = page.locator("#c");
      let blank = 0;
      const captures = 30;
      for (let index = 0; index < captures; index += 1) {
        const bounds = await canvas.boundingBox();
        const buffer = await page.screenshot({ clip: bounds!, animations: "allow", caret: "initial" });
        const { data } = await sharp(buffer).removeAlpha().raw().toBuffer({ resolveWithObject: true });
        let red = 0;
        for (let offset = 0; offset < data.length; offset += 3) red += data[offset] > 150 && data[offset + 1] < 80 ? 1 : 0;
        if (red / (data.length / 3) < 0.5) {
          blank += 1;
          if (blank <= 2) await writeFile(testInfo.outputPath(`${mode}-preserve-${preserve}-blank-${index}.png`), buffer);
        }
      }
      const frames = await page.evaluate(() => (window as typeof window & { __frames?: number }).__frames ?? 0);
      results[`${mode}${preserve ? "+preserve" : ""}`] = { captures, blank };
      console.log(`CABINET_DIAG_MINIMAL_MODE ${JSON.stringify({ mode, preserve, captures, blank, frames })}`);
    }
  }
  console.log(`CABINET_DIAG_MINIMAL ${JSON.stringify(results)}`);
});
