// Optional Sentry error reporting for Edge Functions. Inert unless the
// SENTRY_DSN secret is set on the project (Supabase secrets). No PHI:
// pass context tags only (function name, error class) — never message
// bodies or patient data.

const DSN = Deno.env.get('SENTRY_DSN') ?? '';

let sentryPromise: Promise<typeof import('https://esm.sh/@sentry/deno@9')> | null = null;

async function loadSentry() {
  if (!sentryPromise) {
    sentryPromise = import('https://esm.sh/@sentry/deno@9');
    const Sentry = await sentryPromise;
    Sentry.init({
      dsn: DSN,
      environment: Deno.env.get('SUPABASE_ENVIRONMENT') ?? 'production',
      sendDefaultPii: false,
    });
  }
  return sentryPromise;
}

export async function reportError(error: unknown, context?: Record<string, string>): Promise<void> {
  if (!DSN) return;
  try {
    const Sentry = await loadSentry();
    Sentry.captureException(error, { tags: context });
    await Sentry.flush(2000);
  } catch {
    // Monitoring must never break the request path.
  }
}

/** Wrap a Deno.serve handler: unexpected exceptions are reported then rethrown. */
export function withMonitoring(handler: (req: Request) => Promise<Response>, name: string) {
  return async (req: Request): Promise<Response> => {
    try {
      return await handler(req);
    } catch (error) {
      await reportError(error, { function: name });
      throw error;
    }
  };
}
