import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { FloorPlanImportPausedNotice } from "../components/editor/FloorPlanImportPausedNotice";
import {
  FLOOR_PLAN_UPLOAD_NEW_DESIGN_NOTE,
  FloorPlanUploadChooseStep,
} from "../components/editor/FloorPlanUploadChooseStep";
import { RoomSetupStartActions } from "../components/editor/RoomSetupStartActions";
import { buildDesignEditorUrl } from "../lib/design-editor-url";
import { resolveEditorCapabilities } from "../lib/editor-capabilities";
import { FLOOR_PLAN_CONSUMER_IMPORT_ACTION_ID } from "../lib/floor-plan-upload-dialog-focus";
import {
  FLOOR_PLAN_CAD_NEEDS_PRO,
  FLOOR_PLAN_UPLOAD_MAX_BYTES,
  floorPlanUploadFileProblem,
  floorPlanUploadFormats,
} from "../lib/floor-plan-upload-formats";
import { floorPlanUploadRequestOf } from "../lib/floor-plan-upload-request";
import { MAX_FLOOR_PLAN_UPLOAD_BYTES } from "../lib/floor-plan-imports/validation";

// Upload floor plan (audit findings ST2–ST5): one entry, guests sign in first, one formats rule
// from the `importCad` capability, and a new design that opens in Plan.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");
const noop = () => undefined;

// One formats rule (ST4): everyone gets PDF and images; Pro (`importCad`) adds DXF and IFC; DWG is
// never offered, since no converter is configured.
const free = floorPlanUploadFormats(resolveEditorCapabilities("free").importCad);
const pro = floorPlanUploadFormats(resolveEditorCapabilities("pro").importCad);
assert.equal(free.summary, "PDF, JPG, PNG or WebP, up to 25 MB");
assert.equal(pro.summary, "PDF, JPG, PNG, WebP, DXF or IFC, up to 25 MB");
assert.equal(free.cadNote, FLOOR_PLAN_CAD_NEEDS_PRO);
assert.equal(pro.cadNote, null);
const freeAccept = free.accept.split(",");
const proAccept = pro.accept.split(",");
for (const type of ["application/pdf", "image/png", "image/jpeg", "image/webp", ".pdf", ".png", ".jpg", ".jpeg", ".webp"]) {
  assert.ok(freeAccept.includes(type) && proAccept.includes(type), `Everyone can upload ${type}.`);
}
for (const type of [".dxf", ".ifc", "application/dxf", "application/ifc"]) {
  assert.ok(!freeAccept.includes(type), `Free doesn't offer ${type}.`);
  assert.ok(proAccept.includes(type), `Pro offers ${type}.`);
}
assert.ok(![...freeAccept, ...proAccept].some((type) => /dwg/i.test(type)), "DWG isn't offered to anyone.");
assert.equal(FLOOR_PLAN_UPLOAD_MAX_BYTES, MAX_FLOOR_PLAN_UPLOAD_BYTES, "The app and the server agree on the size limit.");

const file = (name: string, type = "", size = 1024) => ({ name, type, size });
assert.equal(floorPlanUploadFileProblem(file("home.pdf", "application/pdf"), false), null);
assert.equal(floorPlanUploadFileProblem(file("home.JPG"), false), null);
assert.equal(floorPlanUploadFileProblem(file("scan", "image/webp"), false), null);
assert.equal(floorPlanUploadFileProblem(file("home.dxf"), true), null);
assert.equal(floorPlanUploadFileProblem(file("home.ifc"), true), null);
assert.equal(
  floorPlanUploadFileProblem(file("home.dxf"), false),
  "DXF and other CAD files need Pro. Upload a PDF, JPG, PNG or WebP instead."
);
assert.equal(
  floorPlanUploadFileProblem(file("home.dwg", "image/vnd.dwg"), false),
  "DWG files can't be read yet. Save the plan as a PDF and upload that."
);
assert.equal(
  floorPlanUploadFileProblem(file("home.dwg"), true),
  "DWG files can't be read yet. Save the plan as a PDF or DXF and upload that."
);
assert.equal(
  floorPlanUploadFileProblem(file("notes.txt", "text/plain"), false),
  "This type of file can't be uploaded. Upload a PDF, JPG, PNG or WebP."
);
assert.equal(
  floorPlanUploadFileProblem(file("huge.pdf", "application/pdf", FLOOR_PLAN_UPLOAD_MAX_BYTES + 1), false),
  "This file is larger than 25 MB. Upload a smaller PDF, JPG, PNG or WebP."
);
assert.equal(floorPlanUploadFileProblem(file("edge.pdf", "application/pdf", FLOOR_PLAN_UPLOAD_MAX_BYTES), false), null);

