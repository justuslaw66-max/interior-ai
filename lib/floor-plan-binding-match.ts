import type { PersistedFloorPlanAddressBinding } from "@/lib/room-types";

function normalized(value: string | null) {
  return (value ?? "").trim().replace(/\s+/g, " ").toUpperCase();
}

function omittedOrEqual(current: string | null, candidate: string | null) {
  const currentValue = normalized(current);
  return !currentValue || currentValue === normalized(candidate);
}

function postalEvidenceMatches(
  current: string | null,
  candidate: string | null,
  allowChange: boolean
) {
  const currentValue = normalized(current);
  const candidateValue = normalized(candidate);
  return currentValue === candidateValue || !currentValue ||
    (allowChange && !candidateValue);
}

function stackCoversSavedUnit(
  current: PersistedFloorPlanAddressBinding,
  candidate: PersistedFloorPlanAddressBinding
) {
  const selectedStack = normalized(current.unitStack ?? current.stack);
  const candidateStack = normalized(candidate.stack);
  if (!selectedStack) return !candidateStack;
  return !candidateStack || candidateStack === selectedStack;
}

function floorCoversSavedUnit(
  current: PersistedFloorPlanAddressBinding,
  candidate: PersistedFloorPlanAddressBinding
) {
  if (!Number.isInteger(current.unitFloor)) {
    return current.floorMin === candidate.floorMin && current.floorMax === candidate.floorMax;
  }
  const floor = current.unitFloor as number;
  return (
    (candidate.floorMin === null || floor >= candidate.floorMin) &&
    (candidate.floorMax === null || floor <= candidate.floorMax)
  );
}

/** Exact immutable comparison retained for older revision snapshots. */
export function isSameFloorPlanAddressBinding(
  current: PersistedFloorPlanAddressBinding,
  candidate: PersistedFloorPlanAddressBinding
) {
  return (
    normalized(current.countryCode) === normalized(candidate.countryCode) &&
    normalized(current.addressNormalized) === normalized(candidate.addressNormalized) &&
    normalized(current.block) === normalized(candidate.block) &&
    normalized(current.street) === normalized(candidate.street) &&
    normalized(current.postalCode) === normalized(candidate.postalCode) &&
    normalized(current.stack) === normalized(candidate.stack) &&
    current.transform === candidate.transform &&
    current.floorMin === candidate.floorMin &&
    current.floorMax === candidate.floorMax
  );
}

/** Selects a corrected binding using the saved exact unit context. */
export function floorPlanBindingCoversSavedUnit(
  current: PersistedFloorPlanAddressBinding,
  candidate: PersistedFloorPlanAddressBinding,
  options: {
    allowTransformChange?: boolean;
    allowPostalEvidenceChange?: boolean;
  } = {}
) {
  const postalMatches = postalEvidenceMatches(
    current.postalCode,
    candidate.postalCode,
    options.allowPostalEvidenceChange === true
  );
  const sameAddress =
    normalized(current.countryCode) === normalized(candidate.countryCode) &&
    normalized(current.addressNormalized) === normalized(candidate.addressNormalized) &&
    omittedOrEqual(current.block, candidate.block) &&
    omittedOrEqual(current.street, candidate.street) &&
    postalMatches;
  if (!sameAddress) return false;

  if (!stackCoversSavedUnit(current, candidate)) return false;
  if (!floorCoversSavedUnit(current, candidate)) return false;

  return options.allowTransformChange === true || current.transform === candidate.transform;
}
