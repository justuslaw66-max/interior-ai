import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Locator, type Page, type TestInfo } from "@playwright/test";
import { Pool } from "pg";

// My designs is one page (audit findings MD1–MD4 and MD6). The editor's More → My designs saves
// the open design first and goes there. On the page, each card's More menu and its Rename, Share
// and Delete dialogs own focus while open, hide the page behind them, call the server once, and
// hand focus back to the card's More button (after a delete, to the next card's), in Chromium
// and WebKit, on desktop and phone widths. The gate keeps the name it had when My designs was an
// editor dialog.

type UserMode = "consumer" | "pro";
type Seed = {
  userId: string;
  sessionToken: string;
  designIds: string[];
};

const BASE_URL = "http://127.0.0.1:3000";
const DESKTOP = { width: 1440, height: 900 };
const MOBILE = { width: 390, height: 844 };
const databaseUrl = process.env.DATABASE_URL;
if (!databaseUrl) throw new Error("DATABASE_URL is required for My Designs tests.");

const pool = new Pool({ connectionString: databaseUrl });
const prisma = new PrismaClient({ adapter: new PrismaPg(pool) });

function fixtureIdentity(testInfo: TestInfo, variant: string) {
  return crypto
    .createHash("sha256")
    .update(`${testInfo.project.name}:${testInfo.title}:${variant}`)
    .digest("hex")
    .slice(0, 16);
}

async function deleteFixtureRows(userId: string) {
  await prisma.design.deleteMany({ where: { userId } });
  await prisma.session.deleteMany({ where: { userId } });
  await prisma.user.deleteMany({ where: { id: userId } });
  const [designCount, sessionCount, userCount] = await Promise.all([
    prisma.design.count({ where: { userId } }),
    prisma.session.count({ where: { userId } }),
    prisma.user.count({ where: { id: userId } }),
  ]);
  expect({ designCount, sessionCount, userCount }).toEqual({
    designCount: 0,
    sessionCount: 0,
    userCount: 0,
  });
}

/** One user with a session and these designs, created oldest first (the page lists newest first). */
async function createSeed(
  testInfo: TestInfo,
  mode: UserMode,
  designTitles: readonly string[],
  variant = "main"
): Promise<Seed> {
  const identity = fixtureIdentity(testInfo, variant);
  const userId = `ch0015d-user-${identity}`;
  const sessionToken = `ch0015d-session-${identity}`;
  await deleteFixtureRows(userId);
  try {
    await prisma.user.create({
      data: {
        id: userId,
        email: `ch0015d-${identity}@example.test`,
        name: "CH-0015D Fixture",
        plan: mode === "pro" ? "pro" : "free",
      },
    });
    await prisma.session.create({
      data: {
        id: `ch0015d-session-row-${identity}`,
        sessionToken,
        userId,
        expires: new Date("2030-01-01T00:00:00.000Z"),
      },
    });
    const designIds: string[] = [];
    for (const [index, title] of designTitles.entries()) {
      const id = `ch0015d-design-${identity}-${index + 1}`;
      await createDesign(userId, id, title, index);
      designIds.push(id);
    }
    expect(await prisma.design.count({ where: { userId } })).toBe(designTitles.length);
    return { userId, sessionToken, designIds };
  } catch (error) {
    await deleteFixtureRows(userId);
    throw error;
  }
}

async function createDesign(userId: string, id: string, title: string, index: number) {
  await prisma.design.create({
    data: {
      id,
      title,
      roomWidth: 5.8,
      roomDepth: 4.2,
      items: [],
      zones: [],
      savedViews: [],
      mode: "homeowner",
      userId,
      createdAt: new Date(Date.UTC(2026, 7, 9, 0, index)),
      updatedAt: new Date(Date.UTC(2026, 7, 9, 0, index)),
    },
  });
}

async function cleanupSeed(seed: Seed) {
  await deleteFixtureRows(seed.userId);
}

async function signIn(page: Page, seed: Seed) {
  await page.context().addCookies([
    {
      name: "authjs.session-token",
      value: seed.sessionToken,
      url: BASE_URL,
      expires: Math.floor(new Date("2030-01-01T00:00:00.000Z").getTime() / 1000),
      httpOnly: true,
      sameSite: "Lax",
      secure: false,
    },
  ]);
}

async function openMyDesignsPage(page: Page, seed: Seed | null, viewport = DESKTOP) {
  await page.setViewportSize(viewport);
  if (seed) await signIn(page, seed);
  await page.goto("/dashboard", { waitUntil: "domcontentloaded" });
  // Server-rendered first: clicks before React hydrates the page do nothing.
  await expect(page.getByTestId(seed ? "my-designs-page" : "my-designs-signed-out"))
    .toHaveAttribute("data-client-hydrated", "true");
}

