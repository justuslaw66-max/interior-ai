import * as Sentry from "@sentry/nextjs";

export function setSentryContext(context: {
  designId?: string | null;
  mode?: string;
  roomId?: string | null;
  plan?: string;
  isGuest?: boolean;
  userId?: string | null;
}) {
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
}

export function captureWebGLError(error: Error) {
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
}
