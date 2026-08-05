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
  (Array.isArray(design.rooms) ? design.rooms : []).forEach((room, index) => {
    const path = `snapshot.rooms[${index}]`;
    const declaredRoom = assertOnlyDeclaredKeys(room, PUBLIC_ROOM_KEYS, path);
    assertRoomCollections(declaredRoom, path);
  });
  if (design.floorPlan !== undefined) {
    assertOnlyDeclaredKeys(design.floorPlan, floorPlanKeys, "snapshot.floorPlan");
  }
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
