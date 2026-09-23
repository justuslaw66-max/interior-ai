/**
 * One name per concept in the words people read (UX audit 2026-09-23, phase 2).
 * scripts/test-ui-glossary.ts fails when user-facing text uses a retired term,
 * a US spelling (D4: UK spelling), or three dots instead of "…".
 * Terms a later phase restructures (Tray, Download, Level, Surfaces, …) stay
 * in LATER_PHASE_UI_TERMS until that phase lands; they are not enforced yet.
 */
export type UiGlossaryEntry = {
  concept: string;
  use: string;
  /** Lower-case phrases, matched case-insensitively on word boundaries. */
  retire: readonly string[];
};

export const UI_GLOSSARY: readonly UiGlossaryEntry[] = [
  { concept: "The saved thing", use: "design (My designs, New design)", retire: ["new plan", "start a new plan", "guest design"] },
  {
    concept: "Bringing in a drawing",
    use: "Upload floor plan; your floor plan; your uploads",
    retire: [
      "import floor plan", "import a floor plan", "import 2d drawing", "import workspace", "upload plan",
      "choose floor-plan file", "floor-plan import", "floor-plan imports",
    ],
  },
  { concept: "Scale step", use: "Set scale", retire: ["calibrate", "set plan scale", "set one real measurement", "register origin"] },
  { concept: "Image under the plan", use: "Floor plan image (Show/Hide, Image opacity)", retire: ["source reference", "underlay", "plan visibility"] },
  {
    concept: "Ready-made layouts",
    use: "Templates; Choose a template; Empty / Furnished",
    retire: ["starter layout", "starter layouts", "choose a floor plan", "use template", "start from template", "start from a template", "furnished starter"],
  },
  { concept: "AI furnishing", use: "Suggest a layout", retire: ["ai design", "generate ai layout", "generate a starter layout", "ai starter", "ask ai for"] },
  { concept: "Drawing tools", use: "Rectangle room, Custom shape, Curved wall", retire: ["rectangle wall", "straight wall", "arc wall", "outline room"] },
  { concept: "Doors and windows", use: "Doors & windows: Door, Window, Opening (no door)", retire: ["doorway", "doorways", "open passage"] },
  { concept: "Views", use: "2D, 3D, Fit to screen, Saved views", retire: ["2d plan", "room view", "fit plan", "fit view", "camera views", "presentation views"] },
  {
    concept: "Paid tier",
    use: "Pro; Pro tools (the switch); Pricing",
    retire: ["designer mode", "pro mode", "pro controls", "advanced plan controls", "view pro plans", "see plans"],
  },
  { concept: "Cabinetry", use: "Built-ins (Pro)", retire: ["millwork", "cabinetry studio", "plan fixture"] },
  { concept: "Price swaps", use: "Swap for cheaper, Swap for pricier", retire: ["upgrade room", "upgrade this item", "make room cheaper"] },
  {
    concept: "Sharing",
    use: "Share; Copy link; Make a copy",
    retire: ["client handoff", "create share link", "share view", "public presentation", "copy to edit", "duplicate this design"],
  },
  { concept: "Account", use: "Sign in, Sign out, My designs", retire: ["main menu", "dashboard", "login", "log in"] },
  { concept: "Units", use: "Units (selector), Size (inputs)", retire: ["display units", "measurement unit", "starting size"] },
  { concept: "Orders", use: "plain order-placed copy", retire: ["authoritative"] },
];

/** Restructured by phase 3 or 4; listed so nobody mistakes them for approved names. */
export const LATER_PHASE_UI_TERMS: readonly string[] = [
  "Tray", "cart", "Shopping overview", "Export / Present & Export (→ Download)", "Presentation mode (→ Preview)",
  "1F / Add floor (→ Level)", "Tiles (→ Surfaces)", "Clear (four meanings)", "furniture / items (→ products)",
];

/** D4: UK spelling in user-facing text. Keys are US forms, matched as whole words. */
export const UK_SPELLING: Readonly<Record<string, string>> = {
  color: "colour", colors: "colours", colored: "coloured", favorite: "favourite", favorites: "favourites",
  favorited: "favourited", center: "centre", centered: "centred", gray: "grey", catalog: "catalogue",
  catalogs: "catalogues", meter: "metre", meters: "metres", centimeter: "centimetre", centimeters: "centimetres",
  millimeter: "millimetre", millimeters: "millimetres", canceled: "cancelled", canceling: "cancelling",
  labeled: "labelled", modeled: "modelled", modeling: "modelling", behavior: "behaviour",
  neighboring: "neighbouring", aluminum: "aluminium", analyze: "analyse", analyzed: "analysed",
  analyzing: "analysing", organize: "organise", organized: "organised", optimize: "optimise",
  optimized: "optimised", customize: "customise", customized: "customised", visualization: "visualisation",
  prioritize: "prioritise", finalize: "finalise", summarize: "summarise", minimize: "minimise",
  maximize: "maximise", specialized: "specialised", recognize: "recognise",
};
