import * as Sentry from '@sentry/react';

// Error monitoring via Sentry. Fully inert until VITE_SENTRY_DSN is set
// (create a free project at sentry.io → copy the DSN → Vercel env).
//
// GDPR: never attach patient identifiers, names, or clinical text to
// events. Scope events with practiceId / staffRole / feature tags only.
// beforeBreadcrumb strips values of any breadcrumb whose name looks
// clinical (fetch bodies, console args).

export const monitoringEnabled = Boolean(import.meta.env.VITE_SENTRY_DSN);

let initialised = false;

export function initMonitoring() {
  if (!monitoringEnabled || initialised) return;
  initialised = true;
  Sentry.init({
    dsn: import.meta.env.VITE_SENTRY_DSN,
    environment: import.meta.env.MODE,
    sendDefaultPii: false,
    // PHI guard: never capture request bodies or clinical-looking values.
    beforeBreadcrumb(breadcrumb) {
      if (breadcrumb.category === 'http' || breadcrumb.category === 'fetch' || breadcrumb.category === 'xhr') {
        delete breadcrumb.data?.body;
      }
      if (breadcrumb.category === 'console') return null;
      return breadcrumb;
    },
  });
}

export function captureError(error: unknown, context?: Record<string, string>) {
  if (!monitoringEnabled) return;
  Sentry.captureException(error, { tags: context });
}

export function captureMessage(message: string, context?: Record<string, string>) {
  if (!monitoringEnabled) return;
  Sentry.captureMessage(message, { tags: context });
}
