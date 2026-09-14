import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import webpack from "webpack";
import { test, expect } from "@playwright/test";

let bundle: string;
test.beforeAll(async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "scan-plan-scale-component-"));
  bundle = path.join(output, "review.js");
  const compiler = webpack({ mode: "production", target: "web", devtool: false, cache: false,
    entry: path.resolve("tests/scan-to-editable-plan/scale-review-entry.tsx"),
    output: { path: output, filename: "review.js" },
    resolve: { extensions: [".tsx", ".ts", ".js"], alias: { "@": process.cwd() } },
    module: { rules: [{ test: /\.[jt]sx?$/, exclude: /node_modules/, use: path.resolve("scripts/guest-save-overlay-ts-loader.mjs") }] },
    plugins: [new webpack.DefinePlugin({ "process.env.NODE_ENV": JSON.stringify("production") })],
    optimization: { minimize: false }, performance: { hints: false },
  });
  await new Promise<void>((resolve, reject) => compiler.run((error, stats) => {
    compiler.close(() => undefined);
    if (error || stats?.hasErrors()) reject(error ?? new Error(stats?.toString({ all: false, errors: true })));
    else resolve();
  }));
});
test.afterAll(async () => { if (bundle) await fs.rm(path.dirname(bundle), { recursive: true, force: true }); });

