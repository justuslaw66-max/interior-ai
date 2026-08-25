import type { Page } from "@playwright/test";

const RECORDER_KEY = "__ch0015hClientPreviewMoreFocusRecorder";

export type ClientPreviewFocusPhase =
  | "A_ENTRY_TRANSITION"
  | "B_PREVIEW_ACTIVE"
  | "C_EXIT_REQUESTED"
  | "D_EXIT_SETTLING"
  | "E_POST_EXIT_RESTORATION";

export type ClientPreviewMoreFocusEvent = {
  sequence: number;
  eventType: "focusin" | "focusout";
  phase: ClientPreviewFocusPhase;
  invalid: boolean;
  invalidReasons: string[];
  entryScopeHash: string;
  currentScopeHash: string;
  entryGeneration: number;
  restorationGeneration: number | null;
  openerIdentity: string | null;
  targetIdentity: string;
  previewActive: boolean;
  commandBarSettled: boolean;
  targetAvailable: boolean;
  scopeCurrent: boolean;
  newerDialogOwnsFocus: boolean;
  fallbackPermitted: boolean;
};

export type ClientPreviewFocusReport = {
  capacity: number;
  dropped: number;
  finalPhase: ClientPreviewFocusPhase;
  finalActiveIdentity: string;
  exitReason: string;
  restorationEligible: boolean;
  transitions: ClientPreviewFocusPhase[];
  events: ClientPreviewMoreFocusEvent[];
};

type RecorderApi = {
  begin: () => void;
  entered: () => void;
  exitRequested: (reason: string, restorationEligible: boolean) => void;
  complete: () => ClientPreviewFocusReport;
  stop: () => void;
};

