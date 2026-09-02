import { compileFloorPlanDocumentV2, FloorPlanDocumentValidationErrorV2,
  type FloorPlanValidationIssueV2 } from "@/lib/floor-plan-compiler-v2";
import type { FloorPlanDocumentV2, FloorPlanFloorV2, FloorPlanPointMmV2,
  FloorPlanPropertyEvidenceV2 } from "@/lib/floor-plan-document-v2";
import { appendFloorPlanOpeningOverrideAuditV2, planFloorPlanOpeningMutationV2,
  type FloorPlanOpeningOverrideAuthorizationV2 } from "@/lib/floor-plan-opening-mutation-policy";
import { floorPlanPropertyEvidenceIsEditable } from "@/lib/floor-plan-property-evidence";
export type FloorPlanCalibrationValuePlanV2 = {
  entityType: "vertex" | "wall" | "opening" | "annotation" | "calibration";
  entityId: string; field: string; currentRawValueMm: number;
  rawProposedValueMm: number; proposedRawValueMm: number;
  evidence: FloorPlanPropertyEvidenceV2 | null;
  protected: boolean; preserved: boolean; clamped: boolean;
};
export type FloorPlanCalibrationProtectedFieldPlanV2 = {
  openingId: string; field: "width"; currentRawValueMm: number;
  proposedRawValueMm: number; currentEvidence: FloorPlanPropertyEvidenceV2;
  disposition: "preserved" | "requires_override" | "authorized";
};
export type FloorPlanCalibrationDiagnosticV2 = {
  code: string; path: string; affectedEntityIds: string[];
  rawProposedValue: unknown; normalizedValue: unknown; message: string;
};
export type FloorPlanCalibrationBindingV2 = {
  sourceDocumentFingerprint: string; requestFingerprint: string;
  protectedDecisionFingerprint: string; proposedDocumentFingerprint: string;
  validationFingerprint: string; planFingerprint: string;
};
export type FloorPlanHorizontalCalibrationPreflightV2 = {
  status: "ready" | "requires_override" | "blocked" | "invalid";
  floorId: string; anchor: FloorPlanPointMmV2; factor: number; affectedRoomIds: string[];
  values: FloorPlanCalibrationValuePlanV2[]; protectedFields: FloorPlanCalibrationProtectedFieldPlanV2[];
  clamps: FloorPlanCalibrationValuePlanV2[]; diagnostics: FloorPlanCalibrationDiagnosticV2[];
  proposedDocumentValidation: { boundary: "compileFloorPlanDocumentV2";
    status: "not_run" | "valid" | "invalid"; errorCount: number };
  binding: FloorPlanCalibrationBindingV2 | null;
  explanation: string | null;
};
type CalibrationInput = {
  document: FloorPlanDocumentV2; floorId: string; anchor: FloorPlanPointMmV2;
  factor: number; actorId: string; mutatedAt?: string;
  overrideAuthorizations?: FloorPlanOpeningOverrideAuthorizationV2[];
};
type FloorOpening = FloorPlanFloorV2["openings"][number];
type PreflightBuild = {
  preflight: FloorPlanHorizontalCalibrationPreflightV2; proposedDocument: FloorPlanDocumentV2 | null;
};
const protectedEvidence = (evidence: FloorPlanPropertyEvidenceV2) =>
  !floorPlanPropertyEvidenceIsEditable(evidence);
const normalized = (value: number) => Math.round(value);
const isRecord = (value: unknown): value is Record<string, unknown> =>
  typeof value === "object" && value !== null && !Array.isArray(value);
