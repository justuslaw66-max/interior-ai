import crypto from "node:crypto";
import { PrismaClient } from "@prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { expect, test, type Page, type TestInfo } from "@playwright/test";
import { Pool } from "pg";

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

function fixtureIdentity(testInfo: TestInfo) {
  return crypto
    .createHash("sha256")
    .update(`${testInfo.project.name}:${testInfo.title}`)
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

async function createSeed(
  testInfo: TestInfo,
  mode: UserMode,
  designTitles: readonly string[]
): Promise<Seed> {
  const identity = fixtureIdentity(testInfo);
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
          createdAt: new Date(`2026-08-09T0${index}:00:00.000Z`),
        },
      });
      designIds.push(id);
    }
    const [designCount, sessionCount, userCount] = await Promise.all([
      prisma.design.count({ where: { userId } }),
      prisma.session.count({ where: { userId } }),
      prisma.user.count({ where: { id: userId } }),
    ]);
    expect({ designCount, sessionCount, userCount }).toEqual({
      designCount: designTitles.length,
      sessionCount: 1,
      userCount: 1,
    });
    return { userId, sessionToken, designIds };
  } catch (error) {
    await deleteFixtureRows(userId);
    throw error;
  }
}

async function cleanupSeed(seed: Seed) {
  await deleteFixtureRows(seed.userId);
}

async function openEditor(
  page: Page,
  seed: Seed,
  mode: UserMode,
  viewport = DESKTOP
) {
  await page.setViewportSize(viewport);
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
  const sessionReady = page.waitForResponse(async (response) => {
    if (new URL(response.url()).pathname !== "/api/auth/session") return false;
    if (response.status() !== 200) return false;
    const payload = (await response.json()) as { user?: unknown } | null;
    return Boolean(payload?.user);
  });
  await page.goto(mode === "pro" ? "/design?mode=designer" : "/design", {
    waitUntil: "domcontentloaded",
  });
  await sessionReady;
  const scene = page.getByTestId("scene-canvas");
  await expect(scene).toHaveCount(1);
  await expect(scene).toBeVisible();
  await expect(scene).toHaveAttribute("data-client-hydrated", "true");
  if (mode === "pro") {
    await expect(page.getByTestId("pro-mode-indicator")).toBeVisible();
  }
}

async function openMyDesigns(page: Page, entry: "pointer" | "keyboard") {
  const more = page.getByTestId("editor-command-overflow");
  const action = page.getByTestId("editor-command-overflow-load");
  if (await action.count() === 0) {
    if (entry === "pointer") await more.click();
    else {
      await more.focus();
      await page.keyboard.press("Enter");
    }
  }
  await expect(action).toHaveCount(1);
  await expect(action).toBeVisible();
  if (entry === "pointer") await action.click();
  else {
    await action.focus();
    await page.keyboard.press("Enter");
  }
  const dialog = page.getByRole("dialog", { name: "My Designs" });
  await expect(dialog).toHaveCount(1);
  await expect(dialog).toBeVisible();
  return dialog;
}

async function expectParentContract(page: Page) {
  const dialog = page.getByRole("dialog", { name: "My Designs" });
  await expect(dialog).toHaveAttribute("aria-modal", "true");
  await expect(dialog).toHaveAttribute("data-editor-dialog-focus-trap", "active");
  await expect(page.getByTestId("load-designs-close")).toBeFocused();
  const background = await page.getByTestId("editor-command-overflow").evaluate((element) => {
    const owner = element.closest<HTMLElement>("[inert]");
    return { inert: Boolean(owner?.inert), ariaHidden: owner?.getAttribute("aria-hidden") };
  });
  expect(background).toEqual({ inert: true, ariaHidden: "true" });
  return dialog;
}

async function expectFocusInside(page: Page, containerTestId: string) {
  expect(
    await page.evaluate((testId) => {
      const container = document.querySelector<HTMLElement>(`[data-testid="${testId}"]`);
      return Boolean(container?.contains(document.activeElement));
    }, containerTestId)
  ).toBe(true);
}

async function openSingleConfirm(page: Page, designId: string) {
  const action = page.getByTestId(`delete-saved-design-${designId}`);
  await action.click();
  const confirm = page.getByRole("dialog", { name: "Delete saved design?" });
  await expect(confirm).toHaveCount(1);
  await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
  return { action, confirm };
}

async function expectNestedOwnership(page: Page, confirmName: string) {
  const parent = page.getByTestId("load-designs-modal");
  expect(
    await parent.evaluate((element) => ({
      inert: (element as HTMLElement).inert,
      ariaHidden: element.getAttribute("aria-hidden"),
    }))
  ).toEqual({ inert: true, ariaHidden: "true" });
  await expect(page.getByRole("dialog", { name: confirmName })).toHaveCount(1);
  expect(
    await page.evaluate(() =>
      document.querySelectorAll(':is([role="dialog"], [role="alertdialog"])[aria-modal="true"]').length
    )
  ).toBe(2);
}

