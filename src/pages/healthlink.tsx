import { useRef, useState } from 'react';
import { FlaskConical, RefreshCw, Upload } from 'lucide-react';
import { AppButton, Avatar, Badge, EmptyState, Field, SectionTitle, TableShell, Tabs, inputClass } from '@/components/shared/ui';
import { useAppState } from '@/stores/appStore';
import { useLocation } from 'wouter';
import { patientName } from '@/types/domain';
import { uploadReport, type UploadResult } from '@/lib/reports';

export default function HealthLinkPage() {
  const [, setLocation] = useLocation();
  const state = useAppState();
  const [tab, setTab] = useState('All');
  const [search, setSearch] = useState('');
  const rows = state.labResults.filter((row) => {
    const patient = state.patients.find((p) => p.id === row.patientId);
    const hay = `${patient ? patientName(patient) : ''} ${row.preview}`.toLowerCase();
    if (search && !hay.includes(search.toLowerCase())) return false;
    if (tab === 'Abnormal') return row.abnormalFlags.length > 0;
    if (tab === 'Awaiting review') return !row.gpReviewed;
    if (tab === 'Software') return false;
    return true;
  });

  return (
    <div className="fade-in">
      <SectionTitle
        eyebrow="Bridge agent ingest"
        title="HealthLink"
        description="Lab results, discharges and referral acks parsed from HL7 and filed to the patient record."
        action={<AppButton size="sm" icon={RefreshCw} onClick={() => window.location.reload()}>Sync now</AppButton>}
      />
    <Tabs items={['All', 'Abnormal', 'Awaiting review', 'Upload', 'Software']} value={tab} onChange={setTab} />
      {tab === 'Software' ? (
        <div className="max-w-2xl">
          <BridgeDownload />
        </div>
      ) : tab === 'Upload' ? (
        <UploadPanel />
      ) : (
        <>
    <input className="mb-3 h-9 max-w-sm rounded-lg border border-slate-200 bg-white px-3 text-xs outline-none focus:border-teal-400 focus:ring-2 focus:ring-teal-100" value={search} onChange={(e) => setSearch(e.target.value)} placeholder="Search patient or result…" />
      <TableShell>
        <thead>
          <tr>
            <th>Type</th>
            <th>Patient</th>
            <th>Preview</th>
            <th>From</th>
            <th>Status</th>
            <th />
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => {
            const patient = state.patients.find((p) => p.id === row.patientId);
            const abnormal = row.abnormalFlags.length > 0;
            return (
              <tr key={row.id}>
                <td>
                  <Badge tone={abnormal ? 'coral' : 'teal'}>
                    <FlaskConical size={11} /> Lab result
                  </Badge>
                </td>
                <td>
                  <div className="flex items-center gap-2">
                    {patient && <Avatar name={patientName(patient)} size="sm" tone={patient.colour} />}
                    <span className="font-semibold text-slate-700">{patient ? patientName(patient) : 'Unmatched'}</span>
                  </div>
                </td>
                <td className="max-w-[330px] truncate">{row.preview}</td>
                <td>{row.sourceHospital}</td>
                <td>
                  <Badge tone={row.gpReviewed ? 'teal' : abnormal ? 'coral' : 'amber'}>{row.gpReviewed ? 'Reviewed' : abnormal ? 'Urgent' : 'New'}</Badge>
                </td>
                <td>
                  {patient && (
                    <AppButton size="sm" variant="ghost" onClick={() => setLocation(`/patients/${patient.id}`)}>
                      Review
                    </AppButton>
                  )}
                </td>
              </tr>
            );
          })}
        </tbody>
      </TableShell>
      {state.referrals.filter((r) => r.healthlinkRef).map((r) => (
        <p key={r.id} className="mt-2 text-[11px] text-slate-500">
          Referral ack {r.healthlinkRef} · {r.hospital}
        </p>
      ))}
      {!rows.length && (
        <EmptyState title="No matching HealthLink items" detail="Filed by the bridge agent or the Upload tab — HL7 lab results, discharges and referral acks." />
      )}
      {!state.labResults.length && (
        <p className="mt-2 text-[11px] text-slate-500">
          No bridge installed? Use the{' '}
          <button type="button" className="text-teal-700 underline" onClick={() => setTab('Upload')}>
            Upload tab
          </button>{' '}
          to file report files manually, or set up the bridge agent under Software.
        </p>
      )}
        </>
      )}
    </div>
  );
}

/** Manual report upload — zero-install path. HL7 XML files are filed to labs
 *  / inbox exactly like bridge messages; PDFs and scans become inbox
 *  documents. Nothing is installed on the practice PC and no bridge keys or
 *  certificates are shared — the GP's own login is the only credential. */
