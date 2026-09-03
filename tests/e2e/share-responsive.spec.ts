import type { Locator, Page } from "@playwright/test";
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
  pageCacheRestored: boolean;
};

type PublicShareRootLifecycleSample = {
  atMs: number;
  event: "mutation" | "removed" | "pagehide" | "pageshow";
  documentId: string;
  documentGeneration: number;
  routePathname: string;
  routeIdentityDigest: string;
  pageCacheRestored: boolean;
  fallbackStates: string[];
  duplicateStableTestIds: string[];
  lifecycleOwnerCount: number;
  visibleLifecycleOwnerCount: number;
  accessibilityLifecycleOwnerCount: number;
  orphanShareIdentityCount: number;
  outsideCurrentOwnerActionableCount: number;
  fallbacks: PublicShareLifecycleNode[];
  roots: PublicShareLifecycleNode[];
};

type PublicShareRootLifecycleDiagnostics = {
  samples: PublicShareRootLifecycleSample[];
  sampleCount: number;
  truncated: boolean;
  maxConnectedRootCount: number;
  maxVisibleRootCount: number;
  maxLifecycleOwnerCount: number;
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
      maxConnectedRootCount: 0,
      maxVisibleRootCount: 0,
      maxLifecycleOwnerCount: 0,
      maxVisibleLifecycleOwnerCount: 0,
      maxAccessibilityLifecycleOwnerCount: 0,
      maxOutsideCurrentOwnerActionableCount: 0,
    };
    const nodeIds = new WeakMap<Element, number>();
    const nodeCreatedAt = new WeakMap<Element, number>();
    const lifecycleSelector = [
      '[data-testid="public-share-root"]',
      '[data-testid="public-share-loading"]',
      '[data-testid="public-share-client-resolving"]',
      '[data-testid="public-share-invalid"]',
      '[data-testid="public-share-error"]',
    ].join(",");
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
    const describeOwner = (node: Element | null) => {
      if (!node) return null;
      const testId = node.getAttribute("data-testid");
      const id = node.id;
      return `${node.tagName.toLowerCase()}${id ? `#${id}` : ""}${testId ? `[${testId}]` : ""}`;
    };
    const describeLifecycleNode = (
      lifecycleNode: Element,
      connected = lifecycleNode.isConnected,
      removedAtMs: number | null = null
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
      const ariaHidden = Boolean(ariaHiddenOwner || hiddenOwner);
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
          !hiddenOwner &&
          style.display !== "none" &&
          style.visibility !== "hidden" &&
          bounds.width > 0 &&
          bounds.height > 0,
        accessibilityActive: connected && !ariaHidden && !inert,
        ariaHidden,
        inert,
        actionableDescendantCount,
        focusWithin: connected && lifecycleNode.contains(document.activeElement),
        createdAtMs: createdAtMs(lifecycleNode),
        removedAtMs,
        documentId,
        documentGeneration,
        routePathname: routePathname(),
        routeIdentityDigest: routeIdentityDigest(),
        pageCacheRestored,
      };
    };
    const record = (
      event: PublicShareRootLifecycleSample["event"],
      removedLifecycleNodes: Element[] = []
    ) => {
      const fallbackOwners = Array.from(
        document.querySelectorAll(
          '[data-testid="public-share-loading"], [data-testid="public-share-client-resolving"], [data-testid="public-share-invalid"], [data-testid="public-share-error"]'
        )
      );
      const fallbackStates = fallbackOwners.flatMap((node) => {
        const state = node.getAttribute("data-layout-status");
        return state ? [state] : [];
      });
      const connectedRootElements = Array.from(
        document.querySelectorAll('[data-testid="public-share-root"]')
      );
      const removedAtMs = performance.now();
      const removedRoots = removedLifecycleNodes.filter(
        (node) => node.getAttribute("data-testid") === "public-share-root"
      );
      const removedFallbacks = removedLifecycleNodes.filter(
        (node) => node.getAttribute("data-testid") !== "public-share-root"
      );
      const roots = connectedRootElements.map((root) => describeLifecycleNode(root));
      roots.push(
        ...removedRoots.map((root) => describeLifecycleNode(root, false, removedAtMs))
      );
      const fallbacks = fallbackOwners.map((fallback) => describeLifecycleNode(fallback));
      fallbacks.push(
        ...removedFallbacks.map((fallback) =>
          describeLifecycleNode(fallback, false, removedAtMs)
        )
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
      const currentRoot = document.querySelector('[data-testid="public-share-root"]');
      const orphanShareIdentityCount = currentRoot
        ? Array.from(document.querySelectorAll('[data-testid^="share-"]')).filter(
            (node) => !currentRoot.contains(node)
          ).length
        : document.querySelectorAll('[data-testid^="share-"]').length;
      const currentOwners = [
        ...connectedRootElements.filter((root) => {
          const described = describeLifecycleNode(root);
          return !described.ariaHidden && !described.inert;
        }),
        ...fallbackOwners.filter((_, index) =>
          fallbacks[index]?.accessibilityActive
        ),
      ];
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
      const lifecycleOwnerCount = connectedRootElements.length + fallbackOwners.length;
      const visibleLifecycleOwnerCount =
        roots.filter((root) => root.connected && root.visible).length +
        fallbacks.filter((fallback) => fallback.connected && fallback.visible).length;
      const accessibilityLifecycleOwnerCount =
        roots.filter((root) => root.accessibilityActive).length +
        fallbacks.filter((fallback) => fallback.accessibilityActive).length;
      const signature = JSON.stringify({
        event,
        fallbackStates,
        duplicateStableTestIds,
        lifecycleOwnerCount,
        visibleLifecycleOwnerCount,
        accessibilityLifecycleOwnerCount,
        orphanShareIdentityCount,
        outsideCurrentOwnerActionableCount,
        fallbacks,
        roots,
      });
      if (event === "mutation" && signature === previousSignature) return;
      previousSignature = signature;
      diagnostics.sampleCount += 1;
      diagnostics.maxConnectedRootCount = Math.max(
        diagnostics.maxConnectedRootCount,
        connectedRootElements.length
      );
      diagnostics.maxVisibleRootCount = Math.max(
        diagnostics.maxVisibleRootCount,
        roots.filter((root) => root.visible).length
      );
      diagnostics.maxLifecycleOwnerCount = Math.max(
        diagnostics.maxLifecycleOwnerCount,
        lifecycleOwnerCount
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
          routePathname: routePathname(),
          routeIdentityDigest: routeIdentityDigest(),
          pageCacheRestored,
          fallbackStates,
          duplicateStableTestIds,
          lifecycleOwnerCount,
          visibleLifecycleOwnerCount,
          accessibilityLifecycleOwnerCount,
          orphanShareIdentityCount,
          outsideCurrentOwnerActionableCount,
          fallbacks,
          roots,
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
          if (removedNode.matches(lifecycleSelector)) {
            removedLifecycleNodes.push(removedNode);
          }
          removedLifecycleNodes.push(
            ...removedNode.querySelectorAll(lifecycleSelector)
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
        "data-layout-generation",
        "data-layout-mode",
        "data-layout-status",
        "data-selected-room-id",
        "data-selected-saved-view-id",
        "hidden",
        "inert",
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
      maxConnectedRootCount: 0,
      maxVisibleRootCount: 0,
      maxLifecycleOwnerCount: 0,
      maxVisibleLifecycleOwnerCount: 0,
      maxAccessibilityLifecycleOwnerCount: 0,
      maxOutsideCurrentOwnerActionableCount: 0,
    };
  });
}

