import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import {
  emptyReviewHistory,
  recordReviewChange,
  redoReviewChange,
  REVIEW_HISTORY_COALESCE_MS,
  REVIEW_HISTORY_MAX_STEPS,
  reviewHistoryShortcut,
  undoReviewChange,
  type ReviewHistory,
} from "../lib/floor-plan-review-history";

const root = process.cwd();
const source = (file: string) => fs.readFileSync(path.join(root, file), "utf8");

type Doc = { name: string };
const doc = (name: string): Doc => ({ name });

// The stack keeps as many steps as the editor's history, and a gesture is one step.
assert.equal(REVIEW_HISTORY_MAX_STEPS, 100);
assert.equal(REVIEW_HISTORY_COALESCE_MS, 500);

/** Applies corrections `names` one after another, `gapMs` apart, from document "a". */
function corrected(names: string[], gapMs = 1_000) {
  let history: ReviewHistory<Doc> = emptyReviewHistory<Doc>();
  let current = doc("a");
  const documents = [current];
  names.forEach((name, index) => {
    history = recordReviewChange(history, current, 10_000 + index * gapMs);
    current = doc(name);
    documents.push(current);
  });
  return { history, current, documents };
}

function undo(history: ReviewHistory<Doc>, current: Doc) {
  const step = undoReviewChange(history, current);
  assert.ok(step, "there is a step to undo");
  return step;
}

function redo(history: ReviewHistory<Doc>, current: Doc) {
  const step = redoReviewChange(history, current);
  assert.ok(step, "there is a step to redo");
  return step;
}

// Four corrections: undo all four back to the document as it opened, then redo two.
{
  const { history: start, current: last, documents } = corrected(["b", "c", "d", "e"]);
  assert.equal(start.past.length, 4, "each correction is one step");
  let history = start;
  let current = last;
  for (let index = 3; index >= 0; index -= 1) {
    ({ history, document: current } = undo(history, current));
    assert.equal(current, documents[index], "undo puts back the very document before the correction");
  }
  assert.equal(undoReviewChange(history, current), null, "nothing left to undo");
  assert.equal(history.future.length, 4);
  ({ history, document: current } = redo(history, current));
  ({ history, document: current } = redo(history, current));
  assert.equal(current, documents[2], "redo goes forward in order");
  assert.equal(history.past.length, 2);
  assert.equal(history.future.length, 2);

  // A new correction after undoing drops what could be redone.
  const changed = recordReviewChange(history, current, 99_000);
  assert.deepEqual(changed.future, []);
  assert.equal(redoReviewChange(changed, doc("x")), null);
}

// Changes within half a second of each other (a drag, typing a value) are one step.
{
  const { history, current } = corrected(["b", "c", "d"], REVIEW_HISTORY_COALESCE_MS - 1);
  assert.equal(history.past.length, 1, "a gesture is one step");
  const step = undo(history, current);
  assert.equal(step.document.name, "a", "undo goes back to before the gesture");
  // Undo ends a gesture: a change straight after it is a step of its own.
  const two = corrected(["b", "c"]);
  const undone = undo(two.history, two.current);
  const after = recordReviewChange(undone.history, undone.document, 10_000 + 1_000 + 10);
  assert.equal(after.past.length, 2, "not folded into the step before the undo");
  assert.equal(recordReviewChange(after, doc("y"), 10_000 + 1_000 + 100).past.length, 2, "its own gesture still coalesces");
  const separate = recordReviewChange(emptyReviewHistory<Doc>(), doc("a"), 0);
  assert.equal(recordReviewChange(separate, doc("b"), REVIEW_HISTORY_COALESCE_MS).past.length, 2,
    "half a second apart is two steps");
}

// The stack keeps the newest 100 steps.
{
  const names = Array.from({ length: 130 }, (_, index) => `n${index}`);
  const { history, documents } = corrected(names);
  assert.equal(history.past.length, REVIEW_HISTORY_MAX_STEPS);
  assert.equal(history.past[0], documents[30], "the oldest steps go first");
  let state = { history, document: documents[130] };
  for (let index = 0; index < REVIEW_HISTORY_MAX_STEPS; index += 1) state = undo(state.history, state.document);
  assert.equal(undoReviewChange(state.history, state.document), null);
}

