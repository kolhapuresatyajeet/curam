// Cúram — automated email test suite (free providers, no accounts needed).
//
// Run:  npm run test:email          (offline-capable SMTP round-trips)
//       CURAM_LIVE_SMOKE=1 npm run test:email   (+ deployed function checks)
//
// Uses Ethereal (ethereal.email — the Nodemailer project's free fake SMTP).
// A fresh test account is generated automatically on every run: nothing to
// sign up for, nothing delivered to real patients, full message bodies
// assertable via the returned preview URL.
//
// The senders below intentionally mirror the production code:
//   - prescription email  → supabase/functions/send-healthmail/index.ts
//   - booking email texts → supabase/functions/_shared/booking-mail.ts
// If you change those, update the mirrors here so the suite keeps guarding
// the real behaviour.

import test from 'node:test';
import assert from 'node:assert/strict';
import nodemailer from 'nodemailer';

const SUPABASE_URL = 'https://duphvinfwkskjkfqaetr.supabase.co';

// --- mirrors send-healthmail/index.ts transporter config -------------------
function healthmailTransport(account) {
  return nodemailer.createTransport({
    host: process.env.HEALTHMAIL_SMTP_HOST ?? 'smtp.ethereal.email',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: account.user, pass: account.pass },
  });
}

// --- mirrors send-healthmail/index.ts prescription composition -------------
function prescriptionEmail({ patient, dob, lines, prescriber, sentDate }) {
  const rowsHtml = lines
    .map(
      (l) =>
        `<tr><td style="padding:4px 10px 4px 0"><b>${l.drug}</b></td><td style="padding:4px 10px 4px 0">${l.dose}</td><td style="padding:4px 10px 4px 0">${l.frequency}</td><td style="padding:4px 10px 4px 0">${l.months} month(s)</td></tr>`,
    )
    .join('');
  const html = `
    <div style="font-family:Arial,sans-serif;font-size:14px;color:#1f2937">
      <p><b>ELECTRONIC PRESCRIPTION</b></p>
      <p>Patient: <b>${patient}</b><br/>DOB: ${dob}</p>
      <table style="border-collapse:collapse"><thead><tr><th align="left">Medication</th><th align="left">Dose</th><th align="left">Frequency</th><th align="left">Duration</th></tr></thead><tbody>${rowsHtml}</tbody></table>
      <p>Prescriber: <b>${prescriber}</b> (GP)<br/>Sent via Healthmail on ${sentDate}</p>
      <p style="color:#6b7280;font-size:12px">This prescription was sent electronically under Irish ePrescribing legislation (S.I. 94 of 2020). Please contact the practice for any queries.</p>
    </div>`;
  return { subject: `Prescription — ${patient} (DOB ${dob})`, html };
}

// --- mirrors booking-mail.ts dublinStamp -----------------------------------
function dublinStamp(iso) {
  return new Date(iso).toLocaleString('en-IE', {
    timeZone: 'Europe/Dublin',
    dateStyle: 'medium',
    timeStyle: 'short',
  });
}

// --- mirrors booking-mail.ts patient/GP texts -------------------------------
function bookingTexts({ firstName, when, staffName, type, kind }) {
  const verb = kind === 'booked' ? 'booked' : 'cancelled';
  return {
    patientSubject: kind === 'booked' ? 'Your GP appointment is confirmed' : 'Your GP appointment was cancelled',
    patientText:
      kind === 'booked'
        ? `Hello ${firstName},\n\nYour GP appointment is ${verb} for ${when} with ${staffName} (${type}).\n\nIf you need to change this, call the practice or the voice line.\n\nCúram`
        : `Hello ${firstName},\n\nYour GP appointment on ${when} has been cancelled.\n\nCúram`,
    gpSubject: `Cúram: appointment ${verb} — ${firstName}`,
    gpText: `${firstName}: appointment ${verb} for ${when} (${type}).`,
  };
}

async function capturedBody(info) {
  const url = nodemailer.getTestMessageUrl(info);
  assert.ok(url, 'Ethereal should return a preview URL for every captured message');
  const res = await fetch(url);
  assert.ok(res.ok, `preview URL fetch failed: HTTP ${res.status}`);
  return (await res.text()).toLowerCase();
}

test('ethereal test account is created automatically (free provider reachable)', async () => {
  const account = await nodemailer.createTestAccount();
  assert.match(account.user, /@ethereal\.email$/);
  assert.ok(account.pass, 'password generated');
});