function canonicalValue(value: unknown): unknown {
  if (typeof value === "number" && !Number.isFinite(value)) return { number: String(value) };
  if (Array.isArray(value)) return value.map(canonicalValue);
  if (!isRecord(value)) return value;
  return Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalValue(value[key])]));
}
function fingerprint(value: unknown) {
  const text = JSON.stringify(canonicalValue(value));
  let first = 0x811c9dc5;
  let second = 0x9e3779b9;
  for (let index = 0; index < text.length; index += 1) {
    first = Math.imul(first ^ text.charCodeAt(index), 0x01000193);
    second = Math.imul(second ^ text.charCodeAt(index), 0x85ebca6b);
  }
  return `calibration-v1:${text.length}:${(first >>> 0).toString(16).padStart(8, "0")}${
    (second >>> 0).toString(16).padStart(8, "0")}`;
}
function diagnostic(code: string, path: string, message: string,
  rawProposedValue: unknown, normalizedValue: unknown,
  affectedEntityIds: string[] = []): FloorPlanCalibrationDiagnosticV2 {
  return { code, path, affectedEntityIds, rawProposedValue, normalizedValue, message };
}
function invalidBuild(input: CalibrationInput, item: FloorPlanCalibrationDiagnosticV2): PreflightBuild {
  return { proposedDocument: null, preflight: {
    status: "invalid", floorId: input.floorId, anchor: { ...input.anchor }, factor: input.factor,
    affectedRoomIds: [], values: [], protectedFields: [], clamps: [], diagnostics: [item],
    proposedDocumentValidation: { boundary: "compileFloorPlanDocumentV2", status: "not_run", errorCount: 1 },
    binding: null, explanation: item.message,
  } };
}
function valuePlan(input: Omit<FloorPlanCalibrationValuePlanV2, "preserved">) {
  return { ...input, preserved: input.currentRawValueMm === input.proposedRawValueMm };
}
function proposedVertices(floor: FloorPlanFloorV2, anchor: FloorPlanPointMmV2, factor: number) {
  return new Map(floor.vertices.map((vertex) => [vertex.id, {
    xRaw: anchor.xMm + (vertex.xMm - anchor.xMm) * factor,
    zRaw: anchor.zMm + (vertex.zMm - anchor.zMm) * factor,
    xMm: normalized(anchor.xMm + (vertex.xMm - anchor.xMm) * factor),
    zMm: normalized(anchor.zMm + (vertex.zMm - anchor.zMm) * factor),
  }]));
}
function straightWallLengths(floor: FloorPlanFloorV2, vertices: ReturnType<typeof proposedVertices>) {
  return new Map(floor.walls.map((wall) => {
    if (wall.path.kind !== "line") return [wall.id, null] as const;
    const start = vertices.get(wall.path.startVertexId);
    const end = vertices.get(wall.path.endVertexId);
    return [wall.id, start && end
      ? normalized(Math.hypot(end.xMm - start.xMm, end.zMm - start.zMm)) : null] as const;
  }));
}
function openingGeometry(opening: FloorOpening, factor: number, wallLength: number | null) {
  const evidence = opening.widthEvidence ?? "assumed";
  const isProtected = protectedEvidence(evidence);
  const widthRaw = isProtected ? opening.widthMm : opening.widthMm * factor;
  const roundedWidth = normalized(widthRaw);
  const width = wallLength === null ? roundedWidth : Math.min(roundedWidth, wallLength);
  const offsetRaw = opening.offsetMm * factor;
  const roundedOffset = normalized(offsetRaw);
  const offset = wallLength === null ? roundedOffset : Math.max(0, Math.min(roundedOffset, wallLength - width));
  return {
    evidence, isProtected, width,
    widthPlan: valuePlan({ entityType: "opening", entityId: opening.id, field: "widthMm",
      currentRawValueMm: opening.widthMm, rawProposedValueMm: widthRaw, proposedRawValueMm: width,
      evidence, protected: isProtected, clamped: width !== roundedWidth }),
    offsetPlan: valuePlan({ entityType: "opening", entityId: opening.id, field: "offsetMm",
      currentRawValueMm: opening.offsetMm, rawProposedValueMm: offsetRaw, proposedRawValueMm: offset,
      evidence: null, protected: false, clamped: offset !== roundedOffset }),
  };
}
function appendBasePlans(values: FloorPlanCalibrationValuePlanV2[], floor: FloorPlanFloorV2,
  vertices: ReturnType<typeof proposedVertices>, factor: number) {
  for (const vertex of floor.vertices) {
    const next = vertices.get(vertex.id)!;
    values.push(
      valuePlan({ entityType: "vertex", entityId: vertex.id, field: "xMm",
        currentRawValueMm: vertex.xMm, rawProposedValueMm: next.xRaw, proposedRawValueMm: next.xMm,
        evidence: null, protected: false, clamped: false }),
      valuePlan({ entityType: "vertex", entityId: vertex.id, field: "zMm",
        currentRawValueMm: vertex.zMm, rawProposedValueMm: next.zRaw, proposedRawValueMm: next.zMm,
        evidence: null, protected: false, clamped: false })
    );
  }
  for (const wall of floor.walls) values.push(valuePlan({
    entityType: "wall", entityId: wall.id, field: "thicknessMm",
    currentRawValueMm: wall.thicknessMm, rawProposedValueMm: wall.thicknessMm * factor,
    proposedRawValueMm: normalized(wall.thicknessMm * factor), evidence: null,
    protected: false, clamped: false,
  }));
}
function protectedFieldDisposition(preserved: boolean, status: string | undefined) {
  return preserved ? "preserved" as const : status === "applied"
    ? "authorized" as const : "requires_override" as const;
}
function planOpenings(input: CalibrationInput, floor: FloorPlanFloorV2,
  wallLengths: Map<string, number | null>, values: FloorPlanCalibrationValuePlanV2[]) {
  const protectedFields: FloorPlanCalibrationProtectedFieldPlanV2[] = [];
  const authorizations = new Map((input.overrideAuthorizations ?? []).map((item) => [item.openingId, item]));
  if (authorizations.size !== (input.overrideAuthorizations?.length ?? 0)) {
    return { status: "blocked" as const, protectedFields,
      explanation: "Calibration contains duplicate opening override authorizations." };
  }
  let status: FloorPlanHorizontalCalibrationPreflightV2["status"] = "ready";
  let explanation: string | null = null;
  const required = new Set<string>();
  for (const opening of floor.openings) {
    const geometry = openingGeometry(opening, input.factor, wallLengths.get(opening.wallId) ?? null);
    values.push(geometry.widthPlan, geometry.offsetPlan);
    if (!geometry.isProtected) continue;
    const preserved = geometry.widthPlan.preserved;
    const policy = preserved ? null : planFloorPlanOpeningMutationV2({ opening,
      changes: { widthMm: geometry.width }, mutationPurpose: "scale_calibration",
      actorId: input.actorId, overrideAuthorization: authorizations.get(opening.id) });
    const disposition = protectedFieldDisposition(preserved, policy?.status);
    protectedFields.push({ openingId: opening.id, field: "width",
      currentRawValueMm: opening.widthMm, proposedRawValueMm: geometry.width,
      currentEvidence: geometry.evidence, disposition });
    if (!preserved) required.add(opening.id);
    if (policy?.status === "blocked" || policy?.status === "invalid") status = "blocked";
    else if (policy?.status === "requires_override" && status === "ready") status = "requires_override";
    explanation ??= policy?.explanation ?? null;
  }
  const unused = [...authorizations.keys()].find((openingId) => !required.has(openingId));
  return unused ? { status: "blocked" as const, protectedFields,
    explanation: `Calibration override for ${unused} does not match a required protected change.` }
    : { status, protectedFields, explanation };
}
function appendSecondaryPlans(values: FloorPlanCalibrationValuePlanV2[], floor: FloorPlanFloorV2,
  wallLengths: Map<string, number | null>, input: CalibrationInput) {
  for (const annotation of floor.annotations) {
    if (annotation.geometry.kind !== "wall_span") continue;
    const wallLength = wallLengths.get(annotation.geometry.wallId) ?? null;
    for (const [field, current] of [["geometry.widthMm", annotation.geometry.widthMm],
      ["geometry.offsetMm", annotation.geometry.offsetMm]] as const) {
      const raw = current * input.factor;
      const rounded = normalized(raw);
      const width = field === "geometry.widthMm"
        ? (wallLength === null ? rounded : Math.min(rounded, wallLength))
        : values.find((item) => item.entityId === annotation.id && item.field === "geometry.widthMm")?.proposedRawValueMm ?? 0;
      const proposed = field === "geometry.offsetMm" && wallLength !== null
        ? Math.max(0, Math.min(rounded, wallLength - width)) : rounded;
      values.push(valuePlan({ entityType: "annotation", entityId: annotation.id, field,
        currentRawValueMm: current, rawProposedValueMm: raw, proposedRawValueMm: proposed,
        evidence: null, protected: false, clamped: proposed !== rounded }));
    }
  }
  for (const calibration of floor.calibrations) calibration.controlPoints.forEach((control, index) => {
    for (const [axis, current, origin] of [["xMm", control.planMm.xMm, input.anchor.xMm],
      ["zMm", control.planMm.zMm, input.anchor.zMm]] as const) {
      const raw = origin + (current - origin) * input.factor;
      values.push(valuePlan({ entityType: "calibration", entityId: calibration.id,
        field: `controlPoints.${index}.planMm.${axis}`, currentRawValueMm: current,
        rawProposedValueMm: raw, proposedRawValueMm: normalized(raw), evidence: null,
        protected: false, clamped: false }));
    }
  });
}
function valuesByEntity(values: FloorPlanCalibrationValuePlanV2[]) {
  const result = new Map<string, FloorPlanCalibrationValuePlanV2[]>();
  for (const value of values) {
    const key = `${value.entityType}:${value.entityId}`;
    result.set(key, [...(result.get(key) ?? []), value]);
  }
  return result;
}
type CalibrationValuesByEntity = ReturnType<typeof valuesByEntity>;
function applyVertexValues(floor: FloorPlanFloorV2, byEntity: CalibrationValuesByEntity) {
  for (const vertex of floor.vertices) for (const value of byEntity.get(`vertex:${vertex.id}`) ?? []) {
    if (value.field === "xMm") vertex.xMm = value.proposedRawValueMm;
    if (value.field === "zMm") vertex.zMm = value.proposedRawValueMm;
  }
}
function applyWallValues(floor: FloorPlanFloorV2, byEntity: CalibrationValuesByEntity) {
  for (const wall of floor.walls) wall.thicknessMm =
    byEntity.get(`wall:${wall.id}`)?.[0]?.proposedRawValueMm ?? wall.thicknessMm;
}
function applyOpeningValues(floor: FloorPlanFloorV2, byEntity: CalibrationValuesByEntity) {
  for (const opening of floor.openings) for (const value of byEntity.get(`opening:${opening.id}`) ?? []) {
    if (value.field === "widthMm") {
      opening.widthMm = value.proposedRawValueMm;
      if (!value.preserved && !value.protected) opening.widthEvidence = "assumed";
    } else if (value.field === "offsetMm") opening.offsetMm = value.proposedRawValueMm;
  }
}
function applyAnnotationValues(floor: FloorPlanFloorV2, byEntity: CalibrationValuesByEntity) {
  for (const annotation of floor.annotations) {
    if (annotation.geometry.kind !== "wall_span") continue;
    for (const value of byEntity.get(`annotation:${annotation.id}`) ?? []) {
      if (value.field === "geometry.widthMm") annotation.geometry.widthMm = value.proposedRawValueMm;
      if (value.field === "geometry.offsetMm") annotation.geometry.offsetMm = value.proposedRawValueMm;
    }
  }
}
function applyCalibrationValues(floor: FloorPlanFloorV2, byEntity: CalibrationValuesByEntity) {
  for (const calibration of floor.calibrations) {
    for (const value of byEntity.get(`calibration:${calibration.id}`) ?? []) {
      const match = /^controlPoints\.(\d+)\.planMm\.(xMm|zMm)$/.exec(value.field);
      const control = match ? calibration.controlPoints[Number(match[1])] : null;
      if (control && match?.[2] === "xMm") control.planMm.xMm = value.proposedRawValueMm;
      if (control && match?.[2] === "zMm") control.planMm.zMm = value.proposedRawValueMm;
    }
    calibration.rmsErrorPx = undefined;
  }
}
function applyValues(floor: FloorPlanFloorV2, values: FloorPlanCalibrationValuePlanV2[]) {
  const byEntity = valuesByEntity(values);
  applyVertexValues(floor, byEntity);
  applyWallValues(floor, byEntity);
  applyOpeningValues(floor, byEntity);
  applyAnnotationValues(floor, byEntity);
  applyCalibrationValues(floor, byEntity);
}
function auditProtectedChanges(input: CalibrationInput, document: FloorPlanDocumentV2,
  protectedFields: FloorPlanCalibrationProtectedFieldPlanV2[]) {
  const floor = document.floors.find((item) => item.id === input.floorId)!;
  const authorizations = new Map((input.overrideAuthorizations ?? []).map((item) => [item.openingId, item]));
  for (const field of protectedFields) {
    if (field.disposition !== "authorized") continue;
    const opening = floor.openings.find((item) => item.id === field.openingId)!;
    const authorization = authorizations.get(opening.id)!;
    opening.widthEvidence = authorization.fields.find((item) => item.field === "width")!.replacementEvidence;
    const sourceId = opening.provenance.evidence[0]?.sourceId ?? document.sources[0]?.id;
    if (!sourceId || !input.mutatedAt) throw new Error("Calibration override requires an auditable source and timestamp.");
    opening.provenance = appendFloorPlanOpeningOverrideAuditV2({ provenance: opening.provenance,
      sourceId, authorization, reviewedAt: input.mutatedAt,
      reviewId: `scale-calibration:${floor.id}:${opening.id}:${input.mutatedAt}`,
      extractionVersion: "consumer-scale-calibration-v2" });
  }
}
function pathContext(document: FloorPlanDocumentV2, pathValue: string,
  values: FloorPlanCalibrationValuePlanV2[]) {
  let current: unknown = document;
  const ids: string[] = [];
  for (const match of pathValue.matchAll(/(?:^|\.)([^.[\]]+)|\[(\d+)\]/g)) {
    const key = match[1];
    const index = match[2] === undefined ? null : Number(match[2]);
    if (key && isRecord(current)) current = current[key];
    else if (index !== null && Array.isArray(current)) current = current[index];
    else { current = undefined; break; }
    if (isRecord(current) && typeof current.id === "string") ids.push(current.id);
  }
  const entityValues = values.filter((value) => ids.includes(value.entityId));
  const exact = entityValues.find((value) => pathValue.endsWith(value.field));
  return {
    affectedEntityIds: [...new Set(ids)],
    raw: exact?.rawProposedValueMm ?? Object.fromEntries(entityValues.map((value) => [value.field, value.rawProposedValueMm])),
    normalized: exact?.proposedRawValueMm ?? current,
  };
}
function compilerDiagnostics(document: FloorPlanDocumentV2,
  values: FloorPlanCalibrationValuePlanV2[], issues: FloorPlanValidationIssueV2[]) {
  return issues.map((issue) => {
    const context = pathContext(document, issue.path, values);
    return diagnostic(issue.code, issue.path, issue.message, context.raw,
      context.normalized, context.affectedEntityIds);
  });
}
function validateCalibrationInput(input: CalibrationInput) {
  if (!Number.isFinite(input.factor) || input.factor <= 0) return invalidBuild(input,
    diagnostic("INVALID_SCALE_FACTOR", "factor", "Calibration scale factor must be finite and positive.",
      input.factor, null));
  if (!Number.isSafeInteger(input.anchor.xMm) || !Number.isSafeInteger(input.anchor.zMm)) return invalidBuild(input,
    diagnostic("INVALID_CALIBRATION_ANCHOR", "anchor", "Calibration anchor must use integer millimetres.",
      input.anchor, null));
  if ((input.overrideAuthorizations?.length ?? 0) > 0 &&
      (!input.mutatedAt || !Number.isFinite(Date.parse(input.mutatedAt)) || new Date(input.mutatedAt).toISOString() !== input.mutatedAt)) return invalidBuild(input,
    diagnostic("INVALID_MUTATION_TIMESTAMP", "mutatedAt", "Authorized calibration requires a valid UTC timestamp.",
      input.mutatedAt ?? null, null));
  return null;
}
function buildPreflight(input: CalibrationInput): PreflightBuild {
  const invalidInput = validateCalibrationInput(input);
  if (invalidInput) return invalidInput;
  const floor = input.document.floors.find((item) => item.id === input.floorId);
  if (!floor) return invalidBuild(input, diagnostic("UNKNOWN_FLOOR", "floorId",
    "The selected floor is no longer available.", input.floorId, null));
  const vertices = proposedVertices(floor, input.anchor, input.factor);
  const wallLengths = straightWallLengths(floor, vertices);
  const values: FloorPlanCalibrationValuePlanV2[] = [];
  appendBasePlans(values, floor, vertices, input.factor);
  const openings = planOpenings(input, floor, wallLengths, values);
  appendSecondaryPlans(values, floor, wallLengths, input);
  const proposedDocument = structuredClone(input.document);
  applyValues(proposedDocument.floors.find((item) => item.id === input.floorId)!, values);
  let proposalError: Error | null = null;
  try { auditProtectedChanges(input, proposedDocument, openings.protectedFields); }
  catch (cause) { proposalError = cause instanceof Error ? cause : new Error(String(cause)); }
  let diagnostics: FloorPlanCalibrationDiagnosticV2[] = [];
  if (proposalError) diagnostics = [diagnostic("CALIBRATION_PROPOSAL_ERROR", "document",
    proposalError.message, null, null)];
  else try { compileFloorPlanDocumentV2(proposedDocument); }
    catch (cause) {
      diagnostics = cause instanceof FloorPlanDocumentValidationErrorV2
        ? compilerDiagnostics(proposedDocument, values, cause.issues)
        : [diagnostic("CALIBRATION_COMPILER_ERROR", "document",
            cause instanceof Error ? cause.message : String(cause), null, null)];
    }
  const status = diagnostics.length ? "invalid" : openings.status;
  const validation = { boundary: "compileFloorPlanDocumentV2" as const,
    status: diagnostics.length ? "invalid" as const : "valid" as const,
    errorCount: diagnostics.length };
  const bindingBase = {
    sourceDocumentFingerprint: fingerprint(input.document),
    requestFingerprint: fingerprint({ floorId: input.floorId, anchor: input.anchor,
      factor: input.factor, actorId: input.actorId,
      mutatedAt: input.overrideAuthorizations?.length ? input.mutatedAt : null,
      overrideAuthorizations: input.overrideAuthorizations ?? [] }),
    protectedDecisionFingerprint: fingerprint(openings.protectedFields),
    proposedDocumentFingerprint: fingerprint(proposedDocument),
    validationFingerprint: fingerprint({ validation, diagnostics }),
  };
  const binding = { ...bindingBase, planFingerprint: fingerprint(bindingBase) };
  return { proposedDocument, preflight: {
    status, floorId: floor.id, anchor: { ...input.anchor }, factor: input.factor,
    affectedRoomIds: [...new Set(floor.walls.flatMap((wall) => wall.adjacentRoomIds))].sort(),
    values, protectedFields: openings.protectedFields,
    clamps: values.filter((value) => value.clamped), diagnostics,
    proposedDocumentValidation: validation, binding,
    explanation: diagnostics[0]?.message ?? openings.explanation,
  } };
}
export function planFloorPlanHorizontalCalibrationV2(input: CalibrationInput) {
  return buildPreflight(input).preflight;
}
export function applyFloorPlanHorizontalCalibrationV2(input: CalibrationInput & {
  mutatedAt: string;
  validatedPreflightPlan?: FloorPlanHorizontalCalibrationPreflightV2;
}): { document: FloorPlanDocumentV2; undoDocument: FloorPlanDocumentV2;
  preflight: FloorPlanHorizontalCalibrationPreflightV2 } {
  const supplied = input.validatedPreflightPlan;
  if (supplied?.binding?.sourceDocumentFingerprint !== undefined &&
      supplied.binding.sourceDocumentFingerprint !== fingerprint(input.document)) {
    throw Object.assign(new Error("Calibration preflight is stale because the source document changed."),
      { preflight: supplied });
  }
  const built = buildPreflight(input);
  if (supplied && supplied.binding?.planFingerprint !== built.preflight.binding?.planFingerprint) {
    throw Object.assign(new Error("Calibration preflight does not match the exact document and request."),
      { preflight: built.preflight });
  }
  if (built.preflight.status !== "ready" || !built.proposedDocument) {
    throw Object.assign(new Error(built.preflight.explanation ?? "Calibration preflight did not pass."),
      { preflight: built.preflight });
  }
  compileFloorPlanDocumentV2(built.proposedDocument);
  return { document: built.proposedDocument, undoDocument: structuredClone(input.document),
    preflight: built.preflight };
}
