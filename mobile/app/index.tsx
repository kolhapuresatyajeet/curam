import { Pressable, ScrollView, Text, View } from 'react-native';

/** MyCúram — large tap targets, 18px minimum type, no swipe-only actions. */
export default function HomeScreen() {
  return (
    <ScrollView style={{ flex: 1, backgroundColor: '#f6f3ec', padding: 24 }}>
      <Text style={{ fontSize: 28, fontWeight: '700', color: '#1b3344' }}>MyCúram</Text>
      <Text style={{ fontSize: 18, marginTop: 8, color: '#526272' }}>Your next appointment will appear here.</Text>
      <View style={{ marginTop: 24, gap: 12 }}>
        {['Book appointment', 'Repeat prescription', 'Results', 'Message the practice'].map((label) => (
          <Pressable key={label} style={{ minHeight: 48, borderRadius: 12, backgroundColor: '#0d7c5f', justifyContent: 'center', paddingHorizontal: 16 }}>
            <Text style={{ color: 'white', fontSize: 18, fontWeight: '600' }}>{label}</Text>
          </Pressable>
        ))}
      </View>
    </ScrollView>
  );
}
