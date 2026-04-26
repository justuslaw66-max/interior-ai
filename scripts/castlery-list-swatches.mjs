import { chromium } from "playwright";

const url = process.argv[2] ?? "https://www.castlery.com/sg/products/dawson-pit-sectional-sofa";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

await page.goto(url, {
  waitUntil: "networkidle",
  timeout: 120000,
});
await page.waitForTimeout(3000);

const labels = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('button[aria-label^="Select "]'))
    .map((btn) => (btn.getAttribute("aria-label") || "").trim())
    .filter(Boolean);
});

for (const label of labels) {
  console.log(label);
}
await browser.close();