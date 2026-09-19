import type { Browser, Locator, Page } from "@playwright/test";
import type { Prisma } from "@prisma/client";
import { expect, test } from "./fixtures";
import {
  buildBetaDesignSnapshot,
  cleanupBetaSeed,
  createBetaSeedDesign,
  disconnectBetaPrismaClient,
  getBetaPrismaClient,
} from "./beta-seed";

type ShareLayoutMode = "mobile" | "tablet" | "desktop";

type PublicShareLifecycleNode = {
  nodeId: number;
  testId: string | null;
  connected: boolean;
  state: string | null;
  layoutMode: string | null;
  layoutGeneration: string | null;
  projectionIdentity: string | null;
  selectedRoomId: string | null;
  selectedSavedViewId: string | null;
  parent: string | null;
  parentNodeId: number | null;
  streamingOwner: string | null;
  streamingOwnerNodeId: number | null;
  visible: boolean;
  accessibilityActive: boolean;
  hidden: boolean;
  ariaHidden: boolean;
  inert: boolean;
  actionableDescendantCount: number;
  focusWithin: boolean;
  createdAtMs: number;
  removedAtMs: number | null;
  documentId: string;
  documentGeneration: number;
  routePathname: string;
  routeIdentityDigest: string;
  routeGeneration: number;
  pageCacheRestored: boolean;
};

type PublicShareRootLifecycleSample = {
  atMs: number;
  event: "mutation" | "removed" | "pagehide" | "pageshow";
  documentId: string;
  documentGeneration: number;
  routePathname: string;
  routeIdentityDigest: string;
  routeGeneration: number;
  pageCacheRestored: boolean;
  recognizedStates: string[];
  duplicateStableTestIds: string[];
  duplicateStableLifecycleMarkerNodeIds: number[];
  recognizedStateOwnerCount: number;
  stableOwnerCount: number;
  presentationMainLandmarkCount: number;
  visibleLifecycleOwnerCount: number;
  accessibilityLifecycleOwnerCount: number;
  orphanShareIdentityCount: number;
  outsideCurrentOwnerActionableCount: number;
  recognizedStateOwners: PublicShareLifecycleNode[];
  stableOwners: PublicShareLifecycleNode[];
  presentationMainLandmarks: PublicShareLifecycleNode[];
};

type PublicShareRootLifecycleDiagnostics = {
  samples: PublicShareRootLifecycleSample[];
  sampleCount: number;
  truncated: boolean;
  maxRecognizedStateOwnerCount: number;
  maxConnectedStableOwnerCount: number;
  maxPresentationMainLandmarkCount: number;
  maxVisibleLifecycleOwnerCount: number;
  maxAccessibilityLifecycleOwnerCount: number;
  maxOutsideCurrentOwnerActionableCount: number;
};

