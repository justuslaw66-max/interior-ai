import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement, type Dispatch, type SetStateAction } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { StartDesignChooser, type StartDesignChooserProps } from "../components/editor/start/StartDesignChooser";
import { START_UPLOAD_CHOICE_ID } from "../components/editor/start/UploadSignInDialog";
import { HOUSE_PLAN_TEMPLATES, ROOM_DIMENSION_DEFAULTS, type HousePlanTemplate } from "../lib/design-page-house-plan";
import { shouldConfirmPlanTemplateReplacement } from "../lib/design-page-template-furnishings";
import { createRoom, migrateToV3, type DesignSnapshot } from "../lib/room-types";
import {
  BLANK_ROOM_TEMPLATE,
  buildStartTemplateCards,
  matchesStartTemplateFilter,
  START_TEMPLATE_FILTERS,
  START_TEMPLATE_PREVIEW_COUNT,
} from "../lib/start-design";
import { parseStartDesignParam, rootStartDesignHref, START_UPLOAD_CALLBACK_URL } from "../lib/start-design-link";
import {
  applyEntryLink,
  applyStartParam,
  buildStartChooserProps,
  type StartChooserState,
  type UseDesignPageStartChooserInput,
} from "../lib/useDesignPageStartChooser";
import { answerFloorPlanUploadRequest, type FloorPlanUploadEntryInput } from "../lib/useFloorPlanUploadEntry";
import type { FloorPlanUploadRequest } from "../lib/floor-plan-upload-request";

// Start a new design (audit findings FR1, FR3, ST2, ST3, ST7, ST8): the start links, the template
// cards, the chooser's markup, what each choice does, and how the editor wires it.

const read = (path: string) => readFileSync(join(process.cwd(), path), "utf8");

// Start links: `/` opens the chooser; older `?source=` links and `?start=` keep their choice.
assert.equal(parseStartDesignParam("draw"), "draw");
assert.equal(parseStartDesignParam("new"), "new");
assert.equal(parseStartDesignParam("templates"), null);
assert.equal(parseStartDesignParam(null), null);
assert.equal(rootStartDesignHref({}), "/design?start=choose");
assert.equal(rootStartDesignHref({ source: "template" }), "/design?start=template");
assert.equal(rootStartDesignHref({ source: "blank" }), "/design?start=blank");
assert.equal(rootStartDesignHref({ start: "upload", source: "template" }), "/design?start=upload");
assert.equal(rootStartDesignHref({ start: ["draw", "blank"] }), "/design?start=choose", "Repeated values are ignored.");
assert.equal(rootStartDesignHref({ source: "ads" }), "/design?start=choose");
assert.equal(START_UPLOAD_CALLBACK_URL, "/design?start=upload");
assert.doesNotMatch(read("lib/start-design-link.ts"), /design-page-house-plan/, "`/` redirects without loading the templates.");
assert.match(read("app/page.tsx"), /redirect\(rootStartDesignHref\(await searchParams\)\)/);

// The blank room is the first visit's room, so choosing it keeps "nothing to replace" true.
assert.equal(BLANK_ROOM_TEMPLATE.rooms.length, 1);
const [blankRoom] = BLANK_ROOM_TEMPLATE.rooms;
assert.ok(blankRoom);
assert.equal(blankRoom.roomType, "living");
assert.equal(blankRoom.width, ROOM_DIMENSION_DEFAULTS.width);
assert.equal(blankRoom.depth, ROOM_DIMENSION_DEFAULTS.depth);
assert.deepEqual([BLANK_ROOM_TEMPLATE.doorways, BLANK_ROOM_TEMPLATE.windows, BLANK_ROOM_TEMPLATE.furnishingPacks], [[], [], []]);
const base = migrateToV3({
  items: [],
  zones: [],
  roomBounds: { width: 4, depth: 5, wallThickness: 0.2, height: 2.7 },
} as unknown as DesignSnapshot);
const blankDesign: DesignSnapshot = {
  ...base,
  rooms: [createRoom("blank", blankRoom.name, blankRoom.roomType, { width: blankRoom.width, depth: blankRoom.depth })],
};
assert.equal(shouldConfirmPlanTemplateReplacement(blankDesign, []), false);