export async function installClientPreviewFocusRecorder(page: Page) {
  await page.evaluate((recorderKey) => {
    type Phase = ClientPreviewFocusPhase | "IDLE";
    type FocusEventRecord = ClientPreviewMoreFocusEvent;
    type DialogIdentity = {
      element: HTMLElement;
      instance: number;
      generation: string;
      stackIndex: number | null;
    };

    const targetWindow = window as typeof window &
      Record<string, RecorderApi | undefined>;
    targetWindow[recorderKey]?.stop();

    const capacity = 64;
    const moreIdentity = "editor-command-overflow";
    const dialogInstances = new WeakMap<Element, number>();
    let nextDialogInstance = 0;
    let sequence = 0;
    let generation = 0;
    let phase: Phase = "IDLE";
    let active = false;
    let dropped = 0;
    let entryGeneration = 0;
    let restorationGeneration: number | null = null;
    let restorationEligible = false;
    let exitReason = "not-requested";
    let entryScopeHash = "";
    let entryTopDialogIdentity: string | null = null;
    let openerElement: HTMLElement | null = null;
    let openerIdentity: string | null = null;
    let transitions: ClientPreviewFocusPhase[] = [];
    let events: FocusEventRecord[] = [];

    const identity = (element: HTMLElement | null) =>
      element?.dataset.testid ??
      element?.getAttribute("aria-label") ??
      element?.id ??
      null;

    const hashScope = (value: string) => {
      let hash = 0x811c9dc5;
      for (let index = 0; index < value.length; index += 1) {
        hash ^= value.charCodeAt(index);
        hash = Math.imul(hash, 0x01000193);
      }
      return (hash >>> 0).toString(16).padStart(8, "0");
    };

    const currentScopeHash = () => {
      const url = new URL(window.location.href);
      const plan = document.querySelector('[data-testid="pro-mode-indicator"]')
        ? "pro"
        : "consumer";
      return hashScope(
        [
          url.pathname,
          url.searchParams.get("designId") ?? "",
          url.searchParams.get("mode") ?? "",
          plan,
        ].join("|")
      );
    };

    const currentDialogs = (): DialogIdentity[] =>
      Array.from(
        document.querySelectorAll<HTMLElement>(
          '[role="dialog"][aria-modal="true"][data-editor-dialog-state]'
        )
      ).map((element) => {
        let instance = dialogInstances.get(element);
        if (!instance) {
          instance = ++nextDialogInstance;
          dialogInstances.set(element, instance);
        }
        const parsedStackIndex = Number(element.dataset.editorDialogStackIndex);
        return {
          element,
          instance,
          generation: element.dataset.editorDialogGeneration ?? "external",
          stackIndex: Number.isFinite(parsedStackIndex) ? parsedStackIndex : null,
        };
      });

    const topDialogIdentity = () => {
      const dialogs = currentDialogs();
      if (dialogs.length === 0) return null;
      const top = dialogs.reduce((current, candidate) => {
        if (candidate.stackIndex === null) return candidate;
        if (current.stackIndex === null) return current;
        return candidate.stackIndex > current.stackIndex ? candidate : current;
      });
      return [
        identity(top.element) ?? "dialog",
        top.generation,
        top.stackIndex ?? "external",
        top.instance,
      ].join(":");
    };

    const unavailableReasons = (element: HTMLElement) => {
      const reasons: string[] = [];
      if (!element.isConnected) reasons.push("disconnected-target");
      if (
        (element instanceof HTMLButtonElement ||
          element instanceof HTMLInputElement) &&
        element.disabled
      ) {
        reasons.push("disabled-target");
      }
      if (element.getAttribute("aria-disabled") === "true") {
        reasons.push("aria-disabled-target");
      }
      for (
        let candidate: HTMLElement | null = element;
        candidate;
        candidate = candidate.parentElement
      ) {
        if (candidate.hidden) reasons.push("hidden-target-or-ancestor");
        if (candidate.inert) reasons.push("inert-target-or-ancestor");
        if (candidate.getAttribute("aria-hidden") === "true") {
          reasons.push("aria-hidden-target-or-ancestor");
        }
        const style = window.getComputedStyle(candidate);
        if (style.display === "none" || style.visibility !== "visible") {
          reasons.push("visually-hidden-target-or-ancestor");
        }
        if (Number(style.opacity) <= 0) {
          reasons.push("transparent-target-or-ancestor");
        }
        if (style.pointerEvents === "none") {
          reasons.push("pointer-blocked-target-or-ancestor");
        }
      }
      const rect = element.getBoundingClientRect();
      const geometry = [
        rect.left,
        rect.top,
        rect.right,
        rect.bottom,
        rect.width,
        rect.height,
      ];
      if (geometry.some((value) => !Number.isFinite(value))) {
        reasons.push("nonfinite-target-geometry");
      } else {
        if (rect.width <= 0 || rect.height <= 0) {
          reasons.push("empty-target-geometry");
        }
        if (
          rect.left < 0 ||
          rect.top < 0 ||
          rect.right > window.innerWidth ||
          rect.bottom > window.innerHeight
        ) {
          reasons.push("target-outside-viewport");
        }
      }
      return [...new Set(reasons)];
    };

    const commandBarSettlementReasons = () => {
      const commandBar = document.getElementById("editor-command-bar-root");
      if (!(commandBar instanceof HTMLElement)) return ["missing-command-bar"];
      const reasons = unavailableReasons(commandBar);
      const style = window.getComputedStyle(commandBar);
      if (style.pointerEvents === "none") reasons.push("command-bar-pointer-blocked");
      if (style.opacity !== "1") reasons.push("command-bar-opacity-not-settled");
      if (
        commandBar
          .getAnimations()
          .some((animation) => animation.pending || animation.playState === "running")
      ) {
        reasons.push("command-bar-animation-pending");
      }
      return [...new Set(reasons)];
    };

    const previewIsActive = () =>
      Boolean(document.getElementById("client-preview-exit-action"));

    const fallbackIsPermitted = () => {
      const openerStillAvailable =
        openerElement instanceof HTMLElement &&
        unavailableReasons(openerElement).length === 0;
      return openerIdentity === moreIdentity || !openerStillAvailable;
    };

    const newerDialogOwnsFocus = () => {
      const currentTopDialogIdentity = topDialogIdentity();
      return (
        currentTopDialogIdentity !== null &&
        currentTopDialogIdentity !== entryTopDialogIdentity
      );
    };

    const invalidFocusReasons = (target: HTMLElement) => {
      const reasons = unavailableReasons(target);
      if (phase === "A_ENTRY_TRANSITION") {
        reasons.push("entry-transition-not-concealed");
      } else if (phase === "B_PREVIEW_ACTIVE") {
        reasons.push("preview-active");
      } else if (phase === "C_EXIT_REQUESTED" || phase === "D_EXIT_SETTLING") {
        reasons.push("exit-not-semantically-settled");
      } else if (phase !== "E_POST_EXIT_RESTORATION") {
        reasons.push("outside-instrumented-lifecycle");
      }

      if (phase === "E_POST_EXIT_RESTORATION") {
        reasons.push(...commandBarSettlementReasons());
        if (previewIsActive()) reasons.push("preview-active");
        if (!restorationEligible) reasons.push("restoration-cancelled");
        if (currentScopeHash() !== entryScopeHash) {
          reasons.push("stale-preview-scope");
        }
        if (
          restorationGeneration === null ||
          restorationGeneration !== generation
        ) {
          reasons.push("stale-restoration-generation");
        }
        if (newerDialogOwnsFocus()) {
          reasons.push("newer-dialog-generation");
        }
        if (!fallbackIsPermitted()) {
          reasons.push("fallback-not-permitted");
        }
      }
      return [...new Set(reasons)];
    };

    const advanceExitPhaseIfSettled = () => {
      if (phase === "C_EXIT_REQUESTED") setPhase("D_EXIT_SETTLING");
      if (
        phase === "D_EXIT_SETTLING" &&
        !previewIsActive() &&
        commandBarSettlementReasons().length === 0
      ) {
        setPhase("E_POST_EXIT_RESTORATION");
      }
    };

    const recordFocus = (event: FocusEvent) => {
      if (!active || !(event.target instanceof HTMLElement)) return;
      if (event.target.dataset.testid !== moreIdentity) return;
      if (event.type === "focusin") advanceExitPhaseIfSettled();
      const invalidReasons =
        event.type === "focusin" ? invalidFocusReasons(event.target) : [];
      const targetReasons = unavailableReasons(event.target);
      const currentScope = currentScopeHash();
      const record: FocusEventRecord = {
        sequence: ++sequence,
        eventType: event.type as "focusin" | "focusout",
        phase: phase as ClientPreviewFocusPhase,
        invalid: invalidReasons.length > 0,
        invalidReasons,
        entryScopeHash,
        currentScopeHash: currentScope,
        entryGeneration,
        restorationGeneration,
        openerIdentity,
        targetIdentity: identity(event.target) ?? event.target.tagName.toLowerCase(),
        previewActive: previewIsActive(),
        commandBarSettled: commandBarSettlementReasons().length === 0,
        targetAvailable: targetReasons.length === 0,
        scopeCurrent: currentScope === entryScopeHash,
        newerDialogOwnsFocus: newerDialogOwnsFocus(),
        fallbackPermitted: fallbackIsPermitted(),
      };
      if (events.length === capacity) {
        events.shift();
        dropped += 1;
      }
      events.push(record);
    };

    const setPhase = (nextPhase: ClientPreviewFocusPhase) => {
      phase = nextPhase;
      transitions.push(nextPhase);
    };

    const recorder: RecorderApi = {
      begin: () => {
        active = true;
        dropped = 0;
        events = [];
        transitions = [];
        entryGeneration = ++generation;
        restorationGeneration = null;
        restorationEligible = false;
        exitReason = "not-requested";
        entryScopeHash = currentScopeHash();
        entryTopDialogIdentity = topDialogIdentity();
        openerElement =
          document.activeElement instanceof HTMLElement
            ? document.activeElement
            : null;
        openerIdentity = identity(openerElement);
        setPhase("A_ENTRY_TRANSITION");
      },
      entered: () => setPhase("B_PREVIEW_ACTIVE"),
      exitRequested: (reason, eligible) => {
        restorationGeneration = ++generation;
        restorationEligible = eligible;
        exitReason = reason;
        setPhase("C_EXIT_REQUESTED");
      },
      complete: () => {
        advanceExitPhaseIfSettled();
        const report: ClientPreviewFocusReport = {
          capacity,
          dropped,
          finalPhase: phase as ClientPreviewFocusPhase,
          finalActiveIdentity:
            document.activeElement instanceof HTMLElement
              ? identity(document.activeElement) ||
                document.activeElement.tagName.toLowerCase()
              : "none",
          exitReason,
          restorationEligible,
          transitions: [...transitions],
          events: [...events],
        };
        active = false;
        phase = "IDLE";
        return report;
      },
      stop: () => {
        active = false;
        document.removeEventListener("focusin", recordFocus);
        document.removeEventListener("focusout", recordFocus);
        delete targetWindow[recorderKey];
      },
    };

    document.addEventListener("focusin", recordFocus);
    document.addEventListener("focusout", recordFocus);
    targetWindow[recorderKey] = recorder;
  }, RECORDER_KEY);
}