async function installPublicShareRootLifecycleObserver(page: Page) {
  await page.addInitScript(() => {
    const diagnosticWindow = window as typeof window & {
      __publicShareRootLifecycle?: PublicShareRootLifecycleDiagnostics;
    };
    const samples: PublicShareRootLifecycleSample[] = [];
    const diagnostics: PublicShareRootLifecycleDiagnostics = {
      samples,
      sampleCount: 0,
      truncated: false,
      maxRecognizedStateOwnerCount: 0,
      maxConnectedStableOwnerCount: 0,
      maxPresentationMainLandmarkCount: 0,
      maxVisibleLifecycleOwnerCount: 0,
      maxAccessibilityLifecycleOwnerCount: 0,
      maxOutsideCurrentOwnerActionableCount: 0,
    };
    const nodeIds = new WeakMap<Element, number>();
    const nodeCreatedAt = new WeakMap<Element, number>();
    const stableLifecycleOwnerSelector = "[data-public-share-lifecycle-owner]";
    const recognizedStateOwnerSelector = [
      '[data-testid="public-share-root"]',
      '[data-testid="public-share-loading"]',
      '[data-testid="public-share-client-resolving"]',
      '[data-testid="public-share-invalid"]',
      '[data-testid="public-share-error"]',
    ].join(",");
    const presentationMainLandmarkSelector = 'main, [role="main"]';
    const documentGenerationKey = "public-share-diagnostic-document-generation";
    const previousDocumentGeneration = Number(sessionStorage.getItem(documentGenerationKey));
    const documentGeneration = Number.isFinite(previousDocumentGeneration)
      ? previousDocumentGeneration + 1
      : 1;
    sessionStorage.setItem(documentGenerationKey, String(documentGeneration));
    const documentId = `public-share-document:${documentGeneration}:${performance.timeOrigin.toFixed(3)}`;
    let pageCacheRestored = false;
    let nextNodeId = 1;
    let previousSignature = "";
    let previousRouteIdentityDigest = "";
    let routeGeneration = 0;
    const nodeId = (node: Element) => {
      const existing = nodeIds.get(node);
      if (existing) return existing;
      const assigned = nextNodeId++;
      nodeIds.set(node, assigned);
      return assigned;
    };
    const createdAtMs = (node: Element) => {
      const existing = nodeCreatedAt.get(node);
      if (existing !== undefined) return existing;
      const created = performance.now();
      nodeCreatedAt.set(node, created);
      return created;
    };
    const routePathname = () =>
      location.pathname.replace(/^\/share\/[^/]+/, "/share/:shareToken");
    const routeIdentityDigest = () => {
      let primary = 2166136261;
      let secondary = 3339675911;
      for (const character of location.pathname) {
        const code = character.charCodeAt(0);
        primary = Math.imul(primary ^ code, 16777619) >>> 0;
        secondary = Math.imul(secondary ^ code, 2246822519) >>> 0;
      }
      return `public-share-route.v1:${primary.toString(16).padStart(8, "0")}${secondary.toString(16).padStart(8, "0")}`;
    };
    const routeDiagnostics = () => {
      const identityDigest = routeIdentityDigest();
      if (identityDigest !== previousRouteIdentityDigest) {
        previousRouteIdentityDigest = identityDigest;
        routeGeneration += 1;
      }
      return {
        pathname: routePathname(),
        identityDigest,
        generation: routeGeneration,
      };
    };
    const isInteractivePresentationRoute = () => /^\/share\/[^/]+\/?$/.test(location.pathname);
    const describeOwner = (node: Element | null) => {
      if (!node) return null;
      const testId = node.getAttribute("data-testid");
      const id = node.id;
      return `${node.tagName.toLowerCase()}${id ? `#${id}` : ""}${testId ? `[${testId}]` : ""}`;
    };
    const describeLifecycleNode = (
      lifecycleNode: Element,
      connected = lifecycleNode.isConnected,
      removedAtMs: number | null = null,
      route = routeDiagnostics()
    ): PublicShareLifecycleNode => {
      const style = getComputedStyle(lifecycleNode);
      const bounds = lifecycleNode.getBoundingClientRect();
      const ariaHiddenOwner = lifecycleNode.closest('[aria-hidden="true"]');
      const inertOwner = lifecycleNode.closest("[inert]");
      const hiddenOwner = lifecycleNode.closest("[hidden]");
      const streamingOwner = lifecycleNode.closest('[id^="S:"], [id^="B:"]');
      const actionableDescendantCount = lifecycleNode.querySelectorAll(
        'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
      ).length;
      const hidden = Boolean(hiddenOwner);
      const ariaHidden = Boolean(ariaHiddenOwner);
      const inert = Boolean(inertOwner);
      return {
        nodeId: nodeId(lifecycleNode),
        testId: lifecycleNode.getAttribute("data-testid"),
        connected,
        state: lifecycleNode.getAttribute("data-layout-status"),
        layoutMode: lifecycleNode.getAttribute("data-layout-mode"),
        layoutGeneration: lifecycleNode.getAttribute("data-layout-generation"),
        projectionIdentity: lifecycleNode.getAttribute("data-projection-content-identity"),
        selectedRoomId: lifecycleNode.getAttribute("data-selected-room-id"),
        selectedSavedViewId: lifecycleNode.getAttribute("data-selected-saved-view-id"),
        parent: describeOwner(lifecycleNode.parentElement),
        parentNodeId: lifecycleNode.parentElement ? nodeId(lifecycleNode.parentElement) : null,
        streamingOwner: describeOwner(streamingOwner),
        streamingOwnerNodeId: streamingOwner ? nodeId(streamingOwner) : null,
        visible:
          connected &&
          !hidden &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          bounds.width > 0 &&
          bounds.height > 0,
        accessibilityActive: connected && !hidden && !ariaHidden && !inert,
        hidden,
        ariaHidden,
        inert,
        actionableDescendantCount,
        focusWithin: connected && lifecycleNode.contains(document.activeElement),
        createdAtMs: createdAtMs(lifecycleNode),
        removedAtMs,
        documentId,
        documentGeneration,
        routePathname: route.pathname,
        routeIdentityDigest: route.identityDigest,
        routeGeneration: route.generation,
        pageCacheRestored,
      };
    };
    const record = (
      event: PublicShareRootLifecycleSample["event"],
      removedLifecycleNodes: Element[] = []
    ) => {
      const route = routeDiagnostics();
      const recognizedStateOwnerElements = Array.from(
        document.querySelectorAll(recognizedStateOwnerSelector)
      );
      const recognizedStates = recognizedStateOwnerElements.flatMap((node) => {
        const state = node.getAttribute("data-layout-status");
        return state ? [state] : [];
      });
      const connectedStableOwnerElements = Array.from(
        document.querySelectorAll(stableLifecycleOwnerSelector)
      );
      const connectedPresentationMainElements = isInteractivePresentationRoute()
        ? Array.from(document.querySelectorAll(presentationMainLandmarkSelector))
        : [];
      const removedAtMs = performance.now();
      const stableOwners = connectedStableOwnerElements.map((owner) =>
        describeLifecycleNode(owner, true, null, route)
      );
      stableOwners.push(
        ...removedLifecycleNodes.map((owner) =>
          describeLifecycleNode(owner, false, removedAtMs, route)
        )
      );
      const recognizedStateOwners = recognizedStateOwnerElements.map((owner) =>
        describeLifecycleNode(owner, true, null, route)
      );
      recognizedStateOwners.push(
        ...removedLifecycleNodes
          .filter((owner) => owner.matches(recognizedStateOwnerSelector))
          .map((owner) => describeLifecycleNode(owner, false, removedAtMs, route))
      );
      const presentationMainLandmarks = connectedPresentationMainElements.map((landmark) =>
        describeLifecycleNode(landmark, true, null, route)
      );
      const stableTestIds = Array.from(
        document.querySelectorAll(
          [
            '[data-testid^="public-share-"]',
            '[data-testid^="share-room-action-"]',
            '[data-testid^="share-saved-view-action-"]',
            '[data-testid="share-preview-surface"]',
            '[data-testid="share-room-list"]',
            '[data-testid="share-room-list-mobile"]',
            '[data-testid="share-room-list-table"]',
            '[data-testid="share-room-navigation"]',
            '[data-testid="share-saved-view-navigation"]',
          ].join(",")
        )
      ).flatMap((node) => {
        const identity = node.getAttribute("data-testid");
        return identity ? [identity] : [];
      });
      const duplicateStableTestIds = stableTestIds.filter(
        (identity, index) => stableTestIds.indexOf(identity) !== index
      );
      const currentOwner = connectedStableOwnerElements.find((owner) =>
        describeLifecycleNode(owner, true, null, route).accessibilityActive
      );
      const orphanShareIdentityCount = currentOwner
        ? Array.from(document.querySelectorAll('[data-testid^="share-"]')).filter(
            (node) => !currentOwner.contains(node)
          ).length
        : document.querySelectorAll('[data-testid^="share-"]').length;
      const currentOwners = connectedStableOwnerElements.filter((owner) =>
        describeLifecycleNode(owner, true, null, route).accessibilityActive
      );
      const outsideCurrentOwnerActionableCount = Array.from(
        document.querySelectorAll(
          'button, a[href], input, select, textarea, [tabindex]:not([tabindex="-1"])'
        )
      ).filter((node) => {
        if (currentOwners.some((owner) => owner.contains(node))) return false;
        const testId = node.getAttribute("data-testid") ?? "";
        return (
          testId.startsWith("share-") ||
          testId.startsWith("public-share-") ||
          node.hasAttribute("data-share-touch-target") ||
          Boolean(node.closest('[data-testid^="share-"]'))
        );
      }).length;
      const recognizedStateOwnerCount = recognizedStateOwnerElements.length;
      const stableOwnerCount = connectedStableOwnerElements.length;
      const presentationMainLandmarkCount = connectedPresentationMainElements.length;
      const visibleLifecycleOwnerCount = stableOwners.filter(
        (owner) => owner.connected && owner.visible
      ).length;
      const accessibilityLifecycleOwnerCount = stableOwners.filter(
        (owner) => owner.connected && owner.accessibilityActive
      ).length;
      const duplicateStableLifecycleMarkerNodeIds = stableOwners
        .filter((owner) => owner.connected)
        .slice(1)
        .map((owner) => owner.nodeId);
      const signature = JSON.stringify({
        event,
        recognizedStates,
        duplicateStableTestIds,
        duplicateStableLifecycleMarkerNodeIds,
        recognizedStateOwnerCount,
        stableOwnerCount,
        presentationMainLandmarkCount,
        visibleLifecycleOwnerCount,
        accessibilityLifecycleOwnerCount,
        orphanShareIdentityCount,
        outsideCurrentOwnerActionableCount,
        recognizedStateOwners,
        stableOwners,
        presentationMainLandmarks,
      });
      if (event === "mutation" && signature === previousSignature) return;
      previousSignature = signature;
      diagnostics.sampleCount += 1;
      diagnostics.maxRecognizedStateOwnerCount = Math.max(
        diagnostics.maxRecognizedStateOwnerCount,
        recognizedStateOwnerCount
      );
      diagnostics.maxConnectedStableOwnerCount = Math.max(
        diagnostics.maxConnectedStableOwnerCount,
        stableOwnerCount
      );
      diagnostics.maxPresentationMainLandmarkCount = Math.max(
        diagnostics.maxPresentationMainLandmarkCount,
        presentationMainLandmarkCount
      );
      diagnostics.maxVisibleLifecycleOwnerCount = Math.max(
        diagnostics.maxVisibleLifecycleOwnerCount,
        visibleLifecycleOwnerCount
      );
      diagnostics.maxAccessibilityLifecycleOwnerCount = Math.max(
        diagnostics.maxAccessibilityLifecycleOwnerCount,
        accessibilityLifecycleOwnerCount
      );
      diagnostics.maxOutsideCurrentOwnerActionableCount = Math.max(
        diagnostics.maxOutsideCurrentOwnerActionableCount,
        outsideCurrentOwnerActionableCount
      );
      if (samples.length < 1024) {
        samples.push({
          atMs: performance.now(),
          event,
          documentId,
          documentGeneration,
          routePathname: route.pathname,
          routeIdentityDigest: route.identityDigest,
          routeGeneration: route.generation,
          pageCacheRestored,
          recognizedStates,
          duplicateStableTestIds,
          duplicateStableLifecycleMarkerNodeIds,
          recognizedStateOwnerCount,
          stableOwnerCount,
          presentationMainLandmarkCount,
          visibleLifecycleOwnerCount,
          accessibilityLifecycleOwnerCount,
          orphanShareIdentityCount,
          outsideCurrentOwnerActionableCount,
          recognizedStateOwners,
          stableOwners,
          presentationMainLandmarks,
        });
      } else {
        diagnostics.truncated = true;
      }
    };
    diagnosticWindow.__publicShareRootLifecycle = diagnostics;
    const observer = new MutationObserver((records) => {
      const removedLifecycleNodes: Element[] = [];
      for (const recordEntry of records) {
        for (const removedNode of recordEntry.removedNodes) {
          if (!(removedNode instanceof Element)) continue;
          if (removedNode.matches(stableLifecycleOwnerSelector)) {
            removedLifecycleNodes.push(removedNode);
          }
          removedLifecycleNodes.push(
            ...removedNode.querySelectorAll(stableLifecycleOwnerSelector)
          );
        }
      }
      if (removedLifecycleNodes.length > 0) record("removed", removedLifecycleNodes);
      record("mutation");
    });
    observer.observe(document, {
      attributes: true,
      attributeFilter: [
        "aria-hidden",
        "class",
        "data-layout-generation",
        "data-layout-mode",
        "data-layout-status",
        "data-public-share-lifecycle-owner",
        "data-selected-room-id",
        "data-selected-saved-view-id",
        "data-testid",
        "hidden",
        "inert",
        "role",
        "style",
      ],
      childList: true,
      subtree: true,
    });
    addEventListener("pagehide", (event) => {
      pageCacheRestored = event.persisted;
      record("pagehide");
    });
    addEventListener("pageshow", (event) => {
      pageCacheRestored = event.persisted;
      record("pageshow");
    });
    record("mutation");
  });
}

