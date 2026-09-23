"use client";

import {
  useCallback,
  useEffect,
  useRef,
  type MutableRefObject,
} from "react";

import { track } from "@/lib/analytics";
import { CATALOG_ITEMS, CATALOG_ITEMS_MAP } from "@/lib/catalog";
import { resolveCatalogVariant } from "@/lib/catalog/variant-resolver";
import { resolveDesignItemVisualProduct } from "@/lib/design-item-product-snapshot";
import {
  canAddToCart,
  getNonBuyableReason,
  reconcileCart,
} from "@/lib/commerce-helpers";
import { applyReplaceRoomItemsCommand } from "@/lib/design-page-item-commands";
import type { HistoryCommand } from "@/lib/historyManager";
import {
  getActiveRoom,
  switchRoom,
  type DesignItem,
  type DesignSnapshot,
  type LayoutVersion,
  type RoomSnapshot,
} from "@/lib/room-types";
import {
  isParametricCabinetItem,
  normalizeCabinetDesignItem,
} from "@/features/cabinetry/designItemAdapters";

export type DesignPageItemUpdater =
  | DesignItem[]
  | ((previous: DesignItem[]) => DesignItem[]);

export type CommitDesignPageItemsToRoomOptions = {
  activateRoom?: boolean;
  beforeLayoutVersion?: LayoutVersion;
};

type DesignPageItemDocumentHistory = {
  executeCommand: <TInput, TResult>(
    command: HistoryCommand<TInput, TResult>
  ) => TResult;
};

type DesignSnapshotSetter = (
  next: DesignSnapshot | ((previous: DesignSnapshot) => DesignSnapshot)
) => void;

type ClampToActiveRoom = (
  x: number,
  z: number,
  itemWidth: number,
  itemDepth: number,
  targetRoomWidth: number,
  targetRoomDepth: number,
  targetWallThickness: number,
  rotationY?: number
) => [number, number];

type AddDesignPageItemOverrides = Partial<
  Pick<
    DesignItem,
    | "qty"
    | "includeInCheckout"
    | "purchaseOptionId"
    | "bundleGroupId"
    | "bundleRole"
    | "bundleQuantity"
  >
>;

type SelectDesignPageItemsInRoomInput = {
  roomId: string;
  instanceIds: string[];
  primaryInstanceId: string;
};

export type DesignPageItemDocumentControllerState = {
  activeItems: DesignItem[];
};

export type DesignPageItemDocumentControllerConfiguration = {
  roomWidth: number;
  roomDepth: number;
  wallThickness: number;
  clampToActiveRoom: ClampToActiveRoom;
};

export type DesignPageItemDocumentControllerRefs = {
  designSnapshot: MutableRefObject<DesignSnapshot>;
  activeItems: MutableRefObject<DesignItem[]>;
};

export type DesignPageItemDocumentControllerActions = {
  setDesignSnapshot: DesignSnapshotSetter;
  updateSelection: (next: Set<string>, primaryId: string | null) => void;
  history: DesignPageItemDocumentHistory;
};

export type UseDesignPageItemDocumentControllerInput = {
  state: DesignPageItemDocumentControllerState;
  configuration: DesignPageItemDocumentControllerConfiguration;
  refs: DesignPageItemDocumentControllerRefs;
  actions: DesignPageItemDocumentControllerActions;
};

export type ReconciledDesignPageItems = {
  validItems: DesignItem[];
  invalid: Array<{ item: DesignItem; warning: string }>;
};

