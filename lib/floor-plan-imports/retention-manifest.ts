import { hashCanonicalJson } from "./json";

type JsonRecord = Record<string, unknown>;

function isRecord(value: unknown): value is JsonRecord {
  return Boolean(value) && typeof value === "object" && !Array.isArray(value);
}

function finiteCount(value: unknown) {
  return Number.isSafeInteger(value) && (value as number) >= 0
    ? (value as number)
    : 0;
}

function boundedString(value: unknown, max = 160) {
  return typeof value === "string" ? value.slice(0, max) : null;
}

function scrubSourceDescriptor(value: unknown) {
  if (!isRecord(value)) return value;
  return {
    ...(boundedString(value.id) ? { id: boundedString(value.id) } : {}),
    ...(boundedString(value.mimeType, 80)
      ? { mimeType: boundedString(value.mimeType, 80) }
      : {}),
    ...(Number.isSafeInteger(value.byteLength)
      ? { byteLength: value.byteLength }
      : {}),
    ...(typeof value.sha256 === "string" && /^[a-f0-9]{64}$/i.test(value.sha256)
      ? { sha256: value.sha256.toLowerCase() }
      : {}),
    contentRetained: false,
  };
}

/**
 * Removes raw CAD labels/coordinates and source filenames when private source
 * retention expires. Canonical candidate geometry is intentionally outside
 * this function; only non-promoted extraction evidence is reduced to bounded
 * counts, units, conversion identity, and a deterministic integrity digest.
 */
export function scrubRetainedFloorPlanSourceManifest(value: unknown): {
  manifest: unknown;
  scrubbed: boolean;
} {
  if (!isRecord(value)) {
    return { manifest: value, scrubbed: false };
  }
  const manifest = structuredClone(value);
  let scrubbed = false;
  if ("source" in manifest && isRecord(manifest.source)) {
    manifest.source = scrubSourceDescriptor(manifest.source);
    scrubbed = true;
  }
  for (const key of ["fileName", "filename", "sourceFileName"] as const) {
    if (key in manifest) {
      delete manifest[key];
      scrubbed = true;
    }
  }
  if ("warnings" in manifest) {
    delete manifest.warnings;
    scrubbed = true;
  }
  if (!isRecord(manifest.cad)) {
    return { manifest, scrubbed };
  }
  const cad = manifest.cad as JsonRecord;
  const paths = Array.isArray(cad.paths) ? cad.paths : [];
  const texts = Array.isArray(cad.texts) ? cad.texts : [];
  const warnings = Array.isArray(cad.warnings) ? cad.warnings : [];
  const pointCount = paths.reduce((sum, path) => {
    if (!isRecord(path) || !Array.isArray(path.points)) return sum;
    return sum + path.points.length;
  }, 0);
  const retained = isRecord(cad.retainedEvidenceCounts)
    ? cad.retainedEvidenceCounts
    : {};
  const conversion = isRecord(cad.conversion)
    ? {
        providerId: boundedString(cad.conversion.providerId, 120),
        providerVersion: boundedString(cad.conversion.providerVersion, 80),
        sourceFormat: boundedString(cad.conversion.sourceFormat, 20),
        outputFormat: boundedString(cad.conversion.outputFormat, 20),
      }
    : null;
  manifest.cad = {
    kind: boundedString(cad.kind, 80),
    format: boundedString(cad.format, 20),
    parserVersion: boundedString(cad.parserVersion, 120),
    units: isRecord(cad.units)
      ? {
          name: boundedString(cad.units.name, 64),
          millimetresPerUnit:
            typeof cad.units.millimetresPerUnit === "number" &&
            Number.isFinite(cad.units.millimetresPerUnit)
              ? cad.units.millimetresPerUnit
              : null,
          basis: boundedString(cad.units.basis, 40),
          sourceEntityId: boundedString(cad.units.sourceEntityId, 120),
        }
      : null,
    entityCount: finiteCount(cad.entityCount),
    parseFailed: Boolean(cad.parseFailure),
    evidenceTruncated: Boolean(cad.evidenceTruncated),
    retainedEvidenceCounts: {
      paths: finiteCount(retained.paths),
      points: finiteCount(retained.points),
      texts: finiteCount(retained.texts),
    },
    rawEvidenceCounts: {
      paths: paths.length,
      points: pointCount,
      texts: texts.length,
      warnings: warnings.length,
    },
    rawEvidenceIntegritySha256: hashCanonicalJson({
      paths,
      texts,
      warnings,
      parseFailure: cad.parseFailure ?? null,
    }),
    ...(conversion ? { conversion } : {}),
    contentRetained: false,
  };
  if (isRecord(manifest.canonicalBuild)) {
    const issues = Array.isArray(manifest.canonicalBuild.rejectedGeometryIssues)
      ? manifest.canonicalBuild.rejectedGeometryIssues
      : [];
    manifest.canonicalBuild = {
      promotedWallCount: finiteCount(manifest.canonicalBuild.promotedWallCount),
      rejectedGeometryIssueCount: issues.length,
      rejectedGeometryIntegritySha256: hashCanonicalJson(issues),
    };
  }
  return { manifest, scrubbed: true };
}