async function holdPublicShareProjectionRead() {
  const prisma = getBetaPrismaClient();
  let releaseLock = () => undefined;
  let reportLockAcquired = () => undefined;
  let reportLockFailure = (_error: unknown) => undefined;
  const lockReleased = new Promise<void>((resolve) => {
    releaseLock = resolve;
  });
  const lockAcquired = new Promise<void>((resolve, reject) => {
    reportLockAcquired = resolve;
    reportLockFailure = reject;
  });
  const transaction = prisma.$transaction(async (database) => {
    await database.$executeRaw`LOCK TABLE "Design" IN ACCESS EXCLUSIVE MODE`;
    reportLockAcquired();
    await lockReleased;
  });
  transaction.catch(reportLockFailure);
  await lockAcquired;
  return async () => {
    releaseLock();
    await transaction;
  };
}

async function navigateWithAppRouter(page: Page, href: string) {
  await page.getByTestId("share-export-pack").evaluate((link, targetHref) => {
    type RouterCandidate = {
      push?: (target: string) => void;
      replace?: (target: string) => void;
      refresh?: () => void;
    };
    type ReactFiber = {
      return?: ReactFiber | null;
      alternate?: ReactFiber | null;
      memoizedProps?: { value?: RouterCandidate } | null;
      pendingProps?: { value?: RouterCandidate } | null;
    };
    const fiberKey = Object.keys(link).find((key) => key.startsWith("__reactFiber$"));
    if (!fiberKey) throw new Error("Next App Router fiber was not available on the public link");
    let fiber = (link as unknown as Record<string, ReactFiber>)[fiberKey];
    const visited = new Set<ReactFiber>();
    while (fiber && !visited.has(fiber)) {
      visited.add(fiber);
      for (const props of [fiber.memoizedProps, fiber.pendingProps]) {
        const candidate = props?.value;
        if (
          candidate &&
          typeof candidate.push === "function" &&
          typeof candidate.replace === "function" &&
          typeof candidate.refresh === "function"
        ) {
          candidate.push(targetHref);
          return;
        }
      }
      fiber = fiber.return ?? fiber.alternate?.return ?? null;
    }
    throw new Error("Next App Router context was not available above the public link");
  }, href);
  await expect.poll(() => new URL(page.url()).pathname).toBe(href);
}

async function readPublicShareRootLifecycle(page: Page) {
  return page.evaluate(() => {
    const diagnosticWindow = window as typeof window & {
      __publicShareRootLifecycle?: PublicShareRootLifecycleDiagnostics;
    };
    return diagnosticWindow.__publicShareRootLifecycle ?? {
      samples: [],
      sampleCount: 0,
      truncated: false,
      maxRecognizedStateOwnerCount: 0,
      maxConnectedStableOwnerCount: 0,
      maxPresentationMainLandmarkCount: 0,
      maxVisibleLifecycleOwnerCount: 0,
      maxAccessibilityLifecycleOwnerCount: 0,
      maxOutsideCurrentOwnerActionableCount: 0,
    };
  });
}

