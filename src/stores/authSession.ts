import { useEffect, useSyncExternalStore } from 'react';
import { fetchPractice, fetchStaffForUser } from '@/lib/db';
import { supabase, supabaseConfigured } from '@/lib/supabase';
import { appStore } from '@/stores/appStore';
import type { Staff } from '@/types/domain';

interface AuthSnapshot {
  ready: boolean;
  userId: string | null;
  email: string | null;
  fullName: string | null;
  staff: Staff | null;
  needsSetup: boolean;
}

let snapshot: AuthSnapshot = {
  ready: !supabaseConfigured,
  userId: null,
  email: null,
  fullName: null,
  staff: null,
  needsSetup: false,
};

const listeners = new Set<() => void>();

function emit() {
  listeners.forEach((fn) => fn());
}

async function hydrate(userId: string | null, email: string | null, fullName: string | null) {
  if (!userId) {
    snapshot = { ready: true, userId: null, email: null, fullName: null, staff: null, needsSetup: false };
    emit();
    return;
  }
  const staff = await fetchStaffForUser(userId);
  if (staff) {
    const practice = await fetchPractice(staff.practiceId);
    appStore.upsertStaff(staff);
    if (practice) {
      appStore.updatePractice({
        id: practice.id,
        name: practice.name,
        address: practice.address ?? '',
        eircode: practice.eircode ?? '',
        phone: practice.phone ?? '',
        healthlinkId: practice.healthlink_id ?? '',
        healthmail: practice.healthmail ?? '',
        pcrsReg: practice.pcrs_reg ?? '',
        stripeAccountId: practice.stripe_account_id ?? '',
      });
    }
    appStore.login(staff.id);
    snapshot = { ready: true, userId, email, fullName, staff, needsSetup: false };
  } else {
    snapshot = { ready: true, userId, email, fullName, staff: null, needsSetup: true };
  }
  emit();
}

let started = false;

function displayName(user?: { user_metadata?: Record<string, unknown>; email?: string } | null) {
  if (!user) return null;
  const meta = user.user_metadata ?? {};
  const name = meta.full_name ?? meta.name ?? meta.given_name;
  return typeof name === 'string' ? name : user.email ?? null;
}

export async function startAuthListener() {
  if (started) return () => undefined;
  started = true;
  if (!supabase) {
    snapshot = { ...snapshot, ready: true };
    emit();
    return () => undefined;
  }
  const { data } = await supabase.auth.getSession();
  const user = data.session?.user;
  await hydrate(user?.id ?? null, user?.email ?? null, displayName(user));
  const { data: sub } = supabase.auth.onAuthStateChange((_event, session) => {
    const next = session?.user;
    void hydrate(next?.id ?? null, next?.email ?? null, displayName(next));
  });
  return () => sub.subscription.unsubscribe();
}

export function useAuthListener() {
  useEffect(() => {
    let stop: (() => void) | undefined;
    void startAuthListener().then((unsub) => {
      stop = unsub;
    });
    return () => stop?.();
  }, []);
}

export function useSupabaseAuth() {
  return useSyncExternalStore(
    (listener) => {
      listeners.add(listener);
      return () => listeners.delete(listener);
    },
    () => snapshot,
    () => snapshot,
  );
}

export async function signOut() {
  await supabase?.auth.signOut();
  appStore.logout();
}
