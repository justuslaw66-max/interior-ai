import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { join } from "node:path";

import { buildDesignPageViewportRegionAdapter } from "@/lib/design-page-viewport-region-adapter";
import { buildDesignPageViewportWorkspaceRegistration } from "@/lib/design-page-viewport-workspace-registration";
import {
  buildDesignPageViewportWorkspaceReadModel,
  type DesignPageViewportWorkspaceReadModel,
} from "@/lib/design-page-viewport-workspace-read-model";
import type { HousePlanRoom2D } from "@/lib/design-page-house-plan";
import type { BuildDesignPageViewportRegionAdapterInput } from "@/lib/design-page-viewport-region-adapter";
import { createRoom, type DesignItem } from "@/lib/room-types";
import type { DesignPagePresentationWorkspaceRegistration } from "@/lib/useDesignPagePresentationWorkspaceRegistration";

const inertCommand = new Proxy((..._args: unknown[]) => undefined, {
  get: () => inertCommand,
});

const roomA: HousePlanRoom2D = {
  id: "room-a",
  name: "Living room",
  roomType: "living",
  shape: "rectangle",
  x: 0,
  z: 0,
  w: 5,
  d: 4,
  height: 2.7,
};
const roomB: HousePlanRoom2D = {
  id: "room-b",
  name: "Bedroom",
  roomType: "bedroom",
  shape: "rectangle",
  x: 5,
  z: 0,
  w: 4,
  d: 3,
  height: 2.7,
};
const fixtureItem: DesignItem = {
  instanceId: "fixture-1",
  productId: "reference-floor-lamp",
  variantId: "default",
  productSnapshot: {
    schemaVersion: 1,
    productId: "reference-floor-lamp",
    variantId: "default",
    name: "Reference floor lamp",
    category: "floor_lamp",
    dimensionsMm: { w: 400, d: 400, h: 1600 },
    variantLabel: "Default",
    assets: {},
    lighting: {
      emitterType: "spot",
      localOffsetMeters: [0, 1.5, 0],
      direction: [0, -1, 0],
      beamAngleDeg: 35,
      luminousFluxLumens: 800,
      cctKelvin: 2700,
      dimmable: true,
      verification: "estimated",
    },
  },
  position: [0, 0, 0],
  fixtureLight: {
    isOn: true,
    dimmer: 0.5,
    cctKelvin: 3000,
    beamAngleDeg: 42,
  },
};

type FixtureOptions = {
  rooms?: HousePlanRoom2D[];
  activeRoomId?: string;
  viewMode?: "2d" | "3d";
  editorMode?: "design" | "adjust" | "ai" | "buy" | "present";
  isDesigner?: boolean;
  isClientPreview?: boolean;
  selectedItem?: DesignItem | null;
  selectedOpening?: boolean;
  selectedRoomIds?: string[];
  selectedZone?: boolean;
};

