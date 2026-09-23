import type { AuditedFloorPlanAddressBinding } from "./revision-audit";

function normalizeAddressPart(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

function sameAddressSelector(
  replaced: AuditedFloorPlanAddressBinding,
  replacement: AuditedFloorPlanAddressBinding
) {
  if (
    normalizeAddressPart(replaced.countryCode) !==
    normalizeAddressPart(replacement.countryCode)
  ) {
    return false;
  }
  if (
    normalizeAddressPart(replaced.addressNormalized) ===
    normalizeAddressPart(replacement.addressNormalized)
  ) {
    return true;
  }
  if (
    normalizeAddressPart(replaced.block) !== normalizeAddressPart(replacement.block) ||
    normalizeAddressPart(replaced.street) !== normalizeAddressPart(replacement.street)
  ) {
    return false;
  }
  const replacedPostal = normalizeAddressPart(replaced.postalCode);
  const replacementPostal = normalizeAddressPart(replacement.postalCode);
  return !replacedPostal || !replacementPostal || replacedPostal === replacementPostal;
}

function replacementCoversStack(
  replaced: AuditedFloorPlanAddressBinding,
  replacement: AuditedFloorPlanAddressBinding
) {
  const replacedStack = normalizeAddressPart(replaced.stack);
  const replacementStack = normalizeAddressPart(replacement.stack);
  // An all-stack selector cannot be safely replaced by a finite list of stack
  // selectors: the source may contain stacks the reviewer did not enumerate.
  if (!replacedStack) return !replacementStack;
  return !replacementStack || replacedStack === replacementStack;
}

function replacementRangesCover(
  replaced: AuditedFloorPlanAddressBinding,
  replacements: readonly AuditedFloorPlanAddressBinding[]
) {
  const requiredMin = replaced.floorMin ?? Number.NEGATIVE_INFINITY;
  const requiredMax = replaced.floorMax ?? Number.POSITIVE_INFINITY;
  const intervals = replacements
    .map((replacement) => ({
      min: replacement.floorMin ?? Number.NEGATIVE_INFINITY,
      max: replacement.floorMax ?? Number.POSITIVE_INFINITY,
    }))
    .filter((interval) => interval.min <= requiredMax && requiredMin <= interval.max)
    .sort((left, right) => left.min - right.min || right.max - left.max);

  let nextRequired = requiredMin;
  for (const interval of intervals) {
    const start = Math.max(interval.min, requiredMin);
    const end = Math.min(interval.max, requiredMax);
    if (start > nextRequired) return false;
    if (end === Number.POSITIVE_INFINITY || end >= requiredMax) return true;
    nextRequired = Math.max(nextRequired, end + 1);
  }
  return false;
}

export function findUncoveredFloorPlanSupersedeBindings(input: {
  replaced: readonly AuditedFloorPlanAddressBinding[];
  replacement: readonly AuditedFloorPlanAddressBinding[];
}) {
  return input.replaced.filter((replaced) => {
    const applicable = input.replacement.filter(
      (replacement) =>
        sameAddressSelector(replaced, replacement) &&
        replacementCoversStack(replaced, replacement)
    );
    return !replacementRangesCover(replaced, applicable);
  });
}

/**
 * Atomic supersede is intentionally stricter than ordinary publication. Every
 * selector served by the old revision must remain served at transaction commit.
 * Transform and source evidence may change because those are common reasons for
 * replacing a revision. Intentional address removal uses the separate guarded
 * retirement workflow instead of masquerading as a no-downtime replacement.
 */
export function assertFloorPlanSupersedeCoverage(input: {
  replaced: readonly AuditedFloorPlanAddressBinding[];
  replacement: readonly AuditedFloorPlanAddressBinding[];
}) {
  const [missing] = findUncoveredFloorPlanSupersedeBindings(input);
  if (!missing) return;
  const floorRange =
    missing.floorMin == null && missing.floorMax == null
      ? "all floors"
      : `floors ${missing.floorMin ?? "…"}–${missing.floorMax ?? "…"}`;
  throw new Error(
    `SUPERSEDE_ADDRESS_GAP: replacement does not cover ${missing.addressNormalized}` +
      `${missing.stack ? ` stack ${missing.stack}` : " all stacks"}, ${floorRange}`
  );
}
