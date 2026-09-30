// Home: next appointment + six big quick actions. Everything is a tap.
import { useCallback, useEffect, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchMe, fetchNextAppointment, type Me, type UpcomingAppointment } from '../lib/api';
import { BigButton, styles } from '../ui';
import { formatIrishDate, formatIrishTime } from '../lib/datetime';

export default function Home({ navigate }: { navigate: (screen: string) => void }) {
  const [me, setMe] = useState<Me | null>(null);
  const [next, setNext] = useState<UpcomingAppointment | null>(null);

  const load = useCallback(() => {
    void fetchMe().then(setMe).catch(() => undefined);
    void fetchNextAppointment().then(setNext).catch(() => undefined);
  }, []);

  useFocusEffect(load);

  useEffect(() => {
    load();
  }, [load]);

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.title}>Hello, {me?.firstName ?? ''}</Text>
      <View style={styles.card}>
        <Text style={styles.label}>Your next appointment</Text>
        {next ? (
          <>
            <Text style={styles.body}>
              {formatIrishDate(next.startTime)} at {formatIrishTime(next.startTime)}
            </Text>
            <Text style={{ ...styles.subtitle, marginBottom: 0 }}>
              {next.type} {next.staffName ? `with ${next.staffName}` : ''}
            </Text>
          </>
        ) : (
          <Text style={styles.subtitle}>No appointment booked.</Text>
        )}
      </View>

      <BigButton label="Book an appointment" onPress={() => navigate('Book')} />
      <BigButton label="Order a repeat prescription" onPress={() => navigate('Prescriptions')} />
      <BigButton label="View my results" onPress={() => navigate('Results')} />
      <BigButton label="Message the practice" onPress={() => navigate('Messages')} />
      <BigButton label="My health log" onPress={() => navigate('Log')} />
      <BigButton label="My details" onPress={() => navigate('Profile')} kind="plain" />
    </ScrollView>
  );
}