function publicShareLifecycleFailure(
  message: string,
  diagnostics: PublicShareRootLifecycleDiagnostics,
  isRelevant: (sample: PublicShareRootLifecycleSample) => boolean
) {
  const relevantSamples = diagnostics.samples.filter(isRelevant);
  const selectedSamples = (relevantSamples.length > 0
    ? relevantSamples
    : diagnostics.samples.slice(-1)
  ).slice(-4);
  const summarizeNode = (node: PublicShareLifecycleNode) => ({
    nodeId: node.nodeId,
    testId: node.testId,
    state: node.state,
    connected: node.connected,
    visible: node.visible,
    hidden: node.hidden,
    ariaHidden: node.ariaHidden,
    inert: node.inert,
    accessibilityActive: node.accessibilityActive,
    focusWithin: node.focusWithin,
    parent: node.parent,
    parentNodeId: node.parentNodeId,
    streamingOwner: node.streamingOwner,
    streamingOwnerNodeId: node.streamingOwnerNodeId,
  });
  const evidence = selectedSamples.map((sample) => ({
    event: sample.event,
    documentGeneration: sample.documentGeneration,
    routePathname: sample.routePathname,
    routeGeneration: sample.routeGeneration,
    recognizedStateOwnerCount: sample.recognizedStateOwnerCount,
    stableOwnerCount: sample.stableOwnerCount,
    presentationMainLandmarkCount: sample.presentationMainLandmarkCount,
    visibleLifecycleOwnerCount: sample.visibleLifecycleOwnerCount,
    accessibilityLifecycleOwnerCount: sample.accessibilityLifecycleOwnerCount,
    duplicateStableLifecycleMarkerNodeIds:
      sample.duplicateStableLifecycleMarkerNodeIds,
    duplicateStableTestIds: sample.duplicateStableTestIds,
    stableOwners: sample.stableOwners.map(summarizeNode),
    presentationMainLandmarks: sample.presentationMainLandmarks.map(summarizeNode),
  }));
  return `${message}; lifecycle evidence=${JSON.stringify(evidence)}`;
}

async function expectPublicShareRootLifecycleUnique(
  page: Page,
  requiredStates: Array<PublicShareLifecycleNode["state"]> = []
) {
  const diagnostics = await readPublicShareRootLifecycle(page);
  const lifecycle = diagnostics.samples;
  expect(lifecycle.length).toBeGreaterThan(0);
  expect(
    diagnostics.truncated,
    publicShareLifecycleFailure(
      "lifecycle diagnostics must not truncate",
      diagnostics,
      () => diagnostics.truncated
    )
  ).toBe(false);
  expect(diagnostics.sampleCount).toBe(lifecycle.length);
  expect(
    diagnostics.maxConnectedStableOwnerCount,
    publicShareLifecycleFailure(
      "stable lifecycle owner count must never exceed one",
      diagnostics,
      (sample) => sample.stableOwnerCount > 1
    )
  ).toBeLessThanOrEqual(1);
  expect(
    diagnostics.maxPresentationMainLandmarkCount,
    publicShareLifecycleFailure(
      "presentation main-landmark count must never exceed one",
      diagnostics,
      (sample) => sample.presentationMainLandmarkCount > 1
    )
  ).toBeLessThanOrEqual(1);
  expect(
    diagnostics.maxVisibleLifecycleOwnerCount,
    publicShareLifecycleFailure(
      "visible lifecycle owner count must never exceed one",
      diagnostics,
      (sample) => sample.visibleLifecycleOwnerCount > 1
    )
  ).toBeLessThanOrEqual(1);
  expect(
    diagnostics.maxAccessibilityLifecycleOwnerCount,
    publicShareLifecycleFailure(
      "accessibility-active lifecycle owner count must never exceed one",
      diagnostics,
      (sample) => sample.accessibilityLifecycleOwnerCount > 1
    )
  ).toBeLessThanOrEqual(1);
  expect(lifecycle.filter((sample) => sample.visibleLifecycleOwnerCount > 1)).toEqual([]);
  expect(lifecycle.filter((sample) => sample.accessibilityLifecycleOwnerCount > 1)).toEqual([]);
  expect(
    lifecycle.flatMap((sample) => sample.duplicateStableLifecycleMarkerNodeIds),
    publicShareLifecycleFailure(
      "stable lifecycle owner markers must not be duplicated",
      diagnostics,
      (sample) => sample.duplicateStableLifecycleMarkerNodeIds.length > 0
    )
  ).toEqual([]);
  expect(
    diagnostics.maxOutsideCurrentOwnerActionableCount,
    publicShareLifecycleFailure(
      "public-share actions must belong to the current lifecycle owner",
      diagnostics,
      (sample) => sample.outsideCurrentOwnerActionableCount > 0
    )
  ).toBe(0);
  expect(
    lifecycle.flatMap((sample) => sample.stableOwners).filter(
      (owner) =>
        owner.focusWithin &&
        (!owner.connected || owner.hidden || owner.ariaHidden || owner.inert)
    ),
    publicShareLifecycleFailure(
      "focus must not remain in a disconnected, hidden, inert, or outgoing owner",
      diagnostics,
      (sample) => sample.stableOwners.some(
        (owner) =>
          owner.focusWithin &&
          (!owner.connected || owner.hidden || owner.ariaHidden || owner.inert)
      )
    )
  ).toEqual([]);
  expect(
    lifecycle.flatMap((sample) => sample.duplicateStableTestIds),
    publicShareLifecycleFailure(
      "stable public-share test IDs must not be duplicated",
      diagnostics,
      (sample) => sample.duplicateStableTestIds.length > 0
    )
  ).toEqual([]);
  expect(
    lifecycle.filter((sample) => sample.orphanShareIdentityCount > 0),
    publicShareLifecycleFailure(
      "share identities must not be orphaned outside the current owner",
      diagnostics,
      (sample) => sample.orphanShareIdentityCount > 0
    )
  ).toEqual([]);
  expect(
    lifecycle.filter((sample) => sample.outsideCurrentOwnerActionableCount > 0),
    publicShareLifecycleFailure(
      "stale actionable share elements must not survive outside the current owner",
      diagnostics,
      (sample) => sample.outsideCurrentOwnerActionableCount > 0
    )
  ).toEqual([]);
  const observedStates = lifecycle.map((sample) => [
    ...sample.recognizedStates,
    ...sample.stableOwners.flatMap((owner) =>
      owner.connected && owner.state ? [owner.state] : []
    ),
  ]);
  let previousStateIndex = -1;
  for (const requiredState of requiredStates) {
    const requiredStateIndex = observedStates.findIndex(
      (states, index) => index > previousStateIndex && states.includes(requiredState ?? "")
    );
    expect(
      requiredStateIndex,
      `public-share lifecycle did not expose ordered state ${requiredState}`
    ).toBeGreaterThan(previousStateIndex);
    previousStateIndex = requiredStateIndex;
  }
  return diagnostics;
}

type PublicShareLifecycleNegativeControl =
  | "same-id-duplicate"
  | "distinct-id-duplicate"
  | "hidden-distinct-id-duplicate"
  | "unmarked-main";

