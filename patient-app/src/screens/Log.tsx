// CDM self-management log: glucose, blood pressure, weight, symptoms.
import { useCallback, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { addReading, fetchReadings, type Reading } from '../lib/api';
import { BigButton, Choice, Field, styles } from '../ui';
import { formatIrishDate, formatIrishTime } from '../lib/datetime';

type Type = 'glucose' | 'blood_pressure' | 'weight' | 'symptom';

const LABEL: Record<Type, string> = {
  glucose: 'Blood sugar (glucose)',
  blood_pressure: 'Blood pressure',
  weight: 'Weight',
  symptom: 'How I feel (symptom)',
};

export default function Log() {
  const [readings, setReadings] = useState<Reading[]>([]);
  const [type, setType] = useState<Type>('glucose');
  const [value, setValue] = useState('');
  const [systolic, setSystolic] = useState('');
  const [diastolic, setDiastolic] = useState('');
  const [notes, setNotes] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      void fetchReadings().then(setReadings);
    }, []),
  );

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await addReading({
        readingType: type,
        value: type === 'blood_pressure' ? undefined : Number(value) || undefined,
        systolic: type === 'blood_pressure' ? Number(systolic) || undefined : undefined,
        diastolic: type === 'blood_pressure' ? Number(diastolic) || undefined : undefined,
        unit: type === 'glucose' ? 'mmol/L' : type === 'weight' ? 'kg' : undefined,
        notes: type === 'symptom' ? notes : undefined,
      });
      setValue('');
      setSystolic('');
      setDiastolic('');
      setNotes('');
      setReadings(await fetchReadings());
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.title}>My health log</Text>
      <Text style={styles.subtitle}>Log your readings to share with the practice team.</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}

      {(['glucose', 'blood_pressure', 'weight', 'symptom'] as Type[]).map((option) => (
        <Choice
          key={option}
          label={LABEL[option]}
          selected={type === option}
          onSelect={() => setType(option)}
        />
      ))}

      {type === 'blood_pressure' ? (
        <>
          <Field label="Top number (systolic)" value={systolic} onChangeText={setSystolic} placeholder="120" />
          <Field label="Bottom number (diastolic)" value={diastolic} onChangeText={setDiastolic} placeholder="80" />
        </>
      ) : type === 'symptom' ? (
        <Field label="How do you feel today?" value={notes} onChangeText={setNotes} multiline />
      ) : (
        <Field
          label={type === 'glucose' ? 'Reading (mmol/L)' : 'Weight (kg)'}
          value={value}
          onChangeText={setValue}
          placeholder={type === 'glucose' ? '7.0' : '70'}
        />
      )}

      <BigButton label={busy ? 'Saving…' : 'Save reading'} onPress={() => void save()} disabled={busy} />

      <Text style={styles.label}>Recent readings</Text>
      {readings.map((reading) => (
        <Text key={reading.id} style={styles.body}>
          {formatIrishDate(reading.recordedAt)} {formatIrishTime(reading.recordedAt)} —{' '}
          {LABEL[(reading.readingType as Type) ?? 'symptom']}:{' '}
          {reading.readingType === 'blood_pressure'
            ? `${reading.systolic ?? '—'}/${reading.diastolic ?? '—'}`
            : reading.value ?? reading.notes ?? ''}
        </Text>
      ))}
    </ScrollView>
  );
}
