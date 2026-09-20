import { useMemo } from 'react';
import { useAppState } from '@/stores/appStore';

export function useInbox(tab: string, query: string) {
  const { inbox } = useAppState();
  return useMemo(() => {
    return inbox.filter((item) => {
      const matchQuery = `${item.subject} ${item.body} ${item.fromName}`.toLowerCase().includes(query.toLowerCase());
      if (!matchQuery) return false;
      if (tab === 'all') return true;
      if (tab === 'patient') return item.channel === 'patient_app';
      if (tab === 'healthmail') return item.channel === 'healthmail';
      if (tab === 'sile') return item.channel === 'sile_draft';
      if (tab === 'internal') return item.channel === 'internal';
      if (tab === 'unread') return !item.read;
      return true;
    });
  }, [inbox, tab, query]);
}
