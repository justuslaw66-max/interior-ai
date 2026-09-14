import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import webpack from "webpack";
import { test, expect } from "@playwright/test";

let bundle: string;
test.beforeAll(async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "scan-plan-artwork-component-"));
  bundle = path.join(output, "review.js");
  const compiler = webpack({ mode: "production", target: "web", devtool: false, cache: false,
    entry: path.resolve("tests/scan-to-editable-plan/source-artwork-entry.tsx"),
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

test("Reference artwork selection, text correction, calibration and local component reload", async ({ page }, info) => {
  const errors: string[] = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/scan-plan-component", (route) => route.fulfill({ contentType: "text/html", body:
    '<!doctype html><html><head><title>Source artwork fixture</title><style>body{font-family:Arial}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.h-full{height:100%}.w-full{width:100%}svg{display:block}output{display:none}.pointer-events-none{pointer-events:none}label,button{margin:4px}</style></head><body></body></html>' }));
  await page.route("**/api/floor-plan-imports/**/assets/**", (route) => route.fulfill({ contentType: "image/svg+xml", body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="800" height="600"><rect width="800" height="600" fill="white"/></svg>' }));
  await page.goto("/scan-plan-component");
  await page.addScriptTag({ path: bundle });
  const drawing = page.getByRole("group", { name: "Canonical candidate overlay" });
  await drawing.getByRole("button", { name: "Source text: Uncertain room text" }).focus();
  await page.keyboard.press("Enter");
  await page.getByLabel("Correct source text").fill("Reviewed room text");
  await page.getByRole("button", { name: "Save text correction" }).click();
  await expect(drawing.getByRole("button", { name: "Source text: Reviewed room text" })).toBeVisible();
  const before = JSON.parse(await page.getByTestId("fixture-document").innerText());
  await page.getByRole("button", { name: "Apply fixture calibration" }).click();
  const after = JSON.parse(await page.getByTestId("fixture-document").innerText());
  expect(after.floors[0].annotations).toEqual(before.floors[0].annotations);
  expect(after.floors[0].walls).toEqual([]);
  expect(after.verification.tier).toBe("needs_review");
  const curve = drawing.locator("path[data-source-artwork-shape][d^='M 100 200 C']");
  const target = await curve.evaluate((element) => {
    const path = element as SVGPathElement;
    const point = path.getPointAtLength(path.getTotalLength() / 2).matrixTransform(path.getScreenCTM()!);
    return { x: point.x, y: point.y };
  });
  await page.mouse.click(target.x, target.y);
  await expect(drawing.getByRole("button", { name: "Source stroke curve", exact: true })).toHaveAttribute("aria-pressed", "true");
  await expect(drawing.locator("path[data-source-artwork-shape][d^='M 100 200 C']")).toHaveCount(1);
  await page.screenshot({ path: info.outputPath("source-artwork.png") });
  await page.reload();
  await page.addScriptTag({ path: bundle });
  await expect(page.getByRole("button", { name: "Source text: Reviewed room text" })).toBeVisible();
  expect(JSON.parse(await page.getByTestId("fixture-document").innerText())).toEqual(after);
  expect(errors).toEqual([]);
});
