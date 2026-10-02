import type { Role } from '@/types/domain';

/**
 * Role permissions for Cúram. Roles: gp, nurse, pm, receptionist, hca, locum.
 * The practice's first GP (bootstrap creator) is the de-facto practice admin;
 * practice managers (pm) share practice-admin powers.
 */

/** Practice-admin actions: Stripe Connect onboarding, integration accounts, practice settings. */
export function canManagePractice(role: Role | undefined | null): boolean {
  return role === 'gp' || role === 'pm';
}

/** Who may connect a Healthmail mailbox (prescribing staff send from their own address). */
export function canUseHealthmail(role: Role | undefined | null): boolean {
  return role === 'gp' || role === 'nurse';
}

/** Who can view practice billing status (all staff see payment state; only canManagePractice may change it). */
export function canViewBilling(role: Role | undefined | null): boolean {
  return Boolean(role);
}
