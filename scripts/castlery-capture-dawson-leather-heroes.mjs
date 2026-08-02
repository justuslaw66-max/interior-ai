import { chromium } from "playwright";

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

await page.goto("https://www.castlery.com/sg/products/dawson-pit-sectional-sofa", {
  waitUntil: "networkidle",
  timeout: 120000,
});
await page.waitForTimeout(3500);

const leatherModelButton = page.getByRole("button", { name: "Leather" }).first();
if (await leatherModelButton.count()) {
  await leatherModelButton.click({ force: true });
  await page.waitForTimeout(2200);
}

const leatherSwatches = await page.evaluate(() => {
  return Array.from(document.querySelectorAll('button[aria-label^="Select "]'))
    .map((btn) => ({
      aria: btn.getAttribute("aria-label") || "",
      title: btn.getAttribute("title") || "",
    }))
    .filter((entry) => /Leather/i.test(entry.aria) || /Leather/i.test(entry.title));
});

for (const swatch of leatherSwatches) {
  const name = swatch.aria.replace(/^Select\s+/i, "").trim();
  const button = page.getByRole("button", { name: swatch.aria }).first();
  if (!(await button.count())) {
    console.log(`${name}|MISSING_BUTTON`);
    continue;
  }

  await button.click({ force: true });
  await page.waitForTimeout(1600);

  const heroUrl = await page.evaluate(() => {
    const exact = document.querySelector('img[alt="Dawson Pit-Sectional Sofa image 0"]');
    if (exact?.src) return exact.src;

    const candidates = Array.from(document.querySelectorAll("img"))
      .map((img) => {
        const r = img.getBoundingClientRect();
        return {
          src: img.currentSrc || img.src || "",
          alt: img.alt || "",
          area: r.width * r.height,
          w: r.width,
          h: r.height,
        };
      })
      .filter((img) => img.w > 450 && img.h > 450)
      .filter((img) => /Dawson/i.test(img.alt) || /AS-000379|AS-000533/i.test(img.src))
      .sort((a, b) => b.area - a.area);

    return candidates[0]?.src ?? "";
  });

  console.log(`${name}|${heroUrl}`);
}

await browser.close();