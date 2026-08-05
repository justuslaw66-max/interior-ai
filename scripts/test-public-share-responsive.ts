import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RoomSnapshot } from "@/lib/room-types";
import type { DesignSnapshot } from "@/lib/room-types";
import PublicShareLoading from "@/app/share/[shareToken]/loading";
import PublicShareError from "@/app/share/[shareToken]/error";
import {
  buildPublicProjectionContentIdentity,
  PUBLIC_PROJECTION_CONTENT_IDENTITY_VERSION,
} from "@/lib/public-design-projection-identity";
import {
  assertSharedDesignSnapshotPublic,
  projectSharedDesignSnapshot,
} from "@/lib/shared-design-snapshot";
import { fingerprintDesignSnapshot } from "@/lib/snapshot-fingerprint";
import {
  buildPublicShareLayoutKey,
  buildPublicShareLayoutGeneration,
  isPublicShareLayoutReady,
  publicShareRoomActionTestId,
  publicShareSavedViewActionTestId,
  resolvePublicShareLayoutMode,
  resolvePublicShareSelectedRoomId,
} from "@/lib/public-share-layout";

const root = process.cwd();
const read = (relativePath: string) => readFileSync(join(root, relativePath), "utf8");
const rooms = [
  { id: "room-living" },
  { id: "room-dining" },
] as RoomSnapshot[];

type CollisionFixture = {
  schema: string;
  oldFingerprint: string;
  meaningfulDifference: string;
  projectionA: DesignSnapshot;
  projectionB: DesignSnapshot;
};

function reorderObjectProperties(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(reorderObjectProperties);
  if (!value || typeof value !== "object") return value;
  return Object.fromEntries(
    Object.entries(value as Record<string, unknown>)
      .reverse()
      .map(([key, entry]) => [key, reorderObjectProperties(entry)])
  );
}

const collisionFixture = JSON.parse(
  read("scripts/fixtures/public-share-projection-identity-collision.json")
) as CollisionFixture;
assert.equal(collisionFixture.schema, "interior-ai.public-projection-fnv1a-collision.v1");
assert.equal(collisionFixture.meaningfulDifference, "title");
const collisionProjectionA = projectSharedDesignSnapshot(collisionFixture.projectionA);
const collisionProjectionB = projectSharedDesignSnapshot(collisionFixture.projectionB);
assertSharedDesignSnapshotPublic(collisionProjectionA);
assertSharedDesignSnapshotPublic(collisionProjectionB);
assert.notDeepEqual(collisionProjectionA, collisionProjectionB);
assert.notEqual(collisionProjectionA.title, collisionProjectionB.title);
assert.equal(fingerprintDesignSnapshot(collisionProjectionA), collisionFixture.oldFingerprint);
assert.equal(fingerprintDesignSnapshot(collisionProjectionB), collisionFixture.oldFingerprint);
const oldProjectionIdentityA =
  `design-collision:share-token-collision:${fingerprintDesignSnapshot(collisionProjectionA)}`;
const oldProjectionIdentityB =
  `design-collision:share-token-collision:${fingerprintDesignSnapshot(collisionProjectionB)}`;
assert.equal(oldProjectionIdentityA, oldProjectionIdentityB);
assert.equal(
  `${oldProjectionIdentityA}:desktop:room-1`,
  `${oldProjectionIdentityB}:desktop:room-1`
);
const collisionIdentityA = buildPublicProjectionContentIdentity(collisionProjectionA);
const collisionIdentityB = buildPublicProjectionContentIdentity(collisionProjectionB);
assert.match(
  collisionIdentityA,
  new RegExp(`^${PUBLIC_PROJECTION_CONTENT_IDENTITY_VERSION}\\:sha256\\:[a-f0-9]{64}$`)
);
assert.notEqual(collisionIdentityA, collisionIdentityB);
assert.equal(
  buildPublicProjectionContentIdentity(
    reorderObjectProperties(collisionProjectionA) as DesignSnapshot
  ),
  collisionIdentityA
);
const changedPublicProjection = structuredClone(collisionProjectionA);
changedPublicProjection.rooms[0].name = "Client Living Room";
assert.notEqual(
  buildPublicProjectionContentIdentity(changedPublicProjection),
  collisionIdentityA
);
const privateProjectionInputA = structuredClone(collisionFixture.projectionA);
privateProjectionInputA.floorPlan = { sourceJobId: "private-job-a" };
const privateProjectionInputB = structuredClone(collisionFixture.projectionA);
privateProjectionInputB.floorPlan = { sourceJobId: "private-job-b" };
assert.equal(
  buildPublicProjectionContentIdentity(projectSharedDesignSnapshot(privateProjectionInputA)),
  buildPublicProjectionContentIdentity(projectSharedDesignSnapshot(privateProjectionInputB))
);
assert.throws(
  () => buildPublicProjectionContentIdentity({
    ...collisionProjectionA,
    ownerInternalState: "private",
  } as DesignSnapshot),
  /undeclared field|sensitive field/
);

