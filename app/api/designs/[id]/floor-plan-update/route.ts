import { Prisma } from "@prisma/client";
import { NextResponse } from "next/server";
import { auth } from "@/lib/auth";
import { recordServerAnalyticsEvent } from "@/lib/app-events";
import { readJsonRequest } from "@/lib/api-boundary";
import { compileCandidateFloorPlanDocumentV2 } from "@/lib/floor-plan-imports/validation";
import { hashCanonicalJson } from "@/lib/floor-plan-imports/json";
import { applyFloorPlanAddressTransformV2 } from "@/lib/floor-plan-legacy-adapters";
import {
  buildUpdatedFloorPlanDesignCopy,
  compareFloorPlanRevisions,
  findLatestFloorPlanRevisionUpdate,
  floorPlanBindingCoversSavedUnit,
  type FloorPlanRevisionUpdateCandidate,
} from "@/lib/floor-plan-revision-updates";
import { prisma } from "@/lib/prisma";
import {
  sanitizeStoredDesign,
  snapshotToStored,
  storedToSnapshot,
  type StoredDesign,
} from "@/lib/room-persistence";
import type { PersistedFloorPlanAddressBinding } from "@/lib/room-types";

export const runtime = "nodejs";

type OwnedDesign = NonNullable<Awaited<ReturnType<typeof loadOwnedDesign>>>;

const ADDRESS_TRANSFORMS = new Set<PersistedFloorPlanAddressBinding["transform"]>([
  "normal",
  "mirror_x",
  "mirror_z",
  "rotate_90",
  "rotate_180",
  "rotate_270",
  "mirror_x_rotate_90",
  "mirror_x_rotate_270",
]);

function loadOwnedDesign(id: string, userId: string) {
  return prisma.design.findFirst({ where: { id, userId } });
}

function isPersistedAddressBinding(
  value: unknown
): value is PersistedFloorPlanAddressBinding {
  if (!value || typeof value !== "object" || Array.isArray(value)) return false;
  const binding = value as Partial<PersistedFloorPlanAddressBinding>;
  return (
    typeof binding.bindingId === "string" &&
    typeof binding.countryCode === "string" &&
    typeof binding.addressNormalized === "string" &&
    typeof binding.block === "string" &&
    typeof binding.street === "string" &&
    (binding.postalCode === null || typeof binding.postalCode === "string") &&
    (binding.stack === null || typeof binding.stack === "string") &&
    (binding.floorMin === null || Number.isInteger(binding.floorMin)) &&
    (binding.floorMax === null || Number.isInteger(binding.floorMax)) &&
    (binding.unitFloor === undefined ||
      binding.unitFloor === null ||
      Number.isInteger(binding.unitFloor)) &&
    (binding.unitStack === undefined ||
      binding.unitStack === null ||
      typeof binding.unitStack === "string") &&
    Boolean(binding.transform && ADDRESS_TRANSFORMS.has(binding.transform))
  );
}

function readUpdateSource(snapshotValue: unknown) {
  const stored = sanitizeStoredDesign(snapshotValue);
  const floorPlan = stored?.floorPlan;
  if (
    !stored ||
    !floorPlan?.canonicalDocument ||
    !floorPlan.revisionId ||
    !isPersistedAddressBinding(floorPlan.addressBinding)
  ) {
    return null;
  }
  return {
    stored,
    snapshot: storedToSnapshot(stored),
    floorPlan,
    revisionId: floorPlan.revisionId,
    binding: floorPlan.addressBinding,
  };
}

function mapBinding(binding: {
  id: string;
  countryCode: string;
  addressNormalized: string;
  block: string;
  street: string;
  postalCode: string | null;
  stack: string | null;
  floorMin: number | null;
  floorMax: number | null;
  transform: PersistedFloorPlanAddressBinding["transform"];
}): PersistedFloorPlanAddressBinding {
  return {
    bindingId: binding.id,
    countryCode: binding.countryCode,
    addressNormalized: binding.addressNormalized,
    block: binding.block,
    street: binding.street,
    postalCode: binding.postalCode,
    stack: binding.stack,
    floorMin: binding.floorMin,
    floorMax: binding.floorMax,
    transform: binding.transform,
  };
}