export async function beginClientPreviewFocusWindow(page: Page) {
  await page.evaluate((recorderKey) => {
    const recorder = (window as typeof window & Record<string, RecorderApi>)[
      recorderKey
    ];
    if (!recorder) throw new Error("Client Preview focus recorder is not installed");
    recorder.begin();
  }, RECORDER_KEY);
}

export async function markClientPreviewEntered(page: Page) {
  await page.evaluate((recorderKey) => {
    const recorder = (window as typeof window & Record<string, RecorderApi>)[
      recorderKey
    ];
    if (!recorder) throw new Error("Client Preview focus recorder is not installed");
    recorder.entered();
  }, RECORDER_KEY);
}

export async function markClientPreviewExitRequested(
  page: Page,
  options: { reason: string; restorationEligible: boolean }
) {
  await page.evaluate(
    ({ recorderKey, reason, restorationEligible }) => {
      const recorder = (window as typeof window & Record<string, RecorderApi>)[
        recorderKey
      ];
      if (!recorder) throw new Error("Client Preview focus recorder is not installed");
      recorder.exitRequested(reason, restorationEligible);
    },
    { recorderKey: RECORDER_KEY, ...options }
  );
}

export async function exitClientPreviewWithScopeChange(
  page: Page,
  options: {
    reason: string;
    href: string;
    dispatchExitHotkey?: boolean;
  }
) {
  await page.evaluate(
    ({ recorderKey, reason, href, dispatchExitHotkey }) => {
      const recorder = (window as typeof window & Record<string, RecorderApi>)[
        recorderKey
      ];
      if (!recorder) throw new Error("Client Preview focus recorder is not installed");
      recorder.exitRequested(reason, false);
      if (dispatchExitHotkey) {
        window.dispatchEvent(
          new KeyboardEvent("keydown", { key: "p", bubbles: true })
        );
      }
      window.history.pushState(null, "", href);
    },
    { recorderKey: RECORDER_KEY, ...options }
  );
}

export async function completeClientPreviewFocusWindow(
  page: Page
): Promise<ClientPreviewFocusReport> {
  return page.evaluate((recorderKey) => {
    const recorder = (window as typeof window & Record<string, RecorderApi>)[
      recorderKey
    ];
    if (!recorder) throw new Error("Client Preview focus recorder is not installed");
    return recorder.complete();
  }, RECORDER_KEY);
}

export async function stopClientPreviewFocusRecorder(page: Page) {
  await page.evaluate((recorderKey) => {
    const recorder = (window as typeof window & Record<string, RecorderApi>)[
      recorderKey
    ];
    if (!recorder) throw new Error("Client Preview focus recorder is not installed");
    recorder.stop();
  }, RECORDER_KEY);
}
