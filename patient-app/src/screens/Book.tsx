// Booking: pick a clinician, then a day and time from a fixed slot grid.
// Slots run 9:00-16:30 every 30 min for the next 10 working days.
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { bookAppointment, fetchBookableStaff } from '../lib/api';
import { BigButton, Choice, styles } from '../ui';

const SLOT_TIMES = ['09:00', '09:30', '10:00', '10:30', '11:00', '11:30', '14:00', '14:30', '15:00', '15:30', '16:00'];
const DAYS_AHEAD = 10;

function nextDays(count: number): Date[] {
  const days: Date[] = [];
  const cursor = new Date();
  while (days.length < count) {
    cursor.setDate(cursor.getDate() + 1);
    const day = cursor.getDay();
    if (day !== 0 && day !== 6) days.push(new Date(cursor));
  }
  return days;
}

export default function Book() {
  const [staffList, setStaffList] = useState<Array<{ id: string; name: string; role: string }>>([]);
  const [staffId, setStaffId] = useState<string | null>(null);
  const [slot, setSlot] = useState<{ day: Date; time: string } | null>(null);
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      void fetchBookableStaff().then(setStaffList);
    }, []),
  );

  useEffect(() => {
    void fetchBookableStaff().then(setStaffList);
  }, []);

  const days = nextDays(DAYS_AHEAD);

  const confirm = async () => {
    if (!staffId || !slot) return;
    setBusy(true);
    setError('');
    const [h, m] = slot.time.split(':').map(Number);
    const start = new Date(slot.day);
    start.setHours(h, m, 0, 0);
    try {
      await bookAppointment(staffId, start);
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Booking failed');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <ScrollView style={styles.screen}>
        <Text style={styles.title}>Appointment booked</Text>
        <Text style={styles.body}>
          You will get a reminder before your appointment. If you cannot attend, phone the practice.
        </Text>
        <BigButton label="Back to home" onPress={() => setDone(false)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.title}>Book an appointment</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      <Text style={styles.label}>1. Who would you like to see?</Text>
      {staffList.map((member) => (
        <Choice
          key={member.id}
          label={`${member.name} (${member.role === 'gp' ? 'doctor' : 'nurse'})`}
          selected={staffId === member.id}
          onSelect={() => setStaffId(member.id)}
        />
      ))}

      {staffId && (
        <>
          <Text style={styles.label}>2. Pick a day</Text>
          {days.map((day) => (
            <Choice
              key={day.toISOString()}
              label={day.toLocaleDateString('en-IE', { weekday: 'long', day: '2-digit', month: '2-digit' })}
              selected={slot?.day.toDateString() === day.toDateString()}
              onSelect={() => setSlot({ day, time: slot?.time ?? SLOT_TIMES[0] })}
            />
          ))}
          <Text style={styles.label}>3. Pick a time</Text>
          {SLOT_TIMES.map((time) => (
            <Choice key={time} label={time} selected={slot?.time === time} onSelect={() => slot && setSlot({ day: slot.day, time })} />
          ))}
          <BigButton
            label={busy ? 'Booking…' : 'Confirm booking'}
            onPress={() => void confirm()}
            disabled={busy || !slot}
          />
        </>
      )}
    </ScrollView>
  );
}
