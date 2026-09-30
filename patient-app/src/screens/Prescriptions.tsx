// Repeat prescriptions: tick active medications, choose pharmacy, submit.
import { useCallback, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchActivePrescriptions, fetchMe, requestRepeat, type ActiveRx, type Me } from '../lib/api';
import { BigButton, Choice, Field, styles } from '../ui';

export default function Prescriptions() {
  const [meds, setMeds] = useState<ActiveRx[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [me, setMe] = useState<Me | null>(null);
  const [pharmacy, setPharmacy] = useState('');
  const [busy, setBusy] = useState(false);
  const [done, setDone] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      void fetchActivePrescriptions().then((list) => {
        setMeds(list);
        setSelected(new Set());
      });
      void fetchMe().then((profile) => {
        setMe(profile);
        setPharmacy(profile.pharmacyName);
      });
    }, []),
  );

  const submit = async () => {
    setBusy(true);
    setError('');
    try {
      await requestRepeat([...selected]);
      if (me && pharmacy && pharmacy !== me.pharmacyName) {
        await (await import('../lib/api')).updateProfile({
          phone: me.phone,
          email: me.email,
          address: me.address,
          pharmacyName: pharmacy,
        });
      }
      setDone(true);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send request');
    } finally {
      setBusy(false);
    }
  };

  if (done) {
    return (
      <ScrollView style={styles.screen}>
        <Text style={styles.title}>Request sent</Text>
        <Text style={styles.body}>
          The practice will review your request. You will get a message when your prescription is
          ready at the pharmacy.
        </Text>
        <BigButton label="Back" onPress={() => setDone(false)} />
      </ScrollView>
    );
  }

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.title}>Repeat prescription</Text>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {meds.length === 0 ? (
        <Text style={styles.body}>You have no active prescriptions. Phone the practice to discuss.</Text>
      ) : (
        <>
          <Text style={styles.label}>Tick the medicines you need:</Text>
          {meds.map((med) => (
            <Choice
              key={med.id}
              label={`${med.drugName} ${med.dose ?? ''}`.trim()}
              detail={med.frequency ?? undefined}
              selected={selected.has(med.id)}
              onSelect={() => {
                setSelected((current) => {
                  const next = new Set(current);
                  if (next.has(med.id)) next.delete(med.id);
                  else next.add(med.id);
                  return next;
                });
              }}
            />
          ))}
          <Field label="Pharmacy" value={pharmacy} onChangeText={setPharmacy} placeholder="Your pharmacy" />
          <BigButton
            label={busy ? 'Sending…' : 'Send request'}
            onPress={() => void submit()}
            disabled={busy || selected.size === 0}
          />
          <Text style={{ ...styles.subtitle, marginTop: 4 }}>
            Prescriptions always need your doctor to approve them first.
          </Text>
        </>
      )}
    </ScrollView>
  );
}
