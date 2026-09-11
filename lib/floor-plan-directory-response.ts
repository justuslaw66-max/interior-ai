import { z } from "zod";
import { floorPlanPublicDisplayMetadataSchema } from "@/lib/floor-plan-imports/public-display-metadata";

const identifier = z.string().regex(/^[a-z0-9][a-z0-9:_-]{0,190}$/i);
const text = z.string().min(1).max(500);
const tier = z.enum(["source_verified", "construction_verified"]);
const revisionFields = {
  revisionId: identifier,
  revisionUrl: z.string(),
  geometryHash: z.string().regex(/^[a-f0-9]{64}$/i),
  verificationTier: tier,
};
const hasSafeRevisionRoute = (value: { revisionId: string; revisionUrl: string }) =>
  value.revisionUrl === `/api/floor-plans/revisions/${encodeURIComponent(value.revisionId)}`;
const variantOption = z.object({
  ...revisionFields, optionId: identifier, label: text, defaultSelected: z.boolean(),
  sourcePage: z.number().int().positive().max(10_000).nullable(),
}).strict().refine(hasSafeRevisionRoute);
const variantGroup = z.object({
  groupId: identifier, label: text, defaultOptionId: identifier,
  options: z.array(variantOption).min(2).max(20),
}).strict().refine((group) =>
  new Set(group.options.map((option) => option.optionId)).size === group.options.length &&
  group.options.filter((option) => option.defaultSelected).length === 1 &&
  group.options.some((option) => option.defaultSelected && option.optionId === group.defaultOptionId)
);
const resultSchema = z.object({
  ...revisionFields,
  resultKind: z.literal("canonical_revision"),
  id: text, planId: identifier, layoutId: identifier,
  projectName: text, label: text, flatType: text,
  bedroomCount: z.number().int().min(0).max(100),
  floorAreaSqm: z.number().finite().nullable(),
  roomLabels: z.array(z.object({ id: identifier, name: text, roomType: text }).strict()).max(500),
  previewUrl: z.string().nullable(), sourceUrl: z.string().nullable(),
  sourceTitle: text.nullable(), sourcePage: z.number().int().positive().nullable(),
  publisher: text.nullable(), fidelity: z.literal("canonical_v2"),
  verificationNote: text, accuracyNotice: text,
  matchLevel: z.enum(["layout", "unit"]),
  selectedBindingId: identifier.optional(),
  addressTransform: z.enum([
    "normal", "mirror_x", "mirror_z", "rotate_90", "rotate_180", "rotate_270",
    "mirror_x_rotate_90", "mirror_x_rotate_270",
  ]).optional(),
  authoredConfigurationGroups: z.array(variantGroup).max(20).optional(),
}).strict().refine(hasSafeRevisionRoute).refine((result) =>
  result.id === `revision:${result.revisionId}` && result.planId === result.revisionId &&
  result.layoutId === result.revisionId &&
  (result.matchLevel === "unit"
    ? Boolean(result.selectedBindingId && result.addressTransform)
    : result.selectedBindingId === undefined && result.addressTransform === undefined)
).refine((result) => floorPlanPublicDisplayMetadataSchema.safeParse({
  projectName: result.projectName, label: result.label, flatType: result.flatType,
  floorAreaSqm: result.floorAreaSqm,
  // The public DTO permits absent preview/publisher; validate all supplied metadata.
  previewUrl: result.previewUrl ?? "/", publisher: result.publisher ?? "Published revision",
  sourceUrl: result.sourceUrl, sourceTitle: result.sourceTitle, sourcePage: result.sourcePage,
}).success);
const responseSchema = z.object({
  mode: z.enum(["browse", "search"]), count: z.number().int().min(0).max(50),
  nextCursor: z.string().min(1).max(1_024).nullable().optional(),
  results: z.array(resultSchema).max(50),
}).strict().refine((response) => response.count === response.results.length &&
  new Set(response.results.map((result) => result.id)).size === response.count &&
  response.results.every((result) => result.matchLevel === (response.mode === "search" ? "unit" : "layout"))
);

export function parseFloorPlanDirectoryResponse(value: unknown, expectedMode?: "browse" | "search") {
  const parsed = responseSchema.safeParse(value);
  if (!parsed.success || (expectedMode && parsed.data.mode !== expectedMode)) {
    throw new Error("The floor-plan service returned invalid data. Please try again later.");
  }
  return parsed.data;
}
