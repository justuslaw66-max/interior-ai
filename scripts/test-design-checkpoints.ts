import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  checkpointsToPrune,
  DESIGN_CHECKPOINT_INTERVAL_MS,
  DESIGN_CHECKPOINT_KEEP_DAYS,
  DESIGN_CHECKPOINT_KEEP_LATEST,
  recordDesignCheckpoint,
  restoredDesignData,
  withCurrentUnderlay,
  type CheckpointedDesign,
} from "../lib/design-checkpoints";
import { earlierVersionsRestoreBlockedReason } from "../lib/useDesignPageEarlierVersions";
import type { EditorSaveStatus } from "../lib/design-page-save-status";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");
const MINUTE = 60 * 1000;
const DAY = 24 * 60 * MINUTE;

// J, 7 Nov 2026: "Last 20 + daily for 14 days".
assert.equal(DESIGN_CHECKPOINT_KEEP_LATEST, 20);
assert.equal(DESIGN_CHECKPOINT_KEEP_DAYS, 14);
assert.equal(DESIGN_CHECKPOINT_INTERVAL_MS, 10 * MINUTE);

// A restore keeps the design's current plan image only when the version comes from its import.
{
  const underlay = { sourceJobId: "job-1", sourceAssetSha256: "a".repeat(64), opacity: 0.5 };
  const current = { rooms: [], floorPlan: { sourceJobId: "job-1", underlay, walls: [2] } };
  const version = { rooms: [{ id: "living" }], floorPlan: { sourceJobId: "job-1", walls: [1] } };
  const restored = withCurrentUnderlay(version, current) as typeof current;
  assert.deepEqual(restored.floorPlan.underlay, underlay);
  assert.deepEqual(restored.floorPlan.walls, [1]);
  assert.equal("underlay" in version.floorPlan, false, "the stored version is left as it was");
  const otherImport = { floorPlan: { sourceJobId: "job-2", underlay: { sourceJobId: "job-2" } } };
  assert.equal("underlay" in (withCurrentUnderlay(version, otherImport) as typeof current).floorPlan, false,
    "another import's image is never attached to this version");
  const unlinked = { floorPlan: { walls: [1] } };
  assert.equal("underlay" in (withCurrentUnderlay(unlinked, { floorPlan: { underlay: { opacity: 1 } } }) as typeof current).floorPlan,
    false, "neither naming an import is no match");
  assert.equal(withCurrentUnderlay(version, { rooms: [] }), version);
}

// Kept: the newest 20, plus the newest of each of the last 14 days.
{
  const now = new Date("2026-11-20T12:00:00.000Z");
  const recent = Array.from({ length: 25 }, (_, index) => ({ id: `recent-${index}`, createdAt: new Date(now.getTime() - index * MINUTE) }));
  const daily = Array.from({ length: 20 }, (_, day) => [
    // (day + 1) whole days back: the newest checkpoints fill today's slot.
    { id: `day-${day}-late`, createdAt: new Date(now.getTime() - (day + 1) * DAY - 2 * 60 * MINUTE) },
    { id: `day-${day}-early`, createdAt: new Date(now.getTime() - (day + 1) * DAY - 20 * 60 * MINUTE) },
  ]).flat();
  const prune = new Set(checkpointsToPrune([...recent, ...daily], now));
  for (let index = 0; index < 20; index += 1) assert.equal(prune.has(`recent-${index}`), false);
  for (let index = 20; index < 25; index += 1) assert.equal(prune.has(`recent-${index}`), true, `recent-${index} is beyond the 20`);
  for (let day = 0; day < 13; day += 1) {
    assert.equal(prune.has(`day-${day}-late`), false, `day ${day + 1} keeps its newest`);
    assert.equal(prune.has(`day-${day}-early`), true);
  }
  for (let day = 13; day < 20; day += 1) assert.equal(prune.has(`day-${day}-late`), true, `day ${day + 1} is past two weeks`);
  assert.deepEqual(checkpointsToPrune([], now), []);
}

