import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { RoomSnapshot } from "@/lib/room-types";
import PublicShareLoading from "@/app/share/[shareToken]/loading";
import PublicShareError from "@/app/share/[shareToken]/error";
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

assert.equal(resolvePublicShareLayoutMode(320), "mobile");
assert.equal(resolvePublicShareLayoutMode(767), "mobile");
assert.equal(resolvePublicShareLayoutMode(768), "tablet");
assert.equal(resolvePublicShareLayoutMode(1023), "tablet");
assert.equal(resolvePublicShareLayoutMode(1024), "desktop");
assert.equal(resolvePublicShareSelectedRoomId(rooms, "room-dining"), "room-dining");
assert.equal(resolvePublicShareSelectedRoomId(rooms, "removed-room"), "room-living");
assert.equal(resolvePublicShareSelectedRoomId([], "removed-room"), null);

const baseKey = buildPublicShareLayoutKey("design:projection", "desktop", "room-living");
assert.ok(buildPublicShareLayoutGeneration(baseKey) > 0);
assert.notEqual(
  buildPublicShareLayoutGeneration(baseKey),
  buildPublicShareLayoutGeneration(
    buildPublicShareLayoutKey("design:projection", "mobile", "room-living")
  )
);
assert.notEqual(
  baseKey,
  buildPublicShareLayoutKey("design:projection", "mobile", "room-living")
);
assert.notEqual(
  baseKey,
  buildPublicShareLayoutKey("design:projection", "desktop", "room-dining")
);
assert.notEqual(
  baseKey,
  buildPublicShareLayoutKey("other:projection", "desktop", "room-living")
);
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
  "design:projection",
  "desktop",
  "room-1u9950v189osoy"
);
const collisionRoomB = buildPublicShareLayoutKey(
  "design:projection",
  "desktop",
  "room-1xna2an1tmj65u"
);
assert.equal(
  buildPublicShareLayoutGeneration(collisionRoomA),
  buildPublicShareLayoutGeneration(collisionRoomB)
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
