import { execFileSync } from "node:child_process";
import { writeFile } from "node:fs/promises";
import type { Page, TestInfo } from "@playwright/test";

const PREFIX = "__pro_visual_observation__";
const CAPACITY = 512;
type Observation = { event: string; [key: string]: unknown };
type BrowserObservation = {
  documentId: string;
  sequence: number;
  record: (event: string, detail?: Record<string, unknown>) => void;
  stop: () => void;
};
declare global {
  interface Window {
    __proVisualDiagnostic?: BrowserObservation;
  }
}
const collectors = new WeakMap<Page, {
  events: Observation[];
  dropped: number;
  stop: () => void;
}>();

export function proVisualMark(page: Page, event: string, detail = {}) {
  const collector = collectors.get(page);
  if (!collector) return;
  if (collector.events.length >= CAPACITY) { collector.dropped++; return; }
  collector.events.push({ event, nodeTime: Date.now(), ...detail });
}

export function proVisualEventsSince(page: Page, marker: string): Observation[] {
  const collector = collectors.get(page);
  if (!collector || collector.dropped) throw new Error("Pro visual observations are incomplete");
  const index = collector.events.findLastIndex((event) => event.event === marker);
  if (index < 0) throw new Error(`Pro visual marker is missing: ${marker}`);
  return collector.events.slice(index + 1).map((event) => {
    // Browser observations are decoded by this module's console collector.
    return event.event === "browser" ? event.observation as Observation : event;
  });
}