function UploadPanel() {
  const state = useAppState();
  const fileInputRef = useRef<HTMLInputElement | null>(null);
  const [patientId, setPatientId] = useState('');
  const [busy, setBusy] = useState(false);
  const [result, setResult] = useState<UploadResult | null>(null);
  const [error, setError] = useState('');
  const [file, setFile] = useState<File | null>(null);

  async function upload() {
    if (!file) return;
    setBusy(true);
    setError('');
    setResult(null);
    const { data, error: uploadError } = await uploadReport(file, patientId || undefined);
    setBusy(false);
    if (uploadError || !data) return setError(uploadError?.message ?? 'Upload failed');
    setResult(data);
    setFile(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  }

  return (
    <div className="fade-in max-w-2xl space-y-4">
      <div className="surface rounded-xl p-4">
        <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-800">
          <Upload size={14} /> Upload a report file
        </h2>
        <p className="mt-1 text-[12px] leading-5 text-slate-600">
          Download the report anywhere (HealthLink web, hospital portal, email) and drop the file here. Nothing to
          install, no certificates — your Cúram login is the only credential.
        </p>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          <Field label="Link to patient (optional)">
            <select className={inputClass} value={patientId} onChange={(e) => setPatientId(e.target.value)}>
              <option value="">— decide later —</option>
              {state.patients.map((p) => (
                <option key={p.id} value={p.id}>{patientName(p)}</option>
              ))}
            </select>
          </Field>
          <Field label="Report file">
            <input
              ref={fileInputRef}
              type="file"
              className={inputClass}
              accept=".xml,.hl7,.pdf,.png,.jpg,.jpeg,.txt,.doc,.docx"
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </Field>
        </div>
        <div className="mt-3 flex items-center gap-3">
          <AppButton size="sm" variant="primary" icon={Upload} disabled={busy || !file} onClick={() => void upload()}>
            {busy ? 'Uploading…' : 'Upload and file'}
          </AppButton>
          {file && <span className="text-[11px] text-slate-500">{file.name} ({Math.round(file.size / 1024)} kB)</span>}
        </div>
        {result && (
          <div className="mt-3 rounded-lg bg-teal-50 px-3 py-2 text-[12px] text-teal-800">{result.message}</div>
        )}
        {error && <p className="mt-3 text-xs text-red-600">{error}</p>}
      </div>
      <div className="rounded-xl border border-slate-100 bg-slate-50/60 p-4 text-[12px] leading-5 text-slate-600">
        <p className="font-semibold text-slate-700">What happens to each file type</p>
        <p className="mt-1"><span className="font-medium">HL7 XML (.xml, .hl7)</span> — parsed and filed exactly like a
        bridge message: labs to the patient record (abnormal results always go to GP callback, never AI delivery),
        discharge summaries and referral acks to the inbox.</p>
        <p className="mt-1"><span className="font-medium">PDFs, scans, letters</span> — stored encrypted (EU region)
        and filed to the Inbox as a document, linked to the patient you choose.</p>
      </div>
    </div>
  );
}

/** Installers hosted on the public curam-releases GitHub repo (no auth needed on the practice PC). */
const BRIDGE_VERSION = '0.1.0';const BRIDGE_DOWNLOADS = {
  mac: `https://github.com/kolhapuresatyajeet/curam-releases/releases/latest/download/curam-bridge-${BRIDGE_VERSION}-mac.dmg`,
  windows: `https://github.com/kolhapuresatyajeet/curam-releases/releases/latest/download/curam-bridge-${BRIDGE_VERSION}-win-setup.exe`,
};

function BridgeDownload() {
  const ua = navigator.userAgent;
  const isWindows = /Win/i.test(ua);
  const isMac = /Mac/i.test(ua);
  const primary = isWindows ? BRIDGE_DOWNLOADS.windows : isMac ? BRIDGE_DOWNLOADS.mac : null;
  const other = isWindows ? BRIDGE_DOWNLOADS.mac : BRIDGE_DOWNLOADS.windows;

  return (
    <div className="surface mt-4 flex flex-wrap items-center gap-3 rounded-xl p-4">
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold">Cúram HealthLink Bridge · v{BRIDGE_VERSION}</p>
        <p className="mt-0.5 text-[11px] text-slate-500">
          Desktop agent for the practice PC or Mac — polls HealthLink, files results here, sends queued eReferrals.
          Runs in the tray and starts with the OS.
        </p>
      </div>
      {primary && (
        <a href={primary} download>
          <AppButton size="sm" variant="primary">
            Download for {isWindows ? 'Windows' : 'Mac'}
          </AppButton>
        </a>
      )}
      <a href={other} download className="text-[11px] text-teal-700 underline">
        {isWindows ? 'Download for Mac instead' : 'Download for Windows instead'}
      </a>
    </div>
  );
}
