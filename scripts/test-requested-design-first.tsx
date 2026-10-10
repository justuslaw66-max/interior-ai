import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { type CATALOG_ITEMS } from "@/lib/catalog";
import {
  openRequestedDesignBeforeBackup,
  openRequestedDesignThenBackup,
  readLocalBackupDesignId,
  shouldOpenRequestedDesignFirst,
  type RequestedDesignFirstInput,
} from "@/lib/design-page-requested-design-load";
import type { DesignPageCloudLoadResult } from "@/lib/design-page-types";

// Opening a design by its link while this browser's backup holds another design: the requested
// design opens first, instead of the backup showing (and being checked against the cloud) before
// it (UX phase 4a). The backup waits untouched and comes back if the requested design can't open.

const backup = (designId?: string) =>
  JSON.stringify({
    version: 3,
    ...(designId === undefined ? {} : { designId }),
    activeRoomId: "room_living",
    rooms: [
      {
        id: "room_living",
        name: "Living Room",
        roomType: "living",
        geometry: { width: 5, depth: 4, wallThickness: 0.2 },
        items: [],
        zones: [],
        savedViews: [],
      },
    ],
  });

type Log = { loads: string[]; hydrated: boolean[]; restored: string[]; replaced: string[] };

const harness = (result: DesignPageCloudLoadResult, search = "?designId=design-b&view=2d") => {
  const log: Log = { loads: [], hydrated: [], restored: [], replaced: [] };
  const input: RequestedDesignFirstInput = {
    state: { roomWidth: 5, roomDepth: 4, wallThickness: 0.2 },
    configuration: {
      catalogItems: {} as typeof CATALOG_ITEMS,
      resolveConfiguredPlanningDimsMm: () => ({ w: 1000, d: 1000, h: 1000 }),
    },
    refs: { designSnapshot: { current: { activeRoomId: "room_living" } } },
    actions: {
      loadDesign: async (id) => {
        log.loads.push(id);
        return result;
      },
      setLocalBackupHydrated: (value) => {
        log.hydrated.push(typeof value === "function" ? value(false) : value);
      },
    },
  };
  const restoreRawBackup = async (raw: string) => {
    log.restored.push(raw);
    return true;
  };
  const browser = {
    location: { search },
    history: { replaceState: (_state: unknown, _title: string, href?: string | URL | null) => {
      log.replaced.push(String(href));
    } },
  };
  return { log, input, restoreRawBackup, browser };
};
const settle = () => new Promise((resolve) => setImmediate(resolve));

async function main() {
  // Which backups wait.
  assert.equal(shouldOpenRequestedDesignFirst("design-b", "design-a"), true);
  assert.equal(shouldOpenRequestedDesignFirst("design-b", null), true, "A backup never saved to the cloud waits too.");
  assert.equal(shouldOpenRequestedDesignFirst("design-b", "design-b"), false, "The backup of the requested design restores as before.");
  assert.equal(shouldOpenRequestedDesignFirst("", "design-a"), false, "No link: the backup restores as before.");
  assert.equal(shouldOpenRequestedDesignFirst("design-b", undefined), false, "An invalid backup still goes to recovery.");

  const { input } = harness("loaded");
  assert.equal(readLocalBackupDesignId(backup("design-a"), input), "design-a");
  assert.equal(readLocalBackupDesignId(backup(), input), null);
  assert.equal(readLocalBackupDesignId("{not json", input), undefined);
  assert.equal(readLocalBackupDesignId(JSON.stringify({ version: 99 }), input), undefined);

  // The requested design opens; the backup is never shown, and it is replaced only by the next
  // backup write, which waits for hydration.
  for (const result of ["loaded", "superseded"] as const) {
    const run = harness(result);
    await openRequestedDesignThenBackup({
      raw: backup("design-a"),
      requestedDesignId: "design-b",
      backupDesignId: "design-a",
      actions: run.input.actions,
      restoreRawBackup: run.restoreRawBackup,
      browser: run.browser,
    });
    assert.deepEqual(run.log, { loads: ["design-b"], hydrated: [true], restored: [], replaced: [] }, result);
  }

  // It can't open: the backup comes back as before, and the address names the backup's design.
  const missing = harness("missing");
  await openRequestedDesignThenBackup({
    raw: backup("design-a"),
    requestedDesignId: "design-b",
    backupDesignId: "design-a",
    actions: missing.input.actions,
    restoreRawBackup: missing.restoreRawBackup,
    browser: missing.browser,
  });
  assert.deepEqual(missing.log.loads, ["design-b"]);
  assert.deepEqual(missing.log.hydrated, [], "The restore marks hydration once the backup is back.");
  assert.deepEqual(missing.log.restored, [backup("design-a")]);
  assert.deepEqual(missing.log.replaced, ["/design?designId=design-a&view=2d"]);

  const unsaved = harness("unavailable");
  await openRequestedDesignThenBackup({
    raw: backup(),
    requestedDesignId: "design-b",
    backupDesignId: null,
    actions: unsaved.input.actions,
    restoreRawBackup: unsaved.restoreRawBackup,
    browser: unsaved.browser,
  });
  assert.deepEqual(unsaved.log.replaced, ["/design"]);
  assert.deepEqual(unsaved.log.restored, [backup()]);

  // The mount-time entry point: it takes over only when a link names another design.
  const takeover = harness("loaded");
  assert.equal(
    openRequestedDesignBeforeBackup(backup("design-a"), takeover.input, takeover.restoreRawBackup, takeover.browser),
    true
  );
  await settle();
  assert.deepEqual(takeover.log.loads, ["design-b"]);
  assert.deepEqual(takeover.log.hydrated, [true]);
  for (const [raw, search] of [
    [backup("design-b"), "?designId=design-b"],
    [backup("design-a"), "?view=2d"],
    ["{not json", "?designId=design-b"],
  ] as const) {
    const run = harness("loaded", search);
    assert.equal(openRequestedDesignBeforeBackup(raw, run.input, run.restoreRawBackup, run.browser), false, `${search} ${raw.slice(0, 12)}`);
    await settle();
    assert.deepEqual(run.log.loads, []);
  }

  // Wiring: the one-shot mount restore asks first, and keeps its old path otherwise.
  const hydration = readFileSync(join(process.cwd(), "lib/useDesignPageLocalBackupHydration.ts"), "utf8");
  assert.match(
    hydration,
    /if \(openRequestedDesignBeforeBackup\(raw, initialInput, restoreRawBackup\)\) return;\s*void restoreRawBackup\(raw\);/
  );
  console.log("Requested design first checks passed.");
}

void main().catch((error) => {
  console.error(error);
  process.exit(1);
});