function buildPresentationFixture({
  rooms = [roomA],
  activeRoomId = rooms[0]?.id ?? "",
  viewMode = "2d",
  editorMode = "design",
  isDesigner = false,
  isClientPreview = false,
  selectedItem = null,
  selectedOpening = false,
  selectedRoomIds = rooms[0] ? [rooms[0].id] : [],
  selectedZone = false,
}: FixtureOptions = {}): DesignPagePresentationWorkspaceRegistration {
  const snapshotRooms = rooms.map((room) => ({
    ...createRoom(room.id, room.name),
    roomType: room.roomType,
    geometry: { width: room.w, depth: room.d, height: room.height },
    items: selectedItem && room.id === activeRoomId ? [selectedItem] : [],
  }));
  const floorOptions = [{ level: 1, label: "1F", roomCount: rooms.length }];
  const itemCountsByRoomId = Object.fromEntries(
    rooms.map((room) => [room.id, room.id === activeRoomId && selectedItem ? 1 : 0])
  );

  // The same facade fixture drives both pure read-model and orchestration tests.
  // Commands are inert because these characterization cases never invoke them.
  return {
    boundaries: {
      aiWorkspace: {
        boundaries: {
          coreShell: {
            boundaries: {
              base: { state: { editor: { viewMode } } },
              viewportShell: {
                state: {
                  planSelection: {
                    selectedPlanOverlayId: selectedOpening
                      ? "opening-1"
                      : null,
                    selectedPlanRoomIds: selectedRoomIds,
                  },
                  plan: { planMeasurementUnit: "metric" },
                  camera: {
                    cameraView: {
                      pos: [8, 7, 8],
                      target: [2, 0, 2],
                    },
                  },
                  editor: { editorMode },
                },
                actions: inertCommand,
              },
            },
            derived: {
              access: {
                isDesigner,
                isClientPreview,
                showDesignerTheme: isDesigner,
              },
            },
            state: {
              document: {
                designSnapshot: {
                  version: 3,
                  rooms: snapshotRooms,
                  activeRoomId,
                },
              },
              placement: {
                pendingAiLayoutProposal: {
                  items: [{}],
                  itemNames: ["Reference item"],
                },
                crossRoomDragTarget: {
                  kind: "item",
                  valid: true,
                  label: "Target room",
                },
              },
            },
            actions: inertCommand,
          },
          documentSelection: {
            state: { history: { canRedo: true } },
            actions: inertCommand,
            boundaries: {
              documentRoom: {
                derived: {
                  floor: {
                    floorOptions,
                    activeFloorLevel: 1,
                    activeFloorRoomCount: rooms.length,
                  },
                  room: { roomWidth: 5, roomDepth: 4 },
                  plan: { housePlan2D: { rooms } },
                },
                state: {
                  floor: {
                    hiddenFloorLevels: [],
                    stackedFloorView: rooms.length > 1,
                  },
                },
                actions: inertCommand,
              },
              sceneRoomRead: {
                state: { scene: { showSceneLoadingVeil: false } },
                derived: {
                  scene: {
                    selectedPlanRoomContext:
                      rooms.find((room) => room.id === activeRoomId) ?? null,
                    aiLayoutPreviewTone: { text: "Preview" },
                    hasWholeHousePlan: rooms.length > 1,
                  },
                  room: {
                    surfaceInspectorIsWall: false,
                    surfaceInspectorIsCeiling: false,
                    activeRoomHeightMm: 2700,
                    activeRoomWallHeightEvidence: null,
                    canEditActiveRoomWallHeight: true,
                    activeRoomWallThicknessMm: 120,
                    activeRoomSlabThicknessMm: 200,
                    activeRoomSlabThicknessEvidence: null,
                    canEditActiveRoomSlabThickness: true,
                    activeRoomBaseboardDepthMm: 12,
                    activeRoomWallOpacity: 1,
                    activeRoomFloorOpacity: 1,
                    activeRoomCeilingOpacity: 1,
                    activeRoomCeilingVisible: true,
                    activeRoomCeilingColor: "#ffffff",
                    roomItemCountsById: itemCountsByRoomId,
                  },
                },
              },
              itemSelection: {
                state: {
                  selectedItem,
                  selectedIds: new Set(selectedItem ? [selectedItem.instanceId] : []),
                },
              },
              itemDocument: { actions: inertCommand },
            },
          },
          planAuthoring: {
            boundaries: {
              selectionInspection: {
                derived: { selectedProduct: null },
                actions: inertCommand,
              },
              planWorkspace: {
                state: {
                  inspector: {
                    floatingSelectionInspectorVisible: true,
                    selectedObjectInspector: null,
                    visiblePlanOpening: selectedOpening
                      ? { kind: "door", wall: "north", widthMm: 900 }
                      : null,
                    visiblePlanOpeningWallSpanMeters: 4,
                    selectedPlanFixedElement: null,
                    selectedPlanAnnotation: null,
                  },
                  quality: {
                    reviewPanelVisible: false,
                    report: { issues: [] },
                    reviewPanelCollapsed: false,
                    reviewPanelTopPx: 64,
                  },
                },
                derived: {
                  floatingPlanOverlayStackVisible: true,
                  floatingFloorPropertiesPanelVisible: true,
                  planCanvasOverlaysState: {},
                  sceneBackgroundColor: "#f5f5f5",
                  selectionInspectorDockedWithRightRail: true,
                  selectionInspectorRightPx: 16,
                  selectionInspectorTopPx: 64,
                  selectionInspectorWidthPx: 320,
                },
                refs: inertCommand,
                actions: inertCommand,
              },
              importedWallEditing: {
                state: { available: false },
                actions: inertCommand,
              },
              surfaceWorkspace: { actions: inertCommand },
            },
          },
          editorInteraction: {
            boundaries: {
              camera: { actions: inertCommand },
              zone: {
                state: {
                  pendingZoneType: "seating",
                  selectedZone: selectedZone
                    ? { id: "zone-1", type: "seating" }
                    : null,
                },
                actions: inertCommand,
              },
            },
          },
          aiPanel: { actions: inertCommand },
        },
      },
      selection: {
        boundaries: {
          placement: {
            state: { surfaceInspector: null },
            derived: {
              placementTargetRoomId: activeRoomId || null,
              canEditPlanGeometry: !isClientPreview,
            },
            actions: inertCommand,
          },
          selection: { actions: inertCommand },
        },
        derived: { placement: { activeTargetValid: true } },
      },
    },
    actions: { planCanvas: inertCommand },
  } as unknown as DesignPagePresentationWorkspaceRegistration;
}

