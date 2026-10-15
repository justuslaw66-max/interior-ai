import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorDialogButton } from "../components/editor/design-system/EditorDialog";
import { Button, buttonClassName } from "../components/ui/Button";
import { SegmentedControl, segmentClassName } from "../components/ui/SegmentedControl";
import { nextMenuItemIndex } from "../lib/useDismissibleMenu";

// UX phase 4b's foundations (audit findings AX5, AX6, AX7 and AX10): one focus ring, readable
// fills, menus that keep focus, and one Button. The counts at the end can only go down.

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function sourceFiles(directory: string, pattern = /\.(ts|tsx)$/): string[] {
  return readdirSync(join(root, directory)).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path, pattern);
    return pattern.test(name) ? [path] : [];
  });
}

const sources = ["app", "components", "features", "lib", "hooks"]
  .flatMap((directory) => sourceFiles(directory))
  .map((path) => ({ path: relative(root, join(root, path)), text: read(path) }));

// Focus (AX6): globals.css gives every control one 2px ring. A control that draws its own ring
// hides that outline with outline-hidden, which forced-colours mode still shows; outline-none
// hides it there too.
const outlineNone = sources.filter(({ text }) => /(?<![\w-])outline-none(?![\w-])/.test(text));
assert.deepEqual(
  outlineNone.map(({ path }) => path),
  [],
  "Use outline-hidden (or nothing, for the shared ring) instead of outline-none."
);

// Contrast (AX7): white text needs a fill of at least 4.5:1. The 500 and 600 shades of these hues
// don't reach it; the 700 shades, black and the accent blue do.
const weakFill =
  /(?<![\w:-])(?:hover:)?bg-(?:emerald-(?:500|600)|teal-(?:500|600)|sky-(?:500|600)|green-(?:500|600)|orange-(?:500|600)|amber-(?:500|600)|blue-500|cyan-(?:500|600)|lime-\d00|yellow-\d00)(?![\w/-])/;
const whiteOnWeak = sources.flatMap(({ path, text }) =>
  text
    .split("\n")
    .map((line, index) => ({ line, index }))
    .filter(({ line }) => /(?<![\w:-])text-white(?![\w/-])/.test(line) && weakFill.test(line))
    .map(({ index }) => `${path}:${index + 1}`)
);
assert.deepEqual(whiteOnWeak, [], "White text sits on a fill that's too light.");

