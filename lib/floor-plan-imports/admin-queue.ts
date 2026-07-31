import { FloorPlanImportJobStatus, Prisma } from "@prisma/client";

export const ADMIN_FLOOR_PLAN_QUEUE_FILTERS = [
  "all",
  "processing",
  "review",
  "ready",
  "approved",
  "published",
  "failed",
] as const;

export type AdminFloorPlanQueueFilter =
  (typeof ADMIN_FLOOR_PLAN_QUEUE_FILTERS)[number];

export const ADMIN_FLOOR_PLAN_QUEUE_PAGE_SIZE = 50;
export const ADMIN_FLOOR_PLAN_QUEUE_MAX_PAGE_SIZE = 100;

export const ADMIN_FLOOR_PLAN_QUEUE_JOB_SELECT = {
  id: true,
  status: true,
  progress: true,
  candidateVersion: true,
  adapterId: true,
  extractionVersion: true,
  errorMessage: true,
  createdAt: true,
  updatedAt: true,
  user: { select: { id: true, email: true } },
  sourceAsset: {
    select: { fileName: true, mimeType: true, byteLength: true, sha256: true },
  },
  revision: {
    select: {
      id: true,
      geometryHash: true,
      verificationTier: true,
      publicationStatus: true,
    },
  },
} satisfies Prisma.FloorPlanImportJobSelect;

export type AdminFloorPlanQueueJob = Prisma.FloorPlanImportJobGetPayload<{
  select: typeof ADMIN_FLOOR_PLAN_QUEUE_JOB_SELECT;
}> & {
  attention: ReturnType<typeof floorPlanQueueAttention>;
};

const PROCESSING_STATUSES: FloorPlanImportJobStatus[] = [
  FloorPlanImportJobStatus.received,
  FloorPlanImportJobStatus.rendered,
  FloorPlanImportJobStatus.extracted,
  FloorPlanImportJobStatus.selecting_page,
  FloorPlanImportJobStatus.scale_solved,
  FloorPlanImportJobStatus.topology_built,
  FloorPlanImportJobStatus.validating,
];

function boundedHours(value: string | undefined, fallback: number) {
  if (!value?.trim()) return fallback;
  const hours = Number(value);
  if (!Number.isFinite(hours) || hours < 1 || hours > 720) return fallback;
  return hours;
}

export function adminFloorPlanQueueThresholds(
  now = new Date(),
  environment: Readonly<Record<string, string | undefined>> = process.env
) {
  const processingHours = boundedHours(
    environment.FLOOR_PLAN_ADMIN_PROCESSING_SLA_HOURS,
    1
  );
  const reviewHours = boundedHours(
    environment.FLOOR_PLAN_ADMIN_REVIEW_SLA_HOURS,
    24
  );
  return {
    processingHours,
    reviewHours,
    processingCutoff: new Date(now.getTime() - processingHours * 60 * 60 * 1_000),
    reviewCutoff: new Date(now.getTime() - reviewHours * 60 * 60 * 1_000),
  };
}

export function parseAdminFloorPlanQueueFilter(
  value: string | null | undefined
): AdminFloorPlanQueueFilter {
  return ADMIN_FLOOR_PLAN_QUEUE_FILTERS.includes(
    value as AdminFloorPlanQueueFilter
  )
    ? (value as AdminFloorPlanQueueFilter)
    : "all";
}

function statusWhere(
  filter: AdminFloorPlanQueueFilter
): Prisma.FloorPlanImportJobWhereInput | null {
  switch (filter) {
    case "processing":
      return { status: { in: PROCESSING_STATUSES } };
    case "review":
      return { status: FloorPlanImportJobStatus.needs_review };
    case "ready":
      return { status: FloorPlanImportJobStatus.ready };
    case "approved":
      return { revision: { is: { publicationStatus: "approved" } } };
    case "published":
      return { revision: { is: { publicationStatus: "published" } } };
    case "failed":
      return { status: FloorPlanImportJobStatus.failed };
    default:
      return null;
  }
}

export function buildAdminFloorPlanQueueWhere(input: {
  filter: AdminFloorPlanQueueFilter;
  query?: string;
  overdue?: boolean;
  now?: Date;
  environment?: Readonly<Record<string, string | undefined>>;
}): Prisma.FloorPlanImportJobWhereInput {
  const clauses: Prisma.FloorPlanImportJobWhereInput[] = [];
  const filtered = statusWhere(input.filter);
  if (filtered) clauses.push(filtered);

  const query = input.query?.trim().slice(0, 120);
  if (query) {
    clauses.push({
      OR: [
        { id: { contains: query, mode: "insensitive" } },
        { user: { is: { email: { contains: query, mode: "insensitive" } } } },
        {
          sourceAsset: {
            is: {
              OR: [
                { fileName: { contains: query, mode: "insensitive" } },
                { sha256: { startsWith: query.toLowerCase() } },
              ],
            },
          },
        },
      ],
    });
  }

  if (input.overdue) {
    const thresholds = adminFloorPlanQueueThresholds(
      input.now,
      input.environment
    );
    clauses.push({
      OR: [
        {
          status: { in: PROCESSING_STATUSES },
          updatedAt: { lt: thresholds.processingCutoff },
        },
        {
          status: FloorPlanImportJobStatus.needs_review,
          updatedAt: { lt: thresholds.reviewCutoff },
        },
        { status: FloorPlanImportJobStatus.failed },
      ],
    });
  }

  return clauses.length === 0 ? {} : clauses.length === 1 ? clauses[0]! : { AND: clauses };
}

export function floorPlanQueueAttention(input: {
  status: string;
  updatedAt: Date;
  now?: Date;
  environment?: Readonly<Record<string, string | undefined>>;
}) {
  const thresholds = adminFloorPlanQueueThresholds(input.now, input.environment);
  if (input.status === FloorPlanImportJobStatus.failed) return "failed" as const;
  if (
    PROCESSING_STATUSES.includes(input.status as FloorPlanImportJobStatus) &&
    input.updatedAt < thresholds.processingCutoff
  ) {
    return "processing_overdue" as const;
  }
  if (
    input.status === FloorPlanImportJobStatus.needs_review &&
    input.updatedAt < thresholds.reviewCutoff
  ) {
    return "review_overdue" as const;
  }
  return null;
}