function buildReadModel(options: FixtureOptions = {}) {
  const presentation = buildPresentationFixture(options);
  const { aiWorkspace, selection } = presentation.boundaries;
  const { coreShell, documentSelection, planAuthoring, editorInteraction } =
    aiWorkspace.boundaries;
  const { base, viewportShell } = coreShell.boundaries;
  const { documentRoom, sceneRoomRead, itemSelection } =
    documentSelection.boundaries;
  const { importedWallEditing, planWorkspace, selectionInspection } =
    planAuthoring.boundaries;
  return buildDesignPageViewportWorkspaceReadModel({
    sources: {
      base,
      coreShell,
      documentRoom,
      documentSelection,
      importedWallEditing,
      itemSelection,
      placement: selection.boundaries.placement,
      planWorkspace,
      sceneRoomRead,
      selection,
      selectionInspection,
      viewportShell,
      zone: editorInteraction.boundaries.zone,
    },
  });
}

function adaptReadModel(readModel: DesignPageViewportWorkspaceReadModel) {
  const inertBoundary = {
    ...readModel,
    references: { planQuality: { setPanel: () => undefined } },
    actions: {
      selectionInspector: {},
      floorProperties: {},
      selectionControls: { selectedZone: {} },
    },
  } as unknown as BuildDesignPageViewportRegionAdapterInput;
  return buildDesignPageViewportRegionAdapter(inertBoundary);
}

const emptyModel = buildReadModel({ rooms: [], activeRoomId: "" });
assert.equal(emptyModel.state.planSummary, null);
assert.equal(emptyModel.state.navigator.enabled, false);
assert.deepEqual(emptyModel.state.navigator.rooms, []);

const consumer2d = buildReadModel({ rooms: [roomA], viewMode: "2d" });
assert.deepEqual(
  consumer2d.state.planSummary?.rooms.map((room) => room.id),
  ["room-a"]
);
assert.equal(
  consumer2d.state.selectionInspector.selectedFixtureLight,
  null,
  "Consumer mode should not expose Pro fixture controls."
);
assert.equal(adaptReadModel(consumer2d).state.navigator, null);

