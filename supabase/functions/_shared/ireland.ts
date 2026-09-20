export function dublinWallToIso(day: string, hour: number, minute: number) {
  const pad = (n: number) => String(n).padStart(2, '0');
  const asUtc = Date.parse(`${day}T${pad(hour)}:${pad(minute)}:00.000Z`);
  const shown = new Date(asUtc).toLocaleString('en-US', { timeZone: 'Europe/Dublin' });
  const localAsUtc = Date.parse(shown);
  return new Date(asUtc - (localAsUtc - asUtc)).toISOString();
}
