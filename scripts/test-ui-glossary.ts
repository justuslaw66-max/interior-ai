import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { UI_GLOSSARY, UK_SPELLING } from "../lib/ui-glossary";

// UX audit 2026-09-23, phase 2: one name per concept, UK spelling and one
// ellipsis character in the words people read. The names live in
// lib/ui-glossary.ts; this guard reads user-facing text with the TypeScript
// parser (JSX text, text attributes, copy properties, toasts, undo names and
// *Label/*Message helpers) and fails on retired terms.

const root = process.cwd();
const SOURCE_ROOTS = ["app", "components", "features", "lib"];
// Server routes, admin, dev/QA pages, server pipelines and generated documents are out of scope.
const SKIPPED =
  /^(?:app\/(?:api|admin|tools|models-test|hugg-test|lighting-reference)\/|components\/admin\/|lib\/(?:admin|import-jobs|floor-plan-imports|asset-pipeline)\/|lib\/ui-glossary\.ts$|features\/cabinetry\/generateCabinetDocumentation\.ts$)|\.generated\.ts$/;
// Validation and catalogue-QA messages for developers and admins, not shown in the app.
const INTERNAL_MESSAGES = new Set([
  "lib/assetQuality.ts", "lib/catalog-commerce-readiness.ts", "lib/catalog/imported-models-payload.ts",
  "lib/commerce-helpers.ts", "lib/design-document-contract.ts", "lib/finish-gate.ts", "lib/finish-taxonomy.ts",
  "lib/floor-plan-catalog-v1-adapter.ts", "lib/floor-plan-library-schema.ts",
]);
const TEXT_ATTRIBUTES =
  /^(?:aria-(?:label|description|roledescription|valuetext)|title|placeholder|alt|label|description|heading|subtitle|helperText|emptyMessage|closeLabel|confirmLabel|cancelLabel|tooltip|unauthenticatedChildren|screenReaderLabel|ariaLabel|text|message|hint|detail|caption|eyebrow|summary|buttonLabel|ctaLabel)$/;
const COPY_KEYS =
  /^(?:label|title|description|message|text|heading|subheading|subtitle|body|summary|hint|helper|helperText|tooltip|placeholder|ariaLabel|screenReaderLabel|cta|ctaLabel|buttonLabel|actionLabel|primaryLabel|secondaryLabel|confirmLabel|cancelLabel|emptyTitle|emptyBody|emptyMessage|detail|caption|successMessage|errorMessage|fallbackError|notice|statusLabel|explanation|headline|eyebrow|prompt|note|warning|success|failure|copy|badge|shortLabel|menuLabel|tabLabel|nextStep|nextAction|recommendation|guidance)$/;
const COPY_CALLS =
  /^(?:showToast|showRuleToast|toast|notify|setMessage|setError|setErrorMessage|setActionError|setDeleteError|setStatusMessage|announce|setNotice|setFeedback|setToast|setBanner|onError|runHistoryTransaction|runTransaction|begin|commitItems|commitSelectedItemPosition|reportTransformRejection)$/;
const COPY_FUNCTIONS = /(?:Label|Copy|Text|Message|Title|Description|Hint|Caption|Summary|Heading|Explanation|Guidance|Tooltip)s?$/;
// Reviewed exceptions: "file|exact text" → reason.
const ALLOWED = new Map<string, string>([
  ["app/share/[shareToken]/(presentation)/ShareHeader.tsx|Drag to look around • Make a copy to edit", "an instruction, not the retired \"Copy to edit\" button"],
  // The buy list sends people to a shop's website, where they add products to that shop's own cart.
  ["components/editor/shop/ShoppingBuyListDialog.tsx|Add to your cart", "the retailer's own cart, on its website"],
  ["components/editor/shop/ShoppingBuyListDialog.tsx|Add 1 to your cart", "the retailer's own cart, on its website"],
  ["components/editor/shop/ShoppingBuyListDialog.tsx|Open each product at and add it to your cart there.", "the retailer's own cart, on its website"],
]);