async function openEditor(page: Page, path: string) {
  await page.setViewportSize(DESKTOP);
  await page.addInitScript(() => {
    localStorage.setItem("scene_performance_mode", "lite");
  });
  await page.goto(path, { waitUntil: "domcontentloaded" });
  const scene = page.getByTestId("scene-canvas");
  await expect(scene).toHaveCount(1);
  await expect(scene).toHaveAttribute("data-client-hydrated", "true");
}

async function openMoreMenu(page: Page) {
  await page.getByTestId("editor-command-overflow").click();
  await expect(page.getByTestId("editor-command-overflow-menu")).toBeVisible();
}

function card(page: Page, designId: string) {
  return {
    root: page.getByTestId(`my-design-card-${designId}`),
    actions: page.getByTestId(`my-design-actions-${designId}`),
  };
}

async function chooseFromCardMenu(page: Page, actions: Locator, item: string) {
  await actions.click();
  await expect(actions).toHaveAttribute("aria-expanded", "true");
  await page.getByRole("menuitem", { name: item, exact: true }).click();
}

/** The dialog is modal: the page behind it is hidden and inert, and Tab stays inside. */
async function expectModal(page: Page, dialog: Locator) {
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(page.getByTestId("app-header")).toHaveAttribute("aria-hidden", "true");
  expect(await page.getByTestId("app-header").evaluate((element) => (element as HTMLElement).inert)).toBe(true);
  for (const key of ["Tab", "Shift+Tab"]) {
    await page.keyboard.press(key);
    expect(await dialog.evaluate((element) => element.contains(document.activeElement))).toBe(true);
  }
}

async function expectPageBack(page: Page) {
  await expect(page.getByTestId("app-header")).not.toHaveAttribute("aria-hidden", "true");
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("More → My designs saves first, stays in the editor when saving fails, and opens the page once saved", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "consumer", ["Entry Target"]);
  const [designId] = seed.designIds;
  const designRoute = `**/api/designs/${designId}`;
  let failedWrites = 0;
  await page.route(designRoute, async (route) => {
    if (route.request().method() !== "PUT") return route.continue();
    failedWrites += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Saving is unavailable right now."}' });
  });
  try {
    await signIn(page, seed);
    await openEditor(page, `/design?designId=${designId}`);
    await expect(page.getByTestId("rule-announcement-status")).toHaveText("Loaded Entry Target");
    await page.getByTestId("editor-design-title").click();
    await page.getByTestId("design-rename-input").fill("Renamed Before Leaving");
    await page.getByTestId("design-rename-save").click();
    await expect(page.getByTestId("design-rename-dialog")).toHaveCount(0);

    await openMoreMenu(page);
    await page.getByTestId("editor-command-overflow-load").click();
    await expect(page.getByTestId("save-status")).toHaveAttribute("data-status", "failed");
    await expect(page).toHaveURL(new RegExp(`[?&]designId=${designId}(?:&|$)`));
    await expect(page.getByTestId("editor-command-overflow")).toBeFocused();
    expect(failedWrites).toBeGreaterThan(0);

    await page.unroute(designRoute);
    await openMoreMenu(page);
    await page.getByTestId("editor-command-overflow-load").click();
    await expect(page).toHaveURL(/\/dashboard$/);
    await expect(card(page, designId).root).toContainText("Renamed Before Leaving");
    const saved = await prisma.design.findUniqueOrThrow({ where: { id: designId }, select: { title: true } });
    expect(saved.title).toBe("Renamed Before Leaving");
  } finally {
    await cleanupSeed(seed);
  }
});

test("guests get a sign-in prompt, and the editor offers them no My designs", async ({ page }) => {
  await openMyDesignsPage(page, null);
  await expect(page).toHaveURL(/\/dashboard$/);
  await expect(page.getByRole("heading", { name: "Sign in to see your designs" })).toBeVisible();
  await expect(page.getByTestId("my-designs-sign-in")).toHaveText("Continue with Google");
  await expect(page.getByTestId("app-header-sign-in")).toBeVisible();

  await openEditor(page, "/design");
  await openMoreMenu(page);
  await expect(page.getByTestId("editor-command-overflow-load")).toHaveCount(0);
});

