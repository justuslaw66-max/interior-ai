const PRIVATE_SHARED_SNAPSHOT_KEYS = new Set([
  "addressBinding", "addressTransform", "apiKey", "authorization",
  "autosaveState", "baselineFingerprint", "cookie", "dirtyFingerprint",
  "email", "parentRevisionId", "password", "privateNotes", "reviewerId",
  "sessionToken", "sha256", "shareToken", "sourceAssetSha256", "sourceJobId",
  "sourceRevisionGeometryHash", "surfaceMigrationReviewIssues", "underlay",
  "uri", "userId",
].map((key) => key.toLowerCase().replace(/[^a-z0-9]+/g, "")));

const SENSITIVE_KEY_FRAGMENTS = [
  "admin", "apikey", "auth", "cookie", "credential", "email", "internal",
  "owner", "password", "private", "secret", "session", "token", "userid",
];
const PUBLIC_CABINET_ROLE_VALUES = new Set([
  "client", "designer", "fabricator", "installer", "supplier",
]);
const PUBLIC_BUDGET_VALUES = new Set([
  "budget", "mid", "luxury", "$", "$$", "$$$",
]);

export const SHARED_DESIGN_PRESENTATION_LIMITS = {
  title: 120,
  style: 80,
  notes: 20_000,
} as const;

export type SharedDesignPresentation = {
  title: string;
  style: string | null;
  budget: string | null;
  notes: string | null;
};

const PUBLIC_DESIGN_KEYS = new Set([
  "activeRoomId", "budget", "coordinateSystem", "floorPlan", "lighting",
  "lightingPreset", "notes", "rooms", "schemaRevision", "style", "title",
  "units", "version",
]);
const INPUT_DESIGN_KEYS = new Set([
  ...PUBLIC_DESIGN_KEYS,
  "items", "migrationSourceVersion", "roomBounds", "savedViews", "zones",
]);
const PUBLIC_ROOM_KEYS = new Set([
  "ceilingVisible", "floorElevationMm", "floorLabel", "floorLevel",
  "floorSlabThicknessMm", "floorStoreyHeightMm", "geometry", "id", "items",
  "layoutVersions", "name", "planHoles", "planPolygon", "planPosition",
  "planShape", "roomType", "savedViews", "surfaceFinishes", "surfaceOpacity",
  "surfaces", "zones",
]);
const PUBLIC_ITEM_KEYS = new Set([
  "assemblyType", "assetType", "bomSnapshot", "bundleGroupId", "bundleQuantity",
  "bundleRole", "cabinetDefinition", "cabinetUpdatedAt", "configurationCode",
  "createdAt", "cutListSnapshot", "depth", "dimensionScheduleSnapshot",
  "drawingViewScheduleSnapshot", "edgeBandingScheduleSnapshot",
  "fabricationReleaseReadinessSnapshot", "fixtureLight", "glbAssetUrl",
  "hangingHeightCm", "hardwareScheduleSnapshot", "height", "id",
  "includeInCheckout", "installerNotesSnapshot", "instanceId", "locked",
  "materialOverrides", "materialPreset", "materialScheduleSnapshot",
  "millworkAssetManifest", "millworkDefinition", "millworkDefinitionVersion",
  "millworkHardware", "millworkMaterials", "name", "position", "productId",
  "productSnapshot", "purchaseOptionId", "qty", "quoteSummarySnapshot",
  "releaseChecklistSnapshot", "roomId", "rotation", "rotationY", "scale",
  "supplierReadinessSnapshot", "supplierSkuMappingsSnapshot", "supportInstanceId",
  "transform", "type", "updatedAt", "variantId", "width", "x", "y", "z",
]);
const PUBLIC_ZONE_KEYS = new Set([
  "anchor", "id", "itemIds", "name", "source", "type",
]);
const PUBLIC_SAVED_VIEW_KEYS = new Set([
  "cameraPosition", "cameraTarget", "id", "mode", "name", "timestamp",
]);
const PUBLIC_LAYOUT_VERSION_KEYS = new Set([
  "id", "items", "name", "source", "summary", "timestamp", "zones",
]);
const INPUT_FLOOR_PLAN_KEYS = new Set([
  "addressBinding", "addressTransform", "annotations", "canonicalDocument",
  "canonicalGeometryHash", "fixedElements", "openings", "orientationConfirmed",
  "revisionId", "sourceAssetSha256", "sourceJobId", "sourceRevisionGeometryHash",
  "surfaceMigrationReviewIssues", "underlay", "verificationTier",
]);
const PUBLIC_FLOOR_PLAN_KEYS = new Set([
  "annotations", "canonicalDocument", "canonicalGeometryHash", "fixedElements",
  "openings", "orientationConfirmed", "verificationTier",
]);

