import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";

import { CabinetStudioHeader } from "../features/cabinetry/components/CabinetStudioHeader";

const callbacks = {
  onChooseExperience: () => undefined,
  onUndo: () => undefined,
  onRedo: () => undefined,
  onRestoreTemplate: () => undefined,
  onClose: () => undefined,
};

const guidedMarkup = renderToStaticMarkup(
  createElement(CabinetStudioHeader, {
    experience: "guided",
    isProWorkspace: true,
    mode: "create",
    canUndo: false,
    canRedo: true,
    ...callbacks,
  })
);
assert.match(guidedMarkup, /^<header/);
assert.match(guidedMarkup, /Simple to start, powerful when needed\./);
assert.match(
  guidedMarkup,
  /data-testid="cabinet-experience-guided" aria-pressed="true"/
);
assert.match(
  guidedMarkup,
  /data-testid="cabinet-experience-detailed" aria-pressed="false"/
);
assert.match(guidedMarkup, /data-testid="cabinet-undo"[^>]*disabled=""/);
assert.doesNotMatch(guidedMarkup, /data-testid="cabinet-redo"[^>]*disabled=""/);
assert.match(guidedMarkup, /data-testid="cabinet-restore-template"/);
assert.match(guidedMarkup, /data-testid="cabinetry-studio-close"/);

const consumerMarkup = renderToStaticMarkup(
  createElement(CabinetStudioHeader, {
    experience: "guided",
    isProWorkspace: false,
    mode: "create",
    canUndo: false,
    canRedo: false,
    ...callbacks,
  })
);
assert.doesNotMatch(consumerMarkup, /data-testid="cabinet-experience-detailed"/);

const detailedMarkup = renderToStaticMarkup(
  createElement(CabinetStudioHeader, {
    experience: "detailed",
    isProWorkspace: true,
    mode: "edit",
    canUndo: true,
    canRedo: false,
    ...callbacks,
  })
);
assert.match(detailedMarkup, /^<div/);
assert.match(detailedMarkup, /Edit custom cabinetry/);
assert.match(
  detailedMarkup,
  /data-testid="cabinet-experience-guided" aria-pressed="false"/
);
assert.match(
  detailedMarkup,
  /data-testid="cabinet-experience-detailed" aria-pressed="true"/
);
assert.doesNotMatch(detailedMarkup, /data-testid="cabinet-undo"[^>]*disabled=""/);
assert.match(detailedMarkup, /data-testid="cabinet-redo"[^>]*disabled=""/);

const studioSource = readFileSync(
  resolve(process.cwd(), "features/cabinetry/components/CabinetryStudio.tsx"),
  "utf8"
);
const modeViewSource = [
  "CabinetryStudioGuidedView.tsx",
  "CabinetryStudioDetailedView.tsx",
]
  .map((fileName) =>
    readFileSync(
      resolve(process.cwd(), "features/cabinetry/components", fileName),
      "utf8"
    )
  )
  .join("\n");
assert.match(
  modeViewSource,
  /import \{ CabinetStudioHeader \} from "\.\/CabinetStudioHeader"/,
  "The studio must compose the extracted header boundary."
);
assert.equal(
  modeViewSource.match(/<CabinetStudioHeader/g)?.length,
  2,
  "Guided and Detailed layouts must both use the shared header boundary."
);
assert.doesNotMatch(
  `${studioSource}\n${modeViewSource}`,
  /data-testid="(?:cabinet-undo|cabinet-redo|cabinet-restore-template|cabinetry-studio-close)"/,
  "The studio shell must not regain header control markup."
);

console.log("Cabinetry studio header checks passed.");