// Installed before navigation/actions; observations survive a departing document in Node.
export async function installProVisualDiagnostics(page: Page) {
  const onConsole = (message: import("@playwright/test").ConsoleMessage) => {
    if (!message.text().startsWith(PREFIX)) return;
    try {
      const observation: Observation = JSON.parse(message.text().slice(PREFIX.length));
      proVisualMark(page, "browser", { observation });
    } catch { proVisualMark(page, "incomplete-console-record"); }
  };
  const onNavigation = (frame: import("@playwright/test").Frame) => {
    if (frame === page.mainFrame()) proVisualMark(page, "main-frame-navigated");
  };
  let requestSequence = 0;
  const requests = new WeakMap<import("@playwright/test").Request, number>();
  const onRequest = (request: import("@playwright/test").Request) => {
    if (!/\/api\/designs\/[^/]+\/share$/.test(new URL(request.url()).pathname)) return;
    requests.set(request, ++requestSequence);
    proVisualMark(page, "share-request", { requestSequence, method: request.method() });
  };
  const onResponse = (response: import("@playwright/test").Response) => {
    const sequence = requests.get(response.request());
    if (sequence) proVisualMark(page, "share-response", { requestSequence: sequence, status: response.status() });
  };
  const onFailed = (request: import("@playwright/test").Request) => {
    const sequence = requests.get(request);
    if (sequence) proVisualMark(page, "share-request-failed", { requestSequence: sequence });
  };
  const onClose = () => proVisualMark(page, "page-closed");
  const onCrash = () => proVisualMark(page, "page-crashed");
  collectors.set(page, { events: [], dropped: 0, stop: () => {
    page.off("console", onConsole).off("framenavigated", onNavigation)
      .off("request", onRequest).off("response", onResponse).off("requestfailed", onFailed)
      .off("close", onClose).off("crash", onCrash);
  } });
  page.on("console", onConsole).on("framenavigated", onNavigation)
    .on("request", onRequest).on("response", onResponse).on("requestfailed", onFailed)
    .on("close", onClose).on("crash", onCrash);
  await page.addInitScript(({ prefix, capacity }) => {
    if (window !== window.top || window.__proVisualDiagnostic) return;
    const documentId = crypto.randomUUID();
    const identity = (element: Element | null) => element
      ? { tag: element.tagName, testId: element.getAttribute("data-testid"), role: element.getAttribute("role") }
      : null;
    const eligibility = (element: Element | null) => element instanceof HTMLElement ? {
      ...identity(element), connected: element.isConnected,
      disabled: element.matches(":disabled"), ariaDisabled: element.getAttribute("aria-disabled"),
      inertAncestor: Boolean(element.closest("[inert]")),
      hiddenAncestor: Boolean(element.closest('[hidden], [aria-hidden="true"]')),
      display: getComputedStyle(element).display, visibility: getComputedStyle(element).visibility,
      pointerEvents: getComputedStyle(element).pointerEvents,
      rect: element.getBoundingClientRect().toJSON(),
    } : null;
    const owners = () => Array.from(document.querySelectorAll<HTMLElement>(
      '[role="dialog"][data-editor-dialog-state], [data-testid="share-fallback-modal"]',
    )).slice(0, 8).map(element => ({
      ...identity(element), state: element.dataset.editorDialogState,
      generation: element.dataset.editorDialogGeneration, stack: element.dataset.editorDialogStackIndex,
      interactive: element.dataset.editorDialogState === "interactive",
      trap: element.dataset.editorDialogFocusTrap, inert: element.inert,
      ariaHidden: element.getAttribute("aria-hidden"), ariaModal: element.getAttribute("aria-modal"),
      zIndex: getComputedStyle(element).zIndex,
    }));
    const record: BrowserObservation["record"] = (event, detail = {}) => {
      const sequence = ++api.sequence;
      if (sequence > capacity) return;
      console.debug(prefix + JSON.stringify({ event, documentId, sequence,
        browserTime: performance.now(), timeOrigin: performance.timeOrigin,
        active: identity(document.activeElement), owners: owners(), ...detail }));
    };
    let lastFeedback: HTMLElement | null = null;
    let previous = "";
    const observeDom = () => {
      // Feedback stays with the active fallback; retain the global non-fallback path too.
      const feedback = Array.from(document.querySelectorAll<HTMLElement>('[data-testid="share-copy-status"], .fixed.top-6.right-6'))
        .find(element => element.textContent?.includes("Share link copied to clipboard!")) ?? null;
      const rect = (feedback ?? lastFeedback)?.getBoundingClientRect();
      const hit = rect ? document.elementFromPoint(rect.x + rect.width / 2, rect.y + rect.height / 2) : null;
      const state = { present: Boolean(feedback), connected: feedback?.isConnected ?? false,
        textMatches: feedback?.textContent?.includes("Share link copied to clipboard!") ?? false,
        opacity: feedback ? getComputedStyle(feedback).opacity : null,
        visibility: feedback ? getComputedStyle(feedback).visibility : null,
        rect: rect?.toJSON(), centerHit: identity(hit),
        centerOwnedByFeedback: Boolean(feedback && hit && feedback.contains(hit)),
        centerDialog: identity(hit?.closest('[role="dialog"]') ?? null), owners: owners() };
      const encoded = JSON.stringify(state);
      if (encoded !== previous) {
        record(feedback && !lastFeedback ? "feedback-inserted" : !feedback && lastFeedback ? "feedback-removed" : "feedback-or-ownership-changed", state);
        previous = encoded;
      }
      lastFeedback = feedback;
    };
    const onInput = (event: Event) => {
      const target = event.target instanceof Element ? event.target : null;
      const control = target?.closest('[data-testid="create-share"], [data-testid="share-copy-button"]');
      if (!control && !(event instanceof KeyboardEvent && event.key === "Enter")) return;
      record(event.type, { key: event instanceof KeyboardEvent ? event.key : null,
        target: identity(target), control: identity(control ?? null),
        intended: eligibility(document.querySelector('[data-testid="create-share"]')),
        trusted: event.isTrusted, defaultPrevented: event.defaultPrevented });
    };
    const lifecycle = (event: Event) => record(event.type, {
      readyState: document.readyState, visibility: document.visibilityState,
      persisted: event instanceof PageTransitionEvent ? event.persisted : null,
    });
    const observer = new MutationObserver(observeDom);
    const api: BrowserObservation = { documentId, sequence: 0, record, stop: () => observer.disconnect() };
    window.__proVisualDiagnostic = api;
    record("document-observer-installed", { readyState: document.readyState });
    observer.observe(document, { subtree: true, childList: true, characterData: true,
      attributes: true, attributeFilter: ["class", "style", "hidden", "inert", "aria-hidden", "data-editor-dialog-state", "data-editor-dialog-focus-trap"] });
    for (const name of ["keydown", "keyup", "click"]) document.addEventListener(name, onInput, true);
    for (const name of ["pagehide", "pageshow", "popstate", "hashchange", "load"]) window.addEventListener(name, lifecycle);
    document.addEventListener("visibilitychange", lifecycle);
    document.addEventListener("DOMContentLoaded", lifecycle);
    for (const name of ["animationstart", "animationend", "transitionend"]) document.addEventListener(name, event => {
      if (event.target instanceof Element && event.target.closest(".fixed.top-6.right-6")) observeDom();
    }, true);
  }, { prefix: PREFIX, capacity: CAPACITY });
}