// Template cards: Singapore homes first, a short summary line, and the Furnished pack.
const cards = buildStartTemplateCards();
assert.deepEqual(
  cards.map((card) => card.template.id),
  [
    "hdb_two_room", "studio", "one_bedroom", "living_dining", "three_room_flat", "small_condo",
    "compact_two_bed", "family_two_bed", "l_shaped_studio", "narrow_one_bed", "corner_one_bed",
    "railroad_apartment", "adu_guest_house",
  ]
);
assert.equal(cards.length, HOUSE_PLAN_TEMPLATES.length);
for (const card of cards) {
  const area = Math.round(card.template.rooms.reduce((sum, room) => sum + room.width * room.depth, 0));
  const bedrooms = card.template.bedroomCount;
  const bedroomLabel = bedrooms === 0 ? "Studio" : bedrooms === 1 ? "1 bedroom" : `${bedrooms} bedrooms`;
  assert.equal(card.name, card.template.label);
  assert.equal(card.meta, `${bedroomLabel} · ${card.template.rooms.length} rooms · ${area} m²`);
  const pack = card.template.furnishingPacks.find((entry) => entry.id === card.furnishingPackId);
  assert.ok(card.furnishingPackId === null || (pack && pack.intents.length > 0), `${card.name}: Furnished adds furniture.`);
}
const unknownTemplate: HousePlanTemplate = { ...BLANK_ROOM_TEMPLATE, id: "library_test" };
assert.equal(buildStartTemplateCards([unknownTemplate, ...HOUSE_PLAN_TEMPLATES]).at(-1)?.template.id, "library_test");
assert.equal(buildStartTemplateCards([unknownTemplate])[0]?.meta, "Studio · 1 room · 20 m²");
const countFor = (key: (typeof START_TEMPLATE_FILTERS)[number]["key"]) =>
  cards.filter((card) => matchesStartTemplateFilter(card, key)).length;
assert.equal(countFor("all"), cards.length);
assert.equal(countFor(0) + countFor(1) + countFor(2), cards.length, "Every template is in one bedroom filter.");
assert.ok(cards.filter((card) => matchesStartTemplateFilter(card, 2)).every((card) => card.template.bedroomCount >= 2));

