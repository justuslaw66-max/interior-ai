import type { FloorPlanImportJobStatus, ImportJobStatus } from "@prisma/client";
import { prisma } from "@/lib/prisma";
import { bytesToMiB, resolveImportQaLimits } from "@/lib/importQaPolicy";
import { getRejectedLiveGateAssets, type LiveGateEvaluation } from "@/lib/live-catalog";

export type StatusTone = "neutral" | "info" | "success" | "warning" | "critical";

export type AttentionItemData = {
  id: string;
  title: string;
  description: string;
  count: number | null;
  severity: "warning" | "critical" | "unavailable";
  href: string;
  actionLabel: string;
};

export type HealthServiceData = {
  name: string;
  detail: string;
  state: "operational" | "degraded" | "unavailable";
};

export type ToolContextData = {
  value: number | null;
  label: string;
  tone: StatusTone;
};

export type ActivityMetricData = {
  label: string;
  value: number | null;
  detail: string;
};

export type RecentOperationData = {
  id: string;
  label: string;
  workflow: "Asset import" | "Floor plan";
  status: string;
  statusTone: StatusTone;
  owner: string;
  updatedAt: Date;
  issue: string | null;
  href: string;
};

export type QaPolicyData = {
  label: string;
  value: string;
  environmentName: string;
};

export type OperationsDashboardData = {
  attentionItems: AttentionItemData[];
  health: {
    overall: "healthy" | "attention" | "partial";
    services: HealthServiceData[];
    lastUpdated: Date;
    sentryUrl: string | null;
  };
  toolContext: Record<string, ToolContextData>;
  activity: ActivityMetricData[];
  activityAvailable: boolean;
  recentOperations: RecentOperationData[];
  recentOperationsAvailable: boolean;
  qaPolicy: QaPolicyData[];
  qaReportDirectory: string;
  finishGateEnabled: boolean;
};

type QueryResult<T> = {
  value: T;
  available: boolean;
};

type WebhookFailureEvent = {
  id: string;
  eventType: string;
  meta: unknown;
  createdAt: Date;
};

type AssetImportRow = {
  id: string;
  status: ImportJobStatus;
  sourceBrand: string | null;
  sourceFileName: string;
  errorMessage: string | null;
  updatedAt: Date;
  uploadedBy: { email: string | null } | null;
};

type FloorPlanImportRow = {
  id: string;
  status: FloorPlanImportJobStatus;
  errorMessage: string | null;
  updatedAt: Date;
  user: { email: string | null };
  sourceAsset: { fileName: string };
};

type ActivityData = {
  designs24h: number;
  designs7d: number;
  shareCreated24h: number;
  shareOpened24h: number;
  exportOpened24h: number;
  exportPrinted24h: number;
  checkoutStarted24h: number;
  affiliateClicks24h: number;
  webhookFailed24h: number;
  recentWebhookFailures: WebhookFailureEvent[];
};

function daysAgo(days: number) {
  return new Date(Date.now() - days * 24 * 60 * 60 * 1_000);
}

async function safeQuery<T>(load: () => Promise<T>, fallback: T): Promise<QueryResult<T>> {
  try {
    return { value: await load(), available: true };
  } catch {
    return { value: fallback, available: false };
  }
}

function statusTone(status: string): StatusTone {
  if (status === "failed") return "critical";
  if (status === "needs_review" || status === "needs_mapping") return "warning";
  if (status === "approved" || status === "published" || status === "ready") return "success";
  if (status === "received" || status === "normalizing" || status === "validating") return "info";
  return "neutral";
}

function unavailableToolContext(label: string): ToolContextData {
  return { value: null, label, tone: "neutral" };
}

