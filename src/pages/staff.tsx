import { useState } from 'react';
import { AppButton, Badge, Field, SectionTitle, inputClass } from '@/components/shared/ui';
import { ROLE_LABEL } from '@/lib/permissions';
import { appStore, useAppState } from '@/stores/appStore';
import type { Role } from '@/types/domain';
import { id } from '@/lib/utils';

export default function StaffPage() {
  const state = useAppState();
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('gp');
  const [email, setEmail] = useState('');

  return (
    <div className="fade-in">
      <SectionTitle title="Staff & rota" description="Roles drive the sidebar. Reception cannot approve prescriptions or sign CDM GP reviews." />
      <div className="surface divide-y rounded-xl">
        {state.staff.map((member) => (
          <div key={member.id} className="flex items-center gap-3 px-4 py-3">
            <div className="flex-1">
              <div className="text-xs font-semibold">{member.name}</div>
              <div className="text-[11px] text-slate-500">{member.title} · {member.sessions}</div>
            </div>
            <Badge tone="teal">{ROLE_LABEL[member.role]}</Badge>
            {member.googleCalendarId && <Badge tone="blue">Google</Badge>}
            <Badge tone={member.active ? 'teal' : 'slate'}>{member.active ? 'Active' : 'Leave'}</Badge>
          </div>
        ))}
      </div>
      <form
        className="surface mt-4 grid max-w-lg gap-3 rounded-xl p-4"
        onSubmit={(event) => {
          event.preventDefault();
          appStore.upsertStaff({
            id: id('st'),
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
        }}
      >
        <h2 className="text-sm font-semibold">Add staff</h2>
        <Field label="Name"><input className={inputClass} required value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Email"><input className={inputClass} type="email" required value={email} onChange={(e) => setEmail(e.target.value)} /></Field>
        <Field label="Role">
          <select className={inputClass} value={role} onChange={(e) => setRole(e.target.value as Role)}>
            {Object.keys(ROLE_LABEL).map((item) => (
              <option key={item} value={item}>
                {ROLE_LABEL[item as Role]}
              </option>
            ))}
          </select>
        </Field>
        <AppButton type="submit" size="sm" variant="primary">
          Add
        </AppButton>
      </form>
    </div>
  );
}
