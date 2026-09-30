// Results: normal results shown with the GP's comment. Abnormal results NEVER
// show values in the app — the patient is asked to phone the practice (GP
// callback only, per practice policy).
import { useCallback, useState } from 'react';
import { ScrollView, Text } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchResults, type ResultItem } from '../lib/api';
import { BigButton, styles } from '../ui';
import { formatIrishDate } from '../lib/datetime';

function ResultCard({ item }: { item: ResultItem }) {
  if (item.abnormal) {
    return (
      <Text style={[styles.body, { color: '#b91c1c', fontWeight: '700' }]}>
        One of your results needs attention. Please phone the practice to make a callback with
        your doctor. Do not worry — the doctor will explain everything.
      </Text>
    );
  }
  return <Text style={styles.body}>{item.gpComment ?? 'Your result is normal.'}</Text>;
}

export default function Results() {
  const [items, setItems] = useState<ResultItem[]>([]);
  const [openId, setOpenId] = useState<string | null>(null);

  useFocusEffect(
    useCallback(() => {
      void fetchResults().then(setItems);
    }, []),
  );

  return (
    <ScrollView style={styles.screen}>
      <Text style={styles.title}>My results</Text>
      {items.length === 0 && <Text style={styles.body}>No results yet.</Text>}
      {items.map((item) => (
        <Text key={item.id} style={{ marginBottom: 12 }}>
          <Text
            style={{ fontSize: 20, fontWeight: '700', color: '#0f172a' }}
            onPress={() => setOpenId(openId === item.id ? null : item.id)}
          >
            {item.abnormal ? '⚠ Result needs review' : '✓ Result normal'} · {item.source ?? 'Lab'} ·{' '}
            {formatIrishDate(item.receivedAt)}
            {'\n'}
          </Text>
          {openId === item.id ? <ResultCard item={item} /> : null}
        </Text>
      ))}
      <BigButton label="Phone the practice about a result" onPress={() => undefined} kind="plain" />
    </ScrollView>
  );
}
