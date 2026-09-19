import assert from "node:assert/strict";

import type { Page, Request } from "@playwright/test";

import {
  installBrowserRuntimePolicy,
  type BrowserRuntimePolicy,
  type BrowserRuntimePolicyOptions,
} from "../tests/e2e/browser-runtime-policy";

type EventListener = (event: unknown) => void;

class FakeFrame {
  constructor(private currentUrl: string) {}

  setUrl(url: string) {
    this.currentUrl = url;
  }

  url() {
    return this.currentUrl;
  }
}

class FakePage {
  private readonly frame = new FakeFrame("http://127.0.0.1:43123/design");
  private readonly listeners = new Map<string, EventListener[]>();
  private currentUrl = this.frame.url();

  emit(event: string, payload: unknown) {
    for (const listener of this.listeners.get(event) ?? []) listener(payload);
  }

  mainFrame() {
    return this.frame;
  }

  navigate(url: string) {
    this.currentUrl = url;
    this.frame.setUrl(url);
    this.emit("framenavigated", this.frame);
  }

  on(event: string, listener: EventListener) {
    const listeners = this.listeners.get(event) ?? [];
    listeners.push(listener);
    this.listeners.set(event, listeners);
  }

  url() {
    return this.currentUrl;
  }
}

function emitConsole(
  page: FakePage,
  type: "error" | "log" | "warning",
  message: string,
) {
  page.emit("console", {
    text: () => message,
    type: () => type,
  });
}

function createClock() {
  let nowMs = Date.parse("2026-09-04T00:00:00.000Z");
  let deadline: (() => void) | null = null;
  const options: BrowserRuntimePolicyOptions = {
    now: () => nowMs,
    scheduleDeadline(callback) {
      deadline = callback;
      return () => {
        if (deadline === callback) deadline = null;
      };
    },
  };
  return {
    advance(milliseconds = 1) {
      nowMs += milliseconds;
    },
    options,
    triggerDeadline() {
      const callback = deadline;
      deadline = null;
      assert.ok(callback, "a navigation deadline should be scheduled");
      callback();
    },
  };
}

function createFixture(testTitle = "policy regression") {
  const page = new FakePage();
  const clock = createClock();
  // The fake implements exactly the Page event/url/mainFrame surface consumed
  // by installBrowserRuntimePolicy; this is the single test-adapter boundary.
  const policy = installBrowserRuntimePolicy(
    page as unknown as Page,
    testTitle,
    clock.options,
  );
  return { clock, page, policy };
}

function createRequest(
  page: FakePage,
  input: {
    errorText?: string;
    method?: string;
    resourceType?: string;
    url?: string;
  } = {},
) {
  const request = {
    failure: () => ({ errorText: input.errorText ?? "net::ERR_ABORTED" }),
    frame: () => page.mainFrame(),
    method: () => input.method ?? "GET",
    resourceType: () => input.resourceType ?? "script",
    url: () => input.url ??
      "http://127.0.0.1:43123/_next/static/chunks/app/design/page.js",
  };
  // Request is intentionally represented by only the methods the policy reads.
  return request as unknown as Request;
}

function assertPolicyRejected(
  policy: BrowserRuntimePolicy,
  expected: RegExp,
) {
  assert.throws(() => policy.assertSatisfied(), expected);
}