// The keys: the editor's (hooks/useUndoRedoHotkeys.ts), standing aside for fields and other dialogs.
{
  const reviewDialog = { matches: (selector: string) => selector === '[data-testid="floor-plan-import-dialog"]' };
  const otherDialog = { matches: () => false };
  const rootWith = (...owners: { matches: (selector: string) => boolean }[]) => ({ querySelectorAll: () => owners });
  const button = { tagName: "BUTTON", getAttribute: () => null } as unknown as EventTarget;
  const key = (overrides: Partial<Parameters<typeof reviewHistoryShortcut>[0]>) => ({
    key: "z", metaKey: false, ctrlKey: false, shiftKey: false, altKey: false, isComposing: false, target: button,
    ...overrides,
  });
  const mac = { isMac: true, root: rootWith(reviewDialog) };
  const other = { isMac: false, root: rootWith(reviewDialog) };
  assert.equal(reviewHistoryShortcut(key({ metaKey: true }), mac), "undo");
  assert.equal(reviewHistoryShortcut(key({ metaKey: true, shiftKey: true }), mac), "redo");
  assert.equal(reviewHistoryShortcut(key({ metaKey: true, key: "y" }), mac), "redo");
  assert.equal(reviewHistoryShortcut(key({ ctrlKey: true }), mac), null, "Ctrl+Z isn't undo on a Mac");
  assert.equal(reviewHistoryShortcut(key({ ctrlKey: true }), other), "undo");
  assert.equal(reviewHistoryShortcut(key({ ctrlKey: true, key: "Z", shiftKey: true }), other), "redo");
  assert.equal(reviewHistoryShortcut(key({ ctrlKey: true, key: "y" }), other), "redo");
  assert.equal(reviewHistoryShortcut(key({ key: "z" }), other), null, "Z alone does nothing");
  assert.equal(reviewHistoryShortcut(key({ ctrlKey: true, key: "x" }), other), null);
  for (const tagName of ["INPUT", "TEXTAREA", "SELECT"]) {
    const field = { tagName, getAttribute: () => null } as unknown as EventTarget;
    assert.equal(reviewHistoryShortcut(key({ ctrlKey: true, target: field }), other), null, `${tagName} keeps its own undo`);
  }
  const slider = { tagName: "DIV", getAttribute: (name: string) => (name === "role" ? "slider" : null) } as unknown as EventTarget;
  assert.equal(reviewHistoryShortcut(key({ ctrlKey: true, target: slider }), other), null);
  assert.equal(reviewHistoryShortcut(key({ ctrlKey: true, isComposing: true }), other), null, "an input method's composition");
  assert.equal(reviewHistoryShortcut(key({ ctrlKey: true }), { isMac: false, root: rootWith(reviewDialog, otherDialog) }), null,
    "a dialog over the review owns the keyboard");
  let asked = "";
  reviewHistoryShortcut(key({ ctrlKey: true }), { isMac: false, root: { querySelectorAll: (selector: string) => { asked = selector; return []; } } });
  assert.match(asked, /\[role="alertdialog"\]/, "an inline confirmation (deleting an upload) owns the keys too");
  assert.equal(reviewHistoryShortcut(key({ ctrlKey: true }), { isMac: false, root: null }), "undo");
}

