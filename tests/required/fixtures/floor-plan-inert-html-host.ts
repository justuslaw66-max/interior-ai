import { expect, type Page } from "@playwright/test";

const FLOOR_PLAN_INERT_FIXTURE_PATH =
  "/__playwright__/floor-plan-upload/empty-entry";
const FLOOR_PLAN_INERT_FIXTURE_TITLE = "Floor Plan empty entry fixture";
const FLOOR_PLAN_INERT_FIXTURE_HTML = `<!doctype html>
<html lang="en" data-floor-plan-fixture-host="inert-playwright-html">
  <head>
    <meta charset="utf-8">
    <title>${FLOOR_PLAN_INERT_FIXTURE_TITLE}</title>
  </head>
  <body></body>
</html>`;

export async function openFloorPlanInertFixtureHost(
  page: Page,
  responsive: boolean
) {
  await page.route(
    (url) => url.pathname === FLOOR_PLAN_INERT_FIXTURE_PATH,
    (route) =>
      route.fulfill({
        status: 200,
        headers: {
          "cache-control": "no-store",
          "content-type": "text/html; charset=utf-8",
          "x-content-type-options": "nosniff",
          "x-floor-plan-fixture-owner": "playwright",
        },
        body: FLOOR_PLAN_INERT_FIXTURE_HTML,
      })
  );
  const target = `${FLOOR_PLAN_INERT_FIXTURE_PATH}${
    responsive ? "?fixture=responsive" : ""
  }`;
  const response = await page.goto(target, { waitUntil: "domcontentloaded" });
  if (!response) throw new Error("Floor Plan inert fixture returned no response");

  expect(response.status()).toBe(200);
  expect(response.headers()["content-type"]).toMatch(
    /^text\/html(?:;\s*charset=utf-8)?$/i
  );
  expect(response.headers()["x-floor-plan-fixture-owner"]).toBe("playwright");
  expect(response.request().redirectedFrom()).toBeNull();
  const location = new URL(page.url());
  expect(location.pathname).toBe(FLOOR_PLAN_INERT_FIXTURE_PATH);
  expect(location.searchParams.get("fixture")).toBe(
    responsive ? "responsive" : null
  );
  expect(response.url()).toBe(location.href);
  expect(
    await page.evaluate(() => ({
      title: document.title,
      fixtureOwner: document.documentElement.dataset.floorPlanFixtureHost,
      scriptCount: document.scripts.length,
      nextRootPresent: document.querySelector("#__next") !== null,
      bodyChildCount: document.body.childElementCount,
    }))
  ).toEqual({
    title: FLOOR_PLAN_INERT_FIXTURE_TITLE,
    fixtureOwner: "inert-playwright-html",
    scriptCount: 0,
    nextRootPresent: false,
    bodyChildCount: 0,
  });
}

export async function expectFloorPlanInertFixtureHost(page: Page) {
  await expect(page.locator("html")).toHaveAttribute(
    "data-floor-plan-fixture-host",
    "inert-playwright-html"
  );
  await expect(page.locator("#__next")).toHaveCount(0);
  await expect(page.getByRole("heading", { name: "404", exact: true })).toHaveCount(0);
}
