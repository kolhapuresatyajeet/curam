import { useEffect, useMemo, useState } from 'react';
import { AppButton, EmptyState, SectionTitle, inputClass } from '@/components/shared/ui';
import { impersonate, isPlatformAdmin, listSupportTargets, type SupportPractice, type SupportStaff } from '@/lib/support';
import { formatIrishDate } from '@/lib/utils';

// Platform support console (/support): sign in as any staff member of any
// practice for debugging. Platform-admin accounts only (checked on the
// server); every session start is audit-logged in the target practice.

export default function SupportPage() {
  const [checked, setChecked] = useState(false);
  const [allowed, setAllowed] = useState(false);
  const [practices, setPractices] = useState<SupportPractice[]>([]);
  const [staff, setStaff] = useState<SupportStaff[]>([]);
  const [adminEmail, setAdminEmail] = useState('');
  const [error, setError] = useState('');
  const [busy, setBusy] = useState('');
  const [search, setSearch] = useState('');

  useEffect(() => {
    void (async () => {
      try {
        if (!(await isPlatformAdmin())) {
          setAllowed(false);
        } else {
          setAllowed(true);
          const data = await listSupportTargets();
          setPractices(data.practices);
          setStaff(data.staff);
          setAdminEmail(data.adminEmail);
        }
      } catch (e) {
        setError(e instanceof Error ? e.message : 'Failed to load');
      } finally {
        setChecked(true);
      }
    })();
  }, []);

  const targets = useMemo(() => {
    const q = search.trim().toLowerCase();
    return staff.filter((s) => !q || s.name.toLowerCase().includes(q) || (s.email ?? '').toLowerCase().includes(q) || (practices.find((p) => p.id === s.practice_id)?.name ?? '').toLowerCase().includes(q));
  }, [staff, practices, search]);

  if (!checked) {
    return <div className="fade-in p-10 text-center text-sm text-slate-500">Checking platform access…</div>;
  }

  if (!allowed) {
    return (
      <div className="fade-in mx-auto max-w-lg p-6">
        <EmptyState title="Platform admin access required" detail="This console is only available to the Cúram platform owner. Sign in with the platform admin account." />
      </div>
    );
  }

  const signInAs = (member: SupportStaff) => {
    if (!window.confirm(`Sign in as ${member.name} (${member.role})?\n\nA support session will be recorded in that practice's audit log.`)) return;
    if (!member.user_id) {
      setError('That staff account has no login yet (invite pending).');
      return;
    }
    setBusy(member.id);
    setError('');
    void impersonate(member.user_id)
      .then(() => {
        // Full reload so every store bootstraps under the impersonated identity.
        window.location.href = '/';
      })
      .catch((e) => {
        setBusy('');
        setError(e instanceof Error ? e.message : 'Impersonation failed');
      });
  };

  return (
    <div className="fade-in mx-auto max-w-3xl p-6">
      <SectionTitle title="Support console" description={`Platform admin: ${adminEmail}. Signing in opens a normal session as that staff member — RLS applies, and the practice's audit log records the support session.`} />
      <input className={`${inputClass} mb-4`} placeholder="Search staff or practice…" value={search} onChange={(e) => setSearch(e.target.value)} />
      {error && <p className="mb-3 text-xs text-red-600">{error}</p>}
      <div className="surface divide-y rounded-xl">
        {targets.map((member) => {
          const practice = practices.find((p) => p.id === member.practice_id);
          return (
            <div key={member.id} className="flex items-center justify-between gap-3 px-4 py-3">
              <div className="min-w-0">
                <p className="text-xs font-semibold text-slate-800">
                  {member.name} <span className="font-normal text-slate-400">· {member.role}{member.active === false ? ' · inactive' : ''}</span>
                </p>
                <p className="text-[11px] text-slate-500">
                  {practice?.name ?? member.practice_id} · {member.email ?? 'no email'}
                  {practice?.created_at ? ` · joined ${formatIrishDate(practice.created_at)}` : ''}
                </p>
              </div>
              <AppButton
                size="sm"
                variant="primary"
                disabled={busy === member.id || !member.user_id}
                onClick={() => signInAs(member)}
              >
                {busy === member.id ? 'Opening…' : 'Sign in as'}
              </AppButton>
            </div>
          );
        })}
        {!targets.length && <div className="p-4 text-xs text-slate-500">No staff match.</div>}
      </div>
      <p className="mt-4 text-[11px] text-slate-400">
        While in a support session an amber banner is shown across the app. Sign out of the session to return to your own account.
      </p>
    </div>
  );
}