async function expectPublicShareLifecycleNegativeControl(
  browser: Browser,
  origin: string,
  control: PublicShareLifecycleNegativeControl
) {
  const context = await browser.newContext();
  const negativePage = await context.newPage();
  try {
    await installPublicShareRootLifecycleObserver(negativePage);
    await negativePage.goto(new URL("/share/not-a-valid-public-token", origin).href, {
      waitUntil: "domcontentloaded",
    });
    await expectOnlyPublicShareInvalid(negativePage);
    const physicalCounts = await negativePage.evaluate((negativeControl) => {
      const owner = document.querySelector<HTMLElement>(
        "[data-public-share-lifecycle-owner]"
      );
      if (!owner) throw new Error("Invalid owner was unavailable for negative injection");
      const duplicate = owner.cloneNode(true) as HTMLElement;
      duplicate.dataset.publicShareNegativeControl = negativeControl;
      if (negativeControl !== "same-id-duplicate") {
        duplicate.dataset.testid = `public-share-negative-${negativeControl}`;
      }
      if (negativeControl === "hidden-distinct-id-duplicate") {
        duplicate.hidden = true;
        duplicate.setAttribute("aria-hidden", "true");
      }
      if (negativeControl === "unmarked-main") {
        duplicate.removeAttribute("data-public-share-lifecycle-owner");
      }
      owner.after(duplicate);
      const recognizedStateOwnerSelector = [
        '[data-testid="public-share-root"]',
        '[data-testid="public-share-loading"]',
        '[data-testid="public-share-client-resolving"]',
        '[data-testid="public-share-invalid"]',
        '[data-testid="public-share-error"]',
      ].join(",");
      return {
        recognizedStateOwnerCount:
          document.querySelectorAll(recognizedStateOwnerSelector).length,
        stableOwnerCount:
          document.querySelectorAll("[data-public-share-lifecycle-owner]").length,
        presentationMainLandmarkCount:
          document.querySelectorAll('main, [role="main"]').length,
        testIds: Array.from(document.querySelectorAll('main, [role="main"]')).map(
          (node) => node.getAttribute("data-testid")
        ),
      };
    }, control);
    const expectedStableOwnerCount = control === "unmarked-main" ? 1 : 2;
    const expectedRecognizedStateOwnerCount = control === "same-id-duplicate" ? 2 : 1;
    expect(physicalCounts.stableOwnerCount).toBe(expectedStableOwnerCount);
    expect(physicalCounts.presentationMainLandmarkCount).toBe(2);
    expect(physicalCounts.recognizedStateOwnerCount).toBe(
      expectedRecognizedStateOwnerCount
    );
    expect(physicalCounts.testIds).toHaveLength(2);
    await expect
      .poll(async () => {
        const diagnostics = await readPublicShareRootLifecycle(negativePage);
        return {
          stableOwnerCount: diagnostics.maxConnectedStableOwnerCount,
          presentationMainLandmarkCount:
            diagnostics.maxPresentationMainLandmarkCount,
          recognizedStateOwnerCount: diagnostics.maxRecognizedStateOwnerCount,
        };
      })
      .toEqual({
        stableOwnerCount: expectedStableOwnerCount,
        presentationMainLandmarkCount: 2,
        recognizedStateOwnerCount: expectedRecognizedStateOwnerCount,
      });
    const diagnostics = await readPublicShareRootLifecycle(negativePage);
    if (control === "same-id-duplicate") {
      expect(diagnostics.samples.flatMap((sample) => sample.duplicateStableTestIds)).toContain(
        "public-share-invalid"
      );
    }
    if (control === "hidden-distinct-id-duplicate") {
      expect(diagnostics.maxVisibleLifecycleOwnerCount).toBe(1);
      expect(diagnostics.maxAccessibilityLifecycleOwnerCount).toBe(1);
    }
    const rejection = expectPublicShareRootLifecycleUnique(negativePage);
    if (control === "unmarked-main") {
      await expect(rejection).rejects.toThrow(
        /presentation main-landmark count must never exceed one/
      );
    } else {
      await expect(rejection).rejects.toThrow(
        /stable lifecycle owner count must never exceed one/
      );
    }
    return diagnostics;
  } finally {
    await negativePage
      .locator("[data-public-share-negative-control]")
      .evaluateAll((nodes) => nodes.forEach((node) => node.remove()));
    await expect(negativePage.locator("[data-public-share-lifecycle-owner]")).toHaveCount(1);
    await expect(negativePage.locator('main, [role="main"]')).toHaveCount(1);
    await context.close();
  }
}

async function expectFiniteAttribute(locator: Locator, name: string) {
  const value = Number(await locator.getAttribute(name));
  expect(Number.isFinite(value)).toBe(true);
  expect(value).toBeGreaterThan(0);
}

async function expectShareReady(
  page: Page,
  expected: { mode: ShareLayoutMode; roomId: string }
) {
  const root = page.getByTestId("public-share-root");
  await expect(root).toHaveCount(1);
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator("[data-public-share-lifecycle-owner]")).toHaveCount(1);
  await expect(root).toHaveAttribute("data-layout-status", "ready");
  await expect(root).toHaveAttribute("data-layout-mode", expected.mode);
  await expect(root).toHaveAttribute("data-selected-room-id", expected.roomId);
  await expect(root).toHaveAttribute(
    "data-projection-content-identity",
    /^public-design-projection\.v1:sha256:[a-f0-9]{64}$/
  );
  await expectFiniteAttribute(root, "data-layout-generation");
  await expectFiniteAttribute(root, "data-surface-width");
  await expectFiniteAttribute(root, "data-surface-height");
  return root;
}

async function expectOnlyPublicShareInvalid(page: Page) {
  await expect(page.getByTestId("public-share-invalid")).toHaveCount(1);
  await expect(page.getByTestId("public-share-invalid")).toBeVisible();
  await expect(page.getByRole("main")).toHaveCount(1);
  await expect(page.locator("[data-public-share-lifecycle-owner]")).toHaveCount(1);
  await expect(page.getByTestId("public-share-root")).toHaveCount(0);
  await expect(page.getByTestId("public-share-loading")).toHaveCount(0);
  await expect(page.getByTestId("public-share-error")).toHaveCount(0);
  await expect(page.locator('[data-testid^="share-"]')).toHaveCount(0);
  await expect(page.locator("[data-share-touch-target]")).toHaveCount(0);
}

async function expectNoPageOverflow(page: Page) {
  await expect
    .poll(() =>
      page.evaluate(
        () => document.documentElement.scrollWidth - document.documentElement.clientWidth
      )
    )
    .toBeLessThanOrEqual(1);
}

async function expectUniqueResponsiveIdentities(page: Page) {
  const duplicates = await page.locator(
    [
      '[data-testid^="public-share-"]',
      '[data-testid^="share-room-action-"]',
      '[data-testid^="share-saved-view-action-"]',
      '[data-testid="share-preview-surface"]',
      '[data-testid="share-room-list"]',
      '[data-testid="share-room-list-mobile"]',
      '[data-testid="share-room-list-table"]',
      '[data-testid="share-room-navigation"]',
      '[data-testid="share-saved-view-navigation"]',
    ].join(",")
  ).evaluateAll((nodes) => {
    const identities = nodes
      .map((node) => node.getAttribute("data-testid"))
      .filter((identity): identity is string => Boolean(identity));
    return identities.filter((identity, index) => identities.indexOf(identity) !== index);
  });
  expect(duplicates).toEqual([]);
  const duplicateIds = await page.getByTestId("public-share-root").locator("[id]").evaluateAll(
    (nodes) => {
      const ids = nodes.map((node) => node.id).filter(Boolean);
      return ids.filter((identity, index) => ids.indexOf(identity) !== index);
    }
  );
  expect(duplicateIds).toEqual([]);
}