export function reconcileDesignPageItems(
  nextItems: DesignItem[],
  roomId?: string
): ReconciledDesignPageItems {
  const catalogItems = nextItems.filter(
    (item) => !isParametricCabinetItem(item)
  );
  const { valid: validCatalogItems, invalid } = reconcileCart(
    catalogItems,
    CATALOG_ITEMS_MAP
  );
  const validCatalogIds = new Set(
    validCatalogItems.map((item) => item.instanceId)
  );
  const snapshotBackedIds = new Set(
    catalogItems
      .filter(
        (item) =>
          Boolean(item.productSnapshot) &&
          Boolean(resolveDesignItemVisualProduct(item))
      )
      .map((item) => item.instanceId)
  );
  const unresolvedInvalid = invalid.filter(
    ({ item }) => !snapshotBackedIds.has(item.instanceId)
  );
  const validItems = nextItems
    .filter(
      (item) =>
        isParametricCabinetItem(item) ||
        validCatalogIds.has(item.instanceId) ||
        snapshotBackedIds.has(item.instanceId)
    )
    .map((item) =>
      isParametricCabinetItem(item)
        ? (normalizeCabinetDesignItem(item, { roomId }) as DesignItem)
        : item
    );

  return { validItems, invalid: unresolvedInvalid };
}

