import type { FloorPlanAddressBindingInput } from "./validation";

export type ComparableFloorPlanAddressBinding = Omit<
  FloorPlanAddressBindingInput,
  "role"
> & {
  role?: FloorPlanAddressBindingInput["role"];
  id?: string;
  revisionId?: string;
};

export type FloorPlanAddressBindingConflict = {
  incomingIndex: number;
  incoming: ComparableFloorPlanAddressBinding;
  existing: ComparableFloorPlanAddressBinding;
};

function normalizeAddressPart(value: string | null | undefined) {
  return (value ?? "")
    .normalize("NFKC")
    .trim()
    .toLocaleLowerCase("en")
    .replace(/[.,]/g, "")
    .replace(/\s+/g, " ");
}

function sameAddress(
  left: ComparableFloorPlanAddressBinding,
  right: ComparableFloorPlanAddressBinding
) {
  if (normalizeAddressPart(left.countryCode) !== normalizeAddressPart(right.countryCode)) {
    return false;
  }
  if (
    normalizeAddressPart(left.addressNormalized) === normalizeAddressPart(right.addressNormalized)
  ) {
    return true;
  }
  const sameBlockAndStreet =
    normalizeAddressPart(left.block) === normalizeAddressPart(right.block) &&
    normalizeAddressPart(left.street) === normalizeAddressPart(right.street);
  if (!sameBlockAndStreet) return false;
  const leftPostal = normalizeAddressPart(left.postalCode);
  const rightPostal = normalizeAddressPart(right.postalCode);
  return !leftPostal || !rightPostal || leftPostal === rightPostal;
}

function stacksOverlap(
  left: ComparableFloorPlanAddressBinding,
  right: ComparableFloorPlanAddressBinding
) {
  const leftStack = normalizeAddressPart(left.stack);
  const rightStack = normalizeAddressPart(right.stack);
  // Address-only bindings intentionally return multiple candidate layouts for
  // the consumer to choose from. Conflict enforcement begins only when both
  // revisions claim the same exact stack selector.
  return Boolean(leftStack && rightStack && leftStack === rightStack);
}

function floorRangesOverlap(
  left: ComparableFloorPlanAddressBinding,
  right: ComparableFloorPlanAddressBinding
) {
  const leftMin = left.floorMin ?? Number.NEGATIVE_INFINITY;
  const leftMax = left.floorMax ?? Number.POSITIVE_INFINITY;
  const rightMin = right.floorMin ?? Number.NEGATIVE_INFINITY;
  const rightMax = right.floorMax ?? Number.POSITIVE_INFINITY;
  return leftMin <= rightMax && rightMin <= leftMax;
}

export function floorPlanAddressBindingsOverlap(
  left: ComparableFloorPlanAddressBinding,
  right: ComparableFloorPlanAddressBinding
) {
  if ((left.role ?? "catalog") !== "catalog" || (right.role ?? "catalog") !== "catalog") {
    return false;
  }
  return sameAddress(left, right) && stacksOverlap(left, right) && floorRangesOverlap(left, right);
}

export function findFloorPlanAddressBindingConflicts(input: {
  incoming: readonly ComparableFloorPlanAddressBinding[];
  existing?: readonly ComparableFloorPlanAddressBinding[];
}): FloorPlanAddressBindingConflict[] {
  const conflicts: FloorPlanAddressBindingConflict[] = [];
  for (const [incomingIndex, incoming] of input.incoming.entries()) {
    for (let earlierIndex = 0; earlierIndex < incomingIndex; earlierIndex += 1) {
      const earlier = input.incoming[earlierIndex];
      if (floorPlanAddressBindingsOverlap(incoming, earlier)) {
        conflicts.push({ incomingIndex, incoming, existing: earlier });
      }
    }
    for (const existing of input.existing ?? []) {
      if (floorPlanAddressBindingsOverlap(incoming, existing)) {
        conflicts.push({ incomingIndex, incoming, existing });
      }
    }
  }
  return conflicts;
}

export function assertNoFloorPlanAddressBindingConflicts(input: {
  incoming: readonly ComparableFloorPlanAddressBinding[];
  existing?: readonly ComparableFloorPlanAddressBinding[];
}) {
  const [conflict] = findFloorPlanAddressBindingConflicts(input);
  if (!conflict) return;
  const existingReference = conflict.existing.revisionId
    ? `revision ${conflict.existing.revisionId}`
    : "another submitted binding";
  throw new Error(
    `ADDRESS_BINDING_CONFLICT: ${conflict.incoming.addressNormalized}` +
      `${conflict.incoming.stack ? ` stack ${conflict.incoming.stack}` : ""}` +
      ` overlaps ${existingReference}`
  );
}