function normalizedKey(key: string) {
  return key.toLowerCase().replace(/[^a-z0-9]+/g, "");
}

function isSensitiveKey(key: string, path: string, value: unknown) {
  const normalized = normalizedKey(key);
  const isTypedPublicCabinetRole =
    normalized === "owner" &&
    /\.items\[\d+\](?:\.|$)/.test(path) &&
    typeof value === "string" &&
    PUBLIC_CABINET_ROLE_VALUES.has(value);
  if (isTypedPublicCabinetRole) return false;

  return (
    PRIVATE_SHARED_SNAPSHOT_KEYS.has(normalized) ||
    SENSITIVE_KEY_FRAGMENTS.some((fragment) => normalized.includes(fragment))
  );
}

function requireRecord(value: unknown, path: string): Record<string, unknown> {
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    throw new Error(`Shared design projection requires an object at ${path}`);
  }
  return value as Record<string, unknown>;
}

function assertOnlyDeclaredKeys(
  value: unknown,
  allowed: ReadonlySet<string>,
  path: string
) {
  const record = requireRecord(value, path);
  for (const key of Object.keys(record)) {
    if (!allowed.has(key)) {
      throw new Error(`Shared design projection contains undeclared field ${path}.${key}`);
    }
  }
  return record;
}

function assertBoundedString(
  value: unknown,
  path: string,
  maxLength: number,
  options: { allowEmpty?: boolean } = {}
) {
  if (
    typeof value !== "string" ||
    value.length > maxLength ||
    (!options.allowEmpty && value.trim().length === 0)
  ) {
    throw new Error(
      `Shared design projection requires ${path} to be a string of at most ${maxLength} characters`
    );
  }
}

function assertSharedDesignPresentationFields(
  design: Record<string, unknown>,
  path: string,
  options: { allowNullOptionals?: boolean } = {}
) {
  if (design.title !== undefined) {
    assertBoundedString(
      design.title,
      `${path}.title`,
      SHARED_DESIGN_PRESENTATION_LIMITS.title
    );
  }
  if (
    design.style !== undefined &&
    !(options.allowNullOptionals && design.style === null)
  ) {
    assertBoundedString(
      design.style,
      `${path}.style`,
      SHARED_DESIGN_PRESENTATION_LIMITS.style
    );
  }
  if (
    design.budget !== undefined &&
    !(options.allowNullOptionals && design.budget === null) &&
    (typeof design.budget !== "string" || !PUBLIC_BUDGET_VALUES.has(design.budget))
  ) {
    throw new Error(
      `${path}.budget must be a declared public budget category`
    );
  }
  if (
    design.notes !== undefined &&
    !(options.allowNullOptionals && design.notes === null)
  ) {
    assertBoundedString(
      design.notes,
      `${path}.notes`,
      SHARED_DESIGN_PRESENTATION_LIMITS.notes,
      { allowEmpty: true }
    );
  }
}

