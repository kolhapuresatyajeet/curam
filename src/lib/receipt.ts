// Patient-facing receipt for insurer claim-back (VHI, Laya, Irish Life, Aviva).
// Renders a print-optimised A5 receipt and opens the browser print dialog,
// where the user saves it as PDF to upload to the insurer's portal.
//
// GP services are VAT-exempt in Ireland (VAT Consolidation Act 2010, s. 86 —
// medical services), so no VAT line is shown.
import { formatEur, formatIrishDate } from './utils';
import type { Invoice, Patient, Practice } from '@/types/domain';

const METHOD_LABEL: Record<string, string> = {
  cash: 'Cash (in room)',
  card: 'Card (in room)',
  stripe: 'Card (paid online)',
};

export function receiptHtml(invoice: Invoice, patient: Patient, practice: Practice): string {
  const paid = Math.min(invoice.paidAmount, invoice.amount);
  const method = invoice.paymentMethod ? METHOD_LABEL[invoice.paymentMethod] ?? invoice.paymentMethod : 'Paid';
  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<title>Receipt ${escape(invoice.id.slice(0, 8).toUpperCase())} — ${escape(practice.name)}</title>
<style>
  @page { size: A5; margin: 14mm; }
  * { box-sizing: border-box; }
  body { font-family: -apple-system, 'Segoe UI', Roboto, sans-serif; color: #0f172a; margin: 0; font-size: 12px; }
  .letterhead { display: flex; justify-content: space-between; align-items: flex-start; border-bottom: 2px solid #0d9488; padding-bottom: 10px; }
  .practice-name { font-size: 17px; font-weight: 700; color: #0f766e; }
  .practice-details { text-align: right; color: #475569; line-height: 1.5; font-size: 10.5px; }
  h1 { font-size: 14px; margin: 14px 0 2px; }
  .meta { color: #64748b; font-size: 10.5px; margin-bottom: 12px; }
  table { width: 100%; border-collapse: collapse; }
  th, td { text-align: left; padding: 6px 4px; border-bottom: 1px solid #e2e8f0; }
  th { font-size: 10px; text-transform: uppercase; letter-spacing: .04em; color: #64748b; }
  .amount { text-align: right; }
  .total td { border-bottom: none; border-top: 2px solid #0f172a; font-weight: 700; font-size: 13px; padding-top: 8px; }
  .patient { margin: 12px 0; color: #334155; line-height: 1.6; }
  .note { margin-top: 14px; font-size: 10px; color: #64748b; line-height: 1.5; }
  @media print { .no-print { display: none; } }
  .no-print { margin-top: 16px; text-align: center; }
  .no-print button { padding: 8px 20px; background: #0d9488; color: #fff; border: 0; border-radius: 6px; font-size: 13px; cursor: pointer; }
</style>
</head>
<body>
  <div class="letterhead">
    <div>
      <div class="practice-name">${escape(practice.name)}</div>
      <div style="color:#64748b">Medical receipt</div>
    </div>
    <div class="practice-details">
      ${escape(practice.address).replace('\n', '<br>')}<br>
      ${escape(practice.eircode)}<br>
      ${escape(practice.phone)}<br>
      PCRS reg: ${escape(practice.pcrsReg)}
    </div>
  </div>

  <h1>Receipt ${escape(invoice.id.slice(0, 8).toUpperCase())}</h1>
  <div class="meta">Date: ${formatIrishDate(invoice.issuedAt)} · Paid: ${formatIrishDate(new Date().toISOString())}</div>

  <div class="patient">
    <strong>${escape(patient.firstName)} ${escape(patient.lastName)}</strong><br>
    DOB: ${formatIrishDate(patient.dob)}${patient.ppsNumber ? ` · PPS: ${escape(maskPps(patient.ppsNumber))}` : ''}
  </div>

  <table>
    <thead>
      <tr><th>Service</th><th class="amount">Amount</th></tr>
    </thead>
    <tbody>
      <tr>
        <td>${escape(invoice.description ?? 'Consultation')}${invoice.appointmentId ? '' : ''}</td>
        <td class="amount">${formatEur(invoice.amount)}</td>
      </tr>
      <tr class="total">
        <td>Paid — ${escape(method)}</td>
        <td class="amount">${formatEur(paid)}</td>
      </tr>
    </tbody>
  </table>

  <div class="note">
    This receipt may be used to claim reimbursement from your health insurer
    (VHI, Laya Healthcare, Irish Life Health or Aviva). GP consultations are
    VAT-exempt medical services. Please retain for your records.
  </div>

  <div class="no-print">
    <button onclick="window.print()">Save as PDF / Print</button>
  </div>
</body>
</html>`;
}

function maskPps(pps: string): string {
  // Show first 5 chars, mask the rest — enough for insurer verification.
  return pps.length <= 5 ? pps : `${pps.slice(0, 5)}${'•'.repeat(Math.max(pps.length - 5, 2))}`;
}

function escape(value: string): string {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;');
}

export function openReceipt(invoice: Invoice, patient: Patient, practice: Practice): void {
  const win = window.open('', '_blank', 'width=560,height=740');
  if (!win) return;
  win.document.write(receiptHtml(invoice, patient, practice));
  win.document.close();
}
