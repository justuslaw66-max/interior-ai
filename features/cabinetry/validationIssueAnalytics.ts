import type { CabinetValidationIssue } from "./types";

export interface CabinetValidationIssueExposure {
  key: string;
  issueCode: string;
  severity: CabinetValidationIssue["severity"];
  targetScope: CabinetValidationIssue["target"]["scope"];
}

export interface CabinetValidationExposureState {
  definitionId: string;
  activeKeys: ReadonlySet<string>;
}

function normalized(values: readonly string[] | undefined): string {
  return [...new Set(values ?? [])].sort().join(",");
}

/**
 * This key is used only in memory for render deduplication. Target identifiers
 * and fields deliberately never appear in the analytics projection.
 */
export function getCabinetValidationIssueExposureKey(
  issue: CabinetValidationIssue
): string {
  return [
    issue.code,
    issue.severity,
    issue.target.scope,
    issue.target.field ?? issue.field ?? "",
    normalized(issue.target.moduleIds),
    issue.target.hostId ?? "",
  ].join("|");
}

export function collectCabinetValidationIssueExposures(
  definitionId: string,
  issues: readonly CabinetValidationIssue[],
  previous: CabinetValidationExposureState | null
): {
  exposures: CabinetValidationIssueExposure[];
  state: CabinetValidationExposureState;
} {
  const previousKeys =
    previous?.definitionId === definitionId
      ? previous.activeKeys
      : new Set<string>();
  const activeKeys = new Set<string>();
  const exposures: CabinetValidationIssueExposure[] = [];

  for (const issue of issues) {
    const key = getCabinetValidationIssueExposureKey(issue);
    if (activeKeys.has(key)) continue;
    activeKeys.add(key);
    if (previousKeys.has(key)) continue;
    exposures.push({
      key,
      issueCode: issue.code,
      severity: issue.severity,
      targetScope: issue.target.scope,
    });
  }

  return {
    exposures,
    state: { definitionId, activeKeys },
  };
}

export function cabinetStudioElapsedMs(startedAtMs: number, nowMs: number): number {
  if (!Number.isFinite(startedAtMs) || !Number.isFinite(nowMs)) return 0;
  return Math.max(0, Math.round(nowMs - startedAtMs));
}
