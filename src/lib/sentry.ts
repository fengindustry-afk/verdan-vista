import * as Sentry from "@sentry/react";

export const initSentry = () => {
  const dsn = import.meta.env.VITE_SENTRY_DSN;
  const env = import.meta.env.MODE;

  // Only initialize in production or if DSN is explicitly set
  if (!dsn) {
    console.info("Sentry DSN not configured, error tracking disabled");
    return;
  }

  Sentry.init({
    dsn,
    environment: env,
    // Performance monitoring: sample 10% of transactions in prod, 100% in dev
    tracesSampleRate: env === "production" ? 0.1 : 1.0,
    integrations: [Sentry.browserTracingIntegration()],
    // Capture unhandled rejections and errors
    attachStacktrace: true,
    beforeSend(event) {
      // Filter out network errors (offline mode is expected)
      if (event.exception) {
        const exception = event.exception.values?.[0];
        if (exception?.value?.includes?.("fetch failed")) {
          return null;
        }
      }
      return event;
    },
  });
};

export default Sentry;
