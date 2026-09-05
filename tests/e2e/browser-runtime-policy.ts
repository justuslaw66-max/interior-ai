import type {
  ConsoleMessage,
  Frame,
  Page,
  Request,
  Response,
} from "@playwright/test";

type CountedAllowance = {
  minCount: number;
  maxCount: number;
  reason: string;
  observed: number;
};

type AllowedHttpFailure = CountedAllowance & {
  method: string;
  url: string;
  status: number;
};

type AllowedConsoleMessage = CountedAllowance & {
  type: "error" | "warning";
  text: string | RegExp;
};

type TrackedRequest = {
  epoch: number;
  frame: Frame | null;
  frameUrl: string | null;
  resourceType: string;
  startedAtMs: number;
};

type PendingNavigationCancellation = Omit<
  AcceptedNavigationCancellation,
  "replacementReadyAt"
>;

type PendingDevHmrNavigationCancellation = Omit<
  AcceptedDevHmrNavigationCancellation,
  "fullReloadWarningCount" | "replacementHmrConnectedAt" | "replacementReadyAt"
>;

type RequestSettlementWaiter = {
  cancelDeadline: () => void;
  reject: (cause: Error) => void;
  resolve: () => void;
};

type ActiveNavigationCancellation = {
  cancelDeadline: () => void;
  deadlineMs: number;
  eligibleRequests: Map<Request, TrackedRequest>;
  maxCancellations: number;
  openedAtMs: number;
  origin: string;
  outgoingEpoch: number;
  outgoingFrame: Frame;
  outgoingPageUrl: string;
  pending: PendingNavigationCancellation[];
  reason: string;
  token: symbol;
};

type ActiveDevHmrNavigationCancellation = {
  cancelDeadline: () => void;
  deadlineMs: number;
  eligibleRequests: Map<Request, TrackedRequest>;
  fullReloadWarningCount: number;
  maxCancellations: number;
  openedAtMs: number;
  origin: string;
  outgoingEpoch: number;
  outgoingFrame: Frame;
  outgoingPageUrl: string;
  pending: PendingDevHmrNavigationCancellation[];
  reason: string;
  replacementHmrConnectedAtMs: number | null;
  replacementHmrWaiters: Set<RequestSettlementWaiter>;
  token: symbol;
};

export type AcceptedNavigationCancellation = {
  errorText: "net::ERR_ABORTED";
  failureAt: string;
  frameUrl: string | null;
  method: "GET";
  navigationCancellationLimit: number;
  navigationDeadlineMs: number;
  navigationOpenedAt: string;
  navigationReason: string;
  outgoingDocument: true;
  outgoingNavigationEpoch: number;
  outgoingPageUrl: string;
  pageUrlAtFailure: string;
  pathname: string;
  query: string;
  replacementReadyAt: string;
  requestBeganBeforeNavigation: true;
  requestStartedAt: string;
  resourceType: "script";
  testTitle: string;
  url: string;
};

export type AcceptedDevHmrNavigationCancellation = {
  category: "dev-hmr-hot-update";
  errorText: "net::ERR_ABORTED";
  failureAt: string;
  frameUrl: string | null;
  fullReloadWarningCount: number;
  localDevelopmentOrigin: true;
  method: "GET";
  navigationCancellationLimit: number;
  navigationDeadlineMs: number;
  navigationOpenedAt: string;
  navigationReason: string;
  outgoingDocument: true;
  outgoingNavigationEpoch: number;
  outgoingPageUrl: string;
  pageUrlAtFailure: string;
  pathname: string;
  query: "";
  replacementHmrConnectedAt: string;
  replacementReadyAt: string;
  requestBeganBeforeNavigation: true;
  requestStartedAt: string;
  resourceType: "fetch" | "script";
  testTitle: string;
  url: string;
};

export type NavigationCancellationScope = {
  completeReplacementReady(): void;
  failReplacement(reason: string): void;
};

export type DevHmrNavigationCancellationScope = NavigationCancellationScope & {
  waitForReplacementHmrReady(): Promise<void>;
};