{
  const { clock, page, policy } = createFixture("exact test identity");
  const request = createRequest(page, {
    url: "http://127.0.0.1:43123/_next/static/chunks/main-app.js?v=123",
  });
  page.emit("request", request);
  clock.advance(10);
  const navigation = policy.beginNavigationCancellation({
    reason: "authenticated bootstrap reload",
    maxCancellations: 2,
  });
  page.navigate("http://127.0.0.1:43123/design?authenticated=1");
  clock.advance(2);
  page.emit("requestfailed", request);
  const replacementRequest = createRequest(page, {
    url: "http://127.0.0.1:43123/_next/static/chunks/main-app.js?v=123",
  });
  page.emit("request", replacementRequest);
  clock.advance(2);
  page.emit("requestfinished", replacementRequest);
  clock.advance(3);
  navigation.completeReplacementReady();
  policy.assertSatisfied();
  assert.deepEqual(policy.getAcceptedNavigationCancellations(), [{
    errorText: "net::ERR_ABORTED",
    failureAt: "2026-09-04T00:00:00.012Z",
    frameUrl: "http://127.0.0.1:43123/design",
    method: "GET",
    navigationCancellationLimit: 2,
    navigationDeadlineMs: 45_000,
    navigationOpenedAt: "2026-09-04T00:00:00.010Z",
    navigationReason: "authenticated bootstrap reload",
    outgoingDocument: true,
    outgoingNavigationEpoch: 0,
    outgoingPageUrl: "http://127.0.0.1:43123/design",
    pageUrlAtFailure: "http://127.0.0.1:43123/design?authenticated=1",
    pathname: "/_next/static/chunks/main-app.js",
    query: "?v=123",
    replacementReadyAt: "2026-09-04T00:00:00.017Z",
    requestBeganBeforeNavigation: true,
    requestStartedAt: "2026-09-04T00:00:00.000Z",
    resourceType: "script",
    testTitle: "exact test identity",
    url: "http://127.0.0.1:43123/_next/static/chunks/main-app.js?v=123",
  }]);
}

{
  const { page, policy } = createFixture();
  const request = createRequest(page);
  page.emit("request", request);
  const navigation = policy.beginNavigationCancellation({
    reason: "no replacement epoch",
    maxCancellations: 1,
  });
  page.emit("requestfailed", request);
  navigation.completeReplacementReady();
  assertPolicyRejected(policy, /did not create a replacement main-frame epoch/);
}

{
  const { page, policy } = createFixture();
  const request = createRequest(page);
  page.emit("request", request);
  page.emit("requestfailed", request);
  assertPolicyRejected(policy, /requestfailed: GET .*net::ERR_ABORTED/);
}

{
  const { page, policy } = createFixture();
  const navigation = policy.beginNavigationCancellation({
    reason: "reload",
    maxCancellations: 2,
  });
  const request = createRequest(page);
  page.emit("request", request);
  page.emit("requestfailed", request);
  navigation.completeReplacementReady();
  assertPolicyRejected(policy, /requestfailed: GET .*net::ERR_ABORTED/);
}

for (const [label, requestInput] of [
  ["non-Next application script", {
    url: "http://127.0.0.1:43123/scripts/application.js",
  }],
  ["application API", {
    resourceType: "fetch",
    url: "http://127.0.0.1:43123/api/designs/design-1",
  }],
  ["auth request", {
    resourceType: "fetch",
    url: "http://127.0.0.1:43123/api/auth/session",
  }],
  ["document request", {
    resourceType: "document",
  }],
  ["non-GET request", {
    method: "POST",
  }],
  ["different error", {
    errorText: "net::ERR_CONNECTION_RESET",
  }],
] as const) {
  const { page, policy } = createFixture(label);
  const request = createRequest(page, requestInput);
  page.emit("request", request);
  const navigation = policy.beginNavigationCancellation({
    reason: "reload",
    maxCancellations: 2,
  });
  page.emit("requestfailed", request);
  navigation.completeReplacementReady();
  assertPolicyRejected(policy, /requestfailed:/);
}

{
  const { page, policy } = createFixture();
  const request = createRequest(page);
  page.emit("request", request);
  const navigation = policy.beginNavigationCancellation({
    reason: "reload",
    maxCancellations: 2,
  });
  navigation.completeReplacementReady();
  page.emit("requestfailed", request);
  assertPolicyRejected(policy, /requestfailed: GET .*net::ERR_ABORTED/);
}

{
  const { page, policy } = createFixture();
  const first = createRequest(page, {
    url: "http://127.0.0.1:43123/_next/static/chunks/main-app.js",
  });
  const second = createRequest(page);
  page.emit("request", first);
  page.emit("request", second);
  const navigation = policy.beginNavigationCancellation({
    reason: "reload",
    maxCancellations: 1,
  });
  page.emit("requestfailed", first);
  page.emit("requestfailed", second);
  navigation.completeReplacementReady();
  assertPolicyRejected(policy, /cancellation bound exceeded.*max 1/);
}