test.afterAll(async () => {
  await prisma.$disconnect();
});

test("consumer parent pointer lifecycle owns semantics, containment, dismissal, return, and lazy entry", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "consumer", ["Consumer Living Room"]);
  try {
    await openEditor(page, seed, "consumer");
    await expect(page.getByRole("dialog", { name: "My Designs" })).toHaveCount(0);
    const scriptsBefore = await page.evaluate(() =>
      performance.getEntriesByType("resource").map(({ name }) => name).filter((name) => name.endsWith(".js"))
    );
    const dialog = await openMyDesigns(page, "pointer");
    await expectParentContract(page);
    await expect.poll(async () =>
      page.evaluate((before) =>
        performance.getEntriesByType("resource")
          .map(({ name }) => name)
          .filter((name) => name.endsWith(".js") && !before.includes(name)).length,
        scriptsBefore
      )
    ).toBeGreaterThan(0);
    await page.keyboard.press("Shift+Tab");
    await expectFocusInside(page, "load-designs-modal");
    await page.keyboard.press("Tab");
    await expectFocusInside(page, "load-designs-modal");
    await page.keyboard.press("Escape");
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("editor-command-overflow")).toBeFocused();

    await openMyDesigns(page, "pointer");
    await page.getByTestId("load-designs-close").click();
    await expect(page.getByRole("dialog", { name: "My Designs" })).toHaveCount(0);
    await expect(page.getByTestId("editor-command-overflow")).toBeFocused();
  } finally {
    await cleanupSeed(seed);
  }
});

test("pro keyboard and narrow lifecycle preserves backdrop return without overflow or clipped focus", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "pro", ["Pro Living Room"]);
  try {
    await openEditor(page, seed, "pro", MOBILE);
    const dialog = await openMyDesigns(page, "keyboard");
    await expectParentContract(page);
    const geometry = await dialog.evaluate((element) => {
      const panel = element.firstElementChild as HTMLElement;
      const close = element.querySelector<HTMLElement>('[data-testid="load-designs-close"]');
      const panelRect = panel.getBoundingClientRect();
      const closeRect = close?.getBoundingClientRect();
      return {
        documentWidth: document.documentElement.scrollWidth,
        viewportWidth: innerWidth,
        panel: { left: panelRect.left, right: panelRect.right, top: panelRect.top, bottom: panelRect.bottom },
        close: closeRect
          ? { left: closeRect.left, right: closeRect.right, top: closeRect.top, bottom: closeRect.bottom }
          : null,
      };
    });
    expect(geometry.documentWidth).toBe(geometry.viewportWidth);
    expect(geometry.panel.left).toBeGreaterThanOrEqual(0);
    expect(geometry.panel.right).toBeLessThanOrEqual(MOBILE.width);
    expect(geometry.panel.top).toBeGreaterThanOrEqual(0);
    expect(geometry.panel.bottom).toBeLessThanOrEqual(MOBILE.height);
    expect(geometry.close?.left).toBeGreaterThanOrEqual(geometry.panel.left);
    expect(geometry.close?.right).toBeLessThanOrEqual(geometry.panel.right);
    await dialog.click({ position: { x: 2, y: 2 } });
    await expect(dialog).toHaveCount(0);
    await expect(page.getByTestId("editor-command-overflow")).toBeFocused();
  } finally {
    await cleanupSeed(seed);
  }
});

test("loading, empty, and populated states retain one parent owner", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "consumer", []);
  let releaseList!: () => void;
  let listRequested!: () => void;
  const listGate = new Promise<void>((resolve) => { releaseList = resolve; });
  const requested = new Promise<void>((resolve) => { listRequested = resolve; });
  await page.route("**/api/designs", async (route) => {
    if (route.request().method() !== "GET") return route.continue();
    listRequested();
    await listGate;
    await route.continue();
  });
  try {
    await openEditor(page, seed, "consumer");
    const open = openMyDesigns(page, "pointer");
    await requested;
    await expect(page.getByText("Loading your designs...")).toBeVisible();
    releaseList();
    const dialog = await open;
    await expect(page.getByText("No saved designs yet")).toBeVisible();
    await expectParentContract(page);
    await dialog.getByRole("button", { name: "Close My Designs" }).click();

    const id = `ch0015d-design-${fixtureIdentity(testInfo)}-populated`;
    await prisma.design.create({
      data: { id, title: "Now Populated", roomWidth: 5.8, roomDepth: 4.2, items: [], zones: [], savedViews: [], userId: seed.userId },
    });
    seed.designIds.push(id);
    await page.unroute("**/api/designs");
    await openMyDesigns(page, "pointer");
    await expect(page.getByTestId(`load-design-${id}`)).toBeVisible();
    await expect(page.getByTestId("load-designs-bulk-toolbar")).toBeVisible();
  } finally {
    releaseList();
    await cleanupSeed(seed);
  }
});

