import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type ReactElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { AppRouterContext } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { AppHeader } from "../components/app-header/AppHeader";
import { MyDesignCardView } from "../components/my-designs/MyDesignCardView";
import { MyDesignsSignedOut } from "../components/my-designs/MyDesignsSignedOut";
import { MyDesignsView } from "../components/my-designs/MyDesignsView";
import { ShareDesignDialog } from "../components/my-designs/ShareDesignDialog";
import { designLimitForPlan, FREE_PLAN_DESIGN_LIMIT, freePlanDesignLimitReachedMessage } from "../lib/design-limits";
import { withStoredDesignRename } from "../lib/design-route-payload";
import { buildMyDesignCard, designLimitSummary, formatEditedLabel, type MyDesignCard, type MyDesignRow } from "../lib/my-designs";
import { buildDesignPlanThumbnail } from "../lib/plan-thumbnail";
import { createRoom, migrateToV3, type DesignSnapshot } from "../lib/room-types";
import { NEW_DESIGN_HREF, PRICING_HREF } from "../lib/start-design-link";

// My designs as one page (audit findings MD1–MD4 and MD6): the plan's limit in one place, the
// cards (edit dates, thumbnails, Shared), rename keeping the stored name in step, and the markup.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// The limit: one number, used by the page and the design routes.
assert.equal(FREE_PLAN_DESIGN_LIMIT, 20);
assert.equal(designLimitForPlan("pro"), null);
assert.equal(designLimitForPlan("free"), 20);
assert.equal(designLimitForPlan(undefined), 20);
assert.equal(freePlanDesignLimitReachedMessage(), "Free beta limit reached (max 20 designs). Upgrade to create more.");
assert.equal(freePlanDesignLimitReachedMessage("import"), "Free beta limit reached (max 20 designs). Upgrade to import more.");
for (const route of [
  "app/api/designs/route.ts",
  "app/api/designs/[id]/duplicate/route.ts",
  "app/api/designs/import/route.ts",
  "app/api/designs/[id]/floor-plan-update/route.ts",
  "app/api/share/[shareToken]/duplicate/route.ts",
]) {
  const source = read(route);
  assert.match(source, /FREE_PLAN_DESIGN_LIMIT/, `${route} counts designs against the shared limit.`);
  assert.doesNotMatch(source, /max 20 designs|\}\) >= 20|[Cc]ount >= 20|parsedDesigns\.length > 20/, `${route} has no literal limit left.`);
}

// Edit dates, in Singapore time.
const now = new Date("2026-09-24T14:00:00Z"); // 22:00 in Singapore
assert.equal(formatEditedLabel(new Date("2026-09-24T01:00:00Z"), now), "Edited today");
assert.equal(formatEditedLabel(new Date("2026-09-23T16:30:00Z"), now), "Edited today", "00:30 on the 24th in Singapore.");
assert.equal(formatEditedLabel(new Date("2026-09-23T15:30:00Z"), now), "Edited yesterday");
assert.equal(formatEditedLabel(new Date("2026-09-21T03:00:00Z"), now), "Edited 21 Sep");
assert.equal(formatEditedLabel(new Date("2025-12-02T03:00:00Z"), now), "Edited 2 Dec 2025");

assert.deepEqual(designLimitSummary(7, 20), { text: "7 of 20 designs on the Free plan.", reached: false });
assert.deepEqual(designLimitSummary(20, 20), { text: "20 of 20 designs on the Free plan.", reached: true });
assert.equal(designLimitSummary(35, null), null, "Pro has no limit to show.");