type UiText = { file: string; line: number; text: string };

function sourceFiles(directory: string): string[] {
  const absolute = path.join(root, directory);
  if (!fs.existsSync(absolute)) return [];
  return fs.readdirSync(absolute, { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return entry.name === "node_modules" ? [] : sourceFiles(relative);
    return /\.tsx?$/.test(entry.name) && !/\.d\.ts$/.test(entry.name) ? [relative] : [];
  });
}

function textsOf(node: ts.Expression | undefined): Array<{ node: ts.Node; text: string }> {
  if (!node) return [];
  if (ts.isStringLiteral(node) || ts.isNoSubstitutionTemplateLiteral(node)) return [{ node, text: node.text }];
  if (ts.isTemplateExpression(node)) {
    return [{ node, text: node.head.text + node.templateSpans.map((span) => ` ${span.literal.text}`).join("") }];
  }
  if (ts.isParenthesizedExpression(node)) return textsOf(node.expression);
  if (ts.isConditionalExpression(node)) return [...textsOf(node.whenTrue), ...textsOf(node.whenFalse)];
  if (ts.isBinaryExpression(node)) {
    const kind = node.operatorToken.kind;
    const joins = [ts.SyntaxKind.QuestionQuestionToken, ts.SyntaxKind.BarBarToken, ts.SyntaxKind.PlusToken];
    return joins.includes(kind) ? [...textsOf(node.left), ...textsOf(node.right)] : [];
  }
  return [];
}

function enclosingFunctionName(node: ts.Node) {
  for (let current = node.parent; current; current = current.parent) {
    if ((ts.isFunctionDeclaration(current) || ts.isMethodDeclaration(current)) && current.name) return current.name.getText();
    if ((ts.isArrowFunction(current) || ts.isFunctionExpression(current)) && ts.isVariableDeclaration(current.parent)) {
      return current.parent.name.getText();
    }
  }
  return "";
}

function propertyName(node: ts.PropertyName) {
  return ts.isIdentifier(node) || ts.isStringLiteral(node) ? node.text : "";
}

function uiTextsOf(file: string): UiText[] {
  const source = fs.readFileSync(path.join(root, file), "utf8");
  const kind = file.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS;
  const sourceFile = ts.createSourceFile(file, source, ts.ScriptTarget.Latest, true, kind);
  const copyModule = /(?:^|[/-])copy\.ts$/.test(file);
  const found: UiText[] = [];
  const add = (items: Array<{ node: ts.Node; text: string }>) => {
    for (const item of items) {
      const text = item.text.replace(/\s+/g, " ").trim();
      if (!/[A-Za-z]{2}/.test(text)) continue;
      const { line } = sourceFile.getLineAndCharacterOfPosition(item.node.getStart(sourceFile));
      found.push({ file, line: line + 1, text });
    }
  };
  const visit = (node: ts.Node) => {
    if (ts.isJsxText(node)) add([{ node, text: node.text }]);
    else if (ts.isJsxAttribute(node) && node.initializer && TEXT_ATTRIBUTES.test(node.name.getText())) {
      const value = node.initializer;
      add(ts.isStringLiteral(value) ? [{ node: value, text: value.text }] : ts.isJsxExpression(value) ? textsOf(value.expression) : []);
    } else if (ts.isJsxExpression(node) && (ts.isJsxElement(node.parent) || ts.isJsxFragment(node.parent))) {
      add(textsOf(node.expression));
    } else if (ts.isPropertyAssignment(node) && COPY_KEYS.test(propertyName(node.name))) {
      add(textsOf(node.initializer));
    } else if (ts.isCallExpression(node)) {
      const callee = node.expression.getText().split(".").pop() ?? "";
      if (COPY_CALLS.test(callee)) add(node.arguments.flatMap((argument) => textsOf(argument)));
    } else if (ts.isReturnStatement(node) && COPY_FUNCTIONS.test(enclosingFunctionName(node))) {
      add(textsOf(node.expression));
    } else if (copyModule && (ts.isStringLiteral(node) || ts.isTemplateExpression(node)) && !ts.isImportDeclaration(node.parent)) {
      add(textsOf(node as ts.Expression));
    }
    ts.forEachChild(node, visit);
  };
  visit(sourceFile);
  return found;
}