test("single delete cancel and success conceal the parent and restore a current semantic target", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "consumer", ["Oldest", "Middle", "Newest"]);
  const [oldestId, middleId, newestId] = seed.designIds;
  let deleteCalls = 0;
  page.on("request", (request) => {
    if (request.method() === "DELETE" && new URL(request.url()).pathname === `/api/designs/${newestId}`) deleteCalls += 1;
  });
  try {
    await openEditor(page, seed, "consumer");
    await openMyDesigns(page, "pointer");
    const firstConfirm = await openSingleConfirm(page, newestId);
    await expectNestedOwnership(page, "Delete saved design?");
    await firstConfirm.action.evaluate((button) => (button as HTMLButtonElement).focus());
    await expect(firstConfirm.confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Tab");
    expect(await firstConfirm.confirm.evaluate((dialog) => dialog.contains(document.activeElement))).toBe(true);
    await page.keyboard.press("Escape");
    await expect(firstConfirm.confirm).toHaveCount(0);
    await expect(firstConfirm.action).toBeFocused();

    const secondConfirm = await openSingleConfirm(page, newestId);
    await secondConfirm.confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(secondConfirm.confirm).toHaveCount(0);
    await expect(page.getByTestId(`delete-saved-design-${newestId}`)).toHaveCount(0);
    await expect(page.getByTestId(`load-design-${middleId}`)).toBeFocused();
    expect(deleteCalls).toBe(1);
    expect(await prisma.design.count({ where: { userId: seed.userId } })).toBe(2);
    await expect(page.getByTestId(`load-design-${oldestId}`)).toBeVisible();
  } finally {
    await cleanupSeed(seed);
  }
});

test("failed single delete invokes once and restores the surviving delete action", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "consumer", ["Failure Target"]);
  const [designId] = seed.designIds;
  let deleteCalls = 0;
  await page.route(`**/api/designs/${designId}`, async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    deleteCalls += 1;
    await route.fulfill({ status: 503, contentType: "application/json", body: '{"error":"fixture failure"}' });
  });
  try {
    await openEditor(page, seed, "consumer");
    await openMyDesigns(page, "pointer");
    const { action, confirm } = await openSingleConfirm(page, designId);
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(action).toBeFocused();
    await expect(page.getByTestId(`load-design-${designId}`)).toBeVisible();
    expect(deleteCalls).toBe(1);
    expect(await prisma.design.count({ where: { userId: seed.userId } })).toBe(1);
  } finally {
    await cleanupSeed(seed);
  }
});

test("bulk delete cancel, busy guard, and success invoke once per target and focus the surviving row", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "consumer", ["Survivor", "Delete B", "Delete C"]);
  const [survivorId, secondId, thirdId] = seed.designIds;
  let releaseDelete!: () => void;
  const deleteGate = new Promise<void>((resolve) => { releaseDelete = resolve; });
  const deleteCalls: string[] = [];
  await page.route("**/api/designs/*", async (route) => {
    if (route.request().method() !== "DELETE") return route.continue();
    deleteCalls.push(new URL(route.request().url()).pathname);
    if (deleteCalls.length === 1) await deleteGate;
    await route.continue();
  });
  try {
    await openEditor(page, seed, "consumer");
    await openMyDesigns(page, "pointer");
    await page.getByTestId(`select-saved-design-${secondId}`).check();
    await page.getByTestId(`select-saved-design-${thirdId}`).check();
    const bulkAction = page.getByTestId("delete-selected-saved-designs");
    await bulkAction.click();
    let confirm = page.getByRole("dialog", { name: "Delete 2 selected designs?" });
    await expectNestedOwnership(page, "Delete 2 selected designs?");
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(bulkAction).toBeFocused();

    await bulkAction.click();
    confirm = page.getByRole("dialog", { name: "Delete 2 selected designs?" });
    const confirmAction = confirm.getByRole("button", { name: "Delete", exact: true });
    await confirmAction.click();
    await expect.poll(() => deleteCalls.length).toBe(1);
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeDisabled();
    await expect(confirm.getByRole("button", { name: "Working..." })).toBeDisabled();
    await confirm.getByRole("button", { name: "Working..." }).evaluate((button) =>
      (button as HTMLButtonElement).click()
    );
    expect(deleteCalls).toHaveLength(1);
    await expectNestedOwnership(page, "Delete 2 selected designs?");
    releaseDelete();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByTestId(`load-design-${survivorId}`)).toBeFocused();
    expect(deleteCalls).toHaveLength(2);
    expect(new Set(deleteCalls)).toEqual(new Set([`/api/designs/${secondId}`, `/api/designs/${thirdId}`]));
    expect(await prisma.design.count({ where: { userId: seed.userId } })).toBe(1);
  } finally {
    releaseDelete();
    await cleanupSeed(seed);
  }
});

