import { chromium } from "playwright";

const targets = [
  { code: "navagio_seagull", label: "Slub Linen Weave (Navagio), Medium Grey (Seagull)" },
  { code: "performance_creamy_white", label: "Performance Creamy White" },
  { code: "indigo_blue", label: "Indigo Blue" },
  { code: "marcel_brilliant_white", label: "Performance Textured Plain Weave (Marcel), Cream (Brilliant White)" },
  { code: "peyton_ivory", label: "Performance Fleece (Peyton), Ivory (Cream)" },
  { code: "peyton_dove_grey", label: "Performance Fleece (Peyton), Medium Grey (Dove Grey)" },
  { code: "marcel_smoke_grey", label: "Performance Textured Plain Weave (Marcel), Smoke Grey" },
  { code: "peyton_moss", label: "Performance Fleece (Peyton), Moss" },
  { code: "peyton_cumin", label: "Performance Fleece (Peyton), Caramel (Cumin)" },
  { code: "infinity_boucle_ginger", label: "Performance Infinity Boucle, Rust (Ginger)" },
  { code: "infinity_boucle_white_quartz", label: "Performance Infinity Boucle, Light Grey (White Quartz)" },
];

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1600, height: 1200 } });

await page.goto("https://www.castlery.com/sg/products/dawson-pit-sectional-sofa", {
  waitUntil: "networkidle",
  timeout: 120000,
});
await page.waitForTimeout(3500);

for (const target of targets) {
  const button = page.getByRole("button", { name: `Select ${target.label}` }).first();
  if (!(await button.count())) {
    console.log(`${target.code}|MISSING_BUTTON`);
    continue;
  }
  await button.click({ force: true });
  await page.waitForTimeout(1400);
  const src = await page.evaluate(() => {
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
      .filter((img) => /Dawson/i.test(img.alt) || /AS-000379/i.test(img.src))
      .sort((a, b) => b.area - a.area);

    return candidates[0]?.src ?? "";
  });
  console.log(`${target.code}|${src}`);
}

await browser.close();