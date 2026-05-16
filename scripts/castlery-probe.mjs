import { chromium } from "playwright";

const url =
  process.argv[2] ??
  "https://www.castlery.com/sg/products/dawson-pit-sectional-sofa?material=infinity_boucle_ginger";
const swatchTitle = process.argv[3] ?? "";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

await page.goto(url, { waitUntil: "networkidle", timeout: 120000 });
await page.waitForTimeout(3000);

if (swatchTitle) {
  const swatch = page.getByRole("button", { name: swatchTitle });
  if (await swatch.count()) {
    await swatch.first().click({ force: true });
    await page.waitForTimeout(2500);
  }
}

const images = await page.evaluate(() =>
  Array.from(document.querySelectorAll("img"))
    .map((img) => {
      const bounds = img.getBoundingClientRect();
      return {
        alt: img.alt,
        src: img.currentSrc || img.src,
        width: Math.round(bounds.width),
        height: Math.round(bounds.height),
      };
    })
    .filter((entry) => entry.width > 400 && entry.height > 220)
);

console.log(JSON.stringify(images, null, 2));

const primary = await page.locator('img[alt="Dawson Pit-Sectional Sofa image 0"]').first();
if (await primary.count()) {
  console.log("PRIMARY_IMAGE_SRC", await primary.getAttribute("src"));
}

await browser.close();