test("Scale setting, independent conflicts, correction, unit rounding and component reload", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/scan-plan-scale-component", (route) => route.fulfill({ contentType: "text/html", body:
    '<!doctype html><html><head><title>Scale review fixture</title><style>body{font-family:Arial}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.h-full{height:100%}.w-full{width:100%}svg{display:block}output{display:none}.pointer-events-none{pointer-events:none}label,button{margin:4px}[data-testid="source-review-scroll"]{max-height:72vh;overflow:auto}</style></head><body></body></html>' }));
  await page.route("**/api/floor-plan-imports/**/assets/**", (route) => route.fulfill({ contentType: "image/svg+xml", body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"><rect width="1000" height="800" fill="white"/><path d="M200 100H600M200 200V500" fill="none" stroke="gray"/></svg>' }));
  await page.goto("/scan-plan-scale-component"); await page.addScriptTag({ path: bundle });
  const saved = async () => JSON.parse(await page.getByTestId("fixture-document").innerText());
  const initial = await saved();
  const selectSpan = async (first: { x: number; y: number }, second: { x: number; y: number }) => {
    const picker = page.getByRole("group", { name: "Pick scale points on the source drawing" });
    await page.getByTestId("source-review-scroll").scrollIntoViewIfNeeded();
    await page.getByTestId("source-review-scroll").evaluate((element) => { element.scrollTop = 0; element.scrollLeft = 0; });
    for (const source of [first, second]) {
      const target = await picker.evaluate((element, source) => {
        const p = new DOMPoint(source.x, source.y).matrixTransform((element as SVGGraphicsElement).getScreenCTM()!);
        return { x: p.x, y: p.y };
      }, source);
      await page.mouse.click(target.x, target.y);
    }
  };
  await page.getByRole("button", { name: "Choose the two endpoints on the plan" }).click();
  await selectSpan({ x: 200, y: 100 }, { x: 600, y: 100 });
  await page.getByLabel("Printed measurement", { exact: true }).fill("4000");
  await page.getByRole("button", { name: "Update measurement", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect.poll(async () => (await saved()).floors[0].calibrations[0].primaryMeasurement?.confirmedLengthMm).toBe(4000);
  expect((await saved()).floors[0].walls).toEqual(initial.floors[0].walls);
  await page.getByRole("button", { name: "Cross-check scale", exact: true }).click();
  await page.getByRole("button", { name: "Choose check endpoints", exact: true }).click();
  await selectSpan({ x: 200, y: 200 }, { x: 200, y: 500 });
  await page.getByRole("button", { name: "Save independent check", exact: true }).click();
  await expect(page.getByRole("list", { name: "Saved scale checks" })).toContainText("agrees");
  const agreed = await saved();
  expect(JSON.parse(await page.getByTestId("fixture-readiness").innerText())).toEqual([]);
  await page.getByRole("button", { name: "Edit check 1", exact: true }).click();
  await page.getByLabel("Printed measurement", { exact: true }).fill("3500");
  await page.getByRole("button", { name: "Save check correction", exact: true }).click();
  await expect(page.getByRole("list", { name: "Saved scale checks" })).toContainText("conflict");
  const conflict = await saved();
  expect(conflict.floors[0].walls).toEqual(agreed.floors[0].walls);
  expect(conflict.floors[0].vertices).toEqual(agreed.floors[0].vertices);
  expect(conflict.floors[0].calibrations[0].independentMeasurements).toHaveLength(1);
  expect(JSON.parse(await page.getByTestId("fixture-readiness").innerText())[0].code).toBe("independent_scale_conflict");
  await page.reload(); await page.addScriptTag({ path: bundle });
  expect(await saved()).toEqual(conflict);
  await expect(page.getByRole("list", { name: "Saved scale checks" })).toContainText("conflict");
  await page.getByRole("button", { name: "Edit check 1", exact: true }).click();
  await page.getByLabel("Measurement unit", { exact: true }).selectOption("ft-in");
  await page.getByLabel("Printed measurement", { exact: true }).fill("9' 10\"");
  await expect(page.getByText(/Will store 2997 mm \(rounded/)).toBeVisible();
  for (const unit of ["mm", "in", "cm", "ft-in"]) await page.getByLabel("Measurement unit", { exact: true }).selectOption(unit);
  await expect(page.getByText(/Will store 2997 mm \(rounded/)).toBeVisible();
  expect(await saved()).toEqual(conflict);
  await page.getByRole("button", { name: "Save check correction", exact: true }).click();
  await expect(page.getByRole("list", { name: "Saved scale checks" })).toContainText("agrees");
  const rounded = await saved();
  expect(rounded.floors[0].calibrations[0].independentMeasurements[0]).toMatchObject({ confirmedLengthMm: 2997, inputUnit: "ft-in" });
  await page.getByRole("button", { name: "Set scale", exact: true }).click();
  await page.getByRole("button", { name: /Choose .*points/ }).click();
  await selectSpan({ x: 200, y: 100 }, { x: 600, y: 100 });
  await page.getByLabel("Printed measurement", { exact: true }).fill("4400");
  await page.getByRole("button", { name: "Update measurement", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  await expect(page.getByText("Scale conflict", { exact: true })).toBeVisible();
  const rescaled = await saved();
  expect(rescaled.floors[0].calibrations[0].independentMeasurements).toEqual(rounded.floors[0].calibrations[0].independentMeasurements);
  expect(rescaled.verification.tier).toBe("needs_review");
  await page.getByRole("button", { name: "Cross-check scale", exact: true }).click();
  await page.screenshot({ path: info.outputPath("persisted-scale-conflict.png") });
  const overlayPoints = () => page.locator("polyline[data-review-entity-id]").evaluateAll((elements) => elements.map((element) => ({
    id: element.getAttribute("data-review-entity-id"), coordinates: element.getAttribute("points")!.split(/[ ,]+/).map(Number),
  })));
  const beforeMirror = await overlayPoints();
  expect(beforeMirror.length).toBeGreaterThan(0);
  await page.getByText("Orientation", { exact: true }).click();
  await page.getByRole("button", { name: "Mirror left/right", exact: true }).click();
  await expect(page.getByRole("alert")).toHaveCount(0);
  const mirrored = await saved();
  expect(mirrored.floors[0].vertices).not.toEqual(rescaled.floors[0].vertices);
  expect(mirrored.floors[0].calibrations[0].reflected).toBe(true);
  expect(mirrored.floors[0].calibrations[0].independentMeasurements).toEqual(rescaled.floors[0].calibrations[0].independentMeasurements);
  const afterMirror = await overlayPoints();
  expect(afterMirror.map(({ id }) => id)).toEqual(beforeMirror.map(({ id }) => id));
  let maxMirrorErrorPx = 0;
  afterMirror.forEach((entity, index) => {
    expect(entity.coordinates.length).toBe(beforeMirror[index].coordinates.length);
    entity.coordinates.forEach((coordinate, axis) => { maxMirrorErrorPx = Math.max(maxMirrorErrorPx, Math.abs(coordinate - beforeMirror[index].coordinates[axis])); });
  });
  expect(maxMirrorErrorPx).toBeLessThan(1e-7);
  await page.reload(); await page.addScriptTag({ path: bundle });
  expect(await saved()).toEqual(mirrored);
  expect(await overlayPoints()).toEqual(afterMirror);
  await page.screenshot({ path: info.outputPath("mirrored-source-registration.png") });
  await fs.writeFile(info.outputPath("scale-review-evidence.json"), JSON.stringify({ agreed, conflict, rounded, rescaled, mirrored, maxMirrorErrorPx }, null, 2));
  expect(errors).toEqual([]);
});
