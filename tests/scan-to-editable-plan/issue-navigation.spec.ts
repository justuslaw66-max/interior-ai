import path from "node:path";
import os from "node:os";
import fs from "node:fs/promises";
import webpack from "webpack";
import { test, expect } from "@playwright/test";

let bundle: string;
test.beforeAll(async () => {
  const output = await fs.mkdtemp(path.join(os.tmpdir(), "scan-plan-issue-component-"));
  bundle = path.join(output, "review.js");
  const compiler = webpack({ mode: "production", target: "web", devtool: false, cache: false,
    entry: path.resolve("tests/scan-to-editable-plan/issue-navigation-entry.tsx"),
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

test("Issue focus switches evidence pages and offers existing correction controls without losing numeric drafts", async ({ page }, info) => {
  const errors: string[] = []; page.on("pageerror", (error) => errors.push(error.message));
  await page.route("**/scan-plan-issue-component", (route) => route.fulfill({ contentType: "text/html", body:
    '<!doctype html><html><head><title>Issue navigation fixture</title><style>body{font-family:Arial}.relative{position:relative}.absolute{position:absolute}.inset-0{inset:0}.h-full{height:100%}.w-full{width:100%}svg{display:block}output{display:none}.pointer-events-none{pointer-events:none}label,button{margin:4px}[data-testid="source-review-scroll"]{max-height:72vh;overflow:auto}</style></head><body></body></html>' }));
  await page.route("**/api/floor-plan-imports/**/assets/**", (route) => route.fulfill({ contentType: "image/svg+xml", body:
    '<svg xmlns="http://www.w3.org/2000/svg" width="1000" height="800"><rect width="1000" height="800" fill="white"/></svg>' }));
  await page.goto("/scan-plan-issue-component"); await page.addScriptTag({ path: bundle });
  const saved = async () => JSON.parse(await page.getByTestId("fixture-document").innerText());
  const original = await saved();
  await page.getByTestId("floor-plan-import-technical-details").locator("summary").click();
  const issueButton = (message: string) => page.getByRole("checkbox", { name: `Resolve ${message}`, exact: true }).locator("..").getByRole("button", { name: /^(Show|Clear)/ });
  const wallIssue = issueButton("Check the marked shared wall.");
  await wallIssue.focus(); await page.keyboard.press("Enter");
  await expect(page.getByLabel("Floor plan page", { exact: true })).toHaveValue("2");
  await expect(wallIssue).toBeFocused();
  await expect(page.getByRole("button", { name: "Open wall controls", exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Open wall controls", exact: true }).click();
  const wall = page.locator('[data-review-controls="wall"] select').first();
  await expect(wall).toBeVisible(); await expect(wall).toBeFocused();
  await wall.selectOption("shared");
  const thickness = page.locator('[data-review-controls="wall"] input[type=number]');
  await thickness.fill("175");
  expect(await saved()).toEqual(original);
  await issueButton("Check the overall dimension.").click();
  await expect(page.getByLabel("Floor plan page", { exact: true })).toHaveValue("1");
  await page.getByRole("button", { name: "Open dimension controls", exact: true }).click();
  await expect(page.locator('[data-review-controls="dimension"] select').first()).toBeFocused();
  await wallIssue.click();
  await expect(page.getByLabel("Floor plan page", { exact: true })).toHaveValue("2");
  await page.getByRole("button", { name: "Open wall controls", exact: true }).click();
  await expect(wall).toHaveValue("shared"); await expect(thickness).toHaveValue("175");
  expect(await saved()).toEqual(original);
  await page.getByRole("button", { name: "Update wall safely", exact: true }).click();
  await expect.poll(async () => (await saved()).floors[0].walls.find((entry: { id: string }) => entry.id === "shared").thicknessMm).toBe(175);
  const correctedWall = await saved();
  await issueButton("Check the kitchen text.").click();
  await expect(page.getByLabel("Floor plan page", { exact: true })).toHaveValue("2");
  await expect(page.getByText("400%", { exact: true })).toBeVisible();
  await page.getByRole("button", { name: "Select marked artwork", exact: true }).click();
  const artwork = page.getByRole("button", { name: "Source text: Uncertain kitchen", exact: true });
  await expect(artwork).toBeFocused(); await page.keyboard.press("Enter");
  await page.getByLabel("Correct source text", { exact: true }).fill("Kitchen");
  await page.getByRole("button", { name: "Save text correction", exact: true }).click();
  await expect(page.getByRole("button", { name: "Source text: Kitchen", exact: true })).toBeVisible();
  const corrected = await saved();
  expect(corrected.floors[0].walls).toEqual(correctedWall.floors[0].walls);
  expect(corrected.floors[0].vertices).toEqual(original.floors[0].vertices);
  await issueButton("Review the source scale.").click();
  await page.getByRole("button", { name: "Open scale controls", exact: true }).click();
  await expect(page.locator('[data-review-controls="scale"]')).toHaveAttribute("open", "");
  await page.screenshot({ path: info.outputPath("issue-correction-controls.png") });
  expect(await saved()).toEqual(corrected);
  await page.reload(); await page.addScriptTag({ path: bundle });
  expect(await saved()).toEqual(corrected);
  await fs.writeFile(info.outputPath("issue-navigation-evidence.json"), JSON.stringify({ original, correctedWall, corrected }, null, 2));
  expect(errors).toEqual([]);
});
