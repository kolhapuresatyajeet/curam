// Cúram — positive-flow E2E suite (demo mode, watchable in headed Chromium).
//
// Covers the happy paths a user walks every day. Each test gets a fresh
// browser context, so the demo seed boots with a live session — no sign-in
// friction, and nothing ever touches the cloud project.
//
// Auto-accepts window.confirm() dialogs (Approve/Sign/Withdraw flows use
// them by design — GP sign-offs must be confirmed).

import { test, expect } from '@playwright/test';

const nav = (page, module: string) => page.getByTestId(`nav-${module}`).click();

test.beforeEach(async ({ page }) => {
  page.on('dialog', (d) => void d.accept());
  await page.goto('/');
  await expect(page).not.toHaveURL(/\/login/); // demo seed carries a live session
});

test('dashboard boots straight in with the demo practice and staff', async ({ page }) => {
  await expect(page.getByText('Riverside Family Practice').first()).toBeVisible();
  await expect(page.getByText('Dr Sarah Murphy').first()).toBeVisible();
  expect(new URL(page.url()).pathname).toBe('/'); // no login redirect
});

test('patients: panel list opens; a record shows conditions and allergies', async ({ page }) => {
  await nav(page, 'patients');
  await page.waitForURL(/patients/);
  await expect(page.getByText("Mary O'Brien").first()).toBeVisible();
  await expect(page.getByText('Ciarán Doyle').first()).toBeVisible();

  await page.goto('/patients/p1');
  await expect(page.getByText('Type 2 diabetes').first()).toBeVisible(); // active condition
  await expect(page.getByText('Penicillin').first()).toBeVisible(); // allergy
});

test('calendar: day diary renders; booking a new appointment works', async ({ page }) => {
  await nav(page, 'calendar');
  await page.waitForURL(/calendar/);

  // Day view: per-clinician resource columns for the seeded staff
  await expect(page.getByTestId('button-new-appointment')).toBeVisible();
  await expect(page.getByText('Sarah Murphy').first()).toBeVisible();
  await expect(page.getByText('Aisling Brennan').first()).toBeVisible();

  // Positive booking flow: open the modal, pick a patient, confirm
  await page.getByTestId('button-new-appointment').click();
  await expect(page.getByRole('heading', { name: 'Book appointment' })).toBeVisible();

  await page.locator('select').first().selectOption({ index: 1 }); // first panel patient
  await page.getByTestId('button-confirm-booking').click();

  // Modal closes on success and the diary stays interactive
  await expect(page.getByRole('heading', { name: 'Book appointment' })).toBeHidden();
});

test('waiting room shows the checked-in patient', async ({ page }) => {
  await page.goto('/waiting-room');
  await expect(page.getByText('Ciarán Doyle').first()).toBeVisible(); // seeded checked_in
});

test('prescriptions: GP approves a pending repeat request', async ({ page }) => {
  await nav(page, 'prescriptions');
  await page.waitForURL(/prescriptions/);
  await expect(page.getByText('Salbutamol 100mcg')).toBeVisible(); // pending repeat (via app)

  await page.getByTestId('button-approve-rx-rr1').click(); // confirm dialog auto-accepted
  await expect(page.getByTestId('button-approve-rx-rr1')).toBeHidden(); // no longer pending
});

test('healthlink: labs tab filters abnormal results', async ({ page }) => {
  await nav(page, 'healthlink');
  await page.waitForURL(/healthlink/);
  await expect(page.getByText('HbA1c 8.2% (H), U&E, Lipids — chol 5.8 (H)')).toBeVisible();

  await page.getByRole('button', { name: /abnormal/i }).first().click();
  await expect(page.getByText('INR 3.8 (H) — above therapeutic range')).toBeVisible();
  await expect(page.getByText('FBC, TFT, LFT — all within normal range')).toBeHidden(); // normal filtered out
});

test('every core page renders without crashing (navigation sweep)', async ({ page }) => {
  const routes = ['/cdm', '/referrals', '/billing', '/insights', '/staff', '/workflows', '/settings', '/sile'];
  for (const route of routes) {
    await page.goto(route);
    await expect(page.locator('.main-grid')).toBeVisible();
    expect(new URL(page.url()).pathname, `rendered ${route}`).toBe(route);
  }
});

test('login page renders the Google sign-in card', async ({ page }) => {
  await page.goto('/login');
  await expect(page.getByRole('button', { name: 'Continue with Google' })).toBeVisible();
  await expect(page.getByText('Create a practice')).toBeVisible();
});