const escape = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
const word = (value: string) => new RegExp(`(?<![\\w-])${escape(value)}(?![\\w-])`, "i");
const rules: Array<{ test: RegExp; problem: string }> = [
  ...UI_GLOSSARY.flatMap((entry) =>
    entry.retire.map((term) => ({ test: word(term), problem: `"${term}" is retired; use ${entry.use}` }))
  ),
  ...Object.entries(UK_SPELLING).map(([us, uk]) => ({ test: word(us), problem: `UK spelling: "${us}" → "${uk}"` })),
  { test: /\.\.\./, problem: 'use one ellipsis character "…", not three dots' },
  { test: /\bMy Designs\b/, problem: 'sentence case: "My designs"' },
];

for (const entry of UI_GLOSSARY) {
  for (const term of entry.retire) {
    assert.equal(term, term.toLowerCase(), `Retired terms are lower case: ${term}`);
    assert.doesNotMatch(entry.use, word(term), `${entry.concept}: the name in use must not contain a retired term`);
  }
}

const files = SOURCE_ROOTS.flatMap((directory) => sourceFiles(directory)).filter(
  (file) => !SKIPPED.test(file) && !INTERNAL_MESSAGES.has(file)
);
const texts = files.flatMap((file) => uiTextsOf(file));
assert.ok(texts.length > 3000, `The guard must read the app's text; it found only ${texts.length} strings.`);
assert.ok(
  texts.some((item) => item.file === "components/editor/RoomSetupStartActions.tsx" && item.text === "Upload floor plan"),
  "The guard must see Plan's Upload floor plan, under the room card."
);

const violations = texts
  .filter((item) => !ALLOWED.has(`${item.file}|${item.text}`))
  .flatMap((item) =>
    rules
      .filter((rule) => rule.test.test(item.text))
      .map((rule) => `${item.file}:${item.line} "${item.text.slice(0, 90)}" — ${rule.problem}`)
  );
for (const key of ALLOWED.keys()) {
  assert.ok(texts.some((item) => `${item.file}|${item.text}` === key), `Stale glossary exception: ${key}`);
}
assert.deepEqual(violations, [], `User-facing text breaks the glossary:\n${violations.join("\n")}`);

// Sentence case (AX10): a label capitalises its first word and names only ("Download cut list",
// not "Download Cut List"). It is Title Case when every counted word is capitalised. Each "·"
// segment, sentence and dialog title after "Close" is checked on its own; brackets (keys such as
// Cmd/Ctrl+Z), acronyms, single letters, numbers, small words and names don't count. Admin's text
// is read too (its own wording is out of the glossary's scope, but not its case).
const NAMES = /\b(?:Interior AI|Pro|Free|Google Maps|Google|Furnish|Shop|Surfaces|Levels|Layouts|Favourites|Module \d+|Markdown)\b/g;
const SMALL_WORDS = new Set(["a", "an", "and", "as", "at", "by", "for", "from", "in", "into", "of", "on", "or", "per", "the", "to", "via", "vs", "with"]);
const isTitleCase = (label: string) =>
  label.replace(/\([^)]*\)/g, " ").replace(NAMES, "name").split(/\s+·\s+|[.!?]\s+|^Close\s+/).some((segment) => {
    const words = segment.split(/\s+/).map((part) => part.replace(/^[^\p{L}\d]+|[^\p{L}\d]+$/gu, "")).filter((part) => /\p{L}/u.test(part));
    const counted = words.filter(
      (part, index) => !(index > 0 && SMALL_WORDS.has(part.toLowerCase())) && !/^[\p{Lu}\d]+s?$/u.test(part) && !/\d/.test(part)
    );
    return words.length <= 7 && counted.length >= 2 && counted.every((part) => /^\p{Lu}/u.test(part));
  });