const revisionUpdateSelect = {
  id: true,
  createdAt: true,
  geometryHash: true,
  verificationTier: true,
  publicationStatus: true,
  publishedAt: true,
  documentJson: true,
  addressBindings: {
    select: {
      id: true,
      countryCode: true,
      addressNormalized: true,
      block: true,
      street: true,
      postalCode: true,
      stack: true,
      floorMin: true,
      floorMax: true,
      transform: true,
    },
  },
  auditEvents: {
    where: {
      eventType: { in: ["revision_published", "revision_retired"] },
    },
    select: { eventType: true, metadataJson: true },
  },
} satisfies Prisma.FloorPlanRevisionSelect;

type RevisionUpdateRecord = Prisma.FloorPlanRevisionGetPayload<{
  select: typeof revisionUpdateSelect;
}>;

function metadataString(value: unknown, key: string) {
  if (!value || typeof value !== "object" || Array.isArray(value)) return null;
  const candidate = (value as Record<string, unknown>)[key];
  return typeof candidate === "string" && candidate.trim() ? candidate.trim() : null;
}

function retirementReplacementId(revision: RevisionUpdateRecord) {
  const retirement = revision.auditEvents.find(
    (event) => event.eventType === "revision_retired"
  );
  return metadataString(retirement?.metadataJson, "replacementRevisionId");
}

function confirmsSupersedeLineage(
  revision: RevisionUpdateRecord,
  supersededRevisionId: string
) {
  return revision.auditEvents.some(
    (event) =>
      event.eventType === "revision_published" &&
      metadataString(event.metadataJson, "supersedesRevisionId") === supersededRevisionId
  );
}

async function loadRevisionForUpdate(id: string) {
  return prisma.floorPlanRevision.findUnique({
    where: { id },
    select: revisionUpdateSelect,
  });
}

/** Follow append-only retirement/publication audit lineage to the live revision. */
async function findPublishedSupersedeDescendant(current: RevisionUpdateRecord) {
  const seen = new Set([current.id]);
  let cursor = current;
  for (let depth = 0; depth < 20; depth += 1) {
    if (cursor.publicationStatus !== "retired") return null;
    const replacementId = retirementReplacementId(cursor);
    if (!replacementId || seen.has(replacementId)) return null;
    const replacement = await loadRevisionForUpdate(replacementId);
    if (!replacement || !confirmsSupersedeLineage(replacement, cursor.id)) return null;
    seen.add(replacement.id);
    if (replacement.publicationStatus === "published") return replacement;
    cursor = replacement;
  }
  return null;
}

function retainSavedUnitContext(
  binding: PersistedFloorPlanAddressBinding,
  source: PersistedFloorPlanAddressBinding
): PersistedFloorPlanAddressBinding {
  return {
    ...binding,
    unitFloor: source.unitFloor ?? null,
    unitStack: source.unitStack ?? source.stack ?? null,
  };
}