export type BrowserRuntimePolicyOptions = {
  now?: () => number;
  scheduleDeadline?: (
    callback: () => void,
    deadlineMs: number,
  ) => () => void;
};

export type BrowserRuntimePolicy = ReturnType<typeof installBrowserRuntimePolicy>;

const NEXT_STATIC_CHUNK_SCRIPT = /^\/_next\/static\/chunks\/(?:[^/]+\/)*[^/]+\.js$/;
const NEXT_DEV_HMR_UPDATE_JSON =
  /^\/_next\/static\/webpack\/[\da-f]{16}\.webpack\.hot-update\.json$/;
const NEXT_DEV_HMR_UPDATE_SCRIPT =
  /^\/_next\/static\/webpack\/webpack\.[\da-f]{16}\.hot-update\.js$/;
const NEXT_DEV_HMR_CONNECTED_MESSAGE = "[HMR] connected";
const NEXT_DEV_HMR_FULL_RELOAD_WARNING =
  "[Fast Refresh] performing full reload\n\n" +
  "Fast Refresh will perform a full reload when you edit a file that's imported by modules outside of the React rendering tree.\n" +
  "You might have a file which exports a React component but also exports a value that is imported by a non-React component file.\n" +
  "Consider migrating the non-React component export to a separate file and importing it into both files.\n\n" +
  "It is also possible the parent component of the component you edited is a class component, which disables Fast Refresh.\n" +
  "Fast Refresh requires at least one parent function component in your React tree.";
const DEFAULT_NAVIGATION_DEADLINE_MS = 45_000;

function systemScheduleDeadline(callback: () => void, deadlineMs: number) {
  const timer = setTimeout(callback, deadlineMs);
  return () => clearTimeout(timer);
}

function describeResponse(response: Response) {
  return `${response.request().method()} ${response.status()} ${response.url()}`;
}

function consoleAllowanceMatches(
  allowance: AllowedConsoleMessage,
  message: ConsoleMessage,
) {
  return allowance.type === message.type() &&
    (typeof allowance.text === "string"
      ? allowance.text === message.text()
      : allowance.text.test(message.text()));
}

function safeRequestFrame(request: Request): Frame | null {
  try {
    return request.frame();
  } catch {
    return null;
  }
}

function isLocalApplicationOrigin(origin: string) {
  const url = new URL(origin);
  return url.protocol === "http:" &&
    (url.hostname === "127.0.0.1" || url.hostname === "localhost");
}

function devHmrResourceType(
  pathname: string,
  resourceType: string,
): "fetch" | "script" | null {
  if (NEXT_DEV_HMR_UPDATE_JSON.test(pathname) && resourceType === "fetch") {
    return "fetch";
  }
  if (NEXT_DEV_HMR_UPDATE_SCRIPT.test(pathname) && resourceType === "script") {
    return "script";
  }
  return null;
}

function recordAllowedEvent<T extends CountedAllowance>(
  allowance: T,
  failures: string[],
  description: string,
) {
  allowance.observed += 1;
  if (allowance.observed > allowance.maxCount) {
    failures.push(`Allowance exceeded (${allowance.reason}): ${description}`);
  }
}

