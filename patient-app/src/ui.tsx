// Shared UI for MyCúram — elderly-first: 18px+ text, high contrast,
// 56px tap targets, everything a tap (no swipes or long-presses).
import { Pressable, StyleSheet, Text, TextInput, View, type ViewStyle } from 'react-native';
import { t } from './theme';

export const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: t.colour.paper, padding: t.touch.padding },
  title: { fontSize: t.font.xl, fontWeight: '700', color: t.colour.ink, marginBottom: 8 },
  subtitle: { fontSize: t.font.sm, color: t.colour.muted, marginBottom: 16 },
  card: {
    backgroundColor: t.colour.paper,
    borderRadius: t.radius,
    borderWidth: 1,
    borderColor: t.colour.line,
    padding: t.touch.padding,
    marginBottom: 12,
  },
  body: { fontSize: t.font.sm, color: t.colour.ink, lineHeight: 26 },
  label: { fontSize: t.font.sm, color: t.colour.ink, fontWeight: '600', marginBottom: 6 },
  input: {
    fontSize: t.font.sm,
    color: t.colour.ink,
    borderWidth: 2,
    borderColor: t.colour.line,
    borderRadius: t.radius,
    paddingHorizontal: 14,
    minHeight: t.touch.minHeight,
    backgroundColor: t.colour.paper,
  },
  error: { fontSize: t.font.sm, color: t.colour.danger, marginBottom: 12 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 12 },
});

export function BigButton({
  label,
  onPress,
  disabled,
  kind = 'primary',
}: {
  label: string;
  onPress: () => void;
  disabled?: boolean;
  kind?: 'primary' | 'plain' | 'danger';
}) {
  const bg = kind === 'primary' ? t.colour.brand : kind === 'danger' ? t.colour.danger : t.colour.paper;
  const fg = kind === 'primary' ? '#ffffff' : kind === 'danger' ? '#ffffff' : t.colour.brandDark;
  return (
    <Pressable
      accessibilityRole="button"
      disabled={disabled}
      onPress={onPress}
      style={({ pressed }) => [
        {
          backgroundColor: bg,
          borderRadius: t.radius,
          minHeight: t.touch.minHeight,
          paddingHorizontal: 20,
          justifyContent: 'center',
          alignItems: 'center',
          opacity: disabled ? 0.5 : pressed ? 0.8 : 1,
          borderWidth: kind === 'plain' ? 2 : 0,
          borderColor: t.colour.brand,
          marginBottom: 12,
        } as ViewStyle,
      ]}
    >
      <Text style={{ color: fg, fontSize: t.font.md, fontWeight: '700' }}>{label}</Text>
    </Pressable>
  );
}

export function Field({
  label,
  value,
  onChangeText,
  placeholder,
  multiline,
}: {
  label: string;
  value: string;
  onChangeText: (text: string) => void;
  placeholder?: string;
  multiline?: boolean;
}) {
  return (
    <View style={{ marginBottom: 12 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={[styles.input, multiline && { minHeight: 96, paddingTop: 14, textAlignVertical: 'top' }]}
        value={value}
        onChangeText={onChangeText}
        placeholder={placeholder}
        placeholderTextColor="#64748b"
        autoCapitalize="none"
        keyboardType={label.toLowerCase().includes('email') ? 'email-address' : 'default'}
        multiline={multiline}
      />
    </View>
  );
}

export function Choice({
  label,
  selected,
  onSelect,
  detail,
}: {
  label: string;
  selected: boolean;
  onSelect: () => void;
  detail?: string;
}) {
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onSelect}
      style={[
        styles.card,
        { flexDirection: 'row', alignItems: 'center', borderColor: selected ? t.colour.brand : t.colour.line, borderWidth: 2, marginBottom: 10 },
      ]}
    >
      <View
        style={{
          width: 26,
          height: 26,
          borderRadius: 13,
          borderWidth: 2,
          borderColor: selected ? t.colour.brand : t.colour.line,
          backgroundColor: selected ? t.colour.brand : 'transparent',
          marginRight: 12,
          justifyContent: 'center',
          alignItems: 'center',
        }}
      >
        {selected && <Text style={{ color: '#fff', fontSize: 16, fontWeight: '700' }}>✓</Text>}
      </View>
      <View style={{ flex: 1 }}>
        <Text style={{ fontSize: t.font.sm, color: t.colour.ink, fontWeight: '600' }}>{label}</Text>
        {detail ? <Text style={{ fontSize: t.font.xs, color: t.colour.muted, marginTop: 2 }}>{detail}</Text> : null}
      </View>
    </Pressable>
  );
}