assert.equal(resolvePublicShareLayoutMode(320), "mobile");
assert.equal(resolvePublicShareLayoutMode(767), "mobile");
assert.equal(resolvePublicShareLayoutMode(768), "tablet");
assert.equal(resolvePublicShareLayoutMode(1023), "tablet");
assert.equal(resolvePublicShareLayoutMode(1024), "desktop");
assert.equal(resolvePublicShareSelectedRoomId(rooms, "room-dining"), "room-dining");
assert.equal(resolvePublicShareSelectedRoomId(rooms, "removed-room"), "room-living");
assert.equal(resolvePublicShareSelectedRoomId([], "removed-room"), null);

const baseKey = buildPublicShareLayoutKey(
  "public-projection:sha256:content",
  "desktop",
  "room-living",
  null
);
assert.deepEqual(JSON.parse(baseKey), [
  "public-share-layout",
  1,
  "public-projection:sha256:content",
  "desktop",
  "room-living",
  null,
]);
assert.ok(buildPublicShareLayoutGeneration(baseKey) > 0);
assert.notEqual(
  buildPublicShareLayoutGeneration(baseKey),
  buildPublicShareLayoutGeneration(
    buildPublicShareLayoutKey("public-projection:sha256:content", "mobile", "room-living", null)
  )
);
assert.notEqual(
  baseKey,
  buildPublicShareLayoutKey("public-projection:sha256:content", "mobile", "room-living", null)
);
assert.notEqual(
  baseKey,
  buildPublicShareLayoutKey("public-projection:sha256:content", "desktop", "room-dining", null)
);
assert.notEqual(
  baseKey,
  buildPublicShareLayoutKey("other:projection", "desktop", "room-living", null)
);
assert.notEqual(
  baseKey,
  buildPublicShareLayoutKey(
    "public-projection:sha256:content",
    "desktop",
    "room-living",
    "view-client"
  )
);
assert.equal(
  baseKey,
  buildPublicShareLayoutKey(
    "public-projection:sha256:content",
    "desktop",
    "room-living",
    null
  )
);
const collisionLayoutA = buildPublicShareLayoutKey(
  collisionIdentityA,
  "desktop",
  "room-1",
  null
);
const collisionLayoutB = buildPublicShareLayoutKey(
  collisionIdentityB,
  "desktop",
  "room-1",
  null
);
assert.notEqual(collisionLayoutA, collisionLayoutB);
assert.equal(publicShareRoomActionTestId("room-dining"), "share-room-action-room-dining");
assert.equal(
  publicShareSavedViewActionTestId("view-client"),
  "share-saved-view-action-view-client"
);