// An entry's request keeps its source and opener; an event without them is Plan's own.
assert.deepEqual(
  floorPlanUploadRequestOf(new CustomEvent("x", { detail: { source: "address_search", openerId: "a" } })),
  { source: "address_search", openerId: "a" }
);
assert.deepEqual(floorPlanUploadRequestOf(new Event("x")), { source: "plan_panel", openerId: null });

// The upload window's first step, as in the mockup (ST2, ST5): members.
const choose = (overrides: Partial<Parameters<typeof FloorPlanUploadChooseStep>[0]> = {}) =>
  renderToStaticMarkup(createElement(FloorPlanUploadChooseStep, {
    signedIn: true, formats: free, fileProblem: null, onFileDropped: noop,
    dark: false, disabled: false, onChooseFile: noop, ...overrides,
  }));
const member = choose();
assert.match(member, /data-testid="floor-plan-import-dialog-empty-state" data-floor-plan-workspace-state="empty"/);
assert.match(member, /data-testid="floor-plan-upload-drop-zone"/);
assert.match(member, />Drop your floor plan here</);
assert.match(member, /data-editor-dialog-initial-focus="true"[^>]*>Choose a file<\/button>/);
assert.match(member, /data-testid="floor-plan-upload-formats">PDF, JPG, PNG or WebP, up to 25 MB\. DXF and other CAD files need Pro\.</);
assert.ok(member.includes(FLOOR_PLAN_UPLOAD_NEW_DESIGN_NOTE));
assert.equal(FLOOR_PLAN_UPLOAD_NEW_DESIGN_NOTE, "It opens as a new design in Plan, where you check the walls and set the scale.");
assert.doesNotMatch(member, /role="alert"|Continue with Google/);
assert.match(choose({ formats: pro }), /data-testid="floor-plan-upload-formats">PDF, JPG, PNG, WebP, DXF or IFC, up to 25 MB</);
assert.match(choose({ fileProblem: "Nope." }), /role="alert"[^>]*data-testid="floor-plan-upload-file-problem">Nope\.</);
assert.match(choose({ disabled: true }), /disabled="">Choose a file/);

// Guests are asked to sign in instead of choosing a file (ST3).
const guest = choose({ signedIn: false });
assert.match(guest, /data-testid="floor-plan-upload-sign-in" data-floor-plan-workspace-state="sign-in"/);
assert.match(guest, />Sign in to upload your floor plan</);
assert.match(guest, /data-editor-dialog-initial-focus="true"[^>]*>Continue with Google<\/button>/);
assert.doesNotMatch(guest, /Choose a file|floor-plan-upload-drop-zone/);

// "Auto-detection paused" always has a way on.
const paused = (overrides: Partial<Parameters<typeof FloorPlanImportPausedNotice>[0]>) =>
  renderToStaticMarkup(createElement(FloorPlanImportPausedNotice, {
    dark: false, subtle: "", control: "", message: "Sign in to privately detect, review, and save this plan.",
    authenticationRequired: false, resumableJobId: null, ...overrides,
  }));