export async function loadOperationsDashboardData(): Promise<OperationsDashboardData> {
  const since24h = daysAgo(1);
  const since7d = daysAgo(7);
  const appEventClient = (prisma as unknown as {
    appEvent: {
      count: (args: { where: { eventType: string; createdAt: { gte: Date } } }) => Promise<number>;
      findMany: (args: {
        where: { eventType: string; createdAt: { gte: Date } };
        orderBy: { createdAt: "desc" };
        take: number;
      }) => Promise<WebhookFailureEvent[]>;
    };
  }).appEvent;

  const [activityResult, assetImportResult, floorPlanResult, liveGateResult] = await Promise.all([
    safeQuery<ActivityData>(
      async () => {
        const [
          designs24h,
          designs7d,
          shareCreated24h,
          shareOpened24h,
          exportOpened24h,
          exportPrinted24h,
          checkoutStarted24h,
          affiliateClicks24h,
          webhookFailed24h,
          recentWebhookFailures,
        ] = await Promise.all([
          prisma.design.count({ where: { createdAt: { gte: since24h } } }),
          prisma.design.count({ where: { createdAt: { gte: since7d } } }),
          appEventClient.count({ where: { eventType: "share_link_created", createdAt: { gte: since24h } } }),
          appEventClient.count({ where: { eventType: "share_link_opened", createdAt: { gte: since24h } } }),
          appEventClient.count({ where: { eventType: "export_opened", createdAt: { gte: since24h } } }),
          appEventClient.count({ where: { eventType: "export_printed", createdAt: { gte: since24h } } }),
          appEventClient.count({ where: { eventType: "checkout_started", createdAt: { gte: since24h } } }),
          prisma.productClick.count({ where: { createdAt: { gte: since24h } } }),
          appEventClient.count({ where: { eventType: "webhook_failed", createdAt: { gte: since24h } } }),
          appEventClient.findMany({
            where: { eventType: "webhook_failed", createdAt: { gte: since24h } },
            orderBy: { createdAt: "desc" },
            take: 5,
          }),
        ]);

        return {
          designs24h,
          designs7d,
          shareCreated24h,
          shareOpened24h,
          exportOpened24h,
          exportPrinted24h,
          checkoutStarted24h,
          affiliateClicks24h,
          webhookFailed24h,
          recentWebhookFailures,
        };
      },
      {
        designs24h: 0,
        designs7d: 0,
        shareCreated24h: 0,
        shareOpened24h: 0,
        exportOpened24h: 0,
        exportPrinted24h: 0,
        checkoutStarted24h: 0,
        affiliateClicks24h: 0,
        webhookFailed24h: 0,
        recentWebhookFailures: [],
      }
    ),
    safeQuery<AssetImportRow[]>(
      () =>
        prisma.importJob.findMany({
          orderBy: { updatedAt: "desc" },
          take: 300,
          select: {
            id: true,
            status: true,
            sourceBrand: true,
            sourceFileName: true,
            errorMessage: true,
            updatedAt: true,
            uploadedBy: { select: { email: true } },
          },
        }),
      []
    ),
    safeQuery<FloorPlanImportRow[]>(
      () =>
        prisma.floorPlanImportJob.findMany({
          orderBy: { updatedAt: "desc" },
          take: 300,
          select: {
            id: true,
            status: true,
            errorMessage: true,
            updatedAt: true,
            user: { select: { email: true } },
            sourceAsset: { select: { fileName: true } },
          },
        }),
      []
    ),
    safeQuery<LiveGateEvaluation[]>(() => getRejectedLiveGateAssets(), []),
  ]);

  const assetJobs = assetImportResult.value;
  const floorPlanJobs = floorPlanResult.value;
  const activity = activityResult.value;
  const failedAssetImports = assetJobs.filter((job) => job.status === "failed").length;
  const assetReviewQueue = assetJobs.filter(
    (job) => job.status === "needs_review" || job.status === "needs_mapping"
  ).length;
  const floorPlanReviewQueue = floorPlanJobs.filter((job) => job.status === "needs_review").length;
  const failedFloorPlans = floorPlanJobs.filter((job) => job.status === "failed").length;
  const floorPlanAttention = floorPlanReviewQueue + failedFloorPlans;
  const liveGateBlocked = liveGateResult.value.length;

  const attentionItems: AttentionItemData[] = [];
  if (!assetImportResult.available) {
    attentionItems.push({
      id: "asset-import-unavailable",
      title: "Asset pipeline data unavailable",
      description: "The import queue could not be loaded. Check the database connection before triage.",
      count: null,
      severity: "unavailable",
      href: "/admin/imports",
      actionLabel: "Open imports",
    });
  } else {
    if (failedAssetImports > 0) {
      attentionItems.push({
        id: "failed-asset-imports",
        title: "Failed asset imports",
        description: "Jobs stopped before catalog handoff and require diagnosis.",
        count: failedAssetImports,
        severity: "critical",
        href: "/admin/imports",
        actionLabel: "Review failures",
      });
    }
    if (assetReviewQueue > 0) {
      attentionItems.push({
        id: "asset-review-queue",
        title: "Catalog decisions pending",
        description: "Imports are waiting for mapping or human review.",
        count: assetReviewQueue,
        severity: "warning",
        href: "/admin/catalog/review",
        actionLabel: "Open review queue",
      });
    }
  }

  if (!floorPlanResult.available) {
    attentionItems.push({
      id: "floor-plan-unavailable",
      title: "Floor-plan queue unavailable",
      description: "Review status could not be loaded from the floor-plan platform.",
      count: null,
      severity: "unavailable",
      href: "/admin/floor-plans",
      actionLabel: "Open floor plans",
    });
  } else if (floorPlanAttention > 0) {
    attentionItems.push({
      id: "floor-plan-attention",
      title: "Floor plans need intervention",
      description: `${floorPlanReviewQueue} awaiting review · ${failedFloorPlans} failed`,
      count: floorPlanAttention,
      severity: failedFloorPlans > 0 ? "critical" : "warning",
      href: "/admin/floor-plans",
      actionLabel: "Review floor plans",
    });
  }

  if (!liveGateResult.available) {
    attentionItems.push({
      id: "live-gate-unavailable",
      title: "Publication health unavailable",
      description: "Catalog eligibility could not be evaluated with the current model data.",
      count: null,
      severity: "unavailable",
      href: "/admin/audit",
      actionLabel: "Open quality audit",
    });
  } else if (liveGateBlocked > 0) {
    attentionItems.push({
      id: "live-gate-blocked",
      title: "Assets blocked from publication",
      description: "Catalog items are failing one or more live eligibility rules.",
      count: liveGateBlocked,
      severity: "critical",
      href: "/admin/audit",
      actionLabel: "Inspect blockers",
    });
  }

  const services: HealthServiceData[] = [
    {
      name: "Catalog eligibility",
      detail: !liveGateResult.available
        ? "Query unavailable"
        : liveGateBlocked > 0
          ? `${liveGateBlocked} blocked`
          : "No publication blocks",
      state: !liveGateResult.available ? "unavailable" : liveGateBlocked > 0 ? "degraded" : "operational",
    },
    {
      name: "Asset processing",
      detail: !assetImportResult.available
        ? "Queue unavailable"
        : failedAssetImports > 0
          ? `${failedAssetImports} failed`
          : "No failed imports",
      state: !assetImportResult.available ? "unavailable" : failedAssetImports > 0 ? "degraded" : "operational",
    },
    {
      name: "Floor-plan processing",
      detail: !floorPlanResult.available
        ? "Queue unavailable"
        : failedFloorPlans > 0
          ? `${failedFloorPlans} failed`
          : "No failed jobs",
      state: !floorPlanResult.available ? "unavailable" : failedFloorPlans > 0 ? "degraded" : "operational",
    },
    {
      name: "Webhook delivery",
      detail: !activityResult.available
        ? "Events unavailable"
        : activity.webhookFailed24h > 0
          ? `${activity.webhookFailed24h} failed in 24h`
          : "No failures in 24h",
      state: !activityResult.available
        ? "unavailable"
        : activity.webhookFailed24h > 0
          ? "degraded"
          : "operational",
    },
  ];
  const healthOverall = services.some((service) => service.state === "unavailable")
    ? "partial"
    : services.some((service) => service.state === "degraded")
      ? "attention"
      : "healthy";

  const recentOperations = [
    ...assetJobs.slice(0, 8).map<RecentOperationData>((job) => ({
      id: `asset-${job.id}`,
      label: job.sourceFileName,
      workflow: "Asset import",
      status: job.status,
      statusTone: statusTone(job.status),
      owner: job.uploadedBy?.email ?? job.sourceBrand ?? "Unassigned",
      updatedAt: job.updatedAt,
      issue: job.errorMessage,
      href: `/admin/imports/${job.id}`,
    })),
    ...floorPlanJobs.slice(0, 8).map<RecentOperationData>((job) => ({
      id: `floor-plan-${job.id}`,
      label: job.sourceAsset.fileName,
      workflow: "Floor plan",
      status: job.status,
      statusTone: statusTone(job.status),
      owner: job.user.email ?? "Unassigned",
      updatedAt: job.updatedAt,
      issue: job.errorMessage,
      href: `/admin/floor-plans/${job.id}`,
    })),
  ]
    .sort((left, right) => right.updatedAt.getTime() - left.updatedAt.getTime())
    .slice(0, 10);

  const qaLimits = resolveImportQaLimits();

  return {
    attentionItems,
    health: {
      overall: healthOverall,
      services,
      lastUpdated: new Date(),
      sentryUrl: process.env.SENTRY_ISSUES_URL || process.env.SENTRY_PROJECT_URL || null,
    },
    toolContext: {
      "/admin/catalog/inbox": assetImportResult.available
        ? { value: assetReviewQueue, label: "need routing", tone: assetReviewQueue > 0 ? "warning" : "success" }
        : unavailableToolContext("queue unavailable"),
      "/admin/catalog/review": assetImportResult.available
        ? { value: assetReviewQueue, label: "awaiting decision", tone: assetReviewQueue > 0 ? "warning" : "success" }
        : unavailableToolContext("queue unavailable"),
      "/admin/models": liveGateResult.available
        ? { value: liveGateBlocked, label: "publication blocks", tone: liveGateBlocked > 0 ? "critical" : "success" }
        : unavailableToolContext("health unavailable"),
      "/admin/imports": assetImportResult.available
        ? { value: failedAssetImports, label: "failed jobs", tone: failedAssetImports > 0 ? "critical" : "success" }
        : unavailableToolContext("queue unavailable"),
      "/tools/glb-optimizer": { value: null, label: "asset utility", tone: "neutral" },
      "/admin/floor-plans": floorPlanResult.available
        ? { value: floorPlanAttention, label: "need attention", tone: floorPlanAttention > 0 ? "warning" : "success" }
        : unavailableToolContext("queue unavailable"),
      "/admin/audit": liveGateResult.available
        ? { value: liveGateBlocked, label: "issues flagged", tone: liveGateBlocked > 0 ? "critical" : "success" }
        : unavailableToolContext("audit unavailable"),
      "/admin/clicks": activityResult.available
        ? { value: activity.affiliateClicks24h, label: "clicks in 24h", tone: "info" }
        : unavailableToolContext("activity unavailable"),
    },
    activity: [
      {
        label: "Designs created",
        value: activityResult.available ? activity.designs24h : null,
        detail: activityResult.available ? `${activity.designs7d.toLocaleString()} in 7 days` : "Unavailable",
      },
      {
        label: "Shares opened",
        value: activityResult.available ? activity.shareOpened24h : null,
        detail: activityResult.available ? `${activity.shareCreated24h.toLocaleString()} links created` : "Unavailable",
      },
      {
        label: "Exports printed",
        value: activityResult.available ? activity.exportPrinted24h : null,
        detail: activityResult.available ? `${activity.exportOpened24h.toLocaleString()} export sessions` : "Unavailable",
      },
      {
        label: "Checkout starts",
        value: activityResult.available ? activity.checkoutStarted24h : null,
        detail: "Customer intent",
      },
      {
        label: "Affiliate clicks",
        value: activityResult.available ? activity.affiliateClicks24h : null,
        detail: "Outbound traffic",
      },
    ],
    activityAvailable: activityResult.available,
    recentOperations,
    recentOperationsAvailable: assetImportResult.available || floorPlanResult.available,
    qaPolicy: [
      {
        label: "Maximum file size",
        value: `${bytesToMiB(qaLimits.maxFileSizeBytes).toFixed(2)} MB`,
        environmentName: "IMPORT_QA_MAX_FILE_SIZE_MB",
      },
      {
        label: "Maximum triangles",
        value: qaLimits.maxTriangles.toLocaleString(),
        environmentName: "IMPORT_QA_MAX_TRIANGLES",
      },
      {
        label: "Maximum textures",
        value: qaLimits.maxTextureCount.toLocaleString(),
        environmentName: "IMPORT_QA_MAX_TEXTURE_COUNT",
      },
      {
        label: "Texture resolution",
        value: `${qaLimits.maxTextureResolution}px`,
        environmentName: "IMPORT_QA_MAX_TEXTURE_RESOLUTION",
      },
      {
        label: "Minimum AABB axis",
        value: `${qaLimits.minAabbAxisMeters}m`,
        environmentName: "IMPORT_QA_MIN_AABB_AXIS_M",
      },
      {
        label: "Maximum AABB axis",
        value: `${qaLimits.maxAabbAxisMeters}m`,
        environmentName: "IMPORT_QA_MAX_AABB_AXIS_M",
      },
    ],
    qaReportDirectory: process.env.IMPORT_QA_REPORT_DIR || "reports/import-qa",
    finishGateEnabled: process.env.LIVE_GATE_REQUIRE_FINISH_MAPPING === "true",
  };
}
