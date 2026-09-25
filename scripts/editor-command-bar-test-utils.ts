import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The editor command bar is EditorCommandBar.tsx plus its pieces in
 * components/editor/command-bar/. Guards that check the bar's markup read them as one text,
 * the main file first, so moving a control between these files doesn't hide it from them.
 */
export function readEditorCommandBarSource(root = process.cwd()): string {
  const pieceDirectory = join(root, "components", "editor", "command-bar");
  const pieces = readdirSync(pieceDirectory)
    .filter((name) => name.endsWith(".tsx"))
    .sort()
    .map((name) => join(pieceDirectory, name));
  if (pieces.length === 0) {
    throw new Error("The editor command bar's pieces should live in components/editor/command-bar/.");
  }
  return [join(root, "components", "editor", "EditorCommandBar.tsx"), ...pieces]
    .map((file) => readFileSync(file, "utf8"))
    .join("\n");
}
