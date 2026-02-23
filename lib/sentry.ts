import * as Sentry from "@sentry/nextjs";

export function initSentry() {
  Sentry.init({
    dsn: process.env.SENTRY_DSN || process.env.NEXT_PUBLIC_SENTRY_DSN,
    environment: process.env.NEXT_PUBLIC_APP_ENV || process.env.NODE_ENV,
    tracesSampleRate: process.env.NODE_ENV === "production" ? 0.1 : 1.0,
    beforeSend(event, hint) {
      // Filter out certain errors if needed
      if (event.exception) {
        const error = hint.originalException;
        // Ignore network errors in development
        if (process.env.NODE_ENV === "development" && error instanceof Error) {
          if (error.message.includes("NetworkError") || error.message.includes("fetch")) {
            return null;
          }
        }
      }
      return event;
    },
    integrations: [
      // Replay integration (requires @sentry/replay in browser)
      // Uncomment if Replay is available:
      // new Sentry.Replay({
      //   maskAllText: false,
      //   blockAllMedia: false,
      // }),
    ],
    // Performance Monitoring
    replaysSessionSampleRate: 0.1,
    replaysOnErrorSampleRate: 1.0,
  });
}