// Wiring.
{
  const session = source("components/editor/useConsumerFloorPlanImportSession.ts");
  assert.match(session, /const \[candidate, setRawCandidate\] = useState<FloorPlanDocumentV2 \| null>\(null\);\n\s*const \{ setCandidate, replaceCandidate, history: reviewHistory \} = useFloorPlanReviewHistory\(candidate, setRawCandidate\);/);
  assert.match(session, /replaceCandidate\(null\);/, "a new upload or reopened job starts without history");
  assert.match(session, /replaceCandidate\(parseFloorPlanImportDocument\(job\.candidateJson\)\);/);

  const assistant = source("components/editor/FloorPlanImportAssistant.tsx");
  assert.doesNotMatch(assistant, /setCandidate\(parseFloorPlanImportDocument/, "documents from the server never become undo steps");
  // Every document the server sends starts the history afresh, a saved draft included: the server compares what is
  // sent with what it holds, so undoing past a save would send detected values back as the person's corrections.
  assert.equal(assistant.match(/replaceCandidate\(parseFloorPlanImportDocument\(job\.candidateJson\)\);/g)?.length, 3);
  assert.doesNotMatch(assistant, /keepHistory/);
  assert.match(assistant, /<FloorPlanReviewDraftSave disabled=\{photoReviewBusy\(disabled,retryingDetection\)\}[\s\S]*?history=\{reviewHistory\}/,
    "Undo, Redo and Save review draft stand still during a detection retry");
  assert.match(assistant, /reviewRestores=\{reviewHistory\.restores\}/);

  const hook = source("components/editor/useFloorPlanReviewHistory.ts");
  assert.match(hook, /if \(candidate && next\) setHistory\(\(previous\) => recordReviewChange\(previous, candidate, now\)\);\n\s*else setHistory\(emptyReviewHistory<Document>\(\)\);/);
  assert.match(hook, /const replaceCandidate = useCallback\(\(next: Document \| null\) => \{\n\s*setHistory\(emptyReviewHistory<Document>\(\)\);/);
  assert.match(hook, /const setCandidate = useCallback\(\(next: Document \| null\) => \{/, "a whole document, never an update function");
  assert.equal(hook.match(/setRestores\(\(count\) => count \+ 1\);/g)?.length, 2, "undo and redo both count as a restore");

  const draftSave = source("components/editor/floor-plan-import-review/FloorPlanReviewDraftSave.tsx");
  assert.match(draftSave, /<FloorPlanReviewHistoryControls history=\{props\.history\} disabled=\{props\.disabled \|\| props\.submitting \|\| props\.deletingSource\} \/>/);
  const controls = source("components/editor/floor-plan-import-review/FloorPlanReviewHistoryControls.tsx");
  assert.match(controls, /data-testid="floor-plan-review-undo"[\s\S]*?disabled=\{disabled \|\| !history\.canUndo\}/);
  assert.match(controls, /data-testid="floor-plan-review-redo"[\s\S]*?disabled=\{disabled \|\| !history\.canRedo\}/);
  assert.match(controls, /if \(disabled\) return;[\s\S]*?reviewHistoryShortcut\(event, \{ isMac, root: document \}\)/,
    "the keys stand still while the review is busy, as the buttons do");

  const panel = source("components/editor/floor-plan-import-review/FloorPlanImportReviewPanel.tsx");
  assert.match(panel, /useFloorPlanReviewHeights\(candidate, setCandidate, reviewRestores\)/);
  assert.match(panel, /consumerMode proMode=\{proMode\} restores=\{reviewRestores\}/);
  // Correction fields copied from the document (a corner's X and Z, an opening's width, the scale) read it again.
  const tools = source("components/editor/floor-plan-import-review/FloorPlanVisualReviewTools.tsx");
  assert.match(tools, /<FloorPlanScaleReviewPanel key=\{`\$\{sourceId\}:\$\{page\?\.pageNumber\}:\$\{restores\}`\}/);
  assert.match(tools, /<FloorPlanTopologyCorrectionPanel key=\{restores\}/);
  const heights = source("components/editor/floor-plan-import-review/useFloorPlanReviewHeights.ts");
  assert.match(heights, /if \(readForRestores !== restores\) \{\n\s*setReadForRestores\(restores\);\n\s*setHomeType\(reviewHomeTypeFor\(floor\)\);/,
    "after Undo or Redo the home type is read from the document put back");
}

console.log("floor-plan review history: ok");