for (const [label, expected] of [
  ["Download Cut List", true], ["Download cut list", false], ["Close Share Link", true], ["Close Share link", false],
  ["Continue to Furnish", false], ["Upgrade to Pro", false], ["Undo (Cmd/Ctrl+Z)", false], ["Step 1 · Room goal", false],
  ["Opening W", false], ["← Back to 3D View", true], ["Surface material BOM", false], ["Sent. Ref", false],
] as const) {
  assert.equal(isTitleCase(label), expected, `Sentence case reads "${label}" as ${expected ? "" : "not "}Title Case.`);
}
// Product, finish, paint and catalogue names are names, as are default room names saved in designs.
const NAME_FILES = new Set([
  "app/admin/catalog/[catalogItemId]/CatalogAuthoringEditor.tsx",
  "lib/design-page-product-data.ts", "lib/materialPresets.ts", "lib/design-page-model-maps.ts", "lib/catalog-presets/index.ts",
  "lib/catalog/view-builders.ts", "lib/catalog/imported-model-assembly.ts", "lib/useDesignPageProductConfiguration.ts",
  "lib/wall-paint.ts", "components/editor/design-page/ProductModelVariantControls.tsx", "lib/design-page-house-plan.ts",
]);
const SENTENCE_CASE_ALLOWED = new Map<string, string>([
  ["components/editor/FloorPlanAddressFields.tsx|810A Chai Chee Street", "an example address"],
  ["components/editor/design-page/CanonicalPlanVectorExport.tsx|Liberation Sans", "a font"],
  ["components/editor/design-controls-plan/WallPaintPicker.tsx|Nippon Paint", "a paint brand"],
  ["components/editor/design-page/lighting/lightingPresets.ts|Bright & Clear", "a lighting preset's name"],
  ["components/editor/design-page/lighting/lightingPresets.ts|Natural Daylight", "a lighting preset's name"],
  ["lib/design-route-payload.ts|Untitled Living Room", "a new design's default name, saved in designs"],
  ["lib/shared-design-projection-schema.ts|Untitled Living Room", "a new design's default name, saved in designs"],
  ["lib/useDesignPageExport.ts|Interior AI Room Design - Technical Set", "a PDF document's title"],
  ["lib/useDesignPageExport.ts|Interior AI Room Design - Presentation Set", "a PDF document's title"],
  ["lib/useDesignPageExport.ts|Interior AI Room Design - Free Preview", "a PDF document's title"],
  ["app/admin/clicks/page.tsx|Prisma Studio", "a tool's name"],
  ["app/admin/floor-plans/[id]/PublicDisplayMetadataEditor.tsx|Housing and Development Board", "an organisation"],
]);
const adminTexts = SOURCE_ROOTS.flatMap((directory) => sourceFiles(directory))
  .filter((file) => /^(?:app\/admin|components\/admin)\//.test(file))
  .flatMap((file) => uiTextsOf(file));
const sentenceCaseTexts = [...texts, ...adminTexts];
const titleCaseLabels = sentenceCaseTexts
  .filter((item) => !NAME_FILES.has(item.file) && !SENTENCE_CASE_ALLOWED.has(`${item.file}|${item.text}`))
  .filter((item) => isTitleCase(item.text))
  .map((item) => `${item.file}:${item.line} "${item.text.slice(0, 90)}"`);
for (const key of SENTENCE_CASE_ALLOWED.keys()) {
  assert.ok(sentenceCaseTexts.some((item) => `${item.file}|${item.text}` === key), `Stale sentence-case exception: ${key}`);
}
assert.deepEqual(titleCaseLabels, [], `Labels use sentence case (capitalise the first word and names only):\n${titleCaseLabels.join("\n")}`);

console.log(`UI glossary checks passed: ${texts.length} strings in ${files.length} files, and ${adminTexts.length} of Admin's for sentence case.`);