// Cards: title, date, Shared, and a drawing of the active floor.
const base = migrateToV3({
  items: [],
  zones: [],
  roomBounds: { width: 4, depth: 5, wallThickness: 0.2, height: 2.7 },
} as unknown as DesignSnapshot);
const room = (id: string, roomType: "living" | "bedroom" | "kitchen", x: number, floorLevel = 1) => ({
  ...createRoom(id, id, roomType, { width: 4, depth: 3 }),
  planPosition: { x, z: 0 },
  floorLevel,
});
const twoFloors: DesignSnapshot = {
  ...base,
  rooms: [room("living", "living", 0), room("bed", "bedroom", 4), room("upstairs", "kitchen", 0, 2)],
  activeRoomId: "living",
};
const groundFloor = buildDesignPlanThumbnail(twoFloors);
assert.deepEqual(groundFloor?.rooms.map((entry) => [entry.id, entry.fill]), [["living", "#e7e5e4"], ["bed", "#ede9fe"]]);
for (const point of groundFloor?.rooms.flatMap((entry) => entry.points.split(" ")) ?? []) {
  const [x, y] = point.split(",").map(Number);
  assert.ok(x >= 0 && x <= 240 && y >= 0 && y <= 140, `${point} sits inside the 240 × 140 frame.`);
}
assert.deepEqual(buildDesignPlanThumbnail({ ...twoFloors, activeRoomId: "upstairs" })?.rooms.map((entry) => entry.id), ["upstairs"]);
assert.equal(buildDesignPlanThumbnail({ ...base, rooms: [] }), null);

const row = (overrides: Partial<MyDesignRow> = {}): MyDesignRow => ({
  id: "design-1", title: "Tan flat", updatedAt: new Date("2026-09-24T02:00:00Z"), shareEnabled: true,
  roomWidth: 4, roomDepth: 5, items: [], snapshot: null, ...overrides,
});
const legacy = buildMyDesignCard(row(), now);
assert.deepEqual({ ...legacy, thumbnail: legacy.thumbnail?.rooms.length },
  { id: "design-1", title: "Tan flat", editedLabel: "Edited today", shared: true, thumbnail: 1 });
assert.equal(buildMyDesignCard(row({ title: "  ", shareEnabled: false }), now).title, "My Living Room");
assert.equal(buildMyDesignCard(row({ snapshot: { rooms: "broken" } }), now).thumbnail?.rooms.length, 1,
  "A snapshot that can't be read falls back to the row's room size.");

// Renaming from My designs keeps the stored design's name in step (the shared page reads it).
assert.deepEqual(withStoredDesignRename({ title: "Tan flat" }, { version: 3, title: "Old" }),
  { title: "Tan flat", snapshot: { version: 3, title: "Tan flat" } });
assert.deepEqual(withStoredDesignRename({ title: "Tan flat", snapshot: { title: "Editor" } }, { title: "Old" }),
  { title: "Tan flat", snapshot: { title: "Editor" } }, "A save from the editor sends its own snapshot.");
assert.deepEqual(withStoredDesignRename({ title: "Tan flat" }, null), { title: "Tan flat" });
assert.deepEqual(withStoredDesignRename({ notes: "x" }, { title: "Old" }), { notes: "x" });
assert.match(read("app/api/designs/[id]/route.ts"), /const updateData = withStoredDesignRename\(updatePayload\.value, design\.snapshot\);/);

// Markup.
const render = (element: ReactElement) => renderToStaticMarkup(element);
const noop = () => undefined;
/** The opening tag with this test id, so attribute order doesn't matter. */
const tagWithTestId = (markup: string, testId: string) => {
  const found = new RegExp(`<[a-z]+ [^>]*data-testid="${testId}"[^>]*>`).exec(markup)?.[0];
  assert.ok(found, `markup has ${testId}`);
  return found;
};
const signedOutHeader = render(createElement(AppHeader, { current: "designs", account: null }));
assert.match(signedOutHeader, /data-testid="app-header-my-designs" aria-current="page"/);
assert.ok(tagWithTestId(signedOutHeader, "app-header-pricing").includes(`href="${PRICING_HREF}"`));
assert.match(signedOutHeader, /data-testid="app-header-sign-in"[^>]*>.*Sign in<\/button>/);
const memberHeader = render(createElement(AppHeader, { account: { name: "Justus", email: "j@example.com", planLabel: "Free plan" } }));
assert.match(memberHeader, /data-testid="app-header-account" aria-label="Account" aria-haspopup="menu" aria-expanded="false"[^>]*><span aria-hidden="true">J<\/span>/);
assert.doesNotMatch(memberHeader, /aria-current/);