const currentGeneration = buildPublicShareLayoutGeneration(baseKey);
const readyInput = {
  hasSelectedRoom: true,
  layoutMode: "desktop" as const,
  layoutGeneration: currentGeneration,
  layoutKey: baseKey,
  canvasLayoutKey: baseKey,
  surface: { layoutKey: baseKey, generation: currentGeneration, width: 1024, height: 640 },
};
assert.equal(isPublicShareLayoutReady(readyInput), true);
assert.equal(
  isPublicShareLayoutReady({ ...readyInput, canvasLayoutKey: `${baseKey}:stale` }),
  false
);
assert.equal(
  isPublicShareLayoutReady({
    ...readyInput,
    surface: { ...readyInput.surface, layoutKey: `${baseKey}:stale` },
  }),
  false
);
assert.equal(
  isPublicShareLayoutReady({ ...readyInput, surface: { ...readyInput.surface, width: 0 } }),
  false
);
assert.equal(isPublicShareLayoutReady({ ...readyInput, layoutMode: null }), false);
assert.equal(isPublicShareLayoutReady({ ...readyInput, hasSelectedRoom: false }), false);
const collisionRoomA = buildPublicShareLayoutKey(
  "public-projection:sha256:content",
  "desktop",
  "room-wz4078-1mdk0jc",
  null
);
const collisionRoomB = buildPublicShareLayoutKey(
  "public-projection:sha256:content",
  "desktop",
  "room-fa9ou2-9sz572",
  null
);
assert.equal(
  buildPublicShareLayoutGeneration(collisionRoomA),
  buildPublicShareLayoutGeneration(collisionRoomB)
);
const collisionReadyInput = {
  ...readyInput,
  layoutKey: collisionLayoutA,
  layoutGeneration: buildPublicShareLayoutGeneration(collisionLayoutA),
  canvasLayoutKey: collisionLayoutA,
  surface: {
    layoutKey: collisionLayoutA,
    generation: buildPublicShareLayoutGeneration(collisionLayoutA),
    width: 1024,
    height: 640,
  },
};
assert.equal(isPublicShareLayoutReady(collisionReadyInput), true);
assert.equal(
  isPublicShareLayoutReady({
    ...collisionReadyInput,
    layoutKey: collisionLayoutB,
    layoutGeneration: buildPublicShareLayoutGeneration(collisionLayoutB),
  }),
  false,
  "Evidence from the old colliding projection must not ready the current projection"
);
assert.equal(
  isPublicShareLayoutReady({
    ...readyInput,
    layoutKey: collisionRoomB,
    layoutGeneration: buildPublicShareLayoutGeneration(collisionRoomB),
    canvasLayoutKey: collisionRoomA,
    surface: {
      layoutKey: collisionRoomA,
      generation: buildPublicShareLayoutGeneration(collisionRoomA),
      width: 1024,
      height: 640,
    },
  }),
  false
);

const shellSource = read("components/public-share/PublicShareShell.tsx");
assert.match(shellSource, /resolvePublicShareSelectedRoomId/);
assert.match(shellSource, /measurement\.generation !== layoutGeneration/);
assert.match(shellSource, /isPublicShareLayoutReady/);
assert.match(shellSource, /selectedSavedViewId/);
assert.match(shellSource, /projectionContentIdentity/);
assert.doesNotMatch(shellSource, /projectionIdentity/);
assert.match(shellSource, /window\.matchMedia/);
assert.doesNotMatch(shellSource, /userAgent|setTimeout|setInterval/);

const viewerSource = read("components/ShareViewer.tsx");
assert.match(viewerSource, /new ResizeObserver/);
assert.match(viewerSource, /getBoundingClientRect/);
assert.match(viewerSource, /data-testid="share-preview-surface"/);
assert.doesNotMatch(viewerSource, /saved-view-\$\{index\}|initialSnapshot/);

const loadingSource = read("app/share/[shareToken]/loading.tsx");
const errorSource = read("app/share/[shareToken]/error.tsx");
const pageSource = read("app/share/[shareToken]/page.tsx");
assert.match(loadingSource, /data-layout-status="loading"/);
assert.match(errorSource, /data-layout-status="error"/);
assert.match(pageSource, /data-layout-status="invalid"/);
assert.match(pageSource, /buildPublicProjectionContentIdentity\(designSnapshot\)/);
assert.doesNotMatch(pageSource, /projectionIdentity=/);
assert.doesNotMatch(loadingSource + errorSource, /data-layout-status="ready"/);
const loadingMarkup = renderToStaticMarkup(createElement(PublicShareLoading));
const errorMarkup = renderToStaticMarkup(
  createElement(PublicShareError, { reset: () => undefined })
);
assert.match(loadingMarkup, /data-testid="public-share-loading"/);
assert.match(loadingMarkup, /aria-busy="true"/);
assert.match(errorMarkup, /data-testid="public-share-error"/);
assert.match(errorMarkup, /data-testid="public-share-error-retry"/);

console.log("Public share responsive layout tests passed.");
