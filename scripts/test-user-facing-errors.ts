import assert from "node:assert/strict";
import fs from "node:fs";
import path from "node:path";
import ts from "typescript";

import { DesignApiError } from "../lib/design-api-client";
import { editorFeedbackTone } from "../lib/editor-feedback-tone";
import {
  GENERIC_ERROR_MESSAGE,
  UserFacingError,
  userFacingErrorMessage,
} from "../lib/user-facing-error";

// UX audit 2026-09-23, AX8: people never see an Error's raw message or an
// internal id. Messages reach the screen through lib/user-facing-error.ts.

const withCode = (code: string) => Object.assign(new Error(`${code} wall-3`), { code });

assert.equal(userFacingErrorMessage(new UserFacingError("Sign in to continue.")), "Sign in to continue.");
assert.equal(
  userFacingErrorMessage(new DesignApiError("Unable to reach the server.", "network", null, true)),
  "Unable to reach the server.",
  "Design API errors carry curated copy."
);
assert.equal(userFacingErrorMessage(new Error("Opening opening-3 references missing wall wall-9.")), GENERIC_ERROR_MESSAGE);
assert.equal(userFacingErrorMessage("not an error", "Delete failed"), "Delete failed");
assert.match(userFacingErrorMessage(new TypeError("Failed to fetch"), "x"), /Check your connection/);
assert.equal(userFacingErrorMessage(withCode("UNKNOWN_WALL"), "That wall change couldn't be made."), "That wall change couldn't be made.");
for (const code of [
  "POINT_OFF_WALL", "OPENING_OUT_OF_BOUNDS", "ARC_EDIT_UNSUPPORTED", "ARC_MUTATION_UNSUPPORTED",
  "OPENING_EVIDENCE_OVERRIDE_REQUIRED", "DOCUMENTED_VALUE_LOCKED", "INVALID_MEASUREMENT", "NON_INTEGER_MILLIMETRES",
  "SIZE_LIMIT_EXCEEDED", "STORAGE_WRITE_FAILED",
]) {
  const message = userFacingErrorMessage(withCode(code));
  assert.doesNotMatch(message, /wall-3|[A-Z]{2,}_[A-Z]/, `${code} must map to a plain sentence.`);
  assert.equal(editorFeedbackTone(message), "error", `${code} must read as an error in editor toasts.`);
}
const locked = Object.assign(new Error("Protected opening width evidence requires an approved reviewed override."), {
  name: "DesignPageOpeningMutationError",
});
assert.doesNotMatch(userFacingErrorMessage(locked), /evidence|override/);

const root = process.cwd();
// Server routes, admin and dev/QA-only surfaces are out of scope.
const SKIPPED = /^(?:app\/(?:api|admin|tools|models-test|lighting-reference)\/|components\/admin\/|components\/editor\/design-page\/DesignPageQaMarkers\.tsx$)/;
const LOGGING_OR_COMPARISON = /^(?:console\.\w+|track\w*|logOperationalEvent|captureException)$|\.(?:includes|startsWith|endsWith|test|match)$/;
// Ids people are meant to read: a support reference, an admin-only table, and the
// material reference in the share-page order list (Surfaces is reworked in a later phase).
const ALLOWED_IDS = new Set([
  "components/BetaFeedbackWidget.tsx:reportId",
  "components/RecentClicksTable.tsx:c.productId",
  "components/SurfaceMaterialBomSection.tsx:row.materialId",
]);

function sourceFiles(directory: string): string[] {
  return fs.readdirSync(path.join(root, directory), { withFileTypes: true }).flatMap((entry) => {
    const relative = `${directory}/${entry.name}`;
    if (entry.isDirectory()) return sourceFiles(relative);
    return /\.tsx?$/.test(entry.name) && !entry.name.endsWith(".d.ts") ? [relative] : [];
  });
}

function isUserFacing(relative: string, text: string) {
  if (SKIPPED.test(relative) || relative === "lib/user-facing-error.ts") return false;
  return relative.endsWith(".tsx") || /^use[A-Z]/.test(path.basename(relative)) || /^["']use client["']/.test(text);
}

function isNarrowedError(name: string, node: ts.Node) {
  const narrowing = new RegExp(`\\b${name}\\s+instanceof\\s+\\w*Error\\b`);
  for (let current = node.parent; current && !ts.isFunctionLike(current); current = current.parent) {
    if (ts.isCatchClause(current) && current.variableDeclaration?.name.getText() === name) return true;
    const condition = ts.isConditionalExpression(current) ? current.condition
      : ts.isIfStatement(current) ? current.expression
      : ts.isBinaryExpression(current) && current.operatorToken.kind === ts.SyntaxKind.AmpersandAmpersandToken
        ? current.left : null;
    if (condition && narrowing.test(condition.getText())) return true;
  }
  return false;
}

function onlyLogsOrCompares(node: ts.Node) {
  for (let current = node.parent; current && !ts.isStatement(current); current = current.parent) {
    if (ts.isCallExpression(current) && LOGGING_OR_COMPARISON.test(current.expression.getText())) return true;
    if (ts.isBinaryExpression(current) && [
      ts.SyntaxKind.EqualsEqualsEqualsToken, ts.SyntaxKind.ExclamationEqualsEqualsToken,
    ].includes(current.operatorToken.kind)) return true;
  }
  return false;
}

const violations: string[] = [];
const files = ["app", "components", "features", "hooks", "lib"].flatMap(sourceFiles);
let checked = 0;
for (const relative of files) {
  const text = fs.readFileSync(path.join(root, relative), "utf8");
  if (!isUserFacing(relative, text)) continue;
  checked += 1;
  const file = ts.createSourceFile(relative, text, ts.ScriptTarget.Latest, true,
    relative.endsWith(".tsx") ? ts.ScriptKind.TSX : ts.ScriptKind.TS);
  const report = (node: ts.Node, problem: string) => violations.push(
    `${relative}:${file.getLineAndCharacterOfPosition(node.getStart()).line + 1} ${problem}: ${node.getText()}`
  );
  const visit = (node: ts.Node) => {
    if (ts.isPropertyAccessExpression(node) && node.name.text === "message" && ts.isIdentifier(node.expression) &&
        isNarrowedError(node.expression.text, node) && !onlyLogsOrCompares(node)) {
      report(node, "raw error message");
    }
    if (ts.isJsxExpression(node) && node.expression && !ts.isJsxAttribute(node.parent) &&
        /(?:\.id|Id)$/.test(node.expression.getText()) &&
        !ALLOWED_IDS.has(`${relative}:${node.expression.getText()}`)) {
      report(node, "internal id as text");
    }
    ts.forEachChild(node, visit);
  };
  visit(file);
}

assert.deepEqual(
  violations,
  [],
  `Show plain words, not raw error text or internal ids. Use userFacingErrorMessage(cause, "fallback") ` +
    `from lib/user-facing-error.ts, or throw UserFacingError with final copy:\n${violations.join("\n")}`
);
console.log(`User-facing error checks passed (${checked} files).`);