export function installBrowserRuntimePolicy(
  page: Page,
  testTitle: string,
  options: BrowserRuntimePolicyOptions = {},
) {
  const now = options.now ?? Date.now;
  const scheduleDeadline = options.scheduleDeadline ?? systemScheduleDeadline;
  const failures: string[] = [];
  const allowedHttpFailures: AllowedHttpFailure[] = [];
  const allowedConsoleMessages: AllowedConsoleMessage[] = [];
  const trackedRequests = new Map<Request, TrackedRequest>();
  const acceptedNavigationCancellations: AcceptedNavigationCancellation[] = [];
  const acceptedDevHmrNavigationCancellations:
    AcceptedDevHmrNavigationCancellation[] = [];
  const requestSettlementWaiters = new Set<RequestSettlementWaiter>();
  let navigationEpoch = 0;
  let activeNavigation: ActiveNavigationCancellation | null = null;
  let activeDevHmrNavigation: ActiveDevHmrNavigationCancellation | null = null;

  const settleRequestWaitersIfReady = () => {
    if (trackedRequests.size > 0) return;
    for (const waiter of requestSettlementWaiters) {
      waiter.cancelDeadline();
      waiter.resolve();
    }
    requestSettlementWaiters.clear();
  };

  const closeNavigation = (
    navigation: ActiveNavigationCancellation,
    replacementReady: boolean,
    failureReason?: string,
  ) => {
    if (activeNavigation?.token !== navigation.token) return;
    navigation.cancelDeadline();
    activeNavigation = null;
    if (!replacementReady) {
      failures.push(
        `Intentional navigation did not reach its replacement readiness boundary ` +
          `(${navigation.reason}): ${failureReason ?? "unknown failure"}`,
      );
      return;
    }
    if (navigationEpoch <= navigation.outgoingEpoch) {
      failures.push(
        `Intentional navigation did not create a replacement main-frame epoch ` +
          `(${navigation.reason}).`,
      );
      return;
    }
    const replacementReadyAt = new Date(now()).toISOString();
    acceptedNavigationCancellations.push(...navigation.pending.map((event) => ({
      ...event,
      replacementReadyAt,
    })));
  };

  const closeDevHmrNavigation = (
    navigation: ActiveDevHmrNavigationCancellation,
    replacementReady: boolean,
    failureReason?: string,
  ) => {
    if (activeDevHmrNavigation?.token !== navigation.token) return;
    navigation.cancelDeadline();
    activeDevHmrNavigation = null;
    const rejectWaiters = (reason: string) => {
      for (const waiter of navigation.replacementHmrWaiters) {
        waiter.reject(new Error(reason));
      }
      navigation.replacementHmrWaiters.clear();
    };
    if (!replacementReady) {
      const reason =
        `Development HMR navigation did not reach replacement readiness ` +
        `(${navigation.reason}): ${failureReason ?? "unknown failure"}`;
      failures.push(reason);
      rejectWaiters(reason);
      return;
    }
    if (navigationEpoch <= navigation.outgoingEpoch) {
      const reason =
        `Development HMR navigation did not create a replacement main-frame epoch ` +
        `(${navigation.reason}).`;
      failures.push(reason);
      rejectWaiters(reason);
      return;
    }
    if (navigation.replacementHmrConnectedAtMs === null) {
      const reason =
        `Development HMR navigation did not establish a healthy replacement HMR connection ` +
        `(${navigation.reason}).`;
      failures.push(reason);
      rejectWaiters(reason);
      return;
    }
    if (navigation.fullReloadWarningCount > 0 && navigation.pending.length === 0) {
      const reason =
        `Development HMR full-reload warning had no matching outgoing hot-update cancellation ` +
        `(${navigation.reason}).`;
      failures.push(reason);
      rejectWaiters(reason);
      return;
    }
    const replacementReadyAt = new Date(now()).toISOString();
    const replacementHmrConnectedAt = new Date(
      navigation.replacementHmrConnectedAtMs,
    ).toISOString();
    acceptedDevHmrNavigationCancellations.push(...navigation.pending.map(
      (event) => ({
        ...event,
        fullReloadWarningCount: navigation.fullReloadWarningCount,
        replacementHmrConnectedAt,
        replacementReadyAt,
      }),
    ));
    for (const waiter of navigation.replacementHmrWaiters) waiter.resolve();
    navigation.replacementHmrWaiters.clear();
  };

  const recordRequestFailure = (request: Request) => {
    const tracked = trackedRequests.get(request);
    trackedRequests.delete(request);
    const navigation = activeNavigation;
    const devHmrNavigation = activeDevHmrNavigation;
    const requestUrl = new URL(request.url());
    const isStaticChunkEligible = Boolean(
      navigation &&
      tracked &&
      navigation.eligibleRequests.has(request) &&
      tracked.startedAtMs <= navigation.openedAtMs &&
      tracked.epoch === navigation.outgoingEpoch &&
      tracked.frame === navigation.outgoingFrame &&
      request.method() === "GET" &&
      requestUrl.origin === navigation.origin &&
      isLocalApplicationOrigin(navigation.origin) &&
      tracked.resourceType === "script" &&
      NEXT_STATIC_CHUNK_SCRIPT.test(requestUrl.pathname) &&
      request.failure()?.errorText === "net::ERR_ABORTED"
    );
    if (navigation && tracked && isStaticChunkEligible) {
      if (navigation.pending.length >= navigation.maxCancellations) {
        failures.push(
          `Intentional navigation cancellation bound exceeded ` +
            `(${navigation.reason}, max ${navigation.maxCancellations}): ` +
            `${request.method()} ${request.url()} (${request.failure()?.errorText})`,
        );
        settleRequestWaitersIfReady();
        return;
      }
      navigation.pending.push({
        errorText: "net::ERR_ABORTED",
        failureAt: new Date(now()).toISOString(),
        frameUrl: tracked.frameUrl,
        method: "GET",
        navigationCancellationLimit: navigation.maxCancellations,
        navigationDeadlineMs: navigation.deadlineMs,
        navigationOpenedAt: new Date(navigation.openedAtMs).toISOString(),
        navigationReason: navigation.reason,
        outgoingDocument: true,
        outgoingNavigationEpoch: navigation.outgoingEpoch,
        outgoingPageUrl: navigation.outgoingPageUrl,
        pageUrlAtFailure: page.url(),
        pathname: requestUrl.pathname,
        query: requestUrl.search,
        requestBeganBeforeNavigation: true,
        requestStartedAt: new Date(tracked.startedAtMs).toISOString(),
        resourceType: "script",
        testTitle,
        url: request.url(),
      });
      settleRequestWaitersIfReady();
      return;
    }

    const hmrResourceType = tracked
      ? devHmrResourceType(requestUrl.pathname, tracked.resourceType)
      : null;
    const isDevHmrEligible = Boolean(
      devHmrNavigation &&
      tracked &&
      hmrResourceType &&
      devHmrNavigation.eligibleRequests.has(request) &&
      tracked.startedAtMs <= devHmrNavigation.openedAtMs &&
      tracked.epoch === devHmrNavigation.outgoingEpoch &&
      tracked.frame === devHmrNavigation.outgoingFrame &&
      request.method() === "GET" &&
      requestUrl.origin === devHmrNavigation.origin &&
      requestUrl.search === "" &&
      isLocalApplicationOrigin(devHmrNavigation.origin) &&
      request.failure()?.errorText === "net::ERR_ABORTED"
    );
    if (devHmrNavigation && tracked && hmrResourceType && isDevHmrEligible) {
      if (devHmrNavigation.pending.length >= devHmrNavigation.maxCancellations) {
        failures.push(
          `Development HMR navigation cancellation bound exceeded ` +
            `(${devHmrNavigation.reason}, max ${devHmrNavigation.maxCancellations}): ` +
            `${request.method()} ${request.url()} (${request.failure()?.errorText})`,
        );
        settleRequestWaitersIfReady();
        return;
      }
      devHmrNavigation.pending.push({
        category: "dev-hmr-hot-update",
        errorText: "net::ERR_ABORTED",
        failureAt: new Date(now()).toISOString(),
        frameUrl: tracked.frameUrl,
        localDevelopmentOrigin: true,
        method: "GET",
        navigationCancellationLimit: devHmrNavigation.maxCancellations,
        navigationDeadlineMs: devHmrNavigation.deadlineMs,
        navigationOpenedAt: new Date(devHmrNavigation.openedAtMs).toISOString(),
        navigationReason: devHmrNavigation.reason,
        outgoingDocument: true,
        outgoingNavigationEpoch: devHmrNavigation.outgoingEpoch,
        outgoingPageUrl: devHmrNavigation.outgoingPageUrl,
        pageUrlAtFailure: page.url(),
        pathname: requestUrl.pathname,
        query: "",
        requestBeganBeforeNavigation: true,
        requestStartedAt: new Date(tracked.startedAtMs).toISOString(),
        resourceType: hmrResourceType,
        testTitle,
        url: request.url(),
      });
      settleRequestWaitersIfReady();
      return;
    }

    failures.push(
      `requestfailed: ${request.method()} ${request.url()} ` +
        `(${request.failure()?.errorText ?? "unknown"})`,
    );
    settleRequestWaitersIfReady();
  };

  page.on("pageerror", (error) => {
    failures.push(`pageerror: ${error.message}`);
  });
  page.on("console", (message) => {
    const devHmrNavigation = activeDevHmrNavigation;
    if (
      message.type() === "log" &&
      message.text() === NEXT_DEV_HMR_CONNECTED_MESSAGE &&
      devHmrNavigation &&
      navigationEpoch > devHmrNavigation.outgoingEpoch
    ) {
      devHmrNavigation.replacementHmrConnectedAtMs ??= now();
      for (const waiter of devHmrNavigation.replacementHmrWaiters) {
        waiter.resolve();
      }
      devHmrNavigation.replacementHmrWaiters.clear();
      return;
    }
    if (
      message.type() === "warning" &&
      message.text() === NEXT_DEV_HMR_FULL_RELOAD_WARNING &&
      devHmrNavigation &&
      navigationEpoch > devHmrNavigation.outgoingEpoch
    ) {
      devHmrNavigation.fullReloadWarningCount += 1;
      if (devHmrNavigation.fullReloadWarningCount > 1) {
        failures.push(
          `Development HMR full-reload warning bound exceeded ` +
            `(${devHmrNavigation.reason}, max 1).`,
        );
      }
      return;
    }
    if (message.type() !== "error" && message.type() !== "warning") return;
    const allowance = allowedConsoleMessages.find((candidate) =>
      consoleAllowanceMatches(candidate, message)
    );
    if (allowance) {
      recordAllowedEvent(
        allowance,
        failures,
        `console.${message.type()}: ${message.text()}`,
      );
      return;
    }
    failures.push(`console.${message.type()}: ${message.text()}`);
  });
  page.on("framenavigated", (frame) => {
    if (frame === page.mainFrame()) navigationEpoch += 1;
  });
  page.on("request", (request) => {
    const frame = safeRequestFrame(request);
    trackedRequests.set(request, {
      epoch: navigationEpoch,
      frame,
      frameUrl: frame?.url() ?? null,
      resourceType: request.resourceType(),
      startedAtMs: now(),
    });
  });
  page.on("requestfinished", (request) => {
    trackedRequests.delete(request);
    settleRequestWaitersIfReady();
  });
  page.on("requestfailed", (request) => {
    recordRequestFailure(request);
  });
  page.on("response", (response) => {
    if (response.status() < 400) return;
    const allowance = allowedHttpFailures.find((candidate) =>
      candidate.method === response.request().method() &&
      candidate.status === response.status() &&
      candidate.url === response.url()
    );
    if (!allowance) {
      failures.push(`unexpected HTTP response: ${describeResponse(response)}`);
      return;
    }
    recordAllowedEvent(allowance, failures, describeResponse(response));
  });

  return {
    allowHttpFailure(input: Omit<AllowedHttpFailure, "observed">) {
      allowedHttpFailures.push({ ...input, observed: 0 });
    },
    allowConsoleMessage(input: Omit<AllowedConsoleMessage, "observed">) {
      allowedConsoleMessages.push({ ...input, observed: 0 });
    },
    beginNavigationCancellation(input: {
      reason: string;
      maxCancellations: number;
      deadlineMs?: number;
    }): NavigationCancellationScope {
      if (activeNavigation || activeDevHmrNavigation) {
        const activeReason = activeNavigation?.reason ?? activeDevHmrNavigation?.reason;
        throw new Error(
          `Cannot begin intentional navigation "${input.reason}" while ` +
            `"${activeReason}" is active.`,
        );
      }
      if (!input.reason.trim()) {
        throw new Error("Intentional navigation requires a reason.");
      }
      if (!Number.isInteger(input.maxCancellations) || input.maxCancellations < 0) {
        throw new Error("Intentional navigation requires a non-negative cancellation bound.");
      }
      const deadlineMs = input.deadlineMs ?? DEFAULT_NAVIGATION_DEADLINE_MS;
      if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
        throw new Error("Intentional navigation requires a positive deadline.");
      }
      const outgoingFrame = page.mainFrame();
      const outgoingPageUrl = page.url();
      const origin = new URL(outgoingPageUrl).origin;
      const openedAtMs = now();
      const token = Symbol(input.reason);
      const eligibleRequests = new Map(
        [...trackedRequests].filter(([, tracked]) =>
          tracked.epoch === navigationEpoch && tracked.frame === outgoingFrame
        ),
      );
      const navigation: ActiveNavigationCancellation = {
        cancelDeadline: () => {},
        deadlineMs,
        eligibleRequests,
        maxCancellations: input.maxCancellations,
        openedAtMs,
        origin,
        outgoingEpoch: navigationEpoch,
        outgoingFrame,
        outgoingPageUrl,
        pending: [],
        reason: input.reason,
        token,
      };
      navigation.cancelDeadline = scheduleDeadline(() => {
        closeNavigation(
          navigation,
          false,
          `deadline exceeded after ${deadlineMs} ms`,
        );
      }, deadlineMs);
      activeNavigation = navigation;
      return {
        completeReplacementReady() {
          closeNavigation(navigation, true);
        },
        failReplacement(reason: string) {
          closeNavigation(navigation, false, reason);
        },
      };
    },
    beginDevHmrNavigationCancellation(input: {
      reason: string;
      maxCancellations: number;
      deadlineMs?: number;
    }): DevHmrNavigationCancellationScope {
      if (activeNavigation || activeDevHmrNavigation) {
        const activeReason = activeNavigation?.reason ?? activeDevHmrNavigation?.reason;
        throw new Error(
          `Cannot begin development HMR navigation "${input.reason}" while ` +
            `"${activeReason}" is active.`,
        );
      }
      if (!input.reason.trim()) {
        throw new Error("Development HMR navigation requires a reason.");
      }
      if (!Number.isInteger(input.maxCancellations) || input.maxCancellations < 0) {
        throw new Error(
          "Development HMR navigation requires a non-negative cancellation bound.",
        );
      }
      const deadlineMs = input.deadlineMs ?? DEFAULT_NAVIGATION_DEADLINE_MS;
      if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
        throw new Error("Development HMR navigation requires a positive deadline.");
      }
      const outgoingFrame = page.mainFrame();
      const outgoingPageUrl = page.url();
      const origin = new URL(outgoingPageUrl).origin;
      if (!isLocalApplicationOrigin(origin)) {
        throw new Error(
          "Development HMR navigation requires a local HTTP application origin.",
        );
      }
      const openedAtMs = now();
      const token = Symbol(input.reason);
      const eligibleRequests = new Map(
        [...trackedRequests].filter(([, tracked]) =>
          tracked.epoch === navigationEpoch && tracked.frame === outgoingFrame
        ),
      );
      const navigation: ActiveDevHmrNavigationCancellation = {
        cancelDeadline: () => {},
        deadlineMs,
        eligibleRequests,
        fullReloadWarningCount: 0,
        maxCancellations: input.maxCancellations,
        openedAtMs,
        origin,
        outgoingEpoch: navigationEpoch,
        outgoingFrame,
        outgoingPageUrl,
        pending: [],
        reason: input.reason,
        replacementHmrConnectedAtMs: null,
        replacementHmrWaiters: new Set(),
        token,
      };
      navigation.cancelDeadline = scheduleDeadline(() => {
        closeDevHmrNavigation(
          navigation,
          false,
          `deadline exceeded after ${deadlineMs} ms`,
        );
      }, deadlineMs);
      activeDevHmrNavigation = navigation;
      return {
        completeReplacementReady() {
          closeDevHmrNavigation(navigation, true);
        },
        failReplacement(reason: string) {
          closeDevHmrNavigation(navigation, false, reason);
        },
        waitForReplacementHmrReady() {
          if (navigation.replacementHmrConnectedAtMs !== null) {
            return Promise.resolve();
          }
          if (activeDevHmrNavigation?.token !== navigation.token) {
            return Promise.reject(new Error(
              `Development HMR navigation is no longer active (${navigation.reason}).`,
            ));
          }
          return new Promise<void>((resolve, reject) => {
            navigation.replacementHmrWaiters.add({
              cancelDeadline: () => {},
              reject,
              resolve,
            });
          });
        },
      };
    },
    getAcceptedNavigationCancellations() {
      return acceptedNavigationCancellations.map((event) => ({ ...event }));
    },
    getAcceptedDevHmrNavigationCancellations() {
      return acceptedDevHmrNavigationCancellations.map((event) => ({ ...event }));
    },
    waitForCurrentRequestsToSettle(input: {
      reason: string;
      deadlineMs?: number;
    }) {
      const deadlineMs = input.deadlineMs ?? DEFAULT_NAVIGATION_DEADLINE_MS;
      if (!input.reason.trim()) {
        return Promise.reject(new Error("Request settlement requires a reason."));
      }
      if (!Number.isFinite(deadlineMs) || deadlineMs <= 0) {
        return Promise.reject(new Error("Request settlement requires a positive deadline."));
      }
      if (trackedRequests.size === 0) return Promise.resolve();
      return new Promise<void>((resolve, reject) => {
        const waiter: RequestSettlementWaiter = {
          cancelDeadline: () => {},
          reject,
          resolve,
        };
        waiter.cancelDeadline = scheduleDeadline(() => {
          requestSettlementWaiters.delete(waiter);
          const pending = [...trackedRequests.keys()]
            .map((request) => `${request.method()} ${request.url()}`)
            .join(", ");
          reject(new Error(
            `Requests did not settle before ${input.reason} within ${deadlineMs} ms: ` +
              `${pending || "unknown pending request"}.`,
          ));
        }, deadlineMs);
        requestSettlementWaiters.add(waiter);
      });
    },
    assertSatisfied() {
      if (activeNavigation) {
        closeNavigation(
          activeNavigation,
          false,
          "policy assertion ran before replacement readiness was confirmed",
        );
      }
      if (activeDevHmrNavigation) {
        closeDevHmrNavigation(
          activeDevHmrNavigation,
          false,
          "policy assertion ran before replacement HMR readiness was confirmed",
        );
      }
      for (const allowance of [
        ...allowedHttpFailures,
        ...allowedConsoleMessages,
      ]) {
        if (allowance.observed < allowance.minCount) {
          failures.push(
            `Expected allowed event not observed (${allowance.reason}).`,
          );
        }
      }
      if (failures.length === 0) return;
      throw new Error(
        `Strict browser runtime policy failed for ${testTitle}:\n` +
          failures.map((failure) => `- ${failure}`).join("\n"),
      );
    },
  };
}

export function allowKnownChromiumDesignRuntimeEvents(
  policy: BrowserRuntimePolicy,
  _baseUrl?: string,
) {
  policy.allowConsoleMessage({
    type: "warning",
    text: /^\[\.WebGL-0x[\da-f]+\]GL Driver Message \(OpenGL, Performance, GL_CLOSE_PATH_NV, High\): GPU stall due to ReadPixels(?: \(this message will no longer repeat\))?$/,
    minCount: 0,
    maxCount: 4,
    reason: "Chromium's software WebGL driver emits this bounded ReadPixels diagnostic",
  });
}