async function resolveAvailableUpdate(design: OwnedDesign) {
  const source = readUpdateSource(design.snapshot);
  if (!source) return null;

  const currentRevision = await loadRevisionForUpdate(source.revisionId);
  if (!currentRevision) return null;
  if (
    source.floorPlan.sourceRevisionGeometryHash &&
    source.floorPlan.sourceRevisionGeometryHash !== currentRevision.geometryHash
  ) {
    throw new Error("Saved floor-plan revision metadata failed its integrity check.");
  }

  const supersedeDescendant = await findPublishedSupersedeDescendant(currentRevision);
  const revisions = supersedeDescendant
    ? [supersedeDescendant]
    : currentRevision.publicationStatus === "published" && currentRevision.publishedAt
      ? await prisma.floorPlanRevision.findMany({
          where: {
            publicationStatus: "published",
            id: { not: currentRevision.id },
            publishedAt: { gt: currentRevision.publishedAt },
            addressBindings: {
              some: {
                countryCode: source.binding.countryCode,
                addressNormalized: source.binding.addressNormalized,
                block: source.binding.block,
                street: source.binding.street,
              },
            },
          },
          orderBy: [{ publishedAt: "desc" }, { createdAt: "desc" }],
          take: 20,
          select: revisionUpdateSelect,
        })
      : [];

  const candidates: FloorPlanRevisionUpdateCandidate[] = revisions.flatMap((revision) => {
    if (
      revision.verificationTier !== "source_verified" &&
      revision.verificationTier !== "construction_verified"
    ) {
      return [];
    }
    return [{
      id: revision.id,
      createdAt: revision.createdAt,
      geometryHash: revision.geometryHash,
      verificationTier: revision.verificationTier,
      publishedAt: revision.publishedAt,
      addressBindings: revision.addressBindings.map(mapBinding),
    }];
  });
  const lineageBinding = supersedeDescendant?.addressBindings
    .map(mapBinding)
    .find((binding) =>
      floorPlanBindingCoversSavedUnit(source.binding, binding, {
        allowTransformChange: true,
        allowPostalEvidenceChange: true,
      })
    );
  const fallbackMatch = supersedeDescendant
    ? null
    : findLatestFloorPlanRevisionUpdate({
        currentRevisionId: currentRevision.id,
        currentPublishedAt: currentRevision.publishedAt,
        addressBinding: source.binding,
        candidates,
      });
  const revision = supersedeDescendant ??
    revisions.find((candidate) => candidate.id === fallbackMatch?.revision.id);
  const selectedBinding = lineageBinding ?? fallbackMatch?.addressBinding;
  if (!revision || !selectedBinding) return null;
  const addressBinding = retainSavedUnitContext(selectedBinding, source.binding);
  const currentCompiled = compileCandidateFloorPlanDocumentV2(
    source.floorPlan.canonicalDocument
  );
  const nextCompiled = compileCandidateFloorPlanDocumentV2(revision.documentJson);
  if (
    currentCompiled.document.revisionId !== currentRevision.id ||
    nextCompiled.document.revisionId !== revision.id ||
    nextCompiled.scene.geometryHash !== revision.geometryHash ||
    nextCompiled.document.verification.tier !== revision.verificationTier
  ) {
    throw new Error("The newer floor-plan revision failed its integrity check.");
  }
  const transformedNext = applyFloorPlanAddressTransformV2(
    nextCompiled.document,
    addressBinding.transform
  );
  const diff = compareFloorPlanRevisions(currentCompiled.document, transformedNext);
  const copyPreview = buildUpdatedFloorPlanDesignCopy({
    currentSnapshot: source.snapshot,
    nextDocument: nextCompiled.document,
    nextGeometryHash: revision.geometryHash,
    addressBinding,
    title: `${design.title} (updated floor plan)`,
  });

  return {
    source,
    currentRevision,
    revision,
    nextDocument: nextCompiled.document,
    addressBinding,
    diff,
    preservation: copyPreview.preservation,
  };
}

function publicUpdatePayload(update: NonNullable<Awaited<ReturnType<typeof resolveAvailableUpdate>>>) {
  const { revision, currentRevision, addressBinding, diff, preservation } = update;
  return {
    currentRevisionId: currentRevision.id,
    revisionId: revision.id,
    geometryHash: revision.geometryHash,
    verificationTier: revision.verificationTier,
    publishedAt: revision.publishedAt,
    address: {
      block: addressBinding.block,
      street: addressBinding.street,
      postalCode: addressBinding.postalCode,
      stack: addressBinding.stack,
      floorMin: addressBinding.floorMin,
      floorMax: addressBinding.floorMax,
      transform: addressBinding.transform,
    },
    diff,
    preservation,
  };
}

function updatedCopyTitle(title: string) {
  const trimmed = title.trim() || "Untitled Living Room";
  return trimmed.endsWith("(updated floor plan)")
    ? trimmed
    : `${trimmed} (updated floor plan)`;
}

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const design = await loadOwnedDesign(id, userId);
  if (!design) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const update = await resolveAvailableUpdate(design);
    return NextResponse.json(
      { update: update ? publicUpdatePayload(update) : null },
      { headers: { "Cache-Control": "private, no-store" } }
    );
  } catch (cause) {
    console.error("Floor-plan update check failed", {
      errorType: cause instanceof Error ? cause.name : "unknown",
    });
    return NextResponse.json({ error: "Floor-plan update check failed." }, { status: 500 });
  }
}