async function expectTouchTargets(page: Page) {
  const geometryIssues = await page
    .locator(
      [
        '[data-testid="share-page-actions"] :is(button,a)',
        '[data-testid="share-client-handoff-summary"] a',
        '[data-testid="share-room-navigation"] button',
        '[data-testid="share-saved-view-navigation"] button',
        '[data-testid="share-footer-actions"] :is(button,a)',
      ].join(",")
    )
    .filter({ visible: true })
    .evaluateAll((nodes) =>
      nodes.flatMap((node) => {
        const rect = node.getBoundingClientRect();
        const roomNavigation = node.closest('[data-testid="share-room-navigation"]');
        const clipped = !roomNavigation && (rect.left < -1 || rect.right > window.innerWidth + 1);
        return rect.width < 44 || rect.height < 44 || clipped
          ? [{
              label: node.getAttribute("data-testid") ?? node.textContent?.trim(),
              width: rect.width,
              height: rect.height,
              left: rect.left,
              right: rect.right,
              clipped,
            }]
          : [];
      })
    );
  expect(geometryIssues).toEqual([]);
}

test.describe("ARCH-RC53-55 responsive public share", () => {
  test.beforeEach(async ({ page }) => {
    await installPublicShareRootLifecycleObserver(page);
  });

  test.afterEach(async ({ page }, testInfo) => {
    const lifecycle = await readPublicShareRootLifecycle(page);
    await testInfo.attach("public-share-root-lifecycle", {
      body: JSON.stringify(lifecycle, null, 2),
      contentType: "application/json",
    });
    await expectPublicShareRootLifecycleUnique(page);
  });

  test.afterAll(async () => {
    await disconnectBetaPrismaClient();
  });

  test("single-room desktop and mobile share has a deterministic fallback and projection", async ({
    page,
  }) => {
    const snapshot = buildBetaDesignSnapshot();
    snapshot.rooms = [snapshot.rooms[0]];
    snapshot.activeRoomId = "removed-public-room";
    const seed = await createBetaSeedDesign({ snapshot });

    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      const releaseProjectionRead = await holdPublicShareProjectionRead();
      const navigation = page.goto(`/share/${seed.shareToken}`, {
        waitUntil: "domcontentloaded",
      });
      try {
        await expect(page.getByTestId("public-share-loading")).toHaveCount(1);
        await expect(page.getByTestId("public-share-loading")).toBeVisible();
        await expect(page.getByRole("main")).toHaveCount(1);
        await expect(page.getByTestId("public-share-root")).toHaveCount(0);
      } finally {
        await releaseProjectionRead();
      }
      await navigation;
      const desktopRoot = await expectShareReady(page, {
        mode: "desktop",
        roomId: "room_living",
      });
      await expectPublicShareRootLifecycleUnique(page, ["loading", "resolving", "ready"]);
      const fingerprint = await desktopRoot.getAttribute("data-projection-fingerprint");
      const contentIdentity = await desktopRoot.getAttribute(
        "data-projection-content-identity"
      );
      const safeAreaStyle = await desktopRoot.getAttribute("style");
      for (const inset of ["top", "right", "bottom", "left"]) {
        expect(safeAreaStyle).toContain(`safe-area-inset-${inset}`);
      }
      await expect(page.getByTestId("qa-share-snapshot-fingerprint")).toHaveAttribute(
        "data-fingerprint",
        fingerprint ?? ""
      );
      await expect(page.getByTestId("share-room-list-table")).toBeVisible();
      await expect(page.getByTestId("share-room-list-mobile")).toHaveCount(0);
      await expect(page.getByTestId("share-room-action-beta-living")).toHaveCount(0);
      await expect(page.getByTestId("share-saved-view-action-view-living-client")).toBeVisible();

      const desktopGeneration = Number(
        await desktopRoot.getAttribute("data-layout-generation")
      );
      await page.setViewportSize({ width: 390, height: 844 });
      const mobileRoot = await expectShareReady(page, {
        mode: "mobile",
        roomId: "room_living",
      });
      await expect(page.getByTestId("share-room-list-mobile")).toBeVisible();
      await expect(page.getByTestId("share-room-list-table")).toHaveCount(0);
      expect(Number(await mobileRoot.getAttribute("data-layout-generation"))).not.toBe(
        desktopGeneration
      );
      expect(await mobileRoot.getAttribute("data-projection-fingerprint")).toBe(fingerprint);
      expect(await mobileRoot.getAttribute("data-projection-content-identity")).toBe(
        contentIdentity
      );
      await expectNoPageOverflow(page);
      await expectTouchTargets(page);
      await expectUniqueResponsiveIdentities(page);
      const responsiveLifecycle = await expectPublicShareRootLifecycleUnique(page);
      expect(
        new Set(
          responsiveLifecycle.samples.flatMap((sample) =>
            sample.stableOwners.filter((owner) => owner.connected).map((owner) => owner.nodeId)
          )
        ).size,
        "responsive mode changes must preserve the root node identity"
      ).toBe(1);
    } finally {
      await cleanupBetaSeed(seed);
    }
  });

  test("multi-room selection, saved view, focus, and identity survive both resize directions", async ({
    page,
  }) => {
    const seed = await createBetaSeedDesign();
    try {
      await page.setViewportSize({ width: 1280, height: 800 });
      await page.goto(`/share/${seed.shareToken}`, { waitUntil: "domcontentloaded" });
      const root = await expectShareReady(page, {
        mode: "desktop",
        roomId: "beta-living",
      });
      await expect(page.getByTestId("share-room-navigation")).toHaveAttribute(
        "aria-label",
        "Shared rooms"
      );
      await expect(page.getByTestId("share-room-list-table")).toContainText("Living Room");
      await expect(page.getByTestId("share-room-list-table")).toContainText("Dining Room");
      await expect(page.getByTestId("share-room-list-table")).toContainText("Bedroom");

      const diningRoom = page.getByTestId("share-room-action-beta-dining");
      await diningRoom.click();
      await expectShareReady(page, { mode: "desktop", roomId: "beta-dining" });
      await expect(diningRoom).toHaveAttribute("aria-pressed", "true");
      const roomGeneration = Number(await root.getAttribute("data-layout-generation"));
      const diningView = page.getByTestId("share-saved-view-action-view-dining-plan");
      await diningView.click();
      await expect(diningView).toHaveAttribute("aria-pressed", "true");
      await expect(root).toHaveAttribute(
        "data-selected-saved-view-id",
        "view-dining-plan"
      );
      await expect(root).toHaveAttribute("data-layout-status", "ready");
      await expect
        .poll(async () => Number(await root.getAttribute("data-layout-generation")))
        .not.toBe(roomGeneration);
      await diningView.focus();
      await expect(diningView).toBeFocused();
      const desktopGeneration = Number(await root.getAttribute("data-layout-generation"));

      await page.setViewportSize({ width: 390, height: 844 });
      const mobileRoot = await expectShareReady(page, {
        mode: "mobile",
        roomId: "beta-dining",
      });
      await expect(diningView).toHaveAttribute("aria-pressed", "true");
      await expect(diningView).toBeFocused();
      await expect(page.getByTestId("share-room-list-mobile")).toContainText("Living Room");
      await expect(page.getByTestId("share-room-list-mobile")).toContainText("Dining Room");
      await expect(page.getByTestId("share-room-list-mobile")).toContainText("Bedroom");
      await expect(page.getByTestId("share-room-navigation").getByRole("button")).toHaveCount(3);
      expect(await mobileRoot.getAttribute("data-projection-fingerprint")).toBe(
        await root.getAttribute("data-projection-fingerprint")
      );
      expect(Number(await mobileRoot.getAttribute("data-layout-generation"))).not.toBe(
        desktopGeneration
      );

      const livingRoom = page.getByTestId("share-room-action-beta-living");
      const authoredFocusOrder = page.locator(
        [
          '[data-testid="share-copy-link"]',
          '[data-testid="share-room-action-beta-living"]',
          '[data-testid="share-saved-view-action-view-dining-plan"]',
        ].join(",")
      );
      expect(
        await authoredFocusOrder.evaluateAll((nodes) => ({
          identities: nodes.map((node) => node.getAttribute("data-testid")),
          tabIndexes: nodes.map((node) => (node as HTMLElement).tabIndex),
        }))
      ).toEqual({
        identities: [
          "share-copy-link",
          "share-room-action-beta-living",
          "share-saved-view-action-view-dining-plan",
        ],
        tabIndexes: [0, 0, 0],
      });
      for (const control of await authoredFocusOrder.all()) {
        await control.focus();
        await expect(control).toBeFocused();
      }
      await livingRoom.focus();
      await page.keyboard.press("ArrowRight");
      await expect(diningRoom).toBeFocused();
      expect(
        await diningRoom.evaluate((node) => {
          const style = getComputedStyle(node);
          return style.outlineStyle !== "none" && Number.parseFloat(style.outlineWidth) > 0;
        })
      ).toBe(true);

      const mobileGeneration = Number(await mobileRoot.getAttribute("data-layout-generation"));
      await page.setViewportSize({ width: 1280, height: 800 });
      const resizedRoot = await expectShareReady(page, {
        mode: "desktop",
        roomId: "beta-dining",
      });
      await expect(diningRoom).toBeFocused();
      expect(Number(await resizedRoot.getAttribute("data-layout-generation"))).not.toBe(
        mobileGeneration
      );
      await expectNoPageOverflow(page);
      await expectUniqueResponsiveIdentities(page);
      const responsiveLifecycle = await expectPublicShareRootLifecycleUnique(page);
      expect(
        new Set(
          responsiveLifecycle.samples.flatMap((sample) =>
            sample.stableOwners.filter((owner) => owner.connected).map((owner) => owner.nodeId)
          )
        ).size,
        "room, saved-view, and responsive changes must preserve the root node identity"
      ).toBe(1);
    } finally {
      await cleanupBetaSeed(seed);
    }
  });

  test("tablet and mobile-landscape layouts remain ready without overflow", async ({ page }) => {
    const seed = await createBetaSeedDesign();
    try {
      for (const viewport of [
        { width: 768, height: 1024, mode: "tablet" as const },
        { width: 667, height: 375, mode: "mobile" as const },
      ]) {
        await page.setViewportSize(viewport);
        await page.goto(`/share/${seed.shareToken}`, { waitUntil: "domcontentloaded" });
        await expectShareReady(page, { mode: viewport.mode, roomId: "beta-living" });
        await expectNoPageOverflow(page);
        await expectTouchTargets(page);
        await expectPublicShareRootLifecycleUnique(page, ["loading", "resolving", "ready"]);
      }
    } finally {
      await cleanupBetaSeed(seed);
    }
  });

  test("history, reload, invalid, and revoked states are distinct and deterministic", async ({
    page,
    browser,
  }) => {
    const seed = await createBetaSeedDesign();
    const secondSnapshot = buildBetaDesignSnapshot();
    secondSnapshot.title = "Beta Smoke Token B";
    const secondSeed = await createBetaSeedDesign({ snapshot: secondSnapshot });
    const emptySeed = await createBetaSeedDesign();
    const emptySnapshot = buildBetaDesignSnapshot();
    emptySnapshot.rooms = [
      {
        ...emptySnapshot.rooms[0],
        items: [],
        zones: [],
        savedViews: [],
        layoutVersions: [],
      },
    ];
    emptySnapshot.activeRoomId = emptySnapshot.rooms[0].id;
    const errorSeed = await createBetaSeedDesign();
    await getBetaPrismaClient().design.update({
      where: { id: emptySeed.designId },
      data: { snapshot: emptySnapshot as unknown as Prisma.InputJsonValue },
    });
    await getBetaPrismaClient().design.update({
      where: { id: errorSeed.designId },
      data: {
        snapshot: {
          ...buildBetaDesignSnapshot(),
          ownerInternalState: "private-route-error-fixture",
        } as unknown as Prisma.InputJsonValue,
      },
    });
    try {
      await page.setViewportSize({ width: 390, height: 844 });
      await page.goto(`/share/${seed.shareToken}`, { waitUntil: "domcontentloaded" });
      await expectShareReady(page, { mode: "mobile", roomId: "beta-living" });
      await page.getByTestId("share-room-action-beta-dining").click();
      await expectShareReady(page, { mode: "mobile", roomId: "beta-dining" });
      await page.getByTestId("share-shopping-list").click();
      await page.goBack();
      await expectShareReady(page, { mode: "mobile", roomId: "beta-dining" });
      await page.goForward();
      await expectShareReady(page, { mode: "mobile", roomId: "beta-dining" });

      await page.reload({ waitUntil: "domcontentloaded" });
      const reloadedRoot = await expectShareReady(page, {
        mode: "mobile",
        roomId: "beta-living",
      });
      const firstProjectionIdentity = await reloadedRoot.getAttribute(
        "data-projection-content-identity"
      );
      await expectPublicShareRootLifecycleUnique(page, ["loading", "resolving", "ready"]);
      await expect(page.getByTestId("save-design")).toHaveCount(0);
      await expect(page.getByTestId("command-undo")).toHaveCount(0);
      await expect(page.getByTestId("create-share")).toHaveCount(0);

      await page.getByTestId("share-room-action-beta-dining").click();
      await expectShareReady(page, { mode: "mobile", roomId: "beta-dining" });
      const staleDiningAction = await page
        .getByTestId("share-room-action-beta-dining")
        .elementHandle();
      expect(staleDiningAction).not.toBeNull();
      if (!staleDiningAction) throw new Error("Token A dining action was not retained");
      await page.evaluate(() => {
        (window as typeof window & { __publicShareDocumentMarker?: string })
          .__publicShareDocumentMarker = "token-a-document";
      });

      await navigateWithAppRouter(page, `/share/${secondSeed.shareToken}`);
      const secondRoot = await expectShareReady(page, { mode: "mobile", roomId: "beta-living" });
      expect(
        await page.evaluate(
          () =>
            (window as typeof window & { __publicShareDocumentMarker?: string })
              .__publicShareDocumentMarker
        ),
        "Token A to token B must use a same-document App Router transition"
      ).toBe("token-a-document");
      const secondProjectionIdentity = await secondRoot.getAttribute(
        "data-projection-content-identity"
      );
      expect(secondProjectionIdentity).not.toBe(firstProjectionIdentity);
      await expectPublicShareRootLifecycleUnique(page, ["loading", "resolving", "ready"]);
      const transitionUrl = page.url();
      expect(
        await staleDiningAction.evaluate((node) => {
          const wasConnected = node.isConnected;
          (node as HTMLElement).click();
          return wasConnected;
        }),
        "Token A controls must be disconnected before token B becomes actionable"
      ).toBe(false);
      expect(page.url()).toBe(transitionUrl);
      await expectShareReady(page, { mode: "mobile", roomId: "beta-living" });
      const tokenTransitionLifecycle = await expectPublicShareRootLifecycleUnique(page);
      const firstProjectionNodeIds = new Set(
        tokenTransitionLifecycle.samples.flatMap((sample) =>
          sample.stableOwners.flatMap((owner) =>
            owner.projectionIdentity === firstProjectionIdentity ? [owner.nodeId] : []
          )
        )
      );
      const secondProjectionNodeIds = new Set(
        tokenTransitionLifecycle.samples.flatMap((sample) =>
          sample.stableOwners.flatMap((owner) =>
            owner.projectionIdentity === secondProjectionIdentity ? [owner.nodeId] : []
          )
        )
      );
      expect(firstProjectionNodeIds.size).toBe(1);
      expect(secondProjectionNodeIds.size).toBe(1);
      expect([...secondProjectionNodeIds]).not.toEqual([...firstProjectionNodeIds]);

      await page.goBack({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("public-share-root")).toHaveAttribute(
        "data-projection-content-identity",
        firstProjectionIdentity ?? ""
      );
      await expectPublicShareRootLifecycleUnique(page);
      expect(
        await page.evaluate(
          () =>
            (window as typeof window & { __publicShareDocumentMarker?: string })
              .__publicShareDocumentMarker
        )
      ).toBe("token-a-document");
      await page.goForward({ waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("public-share-root")).toHaveAttribute(
        "data-projection-content-identity",
        secondProjectionIdentity ?? ""
      );
      await expectPublicShareRootLifecycleUnique(page);
      expect(
        await page.evaluate(
          () =>
            (window as typeof window & { __publicShareDocumentMarker?: string })
              .__publicShareDocumentMarker
        )
      ).toBe("token-a-document");

      await getBetaPrismaClient().design.update({
        where: { id: seed.designId },
        data: { shareEnabled: false },
      });
      await page.goto(`/share/${seed.shareToken}`, { waitUntil: "domcontentloaded" });
      await expectOnlyPublicShareInvalid(page);
      const disabledLifecycle = await expectPublicShareRootLifecycleUnique(
        page,
        ["loading", "invalid"]
      );

      await page.goto("/share/not-a-valid-public-token", { waitUntil: "domcontentloaded" });
      await expectOnlyPublicShareInvalid(page);
      const malformedLifecycle = await expectPublicShareRootLifecycleUnique(
        page,
        ["loading", "invalid"]
      );
      expect(malformedLifecycle.samples[0]?.documentId).not.toBe(
        disabledLifecycle.samples[0]?.documentId
      );

      await page.goto(`/share/${emptySeed.shareToken}`, { waitUntil: "domcontentloaded" });
      await expectShareReady(page, { mode: "mobile", roomId: "beta-living" });
      await expect(page.getByText("No products added to this shared design yet")).toBeVisible();
      await expect(page.getByTestId("share-saved-view-navigation")).toHaveCount(0);
      const emptyLifecycle = await expectPublicShareRootLifecycleUnique(
        page,
        ["loading", "resolving", "ready"]
      );
      expect(emptyLifecycle.samples[0]?.documentId).not.toBe(
        malformedLifecycle.samples[0]?.documentId
      );

      const browserObservableProjectionChecks: Array<Promise<boolean>> = [];
      const observeProjectionResponse = (response: import("@playwright/test").Response) => {
        const contentType = response.headers()["content-type"] ?? "";
        if (!/(?:text\/html|text\/x-component|application\/json)/.test(contentType)) return;
        browserObservableProjectionChecks.push(
          response.body().then((body) => {
            const text = body.toString("utf8");
            return (
              text.includes("ownerInternalState") ||
              text.includes("private-route-error-fixture")
            );
          })
        );
      };
      page.on("response", observeProjectionResponse);
      await page.goto(`/share/${errorSeed.shareToken}`, { waitUntil: "domcontentloaded" });
      await expect(page.getByTestId("public-share-error")).toHaveCount(1);
      await expect(page.getByTestId("public-share-error")).toBeVisible();
      await expect(page.getByTestId("public-share-error-retry")).toBeVisible();
      await expect(page.getByTestId("public-share-root")).toHaveCount(0);
      await expect(page.getByTestId("public-share-invalid")).toHaveCount(0);
      await expect(page.getByTestId("public-share-loading")).toHaveCount(0);
      await expect(page.getByRole("main")).toHaveCount(1);
      const errorLifecycle = await expectPublicShareRootLifecycleUnique(
        page,
        ["loading", "error"]
      );
      expect(errorLifecycle.samples[0]?.documentId).not.toBe(
        emptyLifecycle.samples[0]?.documentId
      );
      page.removeListener("response", observeProjectionResponse);
      expect(await Promise.all(browserObservableProjectionChecks)).not.toContain(true);
      expect(
        await page.evaluate(() => {
          const publicMarkup = document.documentElement.innerHTML;
          return (
            publicMarkup.includes("ownerInternalState") ||
            publicMarkup.includes("private-route-error-fixture")
          );
        })
      ).toBe(false);

      await expectPublicShareLifecycleNegativeControl(
        browser,
        page.url(),
        "same-id-duplicate"
      );
      await expectPublicShareLifecycleNegativeControl(
        browser,
        page.url(),
        "distinct-id-duplicate"
      );
      await expectPublicShareLifecycleNegativeControl(
        browser,
        page.url(),
        "hidden-distinct-id-duplicate"
      );
      await expectPublicShareLifecycleNegativeControl(browser, page.url(), "unmarked-main");
    } finally {
      await cleanupBetaSeed(seed);
      await cleanupBetaSeed(secondSeed);
      await cleanupBetaSeed(emptySeed);
      await cleanupBetaSeed(errorSeed);
    }
  });
});
