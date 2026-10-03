// MyCúram error monitoring via sentry-expo. Fully inert until
// EXPO_PUBLIC_SENTRY_DSN is set (app.json extra or .env). Never attach
// patient identifiers or clinical data to events — the app's error
// messages already avoid clinical content by design.

import * as Sentry from 'sentry-expo';

const DSN = process.env.EXPO_PUBLIC_SENTRY_DSN ?? '';

export const monitoringEnabled = Boolean(DSN);

if (monitoringEnabled) {
  Sentry.init({
    dsn: DSN,
    enableInExpoDevelopment: false,
    sendDefaultPii: false,
  });
}
