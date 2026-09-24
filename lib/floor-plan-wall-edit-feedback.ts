import { FloorPlanTopologyMutationErrorV2 } from "@/lib/floor-plan-topology-mutation-types";

export function proposedWallEditFailureMessage(cause: unknown): string {
  if (cause instanceof FloorPlanTopologyMutationErrorV2) {
    const details = [...new Set(cause.validationIssues.filter(({ severity }) => severity === "error").map(({ message }) => message))].slice(0, 2);
    if (details.length) return details.join(" ");
  }
  return cause instanceof Error ? cause.message : "The geometry is not valid.";
}
