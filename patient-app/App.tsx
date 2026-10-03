// MyCúram — patient app entry. Auth gate + simple stack navigation.
// Elderly-first: taps only, large targets (see src/ui.tsx).
import './src/lib/monitoring';
import { useEffect, useState } from 'react';
import { Text, View } from 'react-native';
import { NavigationContainer } from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { supabase } from './src/lib/supabase';
import { claimAccess } from './src/lib/api';
import Home from './src/screens/Home';
import Book from './src/screens/Book';
import Prescriptions from './src/screens/Prescriptions';
import Results from './src/screens/Results';
import Messages from './src/screens/Messages';
import Log from './src/screens/Log';
import Profile from './src/screens/Profile';
import Login from './src/screens/Login';

type Tab =
  | 'Home' | 'Book' | 'Prescriptions' | 'Results' | 'Messages' | 'Log' | 'Profile';

function MainTabs({ onSignedOut }: { onSignedOut: () => void }) {
  const [tab, setTab] = useState<Tab>('Home');
  return (
    <View style={{ flex: 1 }}>
      <View style={{ flex: 1 }}>
        {tab === 'Home' && <Home navigate={(s) => setTab(s as Tab)} />}
        {tab === 'Book' && <Book />}
        {tab === 'Prescriptions' && <Prescriptions />}
        {tab === 'Results' && <Results />}
        {tab === 'Messages' && <Messages />}
        {tab === 'Log' && <Log />}
        {tab === 'Profile' && <Profile onSignedOut={() => setTab('Home')} />}
      </View>
      {/* Tab bar: big labelled buttons, no gestures. */}
      <View style={{ flexDirection: 'row', borderTopWidth: 2, borderTopColor: '#cbd5e1', backgroundColor: '#ffffff' }}>
        {(
          [
            ['Home', '⌂'],
            ['Book', '＋'],
            ['Prescriptions', '℞'],
            ['Results', '⚙'],
            ['Messages', '✉'],
            ['Log', '♥'],
            ['Profile', '☺'],
          ] as Array<[Tab, string]>
        ).map(([name, glyph]) => (
          <Text
            key={name}
            onPress={() => setTab(name)}
            style={{
              flex: 1,
              textAlign: 'center',
              paddingVertical: 12,
              fontSize: name === tab ? 16 : 15,
              fontWeight: name === tab ? '800' : '600',
              color: name === tab ? '#0f766e' : '#334155',
            }}
          >
            {glyph}
            {'\n'}
            {name}
          </Text>
        ))}
      </View>
    </View>
  );
}

export default function App() {
  const [session, setSession] = useState<boolean | null>(null); // null = loading
  const [claimed, setClaimed] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data }) => setSession(Boolean(data.session)));
    const { data: sub } = supabase.auth.onAuthStateChange((_event, newSession) => {
      setSession(Boolean(newSession));
      if (newSession) setClaimed(false);
    });
    return () => sub?.subscription.unsubscribe();
  }, []);

  // First sign-in: link the auth user to their patient record.
  useEffect(() => {
    if (!session || claimed) return;
    supabase.auth
      .getUser()
      .then(({ data }) => {
        if (data.user?.email) return claimAccess(data.user.email);
        return undefined;
      })
      .catch(() => undefined)
      .finally(() => setClaimed(true));
  }, [session, claimed]);

  if (session === null) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', backgroundColor: '#fff' }}>
        <Text style={{ fontSize: 20, color: '#0f172a' }}>Loading…</Text>
      </View>
    );
  }

  return (
    <NavigationContainer>
      {session ? <MainTabs onSignedOut={() => setSession(false)} /> : <Login />}
    </NavigationContainer>
  );
}
