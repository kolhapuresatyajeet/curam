import type { ModuleId, Role } from '@/types/domain';

export const NAV_GROUPS: {
  label?: string;
  items: { id: ModuleId; label: string; icon: string; roles: Role[] }[];
}[] = [
  {
    items: [
      { id: 'dashboard', label: 'Dashboard', icon: 'dashboard', roles: ['gp', 'nurse', 'pm', 'receptionist', 'hca', 'locum'] },
      { id: 'calendar', label: 'Calendar', icon: 'calendar', roles: ['gp', 'nurse', 'pm', 'receptionist', 'locum'] },
      { id: 'healthlink', label: 'HealthLink', icon: 'healthlink', roles: ['gp', 'nurse'] },
      { id: 'inbox', label: 'Inbox', icon: 'inbox', roles: ['gp', 'nurse', 'pm', 'receptionist'] },
      { id: 'patients', label: 'Patients', icon: 'patients', roles: ['gp', 'nurse', 'pm', 'receptionist'] },
    ],
  },
  {
    label: 'Clinical',
    items: [
      { id: 'prescriptions', label: 'Prescriptions', icon: 'prescriptions', roles: ['gp', 'nurse'] },
      { id: 'cdm', label: 'CDM programme', icon: 'cdm', roles: ['gp', 'nurse'] },
      { id: 'referrals', label: 'Referrals', icon: 'referrals', roles: ['gp'] },
    ],
  },
  {
    label: 'Practice',
    items: [
      { id: 'billing', label: 'Billing', icon: 'billing', roles: ['gp', 'pm', 'receptionist'] },
      { id: 'sile', label: 'Síle AI', icon: 'sile', roles: ['gp', 'pm'] },
      { id: 'insights', label: 'Insights', icon: 'insights', roles: ['gp', 'pm'] },
    ],
  },
  {
    label: 'Management',
    items: [
      { id: 'staff', label: 'Staff & rota', icon: 'staff', roles: ['gp', 'pm'] },
      { id: 'workflows', label: 'Workflows', icon: 'workflows', roles: ['gp', 'pm'] },
      { id: 'settings', label: 'Settings', icon: 'settings', roles: ['gp', 'pm'] },
    ],
  },
];

export function canAccess(role: Role, moduleId: ModuleId): boolean {
  return NAV_GROUPS.some((group) => group.items.some((item) => item.id === moduleId && item.roles.includes(role)));
}

export function visibleNav(role: Role) {
  return NAV_GROUPS.map((group) => ({
    ...group,
    items: group.items.filter((item) => item.roles.includes(role)),
  })).filter((group) => group.items.length);
}

export const ROLE_LABEL: Record<Role, string> = {
  gp: 'GP',
  nurse: 'Nurse',
  pm: 'Manager',
  receptionist: 'Reception',
  hca: 'HCA',
  locum: 'Locum',
};

export function canApprovePrescriptions(role: Role): boolean {
  return role === 'gp' || role === 'locum';
}

export function canSignCdmGp(role: Role): boolean {
  return role === 'gp';
}

export function canSignCdmNurse(role: Role): boolean {
  return role === 'nurse';
}

export function passwordMeetsPolicy(password: string): boolean {
  return password.length >= 12 && /[A-Z]/.test(password) && /[a-z]/.test(password) && /\d/.test(password);
}
