// Sign in with email magic link. First sign-in links the user to their
// patient record via the claim_patient_access RPC (handled in App.tsx once
// the session is restored from the deep link).
import { useState } from 'react';
import { KeyboardAvoidingView, Platform, Text, View } from 'react-native';
import { supabase } from '../lib/supabase';
import { BigButton, Field, styles } from '../ui';

export default function Login() {
  const [email, setEmail] = useState('');
  const [sent, setSent] = useState(false);
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const sendLink = async () => {
    setBusy(true);
    setError('');
    const { error: otpError } = await supabase.auth.signInWithOtp({ email });
    setBusy(false);
    if (otpError) {
      setError('Could not send the link. Check your email address and try again.');
      return;
    }
    setSent(true);
  };

  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <View style={{ flex: 1, justifyContent: 'center' }}>
        <Text style={styles.title}>MyCúram</Text>
        <Text style={styles.subtitle}>
          Sign in with your email. Your practice adds your email to your record — if it is not
          recognised, phone the practice.
        </Text>
        {sent ? (
          <Text style={styles.body}>
            We sent a sign-in link to {email}. Open it on this device to continue.
          </Text>
        ) : (
          <>
            <Field label="Email address" value={email} onChangeText={setEmail} placeholder="you@example.com" />
            {error ? <Text style={styles.error}>{error}</Text> : null}
            <BigButton label={busy ? 'Sending…' : 'Send sign-in link'} onPress={() => void sendLink()} disabled={busy || !email} />
          </>
        )}
      </View>
    </KeyboardAvoidingView>
  );
}