test("empty, populated, at-the-limit and Pro states", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "consumer", []);
  const pro = await createSeed(testInfo, "pro", ["Pro Living Room"], "pro");
  try {
    await openMyDesignsPage(page, seed);
    await expect(page.getByTestId("my-designs-empty")).toBeVisible();
    await expect(page.getByTestId("my-designs-grid")).toHaveCount(0);
    await expect(page.getByTestId("my-designs-limit")).toContainText("0 of 20 designs on the Free plan.");
    await expect(page.getByTestId("my-designs-new-design")).toHaveAttribute("href", "/design?start=new");

    for (let index = 0; index < 20; index += 1) {
      await createDesign(seed.userId, `${seed.userId}-extra-${index + 1}`, `Saved ${index + 1}`, index);
    }
    await page.reload({ waitUntil: "domcontentloaded" });
    await expect(page.getByTestId("my-designs-grid").locator(":scope > li")).toHaveCount(20);
    await expect(page.getByTestId("my-designs-limit")).toContainText(
      "20 of 20 designs on the Free plan. Delete a design or upgrade to save more."
    );
    await expect(page.getByTestId("my-designs-empty")).toHaveCount(0);

    await page.context().clearCookies();
    await openMyDesignsPage(page, pro);
    await expect(card(page, pro.designIds[0]).root).toContainText("Pro Living Room");
    await expect(page.getByTestId("my-designs-limit")).toHaveCount(0);
  } finally {
    await cleanupSeed(seed);
    await cleanupSeed(pro);
  }
});

test("a card's menu opens from the keyboard, Escape returns focus to its button, and one menu opens at a time", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "consumer", ["Second", "First"]);
  const [secondId, firstId] = seed.designIds;
  try {
    await openMyDesignsPage(page, seed);
    const first = card(page, firstId);
    await first.actions.focus();
    await page.keyboard.press("Enter");
    await expect(first.actions).toHaveAttribute("aria-expanded", "true");
    const menu = first.root.getByRole("menu");
    await expect(menu.getByRole("menuitem")).toHaveText(["Open", "Share", "Make a copy", "Rename", "Delete"]);
    await page.keyboard.press("Tab");
    expect(await menu.evaluate((element) => element.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(menu).toHaveCount(0);
    await expect(first.actions).toBeFocused();
    await expect(first.actions).toHaveAttribute("aria-expanded", "false");

    await first.actions.click();
    const second = card(page, secondId);
    await second.actions.click();
    await expect(page.getByRole("menu")).toHaveCount(1);
    await expect(second.root.getByRole("menu")).toBeVisible();
    await page.getByRole("heading", { name: "My designs", level: 1 }).click();
    await expect(page.getByRole("menu")).toHaveCount(0);
  } finally {
    await cleanupSeed(seed);
  }
});

test("delete asks first, Escape keeps the design, and confirming deletes once and focuses the next card", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "consumer", ["Oldest", "Middle", "Newest"]);
  const [oldestId, middleId] = seed.designIds;
  let deleteCalls = 0;
  page.on("request", (request) => {
    if (request.method() === "DELETE" && new URL(request.url()).pathname === `/api/designs/${middleId}`) deleteCalls += 1;
  });
  try {
    await openMyDesignsPage(page, seed);
    const middle = card(page, middleId);
    await chooseFromCardMenu(page, middle.actions, "Delete");
    let confirm = page.getByRole("dialog", { name: "Delete Middle?" });
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await expectModal(page, confirm);
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(middle.actions).toBeFocused();
    await expectPageBack(page);
    expect(deleteCalls).toBe(0);

    await chooseFromCardMenu(page, middle.actions, "Delete");
    confirm = page.getByRole("dialog", { name: "Delete Middle?" });
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(middle.root).toHaveCount(0);
    await expect(card(page, oldestId).actions).toBeFocused();
    await expect(page.getByTestId("my-designs-status")).toHaveText("Deleted Middle");
    expect(deleteCalls).toBe(1);
    expect(await prisma.design.count({ where: { userId: seed.userId } })).toBe(2);
  } finally {
    await cleanupSeed(seed);
  }
});

test("a failed delete calls once, keeps the card, says why, and returns focus to its button", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "consumer", ["Failure Target"]);
  const [designId] = seed.designIds;
  let deleteCalls = 0;
  await page.route(`**/api/designs/${designId}`, async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    deleteCalls += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"Deleting is unavailable right now."}' });
  });
  try {
    await openMyDesignsPage(page, seed);
    const target = card(page, designId);
    await chooseFromCardMenu(page, target.actions, "Delete");
    const confirm = page.getByRole("dialog", { name: "Delete Failure Target?" });
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByTestId("my-designs-error")).toHaveText("Deleting is unavailable right now.");
    await expect(target.root).toBeVisible();
    await expect(target.actions).toBeFocused();
    expect(deleteCalls).toBe(1);
    expect(await prisma.design.count({ where: { userId: seed.userId } })).toBe(1);
  } finally {
    await cleanupSeed(seed);
  }
});

