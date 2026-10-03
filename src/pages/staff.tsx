import { useEffect, useState } from 'react';
import { AppButton, Badge, Field, SectionTitle, inputClass } from '@/components/shared/ui';
import { ROLE_LABEL } from '@/lib/permissions';
import { inviteStaffMember, fetchStaffMembers, removeStaffMember } from '@/lib/db';
import { supabaseConfigured } from '@/lib/supabase';
import { canManagePractice } from '@/lib/roles';
import { appStore, useAppState } from '@/stores/appStore';
import type { Role } from '@/types/domain';

export default function StaffPage() {
  const state = useAppState();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('nurse');
  const [email, setEmail] = useState('');
  const [busy, setBusy] = useState(false);
  const [removingId, setRemovingId] = useState('');
  const [error, setError] = useState('');
  const [loaded, setLoaded] = useState(false);
  const me = state.staff.find((member) => member.id === state.session?.staffId);

  // Real staff rows from Supabase (including invited-but-not-signed-in members).
  useEffect(() => {
    if (!supabaseConfigured || loaded) return;
    setLoaded(true);
    void fetchStaffMembers().then((members) => {
      members.forEach((member) => appStore.upsertStaff(member));
    });
  }, [loaded]);

  async function addStaff() {
    setError('');
    if (!supabaseConfigured) {
      // Demo mode: local only.
      appStore.upsertStaff({
        id: `st_${Date.now()}`,
        practiceId: state.practice.id,
        name,
        role,
        email,
        phone: '',
        sessions: 'TBC',
        permissions: [role],
        initials: name.slice(0, 2).toUpperCase(),
        title: ROLE_LABEL[role],
        colour: 'slate',
        active: true,
      });
      setName('');
      setEmail('');
      return;
    }
    setBusy(true);
    const { error: inviteError } = await inviteStaffMember({
      practiceId: state.practice.id,
      name,
      role,
      email,
    });
    setBusy(false);
    if (inviteError) {
      setError(inviteError.message);
      return;
    }
    const members = await fetchStaffMembers();
    members.forEach((member) => appStore.upsertStaff(member));
    setName('');
    setEmail('');
  }

  async function removeMember(memberId: string, memberName: string) {
    if (!window.confirm(`Remove ${memberName} from ${state.practice.name}? Their login is revoked immediately — signed notes stay in the record. They can rejoin later via a new invite.`)) return;
    setRemovingId(memberId);
    setError('');
    const result = await removeStaffMember(memberId);
    setRemovingId('');
    if (!result.ok) {
      const payload = result.payload as { error?: string };
      setError(payload.error ?? 'Could not remove staff member.');
      return;
    }
    const members = await fetchStaffMembers();
    members.forEach((member) => appStore.upsertStaff(member));
  }

  return (
    <div className="fade-in">
      <SectionTitle title="Staff & rota" description="Roles drive the sidebar. Reception cannot approve prescriptions or sign CDM GP reviews. Invite staff with the email they will sign in with." />
      <div className="surface divide-y rounded-xl">
        {state.staff.map((member) => (
          <div key={member.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <div className="text-xs font-semibold">{member.name}</div>
              <div className="text-[11px] text-slate-500">{member.title} · {member.sessions} · {member.email}</div>
            </div>
            <Badge tone="teal">{ROLE_LABEL[member.role]}</Badge>
            {member.googleCalendarId && <Badge tone="blue">Google</Badge>}
            {member.invited && <Badge tone="amber">Invite pending</Badge>}
            <Badge tone={member.active ? 'teal' : 'slate'}>{member.active ? 'Active' : 'Leave'}</Badge>
            {supabaseConfigured && me && canManagePractice(me.role) && member.active !== false && member.id !== me.id && (
              <AppButton
                size="sm"
                variant="ghost"
                disabled={removingId === member.id}
                onClick={() => void removeMember(member.id, member.name)}
              >
                {removingId === member.id ? 'Removing…' : 'Remove'}
              </AppButton>
            )}
          </div>
        ))}
      </div>
      <form
        className="surface mt-4 grid max-w-lg gap-3 rounded-xl p-4"
        onSubmit={(event) => {
          event.preventDefault();
          void addStaff();
        }}
      >
        <h2 className="text-sm font-semibold">Invite staff</h2>
        <p className="text-[11px] text-slate-500">
          They sign in with Google using this exact email. Each clinician then connects their own Google Calendar and Healthmail — credentials stay private to them.
        </p>
        <Field label="Name"><input className={inputClass} required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email (must match their sign-in)"><input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Role">
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {Object.keys(ROLE_LABEL).map((item) => (
              <option key={item} value={item}>
                {ROLE_LABEL[item as Role]}
              </option>
            ))}
          </select>
        </Field>
        {error && <p className="text-xs text-red-600">{error}</p>}
        <AppButton type="submit" size="sm" variant="primary" disabled={busy}>
          {busy ? 'Inviting…' : 'Send invite'}
        </AppButton>
      </form>
    </div>
  );
}