test('prescription email round-trips via SMTP with the Healthmail transport config', async () => {
  const account = await nodemailer.createTestAccount();
  const transporter = healthmailTransport(account);

  const sentDate = new Date().toLocaleDateString('en-IE', { day: '2-digit', month: '2-digit', year: 'numeric' });
  const { subject, html } = prescriptionEmail({
    patient: 'Mary O’Brien',
    dob: '12/04/1958',
    lines: [{ drug: 'Metformin', dose: '500mg', frequency: 'twice daily', months: 3 }],
    prescriber: 'Dr Test GP',
    sentDate,
  });

  const info = await transporter.sendMail({
    from: account.user, // prescriber's connected address
    to: 'boots.thomasst@healthmail.ie', // pharmacy — never really delivered
    subject,
    html,
    text: subject,
  });

  assert.ok(info.messageId, 'message accepted by SMTP');
  const body = await capturedBody(info);
  for (const marker of ['electronic prescription', 'mary o’brien', '12/04/1958', 'metformin', '500mg', 'twice daily', 'dr test gp', 's.i. 94 of 2020']) {
    assert.ok(body.includes(marker), `captured email should contain "${marker}"`);
  }
});

test('booking confirmation email renders Irish (Dublin) time and required content', async () => {
  const account = await nodemailer.createTestAccount();
  const transporter = nodemailer.createTransport({
    host: 'smtp.ethereal.email',
    port: 587,
    secure: false,
    requireTLS: true,
    auth: { user: account.user, pass: account.pass },
  });

  // 10:00 UTC on 2026-10-01 is 11:00 in Dublin (IST, UTC+1 in October).
  const start = '2026-10-01T10:00:00.000Z';
  const end = '2026-10-01T10:20:00.000Z';
  const when = `${dublinStamp(start)} – ${dublinStamp(end)}`;
  assert.ok(when.includes('11:00'), `Dublin stamp should render 11:00, got "${when}"`);

  const { patientSubject, patientText, gpText } = bookingTexts({
    firstName: 'Mary',
    when,
    staffName: 'Dr Sarah Murphy',
    type: 'cdm',
    kind: 'booked',
  });

  const info = await transporter.sendMail({
    from: 'Cúram <bookings@mail.voicehub.uk>',
    to: account.user, // patient
    subject: patientSubject,
    text: patientText,
  });
  const body = await capturedBody(info);
  for (const marker of ['your gp appointment is confirmed', 'mary', 'dr sarah murphy', 'cdm', 'cúram']) {
    assert.ok(body.includes(marker), `captured booking email should contain "${marker}"`);
  }

  // GP notification mirror — same transport, separate recipient semantics.
  const gpInfo = await transporter.sendMail({
    from: 'Cúram <bookings@mail.voicehub.uk>',
    to: 'gp@ethereal.email',
    subject: `Cúram: appointment booked — Mary`,
    text: gpText,
  });
  assert.ok(gpInfo.messageId, 'GP notification accepted by SMTP');
});

test('appointment text uses booked/cancelled verbs consistently', () => {
  const booked = bookingTexts({ firstName: 'A', when: 'w', staffName: 's', type: 'routine', kind: 'booked' });
  const cancelled = bookingTexts({ firstName: 'A', when: 'w', staffName: 's', type: 'routine', kind: 'cancelled' });
  assert.match(booked.patientText, /is booked for/);
  assert.match(booked.patientSubject, /is confirmed$/);
  assert.match(cancelled.patientText, /has been cancelled/);
  assert.match(cancelled.patientSubject, /was cancelled$/);
  assert.equal(booked.gpSubject, 'Cúram: appointment booked — A');
});

// --- optional: deployed functions smoke (network + deploy state) -----------
test(
  'live: deployed email functions reject unauthenticated calls (deployed + JWT-protected)',
  { skip: process.env.CURAM_LIVE_SMOKE !== '1' ? 'set CURAM_LIVE_SMOKE=1 to include' : false },
  async () => {
    for (const fn of ['healthmail-connect', 'send-booking-email', 'send-healthmail']) {
      const res = await fetch(`${SUPABASE_URL}/functions/v1/${fn}`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({}),
      });
      assert.ok(
        [401, 403].includes(res.status),
        `${fn} should require auth (401/403), got ${res.status} — is it deployed with verify_jwt?`,
      );
    }
  },
);