const pro3d = buildReadModel({
  rooms: [roomB, roomA],
  activeRoomId: "room-b",
  viewMode: "3d",
  isDesigner: true,
  selectedItem: fixtureItem,
  selectedZone: true,
});
assert.equal(pro3d.state.planSummary, null);
assert.deepEqual(
  pro3d.state.navigator.rooms.map((room) => room.id),
  ["room-b", "room-a"],
  "Viewport room ordering should preserve the canonical plan-room order."
);
assert.equal(pro3d.state.navigator.activeRoomId, "room-b");
assert.deepEqual(pro3d.state.selectionInspector.selectedFixtureLight, {
  isOn: true,
  dimmer: 0.5,
  cctKelvin: 3000,
  beamAngleDeg: 42,
  beamAdjustable: true,
  luminousFluxLumens: 300,
  dimmable: true,
  verification: "estimated",
});
assert.ok(adaptReadModel(pro3d).state.navigator);

const preview = adaptReadModel(
  buildReadModel({
    rooms: [roomA, roomB],
    viewMode: "3d",
    isClientPreview: true,
    selectedOpening: true,
    selectedZone: true,
  })
);
assert.equal(preview.state.selectedOpening, null);
assert.equal(preview.state.aiLayoutPreview, null);
assert.equal(preview.state.selectionControls.floorStack, null);
assert.equal(preview.state.selectionControls.multiSelection, null);
assert.equal(preview.state.selectionControls.selectedZone, null);

const presentation = adaptReadModel(
  buildReadModel({ rooms: [roomA, roomB], viewMode: "3d", editorMode: "present" })
);
assert.ok(presentation.state.navigator);
assert.equal(presentation.configuration.navigator.disabled, true);

const selectedOpening = adaptReadModel(
  buildReadModel({ selectedOpening: true })
);
assert.equal(selectedOpening.state.selectedOpening?.widthMm, 900);
assert.equal(
  adaptReadModel(buildReadModel({ selectedOpening: false })).state
    .selectedOpening,
  null,
  "Removing the selected region should remove its viewport actions."
);

const roomSwitch = buildReadModel({
  rooms: [roomA, roomB],
  activeRoomId: "room-b",
  viewMode: "3d",
});
assert.equal(roomSwitch.state.navigator.activeRoomId, "room-b");
const projectSwitch = buildReadModel({
  rooms: [{ ...roomA, id: "project-2-room" }],
  activeRoomId: "project-2-room",
  selectedRoomIds: ["project-2-room"],
});
assert.deepEqual(
  projectSwitch.state.planSummary?.rooms.map((room) => room.id),
  ["project-2-room"]
);

const repeatedInput: FixtureOptions = {
  rooms: [roomA, roomB],
  activeRoomId: "room-a",
  viewMode: "3d",
  isDesigner: true,
  selectedItem: fixtureItem,
};
assert.deepEqual(
  buildReadModel(repeatedInput),
  buildReadModel(repeatedInput),
  "Save/reload-equivalent inputs must not retain or change viewport state."
);
const repeatedPresentation = buildPresentationFixture(repeatedInput);
const firstRegistration = buildDesignPageViewportWorkspaceRegistration({
  boundaries: { presentation: repeatedPresentation },
});
const secondRegistration = buildDesignPageViewportWorkspaceRegistration({
  boundaries: { presentation: repeatedPresentation },
});
assert.deepEqual(
  firstRegistration.regions.viewport.state,
  secondRegistration.regions.viewport.state,
  "Repeated registration must not accumulate or duplicate viewport state."
);
assert.deepEqual(Object.keys(firstRegistration.regions), ["viewport"]);
assert.equal(firstRegistration.boundaries.presentation, repeatedPresentation);

const root = process.cwd();
const readModelSource = readFileSync(
  join(root, "lib/design-page-viewport-workspace-read-model.ts"),
  "utf8"
);
assert.doesNotMatch(readModelSource, /from "react"|useEffect|useState|createContext/);
assert.doesNotMatch(
  readModelSource,
  /\.actions\b/,
  "The read-model owner must not perform or conceal viewport side effects."
);

console.log("Design-page viewport workspace read-model checks passed.");