async function expectPublicShareRootLifecycleUnique(
  page: Page,
  requiredStates: Array<PublicShareRootLifecycleSample["roots"][number]["state"]> = []
) {
  const diagnostics = await readPublicShareRootLifecycle(page);
  const lifecycle = diagnostics.samples;
  expect(lifecycle.length).toBeGreaterThan(0);
  expect(diagnostics.truncated, "lifecycle diagnostics must not truncate").toBe(false);
  expect(diagnostics.sampleCount).toBe(lifecycle.length);
  expect(
    diagnostics.maxConnectedRootCount,
    "public-share-root must never have more than one connected owner"
  ).toBeLessThanOrEqual(1);
  expect(
    diagnostics.maxVisibleRootCount,
    "public-share-root must never have more than one visible owner"
  ).toBeLessThanOrEqual(1);
  expect(
    diagnostics.maxLifecycleOwnerCount,
    "the public-share route must never connect more than one lifecycle owner"
  ).toBeLessThanOrEqual(1);
  expect(
    diagnostics.maxVisibleLifecycleOwnerCount,
    "route fallbacks and the resolved public-share owner must not be visible together"
  ).toBeLessThanOrEqual(1);
  expect(
    diagnostics.maxAccessibilityLifecycleOwnerCount,
    "route fallbacks and the resolved public-share owner must not share the accessibility tree"
  ).toBeLessThanOrEqual(1);
  expect(lifecycle.filter((sample) => sample.visibleLifecycleOwnerCount > 1)).toEqual([]);
  expect(lifecycle.filter((sample) => sample.accessibilityLifecycleOwnerCount > 1)).toEqual([]);
  expect(
    diagnostics.maxOutsideCurrentOwnerActionableCount,
    "public-share actions must belong to the current lifecycle owner"
  ).toBe(0);
  expect(
    lifecycle.flatMap((sample) => sample.roots).filter(
      (root) => root.focusWithin && (root.ariaHidden || root.inert || !root.connected)
    )
  ).toEqual([]);
  expect(lifecycle.flatMap((sample) => sample.duplicateStableTestIds)).toEqual([]);
  expect(lifecycle.filter((sample) => sample.orphanShareIdentityCount > 0)).toEqual([]);
  expect(lifecycle.filter((sample) => sample.outsideCurrentOwnerActionableCount > 0)).toEqual([]);
  const observedStates = lifecycle.map((sample) => [
    ...sample.fallbackStates,
    ...sample.roots.flatMap((root) => (root.connected && root.state ? [root.state] : [])),
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
            sample.roots.filter((root) => root.connected).map((root) => root.nodeId)
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
            sample.roots.filter((root) => root.connected).map((root) => root.nodeId)
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
          sample.roots.flatMap((root) =>
            root.projectionIdentity === firstProjectionIdentity ? [root.nodeId] : []
          )
        )
      );
      const secondProjectionNodeIds = new Set(
        tokenTransitionLifecycle.samples.flatMap((sample) =>
          sample.roots.flatMap((root) =>
            root.projectionIdentity === secondProjectionIdentity ? [root.nodeId] : []
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

      const duplicateContext = await browser.newContext();
      try {
        const duplicatePage = await duplicateContext.newPage();
        await installPublicShareRootLifecycleObserver(duplicatePage);
        await duplicatePage.goto(new URL("/share/not-a-valid-public-token", page.url()).href, {
          waitUntil: "domcontentloaded",
        });
        await expectOnlyPublicShareInvalid(duplicatePage);
        await duplicatePage.evaluate(() => {
          const owner = document.querySelector('[data-testid="public-share-invalid"]');
          if (!owner) throw new Error("Invalid owner was unavailable for negative injection");
          owner.after(owner.cloneNode(true));
        });
        const duplicateDiagnostics = await readPublicShareRootLifecycle(duplicatePage);
        expect(duplicateDiagnostics.maxLifecycleOwnerCount).toBe(2);
        expect(
          duplicateDiagnostics.samples.flatMap((sample) => sample.duplicateStableTestIds)
        ).toContain("public-share-invalid");
        await expect(
          expectPublicShareRootLifecycleUnique(duplicatePage)
        ).rejects.toThrow(/never connect more than one lifecycle owner/);
      } finally {
        await duplicateContext.close();
      }
    } finally {
      await cleanupBetaSeed(seed);
      await cleanupBetaSeed(secondSeed);
      await cleanupBetaSeed(emptySeed);
      await cleanupBetaSeed(errorSeed);
    }
  });
});