function fakeClient() {
  const rows: { id: string; designId: string; createdAt: Date; reason: string }[] = [];
  const statements: string[] = [];
  const client = {
    $executeRaw: async (strings: TemplateStringsArray, ...values: unknown[]) => {
      statements.push(strings.join("?"));
      const [id, createdAt, reason, designId] = values as [string, Date, string, string];
      if (designId !== "design-a") return 0;
      rows.push({ id, designId, createdAt, reason });
      return 1;
    },
    designCheckpoint: {
      findFirst: async ({ where }: { where: { designId: string } }) =>
        rows.filter((row) => row.designId === where.designId).sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime())[0] ?? null,
      findMany: async ({ where }: { where: { designId: string } }) => rows.filter((row) => row.designId === where.designId),
      deleteMany: async ({ where }: { where: { id: { in: string[] } } }) => {
        for (const id of where.id.in) rows.splice(rows.findIndex((row) => row.id === id), 1);
        return { count: where.id.in.length };
      },
    },
  };
  return { rows, statements, client: client as unknown as Parameters<typeof recordDesignCheckpoint>[0] };
}

const design: CheckpointedDesign = {
  id: "design-a", updatedAt: new Date("2026-11-07T08:00:00.000Z"), title: "Flat", roomWidth: 5.8, roomDepth: 4,
  items: [], zones: null, savedViews: null,
  snapshot: { rooms: [], floorPlan: { sourceJobId: "job-1", underlay: { sourceJobId: "job-1" } } },
};

