import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

const source = readFileSync(
  join(process.cwd(), "components/editor/EditorCommandBar.tsx"),
  "utf8"
);
const wrapperSource = readFileSync(
  join(
    process.cwd(),
    "components/editor/design-page/DesignPageEditorCommandBar.tsx"
  ),
  "utf8"
);
const workspaceSource = readFileSync(
  join(process.cwd(), "components/editor/design-page/DesignPageWorkspace.tsx"),
  "utf8"
);
const presentationWorkspaceSource = readFileSync(
  join(process.cwd(), "lib/useDesignPagePresentationWorkspaceRegistration.ts"),
  "utf8"
);
const editorChromeControllerSource = readFileSync(
  join(process.cwd(), "lib/useDesignPageEditorChromeController.ts"),
  "utf8"
);

assert.match(
  source,
  /data-testid="editor-command-overflow-pro-tools"[\s\S]*?\{isDesigner \? "Exit Pro tools" : "Pro tools"\}/,
  "The overflow Pro tools action should use matching active and inactive labels."
);
assert.match(
  source,
  /\{isDesigner && \([\s\S]*?data-testid="editor-command-overflow-preview"/,
  "Preview should remain available next to the active Pro tools action in the overflow menu."
);
assert.doesNotMatch(
  source,
  /Designer on|Exit Designer Mode|Enter Designer Mode/,
  "Pro tools toggle should not mix Designer wording with Pro tools wording"
);
assert.match(
  wrapperSource,
  /<EditorCommandBar[\s\S]*?\{\.\.\.state\.commandBar\}[\s\S]*?\{\.\.\.actions\.commandBar\}/,
  "The design-page command wrapper should preserve Pro-tools and preview state/actions."
);
assert.match(
  presentationWorkspaceSource,
  /useDesignPagePresentationQaFacade\(\{[\s\S]*?isDesigner:\s*coreShell\.derived\.access\.isDesigner[\s\S]*?shell:\s*\{[\s\S]*?setClientPreview:\s*base\.actions\.access\.setClientPreview[\s\S]*?setUrlMode:\s*coreShell\.actions\.paywall\.setUrlMode/,
  "The presentation workspace should inject Pro-tools and client-preview state transitions into the presentation/QA facade."
);
assert.match(
  editorChromeControllerSource,
  /const toggleDesignerMode = \(\) => \{[\s\S]*?actions\.editor\.setUrlMode\(\s*commandState\.isDesigner \? "homeowner" : "designer"[\s\S]*?const toggleClientPreview = \(\) => \{[\s\S]*?actions\.editor\.setClientPreview\(\(visible\) => !visible\)[\s\S]*?onToggleDesignerMode: toggleDesignerMode,[\s\S]*?onToggleClientPreview: toggleClientPreview/,
  "The chrome controller should provide Pro-tools and client-preview transitions through the command-wrapper boundary."
);
assert.doesNotMatch(
  workspaceSource,
  /<EditorCommandBar\b/,
  "The workspace should not bypass the design-page command wrapper."
);

console.log("Pro tools toggle copy checks passed");
