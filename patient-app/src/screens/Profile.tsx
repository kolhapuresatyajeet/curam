// Profile: update phone, email, address, pharmacy preference.
import { useCallback, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchMe, updateProfile, type Me } from '../lib/api';
import { BigButton, Field, styles } from '../ui';

export default function Profile({ onSignedOut }: { onSignedOut: () => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [phone, setPhone] = useState('');
  const [email, setEmail] = useState('');
  const [address, setAddress] = useState('');
  const [pharmacyName, setPharmacyName] = useState('');
  const [busy, setBusy] = useState(false);
  const [saved, setSaved] = useState(false);
  const [error, setError] = useState('');

  useFocusEffect(
    useCallback(() => {
      void fetchMe().then((profile) => {
        setMe(profile);
        setPhone(profile.phone);
        setEmail(profile.email);
        setAddress(profile.address);
        setPharmacyName(profile.pharmacyName);
      });
    }, []),
  );

  const save = async () => {
    setBusy(true);
    setError('');
    try {
      await updateProfile({ phone, email, address, pharmacyName });
      setSaved(true);
      setTimeout(() => setSaved(false), 2500);
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not save');
    } finally {
      setBusy(false);
    }
  };

  const signOut = async () => {
    const { supabase } = await import('../lib/supabase');
    await supabase.auth.signOut();
    onSignedOut();
  };

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.title}>My details</Text>
      {me && (
        <Text style={styles.subtitle}>
          {me.firstName} {me.lastName} · born {me.dob}
        </Text>
      )}
      {error ? <Text style={styles.error}>{error}</Text> : null}
      {saved ? <Text style={{ ...styles.body, color: '#0f766e', fontWeight: '700' }}>Saved.</Text> : null}
      <Field label="Phone" value={phone} onChangeText={setPhone} placeholder="08X XXX XXXX" />
      <Field label="Email" value={email} onChangeText={setEmail} />
      <Field label="Address" value={address} onChangeText={setAddress} multiline />
      <Field label="Preferred pharmacy" value={pharmacyName} onChangeText={setPharmacyName} />
      <BigButton label={busy ? 'Saving…' : 'Save changes'} onPress={() => void save()} disabled={busy} />
      <BigButton label="Sign out" onPress={() => void signOut()} kind="plain" />
    </ScrollView>
  );
}