// Menus (AX5): the editor bar's More and Account menus use the shared menu, so Escape hands focus
// back to their button and the arrow keys move through their items.
const commandBar = read("components/editor/EditorCommandBar.tsx");
assert.equal(commandBar.match(/useDismissibleMenu\(\{ open: (overflowOpen|accountOpen),/g)?.length, 2);
assert.match(commandBar, /if \(byKeyboard\) moreButtonRef\.current\?\.focus\(\);/);
assert.match(commandBar, /if \(byKeyboard\) accountRef\.current\?\.querySelector<HTMLElement>\('\[data-testid="editor-command-account"\]'\)\?\.focus\(\);/);
assert.doesNotMatch(commandBar, /window\.addEventListener\("keydown"/, "The bar's menus own no keydown listener of their own.");
for (const [key, current, count, expected] of [
  ["ArrowDown", -1, 4, 0],
  ["ArrowDown", 0, 4, 1],
  ["ArrowDown", 3, 4, 0],
  ["ArrowUp", -1, 4, 3],
  ["ArrowUp", 0, 4, 3],
  ["ArrowUp", 2, 4, 1],
  ["Home", 2, 4, 0],
  ["End", 0, 4, 3],
  ["ArrowDown", -1, 0, null],
  ["Tab", 1, 4, null],
  ["Enter", 1, 4, null],
] as const) {
  assert.equal(nextMenuItemIndex(key, current, count), expected, `${key} from ${current} of ${count}`);
}
const feedback = read("components/BetaFeedbackWidget.tsx");
assert.match(
  feedback,
  /data-testid="beta-feedback-dialog"[\s\S]*?onKeyDown=\{\(event\) => \{ if \(event\.key === "Escape"\) resetAndClose\(\); \}\}/,
  "The feedback dialog closes on Escape wherever focus is inside it."
);

// Button (AX10): one component, 44px for touch and 30px compact, black primary, the accent focus ring.
const markup = (element: Parameters<typeof renderToStaticMarkup>[0]) => renderToStaticMarkup(element);
const primary = markup(<Button variant="primary">Save</Button>);
assert.match(primary, /^<button type="button" class="[^"]*\bbg-neutral-900\b[^"]*\btext-white\b[^"]*">Save<\/button>$/);
assert.match(primary, /\bmin-h-11\b/);
assert.match(primary, /\bfocus-visible:ring-2\b[^"]*\bfocus-visible:ring-focus\b/);
assert.match(primary, /\boutline-hidden\b/);
assert.match(markup(<Button size="compact">More</Button>), /\bh-\[30px\][^"]*\bborder-neutral-300\b/);
assert.match(markup(<Button variant="quiet" type="submit">Go</Button>), /^<button type="submit" class="[^"]*\bborder-transparent\b/);
assert.match(markup(<Button variant="danger">Delete</Button>), /\bbg-red-600\b/);
assert.match(markup(<Button variant="quiet" size="icon" aria-label="Undo">U</Button>), /\bh-9 w-9 shrink-0 rounded-lg p-0 border-transparent\b/);
assert.match(markup(<Button size="round" aria-label="Keyboard shortcuts">?</Button>), /\bh-10 w-10 shrink-0 rounded-full p-0 border-neutral-300\b/);
assert.equal(EditorDialogButton, Button, "Dialog actions are the shared Button.");
assert.equal(
  buttonClassName({ variant: "primary", size: "compact", className: "w-full" }).split(" ").at(-1),
  "w-full",
  "A caller's classes come last."
);
// An on/off toggle (UX 5n, J's choice on 14 Oct): pressed is the primary look, off its variant.
const toggledOn = markup(<Button size="compact" pressed>Grid</Button>);
assert.match(toggledOn, /^<button type="button" aria-pressed="true" class="[^"]*\bbg-neutral-900\b[^"]*\btext-white\b/);
const toggledOff = markup(<Button size="compact" pressed={false}>Snap</Button>);
assert.match(toggledOff, /aria-pressed="false"[^>]*\bborder-neutral-300\b[^"]*\bbg-white\b/);
assert.doesNotMatch(primary, /aria-pressed/, "A plain button isn't a toggle.");

// One segmented control (UX 5n, J's choice on 14 Oct): a labelled group of aria-pressed segments in
// a grey track, the pressed one black, in the Button's heights; 44px segments on touch screens.
const segmented = markup(
  <SegmentedControl
    label="Design view"
    value="2d"
    onChange={() => undefined}
    testId="view"
    options={[
      { value: "2d", label: "2D", testId: "view-2d" },
      { value: "3d", label: "3D", testId: "view-3d", disabled: true },
    ]}
  />
);
assert.match(segmented, /^<div role="group" aria-label="Design view" data-testid="view" class="inline-flex gap-0\.5 rounded-\[10px\] bg-neutral-100 p-0\.5">/);
assert.equal(segmented.match(/<button type="button"/g)?.length, 2, "Each segment is a button.");
assert.match(segmented, /aria-pressed="true" data-testid="view-2d" class="[^"]*\bh-8 touch:h-11\b[^"]*\bbg-neutral-900 text-white\b/);
assert.match(segmented, /aria-pressed="false" data-testid="view-3d" disabled="" class="[^"]*\btext-neutral-700\b/);
assert.doesNotMatch(segmented, /outline-hidden|focus-visible:ring/, "Segments show the shared focus ring.");
const filled = markup(
  <SegmentedControl label="Surface" value={1} onChange={() => undefined} size="compact" fill options={[1, 2, 3, 4].map((value) => ({ value, label: String(value) }))} />
);
assert.match(filled, /class="flex w-full gap-0\.5 rounded-lg bg-neutral-100 p-0\.5"/);
assert.equal(filled.match(/\bh-\[26px\] touch:h-11\b[^"]*\bflex-1 basis-0\b/g)?.length, 4, "Filling, the segments share the width equally.");
assert.doesNotMatch(filled, /\bmin-w-0\b/, "A label never shrinks below its own width: it stays on one line.");
const bare = markup(
  <SegmentedControl label="Pill" value="a" onChange={() => undefined} size="touch" track={false} options={[{ value: "a", label: "A" }]} />
);
assert.match(bare, /class="inline-flex gap-0\.5">/, "Without a track there's no grey.");
assert.match(bare, /\bh-11 min-w-12\b/, "Without a track the segments are the full 44px.");
assert.equal(segmentClassName({ pressed: false, className: "mt-2" }).split(" ").at(-1), "mt-2");

// The 12px minimum (AX7, phase 5): text is at least 12px everywhere, set by a class (text-xs and
// up), in a stylesheet, or inline, as the canvas labels set it.
const subTwelvePixelUses = (text: string) =>
  Array.from(text.matchAll(/(?<![\w-])text-\[(\d+(?:\.\d+)?)px\]/g)).filter(([, size]) => Number(size) < 12)
    .length;
assert.deepEqual(
  sources.filter(({ text }) => subTwelvePixelUses(text) > 0).map(({ path }) => path),
  [],
  "Text is at least 12px (text-xs)."
);
const smallFontSizes = (text: string) =>
  Array.from(text.matchAll(/font-size:\s*(\d*\.?\d+)(px|rem)\b/g)).filter(
    ([, size, unit]) => Number(size) * (unit === "rem" ? 16 : 1) < 12
  ).length;
assert.deepEqual(
  ["app", "components", "features"]
    .flatMap((directory) => sourceFiles(directory, /\.css$/))
    .filter((path) => smallFontSizes(read(path)) > 0),
  [],
  "Stylesheets set text at least 12px."
);
// An inline fontSize: every number in its value counts, so both sides of a choice are checked.
const smallInlineFontSizes = (text: string) =>
  Array.from(text.matchAll(/\bfontSize\s*(?::|=)\s*(\{[^}\n]*\}|"[^"\n]*"|[^,}\n]+)/g)).filter(([, value]) =>
    Array.from(value.matchAll(/\d+(?:\.\d+)?/g)).some(([size]) => Number(size) < 12)
  ).length;
// The plan tool picker's import icon letters "JPG" and "CAD" in its 64-unit drawing, which the
// icons step replaces with a lucide icon.
const ICON_ARTWORK = ["components/editor/design-controls-plan/PlanToolIcon.tsx"];
assert.deepEqual(
  sources
    .filter(({ path, text }) => smallInlineFontSizes(text) > 0 && !ICON_ARTWORK.includes(path))
    .map(({ path }) => path),
  [],
  "Inline font sizes are at least 12px."
);
assert.equal(smallInlineFontSizes('style={{ fontSize: 11, fontWeight: 800 }}'), 1);
assert.equal(smallInlineFontSizes('fontSize: note.kind === "room_tag" ? 12 : 11,'), 1);
assert.equal(smallInlineFontSizes('<text fontSize="8">'), 1);
assert.equal(smallInlineFontSizes('fontSize: "11px",'), 1);
assert.equal(smallInlineFontSizes('fontSize={16} style={{ fontSize: 12, lineHeight: "16px" }}'), 0);

// Ratchets: raw <button>s outside Button, and emoji in button labels.
const rawButtons = sources
  .filter(({ path }) => path.endsWith(".tsx"))
  .reduce((count, { text }) => count + (text.match(/<button\b/g)?.length ?? 0), 0);
const emojiButtons = sources
  .filter(({ path }) => path.endsWith(".tsx"))
  .reduce(
    (count, { text }) =>
      count +
      Array.from(text.matchAll(/<button\b[\s\S]*?<\/button>/g)).filter(([block]) =>
        /\p{Extended_Pictographic}/u.test(block)
      ).length,
    0
  );
const LIMITS = { rawButtons: 526, emojiButtons: 3 };
const counts = { rawButtons, emojiButtons };
for (const [name, limit] of Object.entries(LIMITS) as Array<[keyof typeof LIMITS, number]>) {
  assert.ok(counts[name] <= limit, `${name} rose to ${counts[name]} (limit ${limit}); it can only go down.`);
  if (counts[name] < limit) console.log(`${name} fell to ${counts[name]}: lower its limit here to keep it there.`);
}

console.log(
  `UI foundation checks passed: no text under 12px, ${rawButtons} raw buttons, ${emojiButtons} buttons with emoji.`
);
