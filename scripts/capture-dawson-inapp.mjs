import { chromium } from "playwright";

async function clickIfPresent(page, pattern) {
  const locator = page.getByRole("button", { name: pattern }).first();
  if ((await locator.count()) > 0) {
    await locator.click({ timeout: 5000 });
    await page.waitForTimeout(1200);
    return true;
  }
  return false;
}

async function main() {
  const browser = await chromium.launch({ headless: true });
  const page = await browser.newPage({ viewport: { width: 1600, height: 1000 } });

  await page.goto("http://localhost:3000/design", { waitUntil: "domcontentloaded" });
  await page.waitForTimeout(3500);

  const addImportedButton = page.getByRole("button", { name: /add imported furniture/i });
  await addImportedButton.waitFor({ state: "visible", timeout: 15000 });

  // Wait for app gates to finish and the button to become interactive.
  await page.waitForFunction(() => {
    const btn = Array.from(document.querySelectorAll("button")).find((node) =>
      /add imported furniture/i.test((node.textContent || "").trim())
    );
    return Boolean(btn && !btn.disabled);
  }, undefined, { timeout: 30000 });

  await addImportedButton.click({ timeout: 8000 });
  await page.waitForTimeout(1500);

  await page.screenshot({ path: "reports/dawson-comparison/design-inapp-import-panel.jpg", fullPage: true });

  const indigoOk = await clickIfPresent(page, /indigo blue/i);
  await page.screenshot({ path: "reports/dawson-comparison/design-inapp-indigo.jpg", fullPage: true });

  // Cumin is under the Peyton fabric group in the imported upholstery UI.
  await clickIfPresent(page, /performance fleece \(peyton\)/i);
  const cuminOk = await clickIfPresent(page, /caramel \(cumin\)|cumin/i);
  await page.screenshot({ path: "reports/dawson-comparison/design-inapp-cumin.jpg", fullPage: true });

  console.log(`clicked-indigo: ${indigoOk}`);
  console.log(`clicked-cumin: ${cuminOk}`);

  await browser.close();
}

main().catch((err) => {
  console.error(err?.message || err);
  process.exit(1);
});