test("Rename and Share hide the page, keep focus inside, and return it to the card's button", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "consumer", ["Rename Target"]);
  const [designId] = seed.designIds;
  try {
    await openMyDesignsPage(page, seed);
    const target = card(page, designId);
    await chooseFromCardMenu(page, target.actions, "Rename");
    const rename = page.getByTestId("design-rename-dialog");
    await expect(page.getByTestId("design-rename-input")).toBeFocused();
    await expect(page.getByTestId("design-rename-input")).toHaveValue("Rename Target");
    await expectModal(page, page.getByRole("dialog", { name: "Rename design" }));
    await page.keyboard.press("Escape");
    await expect(rename).toHaveCount(0);
    await expect(target.actions).toBeFocused();

    await chooseFromCardMenu(page, target.actions, "Rename");
    await page.getByTestId("design-rename-input").fill("Renamed On The Page");
    await page.getByTestId("design-rename-save").click();
    await expect(page.getByTestId("my-designs-status")).toHaveText("Renamed to Renamed On The Page");
    await expect(target.root).toContainText("Renamed On The Page");
    await expect(target.actions).toBeFocused();
    await expectPageBack(page);
    expect((await prisma.design.findUniqueOrThrow({ where: { id: designId }, select: { title: true } })).title)
      .toBe("Renamed On The Page");

    await chooseFromCardMenu(page, target.actions, "Share");
    const share = page.getByRole("dialog", { name: "Share this design" });
    await expect(share.getByTestId("my-design-share-url")).toHaveValue(/\/share\/\S+$/);
    const stored = await prisma.design.findUniqueOrThrow({
      where: { id: designId },
      select: { shareToken: true, shareEnabled: true },
    });
    expect(stored.shareEnabled).toBe(true);
    await expect(share.getByTestId("my-design-share-url")).toHaveValue(`${BASE_URL}/share/${stored.shareToken}`);
    await expectModal(page, share);
    await share.getByTestId("my-design-share-done").click();
    await expect(share).toHaveCount(0);
    await expect(target.actions).toBeFocused();
    await expect(target.root.getByTestId("my-design-shared")).toHaveText("Shared");
  } finally {
    await cleanupSeed(seed);
  }
});

test("on a phone the page fits, and the card menu and Delete dialog stay on screen", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "pro", ["Phone Second", "Phone First"]);
  const [secondId, firstId] = seed.designIds;
  try {
    await openMyDesignsPage(page, seed, MOBILE);
    await expect(page.getByTestId("my-designs-limit")).toHaveCount(0);
    const [firstBox, secondBox] = await Promise.all([
      card(page, firstId).root.boundingBox(),
      card(page, secondId).root.boundingBox(),
    ]);
    expect(firstBox && secondBox && secondBox.y > firstBox.y && secondBox.x === firstBox.x).toBe(true);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOBILE.width);
    expect((await page.getByTestId("app-header").boundingBox())?.height ?? 0).toBeLessThanOrEqual(65);

    const first = card(page, firstId);
    await first.actions.focus();
    await page.keyboard.press("Enter");
    const menu = first.root.getByRole("menu");
    await expect(menu).toBeVisible();
    const menuBox = await menu.boundingBox();
    expect(menuBox && menuBox.x >= 0 && menuBox.x + menuBox.width <= MOBILE.width).toBe(true);
    await menu.getByRole("menuitem", { name: "Delete" }).click();
    const confirm = page.getByRole("dialog", { name: "Delete Phone First?" });
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    const panel = await confirm.evaluate((element) => {
      const box = (element.firstElementChild as HTMLElement).getBoundingClientRect();
      return { left: box.left, right: box.right, top: box.top, bottom: box.bottom };
    });
    expect(panel.left).toBeGreaterThanOrEqual(0);
    expect(panel.right).toBeLessThanOrEqual(MOBILE.width);
    expect(panel.top).toBeGreaterThanOrEqual(0);
    expect(panel.bottom).toBeLessThanOrEqual(MOBILE.height);
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(first.actions).toBeFocused();
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBeLessThanOrEqual(MOBILE.width);
  } finally {
    await cleanupSeed(seed);
  }
});