export function useDesignPageItemDocumentController({
  state,
  configuration,
  refs,
  actions,
}: UseDesignPageItemDocumentControllerInput) {
  const { activeItems } = state;
  const { roomWidth, roomDepth, wallThickness, clampToActiveRoom } =
    configuration;
  const {
    designSnapshot: designSnapshotRef,
    activeItems: itemsRef,
  } = refs;
  const { setDesignSnapshot, updateSelection, history } = actions;
  const instanceCounterRef = useRef(0);

  useEffect(() => {
    itemsRef.current = activeItems;
  }, [activeItems, itemsRef]);

  const reconcileDesignItems = useCallback(
    (nextItems: DesignItem[], roomId?: string) => {
      const result = reconcileDesignPageItems(nextItems, roomId);
      if (result.invalid.length > 0) {
        console.warn(
          `Removed ${result.invalid.length} invalid items from cart`
        );
        track("commerce_invalid_items_removed", {
          count: result.invalid.length,
          items: result.invalid,
        });
      }
      return result;
    },
    []
  );

  const commitItems = useCallback(
    (updater: DesignPageItemUpdater, actionName: string = "Edit") => {
      const nextItems =
        typeof updater === "function" ? updater(itemsRef.current) : updater;
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) return;
      const { validItems } = reconcileDesignItems(nextItems, room.id);
      history.executeCommand({
        id: "replace-active-room-items",
        description: actionName,
        input: { roomId: room.id, items: validItems },
        execute: (input) => {
          const nextSnapshot = applyReplaceRoomItemsCommand(
            designSnapshotRef.current,
            input
          );
          setDesignSnapshot(nextSnapshot);
          itemsRef.current = input.items;
        },
      });
    },
    [
      designSnapshotRef,
      history,
      itemsRef,
      reconcileDesignItems,
      setDesignSnapshot,
    ]
  );

  const previewItemsPresent = useCallback(
    (updater: DesignPageItemUpdater) => {
      const nextItems =
        typeof updater === "function" ? updater(itemsRef.current) : updater;
      const validItems = nextItems.filter((item) => {
        if (isParametricCabinetItem(item)) return true;
        const catalogItem = resolveDesignItemVisualProduct(item, CATALOG_ITEMS);
        if (!catalogItem) {
          console.warn(`Item ${item.productId} not found in catalog`);
          return false;
        }
        if (!item.productSnapshot && !canAddToCart(catalogItem)) {
          console.warn(
            `Item ${item.productId} cannot be added to cart: ${getNonBuyableReason(
              catalogItem
            )}`
          );
          return false;
        }
        return true;
      });

      itemsRef.current = validItems;
      return validItems;
    },
    [itemsRef]
  );

  const setItemsPresent = useCallback(
    (updater: DesignPageItemUpdater) => {
      const validItems = previewItemsPresent(updater);
      const room = getActiveRoom(designSnapshotRef.current);
      if (!room) return;
      const nextSnapshot = {
        ...designSnapshotRef.current,
        rooms: designSnapshotRef.current.rooms.map((entry) =>
          entry.id === room.id ? { ...room, items: validItems } : entry
        ),
      };
      setDesignSnapshot(nextSnapshot);
    },
    [designSnapshotRef, previewItemsPresent, setDesignSnapshot]
  );

  const createInstanceId = useCallback(() => {
    instanceCounterRef.current += 1;
    if (typeof crypto !== "undefined" && "randomUUID" in crypto) {
      return `i-${crypto.randomUUID()}`;
    }
    return `i-${Date.now()}-${instanceCounterRef.current}`;
  }, []);

  const addItem = useCallback(
    (
      productId: string,
      position: [number, number, number],
      rotationY?: number,
      variantId?: string,
      overrides: AddDesignPageItemOverrides = {}
    ) => {
      const product = CATALOG_ITEMS[productId];
      if (!product) return;

      const resolved = resolveCatalogVariant(
        product,
        variantId ?? product.defaultVariantId
      );
      const instanceId = createInstanceId();
      const [safeX, safeZ] = clampToActiveRoom(
        position[0],
        position[2],
        resolved.dimsMm.w / 1000,
        resolved.dimsMm.d / 1000,
        roomWidth,
        roomDepth,
        wallThickness,
        rotationY ?? 0
      );

      commitItems(
        (previous) => [
          ...previous,
          {
            instanceId,
            productId,
            variantId: resolved.variantId,
            position: [safeX, position[1], safeZ],
            rotationY,
            qty: 1,
            includeInCheckout: true,
            ...overrides,
          },
        ],
        `Add ${product.title || "Item"}`
      );
      updateSelection(new Set([instanceId]), instanceId);
    },
    [
      clampToActiveRoom,
      commitItems,
      createInstanceId,
      roomDepth,
      roomWidth,
      updateSelection,
      wallThickness,
    ]
  );

  const commitItemsToRoom = useCallback(
    (
      roomId: string,
      updater: DesignPageItemUpdater,
      actionName: string = "Edit",
      options: CommitDesignPageItemsToRoomOptions = {}
    ): DesignItem[] | null => {
      const snapshot = designSnapshotRef.current;
      const room = snapshot.rooms.find((entry) => entry.id === roomId);
      if (!room) return null;

      const nextItems =
        typeof updater === "function" ? updater(room.items) : updater;
      const { validItems } = reconcileDesignItems(nextItems, room.id);
      return history.executeCommand({
        id: "replace-room-items",
        description: actionName,
        input: {
          roomId,
          items: validItems,
          activateRoom: options.activateRoom,
          beforeLayoutVersion: options.beforeLayoutVersion,
        },
        execute: (input) => {
          const nextSnapshot = applyReplaceRoomItemsCommand(
            designSnapshotRef.current,
            input
          );
          setDesignSnapshot(nextSnapshot);
          if (nextSnapshot.activeRoomId === room.id) {
            itemsRef.current = input.items;
          }
          return input.items;
        },
      });
    },
    [
      designSnapshotRef,
      history,
      itemsRef,
      reconcileDesignItems,
      setDesignSnapshot,
    ]
  );

  const getActiveItems = useCallback(() => itemsRef.current, [itemsRef]);
  const getActiveRoomId = useCallback(
    () => designSnapshotRef.current.activeRoomId,
    [designSnapshotRef]
  );
  const getRooms = useCallback(
    (): RoomSnapshot[] => designSnapshotRef.current.rooms,
    [designSnapshotRef]
  );
  const selectItemsInRoom = useCallback(
    ({
      roomId,
      instanceIds,
      primaryInstanceId,
    }: SelectDesignPageItemsInRoomInput) => {
      setDesignSnapshot((previous) =>
        previous.activeRoomId === roomId
          ? previous
          : switchRoom(previous, roomId)
      );
      updateSelection(new Set(instanceIds), primaryInstanceId);
    },
    [setDesignSnapshot, updateSelection]
  );

  return {
    refs: { activeItems: itemsRef },
    queries: { getActiveItems, getActiveRoomId, getRooms },
    actions: {
      commitItems,
      commitItemsToRoom,
      previewItemsPresent,
      setItemsPresent,
      createInstanceId,
      addItem,
      selectItemsInRoom,
    },
  };
}