export async function attachProVisualDiagnostics(page: Page, testInfo: TestInfo) {
  const collector = collectors.get(page);
  if (!collector) return;
  const outcomeBeforeCollection = testInfo.status;
  try {
    try {
      const final = await page.evaluate(() => {
        const observer = window.__proVisualDiagnostic;
        observer?.record("final-collection");
        observer?.stop();
        return observer ? { documentId: observer.documentId, sequence: observer.sequence } : null;
      });
      proVisualMark(page, "collection-document", { final, incomplete: !final || final.sequence > CAPACITY });
    } catch { proVisualMark(page, "collection-unavailable", { incomplete: true }); }
    const source = (arg: string) => execFileSync("git", ["rev-parse", arg], { encoding: "utf8" }).trim();
    const browserEvents = collector.events.flatMap(event => event.event === "browser" ? [event.observation as Observation] : []);
    const openWindows = new Set<string>();
    const documents = new Map<unknown, { received: number; lastSequence: number; gaps: boolean }>();
    for (const event of browserEvents) {
      const document = documents.get(event.documentId) ?? { received: 0, lastSequence: 0, gaps: false };
      document.received++;
      if (event.sequence !== document.lastSequence + 1) document.gaps = true;
      document.lastSequence = Number(event.sequence);
      documents.set(event.documentId, document);
      const windowId = `${event.documentId}:${event.recorderId}:${event.entryGeneration}`;
      if (event.event === "focus-window-start") openWindows.add(windowId);
      if (event.event === "focus-window-complete") openWindows.delete(windowId);
    }
    const incomplete = collector.dropped > 0 || openWindows.size > 0 || [...documents.values()].some(document => document.gaps)
      || collector.events.some(event => event.incomplete === true)
      || browserEvents.some(event => event.event === "focus-collection-request" && !event.recorderPresent);
    const path = testInfo.outputPath("pro-visual-observations.json");
    await writeFile(path, JSON.stringify({ schema: "interior-ai.pro-visual-observations.v1",
      sourceCommitSha: source("HEAD"), sourceTreeSha: source("HEAD^{tree}"),
      sourceWorktreeDirty: execFileSync("git", ["status", "--porcelain"], { encoding: "utf8" }).trim().length > 0,
      workflowRunId: process.env.GITHUB_RUN_ID ?? null, workflowAttempt: process.env.GITHUB_RUN_ATTEMPT ?? null,
      testId: testInfo.testId, title: testInfo.title, browser: testInfo.project.name, retry: testInfo.retry,
      outcomeBeforeCollection, capacity: CAPACITY, dropped: collector.dropped,
      incomplete, unfinishedFocusWindows: [...openWindows], documents: [...documents].map(([documentId, counts]) => ({ documentId, ...counts })),
      correlation: "Request ordering is observational; timing alone does not prove activation causality. Clipboard records describe the fixture, not the OS clipboard.",
      events: collector.events,
    }, null, 2));
    await testInfo.attach("pro-visual-observations", { path, contentType: "application/json" });
  } catch (error) {
    // An attachment error is diagnostic only; it cannot replace an earlier product assertion error.
    testInfo.annotations.push({ type: "pro-visual-diagnostics-incomplete", description: "Final diagnostic attachment failed; inspect runner output." });
    console.error("Pro visual diagnostic attachment failed:", error instanceof Error ? error.name : "unknown");
  } finally { collector.stop(); collectors.delete(page); }
}
