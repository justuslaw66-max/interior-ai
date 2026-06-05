'use client';

type SentryModule = typeof import("@sentry/browser");

let sentryModulePromise: Promise<SentryModule> | null = null;

function getSentryModule(): Promise<SentryModule> | null {
  if (typeof window === "undefined") return null;
  if (!sentryModulePromise) {
    sentryModulePromise = import("@sentry/browser");
  }
  return sentryModulePromise;
}

function withSentry(run: (sentry: SentryModule) => void) {
  const modulePromise = getSentryModule();
  if (!modulePromise) return;
  void modulePromise.then(run).catch(() => {
    // Never surface telemetry failures to user flows.
  });
}

export function setSentryContext(context: {
  designId?: string | null;
  mode?: string;
  roomId?: string | null;
  plan?: string;
  isGuest?: boolean;
  userId?: string | null;
}) {
  withSentry((Sentry) => {
    Sentry.setContext("design", {
      designId: context.designId,
      mode: context.mode,
      roomId: context.roomId,
    });

    Sentry.setUser({
      id: context.userId || undefined,
      isGuest: context.isGuest,
      plan: context.plan,
    });
  });
}

export function captureDesignError(
  error: Error,
  context: {
    designId?: string | null;
    mode?: string;
    roomId?: string | null;
    plan?: string;
    isGuest?: boolean;
    location?: string;
  }
) {
  withSentry((Sentry) => {
    setSentryContext({
      ...context,
      isGuest: context.isGuest ?? false,
    });

    Sentry.captureException(error, {
      tags: {
        component: "design-editor",
        mode: context.mode || "unknown",
        location: context.location || "unknown",
      },
    });
  });
}

export function captureWebGLError(error: Error) {
  withSentry((Sentry) => {
    Sentry.captureException(error, {
      tags: {
        component: "three-js",
        type: "webgl-error",
      },
      contexts: {
        webgl: {
          event: "context-loss",
          recovered: true,
        },
      },
    });
  });
}

export function captureCanvasBoundaryError(error: Error, componentStack?: string) {
  withSentry((Sentry) => {
    Sentry.captureException(error, {
      tags: {
        component: "canvas-error-boundary",
        type: "r3f-error",
      },
      contexts: {
        react: {
          componentStack,
        },
      },
    });
  });
}