assert.match(
  paused({ authenticationRequired: true, resumableJobId: "job" }),
  /data-testid="floor-plan-import-sign-in" class="[^"]*\bmin-h-11\b[^"]*">Sign in and continue</
);
assert.doesNotMatch(paused({ authenticationRequired: true }), /Resume processing/);
assert.match(paused({ resumableJobId: "job" }), />Resume processing</);
assert.doesNotMatch(paused({}), /<button/);

// The upload window is light in Pro too (SX3, D11): it is portaled outside the Pro theme, where the
// Pro classes don't apply, so a dark window had unstyled controls and 2.5:1 hints.
const windowSource = read("components/editor/FloorPlanUploadWorkspaceDialog.tsx");
assert.match(windowSource, /<FloorPlanImportWorkspace [^>]*dark=\{false\}/);
assert.doesNotMatch(windowSource, /bg-neutral-950|designer-|dark \?/);
assert.match(windowSource, /aria-label="Close floor plan upload"\s+className="flex h-11 w-11 /);
assert.doesNotMatch(read("components/editor/FloorPlanUploadPanel.tsx"), /<FloorPlanUploadWorkspaceDialog[^>]*\bdark=/);

// One visible Upload floor plan under the room card (ST2).
const startActions = renderToStaticMarkup(createElement(RoomSetupStartActions, {
  dark: false, canEdit: true, secondaryActionClass: "",
  actions: { chooseTemplate: noop, drawRoom: noop, uploadFloorPlan: noop },
}));
assert.match(
  startActions,
  new RegExp(`Have a floor plan\\?[^<]*<button id="${FLOOR_PLAN_CONSUMER_IMPORT_ACTION_ID}" type="button" data-testid="plan-tool-import-2d"[^>]*>Upload floor plan</button>`)
);
assert.ok(startActions.indexOf("plan-start-template") < startActions.indexOf("plan-tool-import-2d"));

// A design made from a floor plan opens in Plan, in 2D, with the arrival note (ST5).
assert.equal(
  buildDesignEditorUrl({ designId: "design-1", view: "2d", floorPlanImportId: "job-1" }),
  "/design?designId=design-1&view=2d&floorPlanImport=job-1"
);
assert.match(
  read("components/editor/useConsumerFloorPlanImportCreation.ts"),
  /router\.push\(buildDesignEditorUrl\(\{ designId: id, view: "2d", floorPlanImportId: activeJob\.id \}\)\)/
);
assert.match(read("components/editor/FloorPlanImportAssistant.tsx"), /Opens in Plan, in 2D, so you can check it before you furnish\./);
const arrival = read("components/editor/FloorPlanImportArrivalNote.tsx");
assert.match(arrival, /useSearchParams\(\)\.get\("floorPlanImport"\)/);
assert.match(arrival, /url\.searchParams\.delete\("floorPlanImport"\);\s*window\.history\.replaceState\(/);
assert.match(read("components/editor/DesignControlsPlanPanel.tsx"), /<FloorPlanImportArrivalNote dark=\{dark\} \/>/);
const urlView = read("lib/useUrlViewMode.ts");
assert.match(urlView, /if \(urlView !== followedView\) \{\s*setFollowedView\(urlView\);\s*if \(urlView === "2d" \|\| urlView === "3d"\) setViewMode\(urlView\);/);
assert.match(read("lib/useDesignPageCoreShellBaseRegistration.ts"), /const \[viewMode, setViewMode\] = useUrlViewMode\(urlView\);/);

// Tracking: every upload records where it started, once, when the window opens.
const opener = read("lib/open-floor-plan-upload-workspace.ts");
assert.match(opener, /track\("launch_path_selected", \{ path: "upload", source \}\)/);
assert.doesNotMatch(opener, /consumer_room_setup/);
assert.match(read("components/editor/FloorPlanWorkspaceOpener.tsx"), /isDesigner \? "pro_plan_tools" : "plan_panel"/);

console.log("Upload floor plan entry, formats, first step and landing checks passed.");