const card: MyDesignCard = { ...legacy, title: "Tan flat" };
const cardMarkup = (menuOpen: boolean) => render(createElement(MyDesignCardView, {
  card, menuOpen, busy: false, onToggleMenu: noop, onCloseMenu: noop, onAction: noop,
}));
assert.ok(tagWithTestId(cardMarkup(false), "my-design-open-design-1").includes('href="/design?designId=design-1"'));
assert.match(cardMarkup(false), /data-testid="my-design-shared"[^>]*>.*Shared<\/span>/);
assert.match(cardMarkup(false), /id="my-design-actions-design-1"[^>]*aria-label="More actions for Tan flat" aria-haspopup="menu" aria-expanded="false"/);
assert.doesNotMatch(cardMarkup(false), /role="menu"/);
const menuItems = [...cardMarkup(true).matchAll(/role="menuitem"[^>]*>([^<]+)</g)].map(([, label]) => label);
assert.deepEqual(menuItems, ["Open", "Share", "Make a copy", "Rename", "Delete"]);

const fakeRouter = { back: noop, forward: noop, refresh: noop, push: noop, replace: noop, prefetch: noop, hmrRefresh: noop };
// useRouter needs the app router's context, which only Next.js provides outside tests.
const view = (props: Parameters<typeof MyDesignsView>[0]) =>
  render(createElement(AppRouterContext.Provider, { value: fakeRouter }, createElement(MyDesignsView, props)));
const free = view({ designs: [card], limit: designLimitSummary(1, 20) });
assert.match(free, /<h1[^>]*>My designs<\/h1>/);
assert.match(free, /data-testid="my-designs-limit"[^>]*>1 of 20 designs on the Free plan\. <a[^>]*href="\/design\?pricing=open"[^>]*>See pricing<\/a>/);
assert.ok(tagWithTestId(free, "my-designs-new-design").includes(`href="${NEW_DESIGN_HREF}"`));
assert.match(free, /data-testid="my-designs-grid"/);
assert.doesNotMatch(free, /my-designs-empty|design-rename-dialog|my-design-share-dialog/);
assert.match(view({ designs: [card], limit: designLimitSummary(20, 20) }), /Delete a design or upgrade to save more\./);
const pro = view({ designs: [], limit: null });
assert.doesNotMatch(pro, /my-designs-limit/);
assert.match(pro, /data-testid="my-designs-empty"/);

const share = (overrides: Partial<Parameters<typeof ShareDesignDialog>[0]>) => render(createElement(ShareDesignDialog, {
  open: true, designTitle: "Tan flat", url: "https://example.com/share/abc", errorMessage: null, copied: false,
  returnFocusIds: ["my-design-actions-design-1"], onCopy: noop, onClose: noop, ...overrides,
}));
assert.match(share({}), /Anyone with the link can view Tan flat\. They can&#x27;t change it\./);
assert.match(share({}), /value="https:\/\/example\.com\/share\/abc"/);
assert.match(share({}), /data-testid="my-design-share-copy"[^>]*>Copy link<\/button>/);
assert.match(share({}), /href="https:\/\/example\.com\/share\/abc" target="_blank" rel="noopener noreferrer"/);
assert.match(share({ copied: true }), /data-testid="my-design-share-status"[^>]*>Link copied\.<\/p>/);
assert.match(share({ url: null }), /data-testid="my-design-share-pending"[^>]*>Making the link…<\/p>/);
assert.match(share({ url: null, errorMessage: "Too many share requests." }), />Too many share requests\.<\/p>/);

const signedOut = render(createElement(MyDesignsSignedOut));
assert.match(signedOut, /Sign in to see your designs/);
assert.match(signedOut, /data-testid="my-designs-sign-in"[^>]*>Continue with Google<\/button>/);
assert.ok(tagWithTestId(signedOut, "my-designs-continue-as-guest").includes('href="/design"'));

// The page: a sign-in prompt for guests, never a redirect.
const page = read("app/dashboard/page.tsx");
assert.doesNotMatch(page, /redirect\(/);
assert.match(page, /if \(!userId\) \{[\s\S]*?<MyDesignsSignedOut \/>/);
assert.match(page, /designLimitSummary\(designs\.length, limit\)/);

console.log("My designs page tests passed.");