// The chooser's markup.
const noop = () => undefined;
const chooserProps = (overrides: Partial<StartDesignChooserProps> = {}): StartDesignChooserProps => ({
  open: true,
  ready: true,
  isAuthenticated: false,
  onClose: noop,
  onChooseTemplate: noop,
  onChooseDraw: noop,
  onChooseUpload: noop,
  onChooseBlank: noop,
  onSearchAddress: noop,
  uploadSignIn: { open: false, onClose: noop, onSignIn: noop },
  ...overrides,
});
const render = (props: StartDesignChooserProps) => renderToStaticMarkup(createElement(StartDesignChooser, props));
assert.equal(render(chooserProps({ open: false })), "");
const guest = render(chooserProps());
assert.match(guest, /data-testid="start-design-chooser"/);
assert.match(guest, /role="dialog" aria-modal="true" aria-labelledby="start-design-title"/);
assert.match(guest, /<h1 id="start-design-title"[^>]*data-editor-dialog-initial-focus="true"[^>]*>Start a new design<\/h1>/);
assert.match(guest, /aria-label="Close" data-testid="start-design-close"/);
const choiceOrder = ["templates", "draw", "upload", "blank"].map((id) => guest.indexOf(`data-testid="start-choice-${id}"`));
assert.ok(choiceOrder.every((index, position) => index > 0 && (position === 0 || index > choiceOrder[position - 1])));
assert.match(guest, new RegExp(`id="${START_UPLOAD_CHOICE_ID}"[^>]*data-testid="start-choice-upload"`));
assert.match(guest, /data-testid="start-choice-upload-sign-in"[^>]*>.*Sign in needed<\/span>/);
assert.doesNotMatch(render(chooserProps({ isAuthenticated: true })), /start-choice-upload-sign-in/);
for (const { key, label } of START_TEMPLATE_FILTERS) {
  assert.match(
    guest,
    new RegExp(`data-testid="start-template-filter-${key}" aria-pressed="${key === "all"}"[^>]*>${label}<span[^>]*>${countFor(key)}</span>`)
  );
}
assert.match(guest, /data-testid="start-template-empty" aria-pressed="true"/);
assert.match(guest, /data-testid="start-template-furnished" aria-pressed="false"/);
assert.match(guest, /data-testid="start-template-address-search"[^>]*>.*Search by HDB address<\/button>/);
const shownIds = [...guest.matchAll(/data-testid="start-template-([a-z_]+)" aria-label="([^"]+)"/g)];
assert.deepEqual(
  shownIds.map(([, id]) => id),
  cards.slice(0, START_TEMPLATE_PREVIEW_COUNT).map((card) => card.template.id),
  "Eight templates show before See all."
);
assert.equal(shownIds[0]?.[2], `${cards[0]?.name}, ${cards[0]?.meta}`);
assert.match(guest, new RegExp(`data-testid="start-templates-see-all"[^>]*>See all ${cards.length} templates`));
assert.match(guest, new RegExp(`data-testid="start-template-preview-${cards[0]?.template.id}"`));
assert.doesNotMatch(guest, /upload-sign-in-dialog/);
assert.doesNotMatch(guest, /disabled=""/);
// Until products load, the choices wait, as Plan's own template buttons do; Templates only scrolls.
const waiting = render(chooserProps({ ready: false }));
for (const id of ["draw", "upload", "blank"]) {
  assert.match(waiting, new RegExp(`data-testid="start-choice-${id}" disabled=""`));
}
assert.match(waiting, /data-testid="start-choice-templates" class=/);
assert.equal(waiting.match(/data-testid="start-template-[a-z_]+" aria-label="[^"]+" disabled=""/g)?.length, START_TEMPLATE_PREVIEW_COUNT);
const signIn = render(chooserProps({ uploadSignIn: { open: true, onClose: noop, onSignIn: noop } }));
assert.match(signIn, /data-testid="upload-sign-in-dialog"/);
for (const text of [
  "Sign in to upload your floor plan", "Choose your file", "PDF, JPG, PNG or WebP, up to 25 MB.", "Check the walls",
  "Set scale", "Continue with Google", "Not now", "DXF and other CAD files need Pro.",
]) {
  assert.ok(signIn.includes(text), `The sign-in dialog says "${text}".`);
}
// An Upload elsewhere in the editor (Plan, the address search) opens the dialog on its own.
const signInAlone = render(chooserProps({ open: false, uploadSignIn: { open: true, onClose: noop, onSignIn: noop } }));
assert.match(signInAlone, /data-testid="upload-sign-in-dialog"/);
assert.doesNotMatch(signInAlone, /data-testid="start-design-chooser"/);

// What each choice does.
type Recorder = {
  input: UseDesignPageStartChooserInput;
  calls: string[];
  setChooser: Dispatch<SetStateAction<StartChooserState>>;
  last: () => StartChooserState | null;
};
const closedChooser: StartChooserState = { open: false, asNewDesign: false, signIn: false, signInOpenerId: null };
function recorder(state: Partial<UseDesignPageStartChooserInput["state"]> = {}, chooser = closedChooser): Recorder {
  const calls: string[] = [];
  let latest: StartChooserState | null = null;
  const record = (name: string) => () => {
    calls.push(name);
  };
  return {
    calls,
    last: () => latest,
    setChooser: (next) => {
      const value = typeof next === "function" ? next(chooser) : next;
      latest = value;
      calls.push(`chooser:${value.open ? "open" : "closed"}${value.asNewDesign ? "+new" : ""}${value.signIn ? "+signIn" : ""}`);
    },
    input: {
      state: { isAuthenticated: true, sessionKnown: true, designIsEmpty: true, localBackupHydrated: true, canEdit: true, ...state },
      actions: {
        applyPlanTemplate: (template, options) => {
          const pack = options?.furnishingPackId ? `+${options.furnishingPackId}` : "";
          calls.push(`apply:${template.id}${pack}${options?.onApplied ? "+then" : ""}`);
          options?.onApplied?.();
        },
        requirePlanChoiceForNextTemplate: record("requireChoice"),
        openTemplatePicker: record("templatePicker"),
        openNewDesignTemplatePicker: record("newDesignTemplatePicker"),
        goPlan: record("goPlan"),
        drawRoom: record("drawRoom"),
        openPricing: record("pricing"),
      },
    },
  };
}
const dispatched: string[] = [];
const dispatchedDetails: unknown[] = [];
Object.assign(globalThis, {
  window: {
    requestAnimationFrame: (callback: (time: number) => void) => {
      callback(0);
      return 0;
    },
    dispatchEvent: (event: Event) => {
      dispatched.push(event.type);
      dispatchedDetails.push((event as CustomEvent).detail);
      return true;
    },
  },
});
const firstVisit: StartChooserState = { open: true, asNewDesign: false, signIn: false, signInOpenerId: null };
const newDesign: StartChooserState = { open: true, asNewDesign: true, signIn: false, signInOpenerId: null };
type ChooserInputState = Partial<UseDesignPageStartChooserInput["state"]>;
const choose = (chooser: StartChooserState, run: (props: StartDesignChooserProps) => void, state: ChooserInputState = {}) => {
  const { input, calls, setChooser } = recorder(state, chooser);
  run(buildStartChooserProps(chooser, setChooser, input));
  return calls;
};
const [firstCard] = cards;
const furnishedCard = cards.find((card) => card.furnishingPackId !== null);
assert.ok(firstCard && furnishedCard?.furnishingPackId);

// A first visit's untouched room is replaced or kept without asking.
assert.deepEqual(choose(firstVisit, (props) => props.onChooseTemplate(firstCard, false)), ["chooser:closed", `apply:${firstCard.template.id}`]);
assert.deepEqual(
  choose(firstVisit, (props) => props.onChooseTemplate(furnishedCard, true)),
  ["chooser:closed", `apply:${furnishedCard.template.id}+${furnishedCard.furnishingPackId}`]
);
assert.deepEqual(choose(firstVisit, (props) => props.onChooseDraw()), ["chooser:closed", "drawRoom"]);
assert.deepEqual(choose(firstVisit, (props) => props.onChooseBlank()), ["chooser:closed", "goPlan"]);
assert.deepEqual(choose(firstVisit, (props) => props.onSearchAddress()), ["chooser:closed", "templatePicker"]);
// New design always asks before replacing, as it did before; Draw room draws once the blank room is in.
assert.deepEqual(
  choose(newDesign, (props) => props.onChooseTemplate(firstCard, false)),
  ["chooser:closed", "requireChoice", `apply:${firstCard.template.id}`]
);
assert.deepEqual(
  choose(newDesign, (props) => props.onChooseDraw()),
  ["chooser:closed", "requireChoice", "apply:blank_room+then", "drawRoom"]
);
assert.deepEqual(choose(newDesign, (props) => props.onChooseBlank()), ["chooser:closed", "requireChoice", "apply:blank_room"]);
assert.deepEqual(choose(newDesign, (props) => props.onSearchAddress()), ["chooser:closed", "newDesignTemplatePicker"]);
// A design with content, reached without New design (a guest's upload link): the template flow asks.
assert.deepEqual(choose(firstVisit, (props) => props.onChooseDraw(), { designIsEmpty: false }), ["chooser:closed", "apply:blank_room+then", "drawRoom"]);
// Upload: guests sign in first (ST3), and focus comes back to the Upload card; members get Plan
// and the upload window, recorded as an upload from Start a new design.
const guestChoice = recorder({ isAuthenticated: false }, firstVisit);
buildStartChooserProps(firstVisit, guestChoice.setChooser, guestChoice.input).onChooseUpload();
assert.deepEqual(guestChoice.calls, ["chooser:open+signIn"]);
assert.equal(guestChoice.last()?.signInOpenerId, START_UPLOAD_CHOICE_ID);
assert.deepEqual(choose(firstVisit, (props) => props.onChooseUpload()), ["chooser:closed", "goPlan"]);
assert.deepEqual(dispatched.splice(0), ["floor-plan-upload-requested"]);
assert.deepEqual(dispatchedDetails.splice(0), [{ source: "start_chooser", openerId: START_UPLOAD_CHOICE_ID }]);
const guestProps = buildStartChooserProps({ ...firstVisit, signIn: true }, noop, recorder({ isAuthenticated: false }).input);
assert.equal(guestProps.uploadSignIn.open, true);
assert.equal(guestProps.isAuthenticated, false);
assert.equal(guestProps.ready, true);
assert.equal(buildStartChooserProps(firstVisit, noop, recorder({ canEdit: false }).input).ready, false);
assert.equal(
  buildStartChooserProps(firstVisit, noop, recorder({ sessionKnown: false }).input).ready,
  false,
  "While the session loads a member looks like a guest, so the choices wait for it."
);
assert.deepEqual(choose({ ...firstVisit, signIn: true }, (props) => props.uploadSignIn.onClose()), ["chooser:open"]);
// The sign-in dialog also opens without the choices, for an Upload elsewhere in the editor.
const aloneProps = buildStartChooserProps({ ...closedChooser, signIn: true, signInOpenerId: "plan-upload" }, noop, recorder().input);
assert.equal(aloneProps.open, false);
assert.equal(aloneProps.uploadSignIn.open, true);
assert.equal(aloneProps.uploadSignIn.openerId, "plan-upload");

// Every other Upload floor plan: guests are asked to sign in, focus going back to that Upload;
// members in Plan get the upload window at once, with the Upload's own source.
const entryCalls: string[] = [];
const entryInput = (isAuthenticated: boolean): FloorPlanUploadEntryInput => ({
  isAuthenticated,
  sessionKnown: true,
  goPlan: () => entryCalls.push("goPlan"),
  askToSignIn: (request: FloorPlanUploadRequest) => entryCalls.push(`signIn:${request.source}:${request.openerId}`),
});
const planUpload: FloorPlanUploadRequest = { source: "plan_panel", openerId: "floor-plan-consumer-import-2d-action" };
answerFloorPlanUploadRequest(planUpload, entryInput(false));
assert.deepEqual(entryCalls.splice(0), ["signIn:plan_panel:floor-plan-consumer-import-2d-action"]);
assert.deepEqual(dispatched.splice(0), []);
answerFloorPlanUploadRequest({ source: "address_search", openerId: "floor-plan-address-upload-action" }, entryInput(true));
assert.deepEqual(entryCalls.splice(0), [], "Plan is already open behind its own Upload.");
assert.deepEqual(dispatched.splice(0), ["floor-plan-upload-requested"]);
assert.deepEqual(dispatchedDetails.splice(0), [{ source: "address_search", openerId: "floor-plan-address-upload-action" }]);

// `?start=`: once, and never over a design with content, except Upload, which opens a new one.
const startWith = (start: Parameters<typeof applyStartParam>[0], state: ChooserInputState = {}) => {
  const { input, calls, setChooser } = recorder(state);
  applyStartParam(start, input, setChooser);
  return calls;
};
assert.deepEqual(startWith("choose"), ["chooser:open"]);
assert.deepEqual(startWith("template"), ["chooser:open"]);
assert.deepEqual(startWith("draw"), ["drawRoom"]);
assert.deepEqual(startWith("blank"), ["goPlan"]);
for (const start of ["choose", "template", "draw", "blank"] as const) {
  assert.deepEqual(startWith(start, { designIsEmpty: false }), [], `?start=${start} keeps a design with content.`);
}
assert.deepEqual(startWith("upload", { designIsEmpty: false }), ["goPlan"]);
assert.deepEqual(dispatched.splice(0), ["floor-plan-upload-requested"]);
assert.deepEqual(dispatchedDetails.splice(0), [{ source: "start_link", openerId: null }]);
// A guest's upload link shows the sign-in dialog over the choices, as in the mockup.
assert.deepEqual(startWith("upload", { isAuthenticated: false }), ["chooser:open+signIn"]);
// My designs' New design opens Start a new design as New design does, over any design.
assert.deepEqual(startWith("new", { designIsEmpty: false }), ["chooser:open+new"]);
// My designs' "See pricing" opens Pricing; it can come with a start link.
const entry = (link: Parameters<typeof applyEntryLink>[0]) => {
  const { input, calls, setChooser } = recorder();
  applyEntryLink(link, input, setChooser);
  return calls;
};
assert.deepEqual(entry({ start: null, pricing: true }), ["pricing"]);
assert.deepEqual(entry({ start: "blank", pricing: false }), ["goPlan"]);

// Wiring.
const chooserHook = read("lib/useDesignPageStartChooser.ts");
assert.match(
  chooserHook,
  /url\.searchParams\.delete\("start"\);\s*url\.searchParams\.delete\("pricing"\);\s*window\.history\.replaceState\(/,
  "A link starts once, and opens Pricing once."
);
assert.match(chooserHook, /start: url\.searchParams\.has\("designId"\) \? null : start, pricing \}/, "Saved designs ignore ?start=.");
const uploadEntry = read("lib/useFloorPlanUploadEntry.ts");
assert.match(uploadEntry, /signIn\("google", \{ callbackUrl: START_UPLOAD_CALLBACK_URL \}\)/);
assert.match(
  chooserHook,
  /const ready = input\.state\.localBackupHydrated && input\.state\.canEdit && input\.state\.sessionKnown;/,
  "?start= waits for the session, so a member back from signing in isn't asked to sign in again."
);
assert.match(uploadEntry, /if \(latest\.current\.sessionKnown\) answerFloorPlanUploadRequest\(request, latest\.current\);\s*else pending\.current = request;/);
assert.match(chooserHook, /track\("launch_path_selected", \{ path, source \}\)/);
assert.doesNotMatch(chooserHook, /path: "upload"/, "The upload window records uploads, once.");
const registration = read("lib/useDesignPagePersistenceWorkspaceRegistration.ts");
assert.match(registration, /openNewDesignTemplatePicker: persistence\.actions\.newPlan\.openNewPlanPicker/);
assert.match(registration, /drawRoom: documentSelection\.actions\.betaStart\.startDrawRoom/);
assert.match(registration, /state: \{ \.\.\.persistence\.state, startChooser: startChooser\.chooserProps \}/);
assert.match(
  registration,
  /newPlan: \{ \.\.\.persistence\.actions\.newPlan, openNewPlanPicker: startChooser\.openAsNewDesign \}/,
  "New design, in More and in My designs, opens Start a new design."
);
assert.match(
  read("lib/useDesignPageBetaStartController.ts"),
  /const startDrawRoom = useCallback\(\(\) => \{(?:(?!track\()[\s\S])*?\}, \[actions\]\);/,
  "Draw room from Start a new design isn't recorded as the Beta panel's."
);
assert.match(
  read("lib/useDesignPageFloorPlanUnderlayController.ts"),
  /track\("floor_plan_template_applied", \{[\s\S]*?\}\);\s*\/\/[^\n]*\n\s*options\?\.onApplied\?\.\(\);/
);
assert.match(
  read("components/editor/design-page/DesignPageWorkspace.tsx"),
  /persistence: \{ startChooser: persistenceWorkspaceRegistration\.state\.startChooser,/
);
assert.match(read("lib/design-page-dialog-layer-model.ts"), /startChooser: persistence\.startChooser,/);
assert.match(read("lib/design-page-dialog-layer-adapter.ts"), /startChooser: dialogs\.startChooser,/);
assert.match(read("components/editor/design-page/DesignPageDialogLayer.tsx"), /<StartDesignChooser \{\.\.\.dialogs\.startChooser\} \/>/);
const chooserComponent = read("components/editor/start/StartDesignChooser.tsx");
assert.match(
  chooserComponent,
  /focusRestorationEnabledRef\.current = false;\s*handOverToAddressSearch\(onClose, props\.onSearchAddress\);/,
  "Search by HDB address hands focus to Plan's template list, which returns it to More."
);

console.log("Start a new design tests passed.");
