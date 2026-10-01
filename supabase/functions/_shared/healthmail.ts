// Shared Healthmail address validation.
//
// Real Healthmail addresses end in @healthmail.ie (the HSE-issued secure
// mail system). Tests must be able to exercise the connect/send flow without
// a real account, so an Ethereal address (@ethereal.email — the Nodemailer
// project's free fake-SMTP provider) is accepted ONLY when
// HEALTHMAIL_TEST_MODE=true.
//
// HEALTHMAIL_TEST_MODE is deliberately NOT a deployed secret: it exists only
// in the test harness env file (tests/email/functions.test.env) used when
// `supabase functions serve` runs locally under the automated test suite.
// Production never sees it, so the relaxation cannot leak into the live app.

const REAL_DOMAIN = '@healthmail.ie';
const TEST_DOMAIN = '@ethereal.email';

export function isHealthmailAddress(address: string): boolean {
  const a = String(address ?? '').trim().toLowerCase();
  if (a.endsWith(REAL_DOMAIN)) return true;
  return Deno.env.get('HEALTHMAIL_TEST_MODE') === 'true' && a.endsWith(TEST_DOMAIN);
}