function assertRoomCollections(room: Record<string, unknown>, path: string) {
  (Array.isArray(room.items) ? room.items : []).forEach((item, index) =>
    assertOnlyDeclaredKeys(item, PUBLIC_ITEM_KEYS, `${path}.items[${index}]`)
  );
  (Array.isArray(room.zones) ? room.zones : []).forEach((zone, index) =>
    assertOnlyDeclaredKeys(zone, PUBLIC_ZONE_KEYS, `${path}.zones[${index}]`)
  );
  (Array.isArray(room.savedViews) ? room.savedViews : []).forEach((view, index) =>
    assertOnlyDeclaredKeys(view, PUBLIC_SAVED_VIEW_KEYS, `${path}.savedViews[${index}]`)
  );
  (Array.isArray(room.layoutVersions) ? room.layoutVersions : []).forEach(
    (layoutVersion, index) => {
      const layoutPath = `${path}.layoutVersions[${index}]`;
      const layout = assertOnlyDeclaredKeys(
        layoutVersion,
        PUBLIC_LAYOUT_VERSION_KEYS,
        layoutPath
      );
      (Array.isArray(layout.items) ? layout.items : []).forEach((item, itemIndex) =>
        assertOnlyDeclaredKeys(item, PUBLIC_ITEM_KEYS, `${layoutPath}.items[${itemIndex}]`)
      );
      (Array.isArray(layout.zones) ? layout.zones : []).forEach((zone, zoneIndex) =>
        assertOnlyDeclaredKeys(zone, PUBLIC_ZONE_KEYS, `${layoutPath}.zones[${zoneIndex}]`)
      );
    }
  );
}

function assertDeclaredDesignShape(
  value: unknown,
  rootKeys: ReadonlySet<string>,
  floorPlanKeys: ReadonlySet<string>
) {
  const design = assertOnlyDeclaredKeys(value, rootKeys, "snapshot");
  assertSharedDesignPresentationFields(design, "snapshot");
  (Array.isArray(design.rooms) ? design.rooms : []).forEach((room, index) => {
    const path = `snapshot.rooms[${index}]`;
    const declaredRoom = assertOnlyDeclaredKeys(room, PUBLIC_ROOM_KEYS, path);
    assertRoomCollections(declaredRoom, path);
  });
  if (design.floorPlan !== undefined) {
    assertOnlyDeclaredKeys(design.floorPlan, floorPlanKeys, "snapshot.floorPlan");
  }
}

/**
 * Resolves the one shared presentation read model. Snapshot values win; the
 * legacy envelope is consulted only when an older document omitted a field.
 */
export function resolveSharedDesignPresentation(
  snapshot: unknown,
  legacy: {
    title?: unknown;
    style?: unknown;
    budget?: unknown;
    notes?: unknown;
  } = {}
): SharedDesignPresentation {
  const source = requireRecord(snapshot, "snapshot");
  const presentation: Record<string, unknown> = {
    title: source.title !== undefined
      ? source.title
      : legacy.title ?? "Untitled Living Room",
    style: source.style !== undefined ? source.style : legacy.style ?? null,
    budget: source.budget !== undefined ? source.budget : legacy.budget ?? null,
    notes: source.notes !== undefined ? source.notes : legacy.notes ?? null,
  };
  assertSharedDesignPresentationFields(presentation, "snapshot", {
    allowNullOptionals: true,
  });
  return presentation as SharedDesignPresentation;
}

export function assertSharedDesignInput(value: unknown) {
  assertDeclaredDesignShape(value, INPUT_DESIGN_KEYS, INPUT_FLOOR_PLAN_KEYS);
}

export function removeLegacySharedDesignRootFields(value: unknown) {
  const record = requireRecord(value, "snapshot");
  for (const key of [
    "items", "migrationSourceVersion", "roomBounds", "savedViews", "zones",
  ]) {
    delete record[key];
  }
}

export function assertSharedDesignSnapshotPublic(
  value: unknown,
  path = "snapshot"
): void {
  if (path === "snapshot") {
    assertDeclaredDesignShape(value, PUBLIC_DESIGN_KEYS, PUBLIC_FLOOR_PLAN_KEYS);
  }
  if (Array.isArray(value)) {
    value.forEach((entry, index) =>
      assertSharedDesignSnapshotPublic(entry, `${path}[${index}]`)
    );
    return;
  }
  if (!value || typeof value !== "object") return;

  for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
    if (isSensitiveKey(key, path, entry)) {
      throw new Error(`Shared design projection contains sensitive field ${path}.${key}`);
    }
    assertSharedDesignSnapshotPublic(entry, `${path}.${key}`);
  }
}