export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> }
) {
  const session = await auth();
  const userId = session?.user?.id;
  if (!userId) return NextResponse.json({ error: "Unauthorized" }, { status: 401 });

  const { id } = await params;
  const design = await loadOwnedDesign(id, userId);
  if (!design) return NextResponse.json({ error: "Not found" }, { status: 404 });

  try {
    const rawBody = await readJsonRequest(request, 4 * 1024);
    const body = rawBody && typeof rawBody === "object"
      ? rawBody as { revisionId?: unknown }
      : null;
    const requestedRevisionId =
      typeof body?.revisionId === "string" ? body.revisionId.trim() : "";
    if (!requestedRevisionId || requestedRevisionId.length > 64) {
      return NextResponse.json(
        { error: "Choose the reviewed floor-plan revision before creating a copy." },
        { status: 400 }
      );
    }
    const update = await resolveAvailableUpdate(design);
    if (!update) {
      return NextResponse.json(
        { error: "No newer published floor-plan revision is available." },
        { status: 409 }
      );
    }
    if (update.revision.id !== requestedRevisionId) {
      return NextResponse.json(
        { error: "A different revision is now latest. Review the new comparison first." },
        { status: 409 }
      );
    }

    const user = await prisma.user.findUnique({
      where: { id: userId },
      select: { plan: true },
    });
    if (user?.plan !== "pro") {
      const designCount = await prisma.design.count({ where: { userId } });
      if (designCount >= 20) {
        return NextResponse.json(
          { error: "Free beta limit reached (max 20 designs). Upgrade to create more." },
          { status: 403 }
        );
      }
    }

    const title = updatedCopyTitle(design.title);
    const updated = buildUpdatedFloorPlanDesignCopy({
      currentSnapshot: update.source.snapshot,
      nextDocument: update.nextDocument,
      nextGeometryHash: update.revision.geometryHash,
      addressBinding: update.addressBinding,
      title,
    });
    const storedSnapshot: StoredDesign = snapshotToStored(updated.snapshot);
    const activeRoom =
      storedSnapshot.rooms.find((room) => room.id === storedSnapshot.activeRoomId) ??
      storedSnapshot.rooms[0];
    const sourceSnapshotHash = hashCanonicalJson(design.snapshot);
    const copy = await prisma.$transaction(async (tx) => {
      const sourceReadBack = await tx.design.findFirst({
        where: { id: design.id, userId },
        select: { snapshot: true },
      });
      if (
        !sourceReadBack ||
        hashCanonicalJson(sourceReadBack.snapshot) !== sourceSnapshotHash
      ) {
        throw new Error("SOURCE_DESIGN_CHANGED");
      }
      const liveRevision = await tx.floorPlanRevision.findFirst({
        where: {
          id: update.revision.id,
          publicationStatus: "published",
          geometryHash: update.revision.geometryHash,
          addressBindings: { some: { id: update.addressBinding.bindingId } },
        },
        select: { id: true },
      });
      if (!liveRevision) throw new Error("REVISION_CHANGED");

      const created = await tx.design.create({
        data: {
          user: { connect: { id: userId } },
          title,
          roomWidth: activeRoom.geometry.width,
          roomDepth: activeRoom.geometry.depth,
          items: activeRoom.items as unknown as Prisma.InputJsonValue,
          zones: activeRoom.zones as unknown as Prisma.InputJsonValue,
          savedViews: activeRoom.savedViews as unknown as Prisma.InputJsonValue,
          snapshot: storedSnapshot as unknown as Prisma.InputJsonValue,
          style: design.style,
          budget: design.budget,
          mode: design.mode ?? "homeowner",
          notes: design.notes,
          shareEnabled: false,
          shareToken: null,
        },
        select: { id: true, snapshot: true },
      });
      if (
        !created.snapshot ||
        hashCanonicalJson(created.snapshot) !== hashCanonicalJson(storedSnapshot)
      ) {
        throw new Error("DESIGN_PERSISTENCE_MISMATCH");
      }
      return { id: created.id };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    await recordServerAnalyticsEvent({
      eventType: "design_duplicated",
      userId,
      designId: copy.id,
      meta: {
        source: "floor_plan_revision_update",
        sourceDesignId: design.id,
        fromRevisionId: update.currentRevision.id,
        toRevisionId: update.revision.id,
        ...updated.preservation,
      },
    });

    return NextResponse.json(
      {
        id: copy.id,
        update: publicUpdatePayload(update),
        preservation: updated.preservation,
      },
      { status: 201 }
    );
  } catch (cause) {
    if (cause instanceof Error && cause.message === "SOURCE_DESIGN_CHANGED") {
      return NextResponse.json(
        { error: "The original design changed while the copy was being prepared. Review the update again." },
        { status: 409 }
      );
    }
    if (cause instanceof Error && cause.message === "REVISION_CHANGED") {
      return NextResponse.json(
        { error: "The published floor-plan revision changed. Review the latest comparison first." },
        { status: 409 }
      );
    }
    if (cause instanceof Error && cause.message === "DESIGN_PERSISTENCE_MISMATCH") {
      console.error("Updated floor-plan copy failed its database round-trip integrity check");
      return NextResponse.json(
        { error: "Unable to persist the updated floor-plan copy." },
        { status: 500 }
      );
    }
    console.error("Updated floor-plan copy failed", {
      errorType: cause instanceof Error ? cause.name : "unknown",
    });
    return NextResponse.json({ error: "Updated copy could not be created." }, { status: 500 });
  }
}
