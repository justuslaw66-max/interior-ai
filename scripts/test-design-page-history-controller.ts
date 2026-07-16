import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const root = process.cwd();
const hookSource = readFileSync(join(root, "lib/useDesignPageHistory.ts"), "utf8");
const pageSource = readFileSync(
  join(root, "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);

assert.match(
  hookSource,
  /useState\([\s\S]*?new HistoryManager\(captureSnapshot, restoreSnapshot, onHistoryChange\)/,
  "The history manager should be initialized once from explicit snapshot adapters."
);
assert.match(
  hookSource,
  /flushCoalescedHistoryTransaction\(\);[\s\S]*?history\.begin\(name\);[\s\S]*?action\(\);[\s\S]*?history\.commit\(\);[\s\S]*?history\.rollback\(\);/,
  "Discrete history transactions should flush coalesced work and roll back failed actions."
);
assert.match(
  hookSource,
  /idleMs = 420[\s\S]*?window\.clearTimeout[\s\S]*?window\.setTimeout[\s\S]*?history\.commit\(\)/,
  "Coalesced transactions should retain their original idle window and timer replacement."
);
assert.match(
  hookSource,
  /useEffect\(\(\) => flushCoalescedHistoryTransaction, \[flushCoalescedHistoryTransaction\]\)/,
  "Unmounting the controller should flush pending coalesced history."
);
assert.match(
  pageSource,
  /useDesignPageHistory\(\{[\s\S]*?captureSnapshot: \(\) => \(\{[\s\S]*?designSnapshot: designSnapshotRef\.current[\s\S]*?floorPlanUnderlay: floorPlanUnderlayRef\.current/,
  "The page adapter should capture every document and plan field from event-time refs."
);
assert.match(
  pageSource,
  /restoreSnapshot: \(snapshot: DesignPageHistorySnapshot\) => \{[\s\S]*?designSnapshotRef\.current = snapshot\.designSnapshot[\s\S]*?setFloorPlanUnderlayState\(snapshot\.floorPlanUnderlay\)/,
  "The page adapter should restore refs and React state together."
);

console.log("design page history controller guardrails passed");
