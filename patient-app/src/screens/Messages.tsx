// Two-way secure messaging with the practice. Read receipts both ways.
import { useCallback, useState } from 'react';
import { ScrollView, Text, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { fetchMessages, markPracticeMessagesRead, sendMessage, type Message } from '../lib/api';
import { BigButton, Field, styles } from '../ui';
import { formatIrishDate, formatIrishTime } from '../lib/datetime';

export default function Messages() {
  const [messages, setMessages] = useState<Message[]>([]);
  const [draft, setDraft] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState('');

  const load = useCallback(() => {
    void fetchMessages().then((list) => {
      setMessages(list);
      void markPracticeMessagesRead();
    });
  }, []);

  useFocusEffect(load);

  const send = async () => {
    if (!draft.trim()) return;
    setBusy(true);
    setError('');
    try {
      await sendMessage(draft.trim());
      setDraft('');
      load();
    } catch (e) {
      setError(e instanceof Error ? e.message : 'Could not send');
    } finally {
      setBusy(false);
    }
  };

  return (
    <View style={styles.screen}>
      <Text style={styles.title}>Messages</Text>
      <ScrollView style={{ flex: 1 }} contentContainerStyle={{ paddingBottom: 12 }}>
        {messages.length === 0 && (
          <Text style={styles.body}>
            No messages yet. You can send a non-urgent message to the practice here.
          </Text>
        )}
        {messages.map((message) => {
          const mine = message.direction === 'to_practice';
          return (
            <View
              key={message.id}
              style={{
                alignSelf: mine ? 'flex-end' : 'flex-start',
                maxWidth: '85%',
                backgroundColor: mine ? '#0f766e' : '#f1f5f9',
                borderRadius: 14,
                padding: 14,
                marginBottom: 10,
              }}
            >
              <Text style={{ fontSize: 18, color: mine ? '#ffffff' : '#0f172a', lineHeight: 26 }}>
                {message.body}
              </Text>
              <Text style={{ fontSize: 14, color: mine ? '#ccfbf1' : '#64748b', marginTop: 6 }}>
                {formatIrishDate(message.createdAt)} {formatIrishTime(message.createdAt)}
                {!mine && message.readAt ? ' · read' : ''}
              </Text>
            </View>
          );
        })}
      </ScrollView>
      {error ? <Text style={styles.error}>{error}</Text> : null}
      <Field label="Write a message (not for emergencies — phone 999/112 in an emergency)" value={draft} onChangeText={setDraft} multiline />
      <BigButton label={busy ? 'Sending…' : 'Send'} onPress={() => void send()} disabled={busy || !draft.trim()} />
    </View>
  );
}
