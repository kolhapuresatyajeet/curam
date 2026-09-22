import { appStore, useAppState } from '@/stores/appStore';

export function useAuth() {
  const state = useAppState();
  const staff = state.staff.find((item) => item.id === state.session?.staffId);
  return {
    session: state.session,
    staff,
    isAuthenticated: Boolean(state.session && Date.now() < state.session.expiresAt),
    login: appStore.login,
    logout: appStore.logout,
  };
}
