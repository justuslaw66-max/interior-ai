import assert from "node:assert/strict";
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { renderToStaticMarkup } from "react-dom/server";

import { EditorDialogButton } from "../components/editor/design-system/EditorDialog";
import { Button, buttonClassName } from "../components/ui/Button";
import { nextMenuItemIndex } from "../lib/useDismissibleMenu";

// UX phase 4b's foundations (audit findings AX5, AX6, AX7 and AX10): one focus ring, readable
// fills, menus that keep focus, and one Button. The counts at the end can only go down.

const root = process.cwd();
const read = (path: string) => readFileSync(join(root, path), "utf8");

function sourceFiles(directory: string): string[] {
  return readdirSync(join(root, directory)).flatMap((name) => {
    const path = join(directory, name);
    if (statSync(join(root, path)).isDirectory()) return sourceFiles(path);
    return /\.(ts|tsx)$/.test(name) ? [path] : [];
  });
}

const sources = ["app", "components", "features", "lib", "hooks"]
  .flatMap(sourceFiles)
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
assert.equal(EditorDialogButton, Button, "Dialog actions are the shared Button.");
assert.equal(
  buttonClassName({ variant: "primary", size: "compact", className: "w-full" }).split(" ").at(-1),
  "w-full",
  "A caller's classes come last."
);

// Ratchets: text under 12px, raw <button>s outside Button, and emoji in button labels.
const underTwelvePixels = sources.reduce(
  (count, { text }) =>
    count +
    Array.from(text.matchAll(/(?<![\w-])text-\[(\d+(?:\.\d+)?)px\]/g)).filter(([, size]) => Number(size) < 12)
      .length,
  0
);
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
const LIMITS = { underTwelvePixels: 672, rawButtons: 784, emojiButtons: 7 };
const counts = { underTwelvePixels, rawButtons, emojiButtons };
for (const [name, limit] of Object.entries(LIMITS) as Array<[keyof typeof LIMITS, number]>) {
  assert.ok(counts[name] <= limit, `${name} rose to ${counts[name]} (limit ${limit}); it can only go down.`);
  if (counts[name] < limit) console.log(`${name} fell to ${counts[name]}: lower its limit here to keep it there.`);
}

console.log(
  `UI foundation checks passed: ${underTwelvePixels} sub-12px text uses, ${rawButtons} raw buttons, ${emojiButtons} buttons with emoji.`
);