test("deleting the loaded final design preserves detach semantics and focuses the empty parent hierarchy", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "consumer", ["Loaded Target"]);
  const [designId] = seed.designIds;
  try {
    await openEditor(page, seed, "consumer");
    await openMyDesigns(page, "pointer");
    await page.getByTestId(`load-design-${designId}`).click();
    await expect(page.getByRole("dialog", { name: "My Designs" })).toHaveCount(0);
    await expect(page).toHaveURL(new RegExp(`[?&]designId=${designId}(?:&|$)`));
    await expect(page.getByTestId("qa-editor-cloud-design")).toHaveAttribute("data-design-id", designId);

    await openMyDesigns(page, "pointer");
    await page.getByTestId("delete-all-saved-designs").click();
    const confirm = page.getByRole("dialog", { name: "Delete all saved designs?" });
    await confirm.getByRole("button", { name: "Delete", exact: true }).click();
    await expect(confirm).toHaveCount(0);
    await expect(page.getByText("No saved designs yet")).toBeVisible();
    await expect(page.getByTestId("load-designs-close")).toBeFocused();
    await expect(page.getByTestId("qa-editor-cloud-design")).toHaveAttribute("data-design-id", "");
    expect(await prisma.design.count({ where: { userId: seed.userId } })).toBe(0);
  } finally {
    await cleanupSeed(seed);
  }
});

test("semantic replacement, newer owned dialog, reopen, and route unmount suppress stale restoration", async ({ page }, testInfo) => {
  const seed = await createSeed(testInfo, "consumer", ["Supersession Target"]);
  const [designId] = seed.designIds;
  try {
    await openEditor(page, seed, "consumer");
    let parent = await openMyDesigns(page, "pointer");
    await page.getByTestId("editor-command-overflow").evaluate((element) => {
      const id = element.id;
      element.removeAttribute("id");
      const replacement = document.createElement("button");
      replacement.id = id;
      replacement.dataset.testid = "my-designs-replacement-opener";
      replacement.textContent = "Replacement My Designs opener";
      document.body.append(replacement);
    });
    await page.getByTestId("load-designs-close").click();
    await expect(page.getByTestId("my-designs-replacement-opener")).toBeFocused();

    await openMyDesigns(page, "pointer");
    await page.getByTestId(`load-design-${designId}`).click();
    await expect(page).toHaveURL(new RegExp(`[?&]designId=${designId}(?:&|$)`));
    await expect(page.getByTestId("my-designs-replacement-opener")).not.toBeFocused();
    await expect(page.getByTestId("qa-editor-cloud-design")).toHaveAttribute(
      "data-design-id",
      designId
    );

    await openMyDesigns(page, "pointer");
    const { action, confirm } = await openSingleConfirm(page, designId);
    await page.getByTestId("editor-command-overflow").evaluate((button) =>
      (button as HTMLButtonElement).click()
    );
    const renameOpener = page.getByTestId("editor-command-overflow-rename-room");
    await expect(renameOpener).toHaveCount(1);
    await renameOpener.evaluate((button) => (button as HTMLButtonElement).click());
    const renameDialog = page.getByTestId("room-rename-dialog");
    await expect(renameDialog).toBeVisible();
    await expect(page.getByTestId("room-rename-input")).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(renameDialog).toHaveCount(0);
    await expect(confirm.getByRole("button", { name: "Cancel" })).toBeFocused();
    await page.keyboard.press("Escape");
    await expect(confirm).toHaveCount(0);
    await expect(action).toBeFocused();

    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog", { name: "My Designs" })).toHaveCount(0);
    parent = await openMyDesigns(page, "pointer");
    const pendingRouteConfirm = await openSingleConfirm(page, designId);
    await expectNestedOwnership(page, "Delete saved design?");
    await page.goto("/", { waitUntil: "domcontentloaded" });
    await expect(parent).toHaveCount(0);
    await expect(pendingRouteConfirm.confirm).toHaveCount(0);
    expect(await page.evaluate(() => document.activeElement?.isConnected ?? false)).toBe(true);
  } finally {
    await cleanupSeed(seed);
  }
});
