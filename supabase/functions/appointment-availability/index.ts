import { dublinWallToIso } from '../_shared/ireland.ts';
import { googleBusyWindows } from '../_shared/google-calendar.ts';

const cors = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-booking-key',
};

function json(body: unknown, status = 200) {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...cors, 'Content-Type': 'application/json' },
  });
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response('ok', { headers: cors });
  if (req.method !== 'GET') return json({ error: 'Method not allowed' }, 405);

  const bookingKey = Deno.env.get('BOOKING_API_KEY') ?? '';
  const provided = req.headers.get('x-booking-key') ?? '';
  if (!bookingKey) return json({ error: 'Voice booking is not configured' }, 503);
  if (provided !== bookingKey) return json({ error: 'Voice agent key required' }, 401);

  const url = new URL(req.url);
  const day = url.searchParams.get('date') ?? new Date().toISOString().slice(0, 10);
  if (!/^\d{4}-\d{2}-\d{2}$/.test(day)) return json({ error: 'date must be YYYY-MM-DD' }, 400);
  const practiceId = url.searchParams.get('practiceId');
  const supabaseUrl = Deno.env.get('SUPABASE_URL') ?? '';
  const service = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY') ?? '';
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2');
  const admin = createClient(supabaseUrl, service);

  let staffQuery = admin.from('staff').select('id, name, practice_id').eq('active', true).in('role', ['gp', 'nurse']);
  if (practiceId) staffQuery = staffQuery.eq('practice_id', practiceId);
  const { data: staff } = await staffQuery;
  if (!staff?.length) return json({ date: day, timezone: 'Europe/Dublin', slots: [] });

  const dayStart = dublinWallToIso(day, 8, 30);
  const dayEnd = dublinWallToIso(day, 17, 30);
  const { data: booked } = await admin
    .from('appointments')
    .select('staff_id, start_time, end_time')
    .neq('status', 'cancelled')
    .gte('start_time', dayStart)
    .lt('start_time', dayEnd);

  const busyByStaff: Record<string, { start: string; end: string }[]> = {};
  await Promise.all(
    staff.map(async (member) => {
      busyByStaff[member.id] = await googleBusyWindows(admin, member.id, dayStart, dayEnd);
    }),
  );

  const slots: { staffId: string; staffName: string; startTime: string }[] = [];
  for (const member of staff) {
    for (let hour = 8, minute = 30; hour < 17 || (hour === 17 && minute < 30); ) {
      const startIso = dublinWallToIso(day, hour, minute);
      minute += 20;
      if (minute >= 60) {
        hour += 1;
        minute -= 60;
      }
      const endIso = dublinWallToIso(day, hour, minute);
      const taken = booked?.some(
        (row) =>
          row.staff_id === member.id &&
          new Date(row.start_time) < new Date(endIso) &&
          new Date(row.end_time) > new Date(startIso),
      );
      const googleBusy = busyByStaff[member.id]?.some(
        (block) => new Date(block.start) < new Date(endIso) && new Date(block.end) > new Date(startIso),
      );
      if (!taken && !googleBusy) {
        slots.push({ staffId: member.id, staffName: member.name, startTime: startIso });
      }
    }
  }

  return json({ date: day, timezone: 'Europe/Dublin', slots: slots.slice(0, 40) });
});
