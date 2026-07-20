"use client";

import { useEffect, useRef, useState } from "react";

import type { CabinetValidationIssue } from "../types";
import {
  cabinetStudioElapsedMs,
  collectCabinetValidationIssueExposures,
  type CabinetValidationExposureState,
} from "../validationIssueAnalytics";

interface UseCabinetStudioValidationExposureInput {
  definitionId: string;
  moduleCount: number;
  issues: readonly CabinetValidationIssue[];
  trackStudioInteraction: (
    event: string,
    details?: Record<string, unknown>
  ) => void;
}

export function useCabinetStudioValidationExposure({
  definitionId,
  moduleCount,
  issues,
  trackStudioInteraction,
}: UseCabinetStudioValidationExposureInput): void {
  const [sessionStartedAt] = useState(() => Date.now());
  const exposureStateRef = useRef<CabinetValidationExposureState | null>(null);

  useEffect(() => {
    const next = collectCabinetValidationIssueExposures(
      definitionId,
      issues,
      exposureStateRef.current
    );
    exposureStateRef.current = next.state;
    for (const exposure of next.exposures) {
      trackStudioInteraction("millwork_validation_issue_exposed", {
        issue_code: exposure.issueCode,
        severity: exposure.severity,
        target_scope: exposure.targetScope,
        module_count: moduleCount,
        elapsed_ms: cabinetStudioElapsedMs(
          sessionStartedAt,
          Date.now()
        ),
      });
    }
  }, [
    definitionId,
    issues,
    moduleCount,
    sessionStartedAt,
    trackStudioInteraction,
  ]);
}