{
  const { clock, page, policy } = createFixture();
  const request = createRequest(page);
  page.emit("request", request);
  policy.beginNavigationCancellation({
    reason: "replacement never ready",
    maxCancellations: 2,
    deadlineMs: 25,
  });
  page.emit("requestfailed", request);
  clock.triggerDeadline();
  assertPolicyRejected(
    policy,
    /did not reach its replacement readiness boundary.*deadline exceeded after 25 ms/,
  );
  assert.equal(policy.getAcceptedNavigationCancellations().length, 0);
}

const fullHmrReloadWarning =
  "[Fast Refresh] performing full reload\n\n" +
  "Fast Refresh will perform a full reload when you edit a file that's imported by modules outside of the React rendering tree.\n" +
  "You might have a file which exports a React component but also exports a value that is imported by a non-React component file.\n" +
  "Consider migrating the non-React component export to a separate file and importing it into both files.\n\n" +
  "It is also possible the parent component of the component you edited is a class component, which disables Fast Refresh.\n" +
  "Fast Refresh requires at least one parent function component in your React tree.";

async function runAsyncChecks() {
  for (const withRequest of [false, true]) {
    const { page, policy } = createFixture(
      `request settlement input validation (${withRequest ? "active" : "idle"})`,
    );
    if (withRequest) page.emit("request", createRequest(page));
    await assert.rejects(
      policy.waitForCurrentRequestsToSettle({ reason: "  " }),
      /Request settlement requires a reason/,
    );
    await assert.rejects(
      policy.waitForCurrentRequestsToSettle({
        reason: "consumer reload",
        deadlineMs: 0,
      }),
      /Request settlement requires a positive deadline/,
    );
  }

  {
    const { page, policy } = createFixture("request settlement");
    const authRequest = createRequest(page, {
      resourceType: "fetch",
      url: "http://127.0.0.1:43123/api/auth/session",
    });
    page.emit("request", authRequest);
    let settled = false;
    const settlement = policy.waitForCurrentRequestsToSettle({
      reason: "consumer reload",
    }).then(() => {
      settled = true;
    });
    await Promise.resolve();
    assert.equal(settled, false, "an in-flight auth request must block reload readiness");
    page.emit("requestfinished", authRequest);
    await settlement;
    assert.equal(settled, true);
    policy.assertSatisfied();
  }

  {
    const { clock, page, policy } = createFixture("exact dev HMR JSON");
    const request = createRequest(page, {
      resourceType: "fetch",
      url: "http://127.0.0.1:43123/_next/static/webpack/58c9e141fdc1733c.webpack.hot-update.json",
    });
    page.emit("request", request);
    clock.advance(10);
    const navigation = policy.beginDevHmrNavigationCancellation({
      reason: "consumer display-unit reload",
      maxCancellations: 1,
    });
    page.navigate("http://127.0.0.1:43123/design?replacement=1");
    clock.advance(2);
    page.emit("requestfailed", request);
    emitConsole(page, "warning", fullHmrReloadWarning);
    emitConsole(page, "log", "[HMR] connected");
    await navigation.waitForReplacementHmrReady();
    clock.advance(3);
    navigation.completeReplacementReady();
    policy.assertSatisfied();
    assert.deepEqual(policy.getAcceptedDevHmrNavigationCancellations(), [{
      category: "dev-hmr-hot-update",
      errorText: "net::ERR_ABORTED",
      failureAt: "2026-09-04T00:00:00.012Z",
      frameUrl: "http://127.0.0.1:43123/design",
      fullReloadWarningCount: 1,
      localDevelopmentOrigin: true,
      method: "GET",
      navigationCancellationLimit: 1,
      navigationDeadlineMs: 45_000,
      navigationOpenedAt: "2026-09-04T00:00:00.010Z",
      navigationReason: "consumer display-unit reload",
      outgoingDocument: true,
      outgoingNavigationEpoch: 0,
      outgoingPageUrl: "http://127.0.0.1:43123/design",
      pageUrlAtFailure: "http://127.0.0.1:43123/design?replacement=1",
      pathname: "/_next/static/webpack/58c9e141fdc1733c.webpack.hot-update.json",
      query: "",
      replacementHmrConnectedAt: "2026-09-04T00:00:00.012Z",
      replacementReadyAt: "2026-09-04T00:00:00.015Z",
      requestBeganBeforeNavigation: true,
      requestStartedAt: "2026-09-04T00:00:00.000Z",
      resourceType: "fetch",
      testTitle: "exact dev HMR JSON",
      url: "http://127.0.0.1:43123/_next/static/webpack/58c9e141fdc1733c.webpack.hot-update.json",
    }]);
  }

  {
    const { page, policy } = createFixture("exact dev HMR script");
    const request = createRequest(page, {
      resourceType: "script",
      url: "http://127.0.0.1:43123/_next/static/webpack/webpack.fc8f9d1197493a4e.hot-update.js",
    });
    page.emit("request", request);
    const navigation = policy.beginDevHmrNavigationCancellation({
      reason: "consumer reload",
      maxCancellations: 1,
    });
    page.navigate("http://127.0.0.1:43123/design?replacement=1");
    page.emit("requestfailed", request);
    emitConsole(page, "log", "[HMR] connected");
    await navigation.waitForReplacementHmrReady();
    navigation.completeReplacementReady();
    policy.assertSatisfied();
    assert.equal(policy.getAcceptedDevHmrNavigationCancellations().length, 1);
  }

  for (const [label, requestInput] of [
    ["HMR application chunk", {
      resourceType: "script",
      url: "http://127.0.0.1:43123/_next/static/chunks/main-app.js",
    }],
    ["HMR nearby JSON path", {
      resourceType: "fetch",
      url: "http://127.0.0.1:43123/_next/static/webpack/not-a-hash.webpack.hot-update.json",
    }],
    ["HMR JSON wrong resource type", {
      resourceType: "script",
      url: "http://127.0.0.1:43123/_next/static/webpack/58c9e141fdc1733c.webpack.hot-update.json",
    }],
    ["HMR script wrong resource type", {
      resourceType: "fetch",
      url: "http://127.0.0.1:43123/_next/static/webpack/webpack.fc8f9d1197493a4e.hot-update.js",
    }],
    ["HMR query", {
      resourceType: "fetch",
      url: "http://127.0.0.1:43123/_next/static/webpack/58c9e141fdc1733c.webpack.hot-update.json?v=1",
    }],
    ["HMR other origin", {
      resourceType: "fetch",
      url: "http://localhost:43123/_next/static/webpack/58c9e141fdc1733c.webpack.hot-update.json",
    }],
    ["HMR other method", {
      method: "POST",
      resourceType: "fetch",
      url: "http://127.0.0.1:43123/_next/static/webpack/58c9e141fdc1733c.webpack.hot-update.json",
    }],
    ["HMR other failure", {
      errorText: "net::ERR_CONNECTION_RESET",
      resourceType: "fetch",
      url: "http://127.0.0.1:43123/_next/static/webpack/58c9e141fdc1733c.webpack.hot-update.json",
    }],
  ] as const) {
    const { page, policy } = createFixture(label);
    const request = createRequest(page, requestInput);
    page.emit("request", request);
    const navigation = policy.beginDevHmrNavigationCancellation({
      reason: "consumer reload",
      maxCancellations: 1,
    });
    page.navigate("http://127.0.0.1:43123/design?replacement=1");
    page.emit("requestfailed", request);
    emitConsole(page, "log", "[HMR] connected");
    await navigation.waitForReplacementHmrReady();
    navigation.completeReplacementReady();
    assertPolicyRejected(policy, /requestfailed:/);
  }

  {
    const { page, policy } = createFixture("replacement HMR request");
    const navigation = policy.beginDevHmrNavigationCancellation({
      reason: "consumer reload",
      maxCancellations: 1,
    });
    page.navigate("http://127.0.0.1:43123/design?replacement=1");
    const request = createRequest(page, {
      resourceType: "fetch",
      url: "http://127.0.0.1:43123/_next/static/webpack/58c9e141fdc1733c.webpack.hot-update.json",
    });
    page.emit("request", request);
    page.emit("requestfailed", request);
    emitConsole(page, "log", "[HMR] connected");
    await navigation.waitForReplacementHmrReady();
    navigation.completeReplacementReady();
    assertPolicyRejected(policy, /requestfailed:/);
  }

  {
    const { page, policy } = createFixture("HMR cancellation bound");
    const first = createRequest(page, {
      resourceType: "fetch",
      url: "http://127.0.0.1:43123/_next/static/webpack/58c9e141fdc1733c.webpack.hot-update.json",
    });
    const second = createRequest(page, {
      resourceType: "script",
      url: "http://127.0.0.1:43123/_next/static/webpack/webpack.fc8f9d1197493a4e.hot-update.js",
    });
    page.emit("request", first);
    page.emit("request", second);
    const navigation = policy.beginDevHmrNavigationCancellation({
      reason: "consumer reload",
      maxCancellations: 1,
    });
    page.navigate("http://127.0.0.1:43123/design?replacement=1");
    page.emit("requestfailed", first);
    page.emit("requestfailed", second);
    emitConsole(page, "log", "[HMR] connected");
    await navigation.waitForReplacementHmrReady();
    navigation.completeReplacementReady();
    assertPolicyRejected(policy, /HMR navigation cancellation bound exceeded.*max 1/);
  }

  {
    const { page, policy } = createFixture("missing replacement HMR");
    const request = createRequest(page, {
      resourceType: "fetch",
      url: "http://127.0.0.1:43123/_next/static/webpack/58c9e141fdc1733c.webpack.hot-update.json",
    });
    page.emit("request", request);
    const navigation = policy.beginDevHmrNavigationCancellation({
      reason: "consumer reload",
      maxCancellations: 1,
    });
    page.navigate("http://127.0.0.1:43123/design?replacement=1");
    page.emit("requestfailed", request);
    navigation.completeReplacementReady();
    assertPolicyRejected(policy, /did not establish a healthy replacement HMR connection/);
  }

  {
    const { page, policy } = createFixture("armed HMR warning without cancellation");
    const navigation = policy.beginDevHmrNavigationCancellation({
      reason: "consumer reload",
      maxCancellations: 1,
    });
    page.navigate("http://127.0.0.1:43123/design?replacement=1");
    emitConsole(page, "warning", fullHmrReloadWarning);
    emitConsole(page, "log", "[HMR] connected");
    await navigation.waitForReplacementHmrReady();
    navigation.completeReplacementReady();
    assertPolicyRejected(
      policy,
      /full-reload warning had no matching outgoing hot-update cancellation/,
    );
  }

  {
    const { page, policy } = createFixture("unarmed HMR failure");
    const request = createRequest(page, {
      resourceType: "fetch",
      url: "http://127.0.0.1:43123/_next/static/webpack/58c9e141fdc1733c.webpack.hot-update.json",
    });
    page.emit("request", request);
    page.emit("requestfailed", request);
    assertPolicyRejected(policy, /requestfailed:/);
  }

  {
    const { page, policy } = createFixture("unarmed HMR warning");
    emitConsole(page, "warning", fullHmrReloadWarning);
    assertPolicyRejected(policy, /console\.warning: \[Fast Refresh\] performing full reload/);
  }
}

void runAsyncChecks().then(() => {
  console.log(
    "Browser runtime navigation-cancellation policy checks passed " +
      "(static replacement success, auth settlement, exact dev-HMR health, " +
      "and 30 rejection/readiness cases enforced).",
  );
}).catch((cause) => {
  console.error(cause);
  process.exitCode = 1;
});
