// Irish date/time formatting (dd/MM/yyyy, 24-hour).
export function formatIrishDate(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return iso;
  return d.toLocaleDateString('en-IE', { day: '2-digit', month: '2-digit', year: 'numeric' });
}

export function formatIrishTime(iso: string): string {
  const d = new Date(iso);
  if (Number.isNaN(d.getTime())) return '';
  return d.toLocaleTimeString('en-IE', { hour: '2-digit', minute: '2-digit', hour12: false });
}