// A save keeps one at most every 10 minutes; a restore always does; the oldest beyond the rule go.
(async () => {
  const { rows, statements, client } = fakeClient();
  const start = new Date("2026-11-07T08:00:00.000Z");
  assert.equal(await recordDesignCheckpoint(client, "design-a", "save", start), true, "the first save keeps the version before it");
  assert.equal(await recordDesignCheckpoint(client, "design-a", "save", new Date(start.getTime() + 9 * MINUTE)), false);
  assert.equal(await recordDesignCheckpoint(client, "design-a", "restore", new Date(start.getTime() + 9 * MINUTE)), true);
  assert.equal(await recordDesignCheckpoint(client, "design-a", "save", new Date(start.getTime() + 20 * MINUTE)), true);
  assert.equal(rows.length, 3);
  assert.equal(await recordDesignCheckpoint(client, "gone", "restore", start), false, "no design row, no checkpoint");
  // The copy is made in the database, from the row the transaction sees, without the image link.
  assert.match(statements[0], /INSERT INTO "DesignCheckpoint"[\s\S]*SELECT[\s\S]*"snapshot" #- '\{floorPlan,underlay\}'[\s\S]*FROM "Design" WHERE "id" = \?/);
  for (let index = 0; index < 30; index += 1) {
    await recordDesignCheckpoint(client, "design-a", "save", new Date(start.getTime() + (30 + index * 11) * MINUTE));
  }
  assert.equal(rows.length, DESIGN_CHECKPOINT_KEEP_LATEST, "one day's saves keep the newest 20");

  // Restoring writes the version back with the design's current image link.
  const version = { ...design, snapshot: { rooms: [], floorPlan: { sourceJobId: "job-1" } } };
  const data = restoredDesignData(version, design);
  assert.deepEqual((data.snapshot as { floorPlan: { underlay: unknown } }).floorPlan.underlay, { sourceJobId: "job-1" });
  assert.equal(data.title, "Flat");
  // An empty column in the version empties it in the design, rather than keeping today's.
  const empty = restoredDesignData({ ...version, snapshot: null }, design);
  // (Prisma.DbNull: in the cloud test kit's Prisma stand-in it isn't one shared value, so only "written".)
  for (const column of [empty.snapshot, empty.zones, empty.savedViews]) {
    assert.notEqual(column, undefined, "an empty column is written, never left as it is");
    assert.notEqual(column, null);
  }

  // Restore stays off while the account lacks what's on screen.
  const status = (kind: EditorSaveStatus["kind"], source: EditorSaveStatus["source"]) =>
    ({ kind, source, label: "", detail: "", tone: "saved", canRetry: false, lastSuccessfulSaveAt: null, cloudBacked: true }) as EditorSaveStatus;
  assert.equal(earlierVersionsRestoreBlockedReason({ cloudRevision: "r1", saveStatus: status("saved", "cloud") }), null);
  assert.equal(earlierVersionsRestoreBlockedReason({ cloudRevision: "r1", saveStatus: status("pending", "cloud") }), null);
  assert.ok(earlierVersionsRestoreBlockedReason({ cloudRevision: "r1", saveStatus: status("saving", "cloud") }));
  assert.ok(earlierVersionsRestoreBlockedReason({ cloudRevision: "r1", saveStatus: status("saved", "local") }));
  assert.ok(earlierVersionsRestoreBlockedReason({ cloudRevision: "r1", saveStatus: status("failed", "cloud") }));
  assert.ok(earlierVersionsRestoreBlockedReason({ cloudRevision: "r1", saveStatus: status("conflict", "cloud") }));
  assert.ok(earlierVersionsRestoreBlockedReason({ cloudRevision: null, saveStatus: status("saved", "cloud") }));

  // Wiring: saves keep a version inside their transaction, before the write.
  const put = source("app/api/designs/[id]/route.ts");
  assert.match(put, /\$transaction\(async \(transaction\) => \{[\s\S]*?await recordDesignCheckpoint\(transaction, id, "save"\);[\s\S]*?transaction\.design\.updateMany/);
  const restore = source("app/api/designs/[id]/checkpoints/[checkpointId]/restore/route.ts");
  assert.match(restore, /findFirst\(\{ where: \{ id, userId \} \}\)/, "only the owner restores");
  assert.match(restore, /designCheckpoint\.findFirst\(\{ where: \{ id: checkpointId, designId: id \} \}\)/);
  assert.match(restore, /Free beta limit: max 20 items per design\.[\s\S]*?await recordDesignCheckpoint\(transaction, design\.id, "restore"\);[\s\S]*?sanitizePrivateFloorPlanUnderlayForSave[\s\S]*?updatedAt: design\.updatedAt[\s\S]*?syncFloorPlanDesignReference/);
  assert.match(restore, /typeof expectedUpdatedAt !== "string"/, "a restore names the revision it was made on");
  assert.match(restore, /err instanceof FloorPlanDesignReferenceSyncError[\s\S]*?409, "CONFLICT",\s*"This version's floor plan is no longer available/,
    "a version whose floor plan is gone says why it can't come back");
  assert.match(restore, /\{ timeout: 20_000 \}/);
  const list = source("app/api/designs/[id]/checkpoints/route.ts");
  assert.match(list, /where: \{ id, userId: session\.user\.id \}/, "only the owner lists them");
  assert.doesNotMatch(list, /snapshot: true|items: true/, "the list carries no design content");

  // The table, as the migration makes it.
  const schema = source("prisma/schema.prisma");
  assert.match(schema, /model DesignCheckpoint \{[\s\S]*?design\s+Design\s+@relation\(fields: \[designId\], references: \[id\], onDelete: Cascade\)/);
  const migration = source("prisma/migrations/20261107160000_add_design_checkpoints/migration.sql");
  assert.match(migration, /CREATE TABLE "DesignCheckpoint"/);
  assert.match(migration, /CREATE INDEX "DesignCheckpoint_designId_createdAt_idx"/);
  assert.match(migration, /REFERENCES "Design"\("id"\) ON DELETE CASCADE/);

  // The editor: More → Earlier versions, and the dialog in the dialog layer.
  assert.match(source("components/editor/command-bar/CommandBarMoreMenu.tsx"),
    /testId="editor-command-overflow-earlier-versions" onSelect=\{props\.onOpenEarlierVersions\}/);
  assert.match(source("components/editor/design-page/DesignPageDialogLayer.tsx"), /<DesignEarlierVersionsDialog \{\.\.\.dialogs\.earlierVersions\} \/>/);
  assert.match(source("lib/useDesignPageEditorChromeController.ts"), /onOpenEarlierVersions: actions\.dialogs\.openEarlierVersions/);

  console.log("design checkpoints: ok");
})().catch((error) => {
  console.error(error);
  process.exit(1);
});
