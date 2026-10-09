import { StyleSheet, Text, TextInput, View } from 'react-native';

import { C, R } from '../theme';

type Props = { label: string; value: string; onChange: (v: string) => void; hint?: string };

export function Field({ label, value, onChange, hint }: Props) {
  return (
    <View style={{ marginTop: 10 }}>
      <Text style={styles.label}>{label}</Text>
      <TextInput
        style={styles.input}
        value={value}
        onChangeText={onChange}
        autoCapitalize="none"
        autoCorrect={false}
        placeholderTextColor={C.faint}
        placeholder={label}
      />
      {hint ? <Text style={styles.hint}>{hint}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  label: { color: C.sub, fontSize: 12, fontWeight: '700', marginBottom: 6 },
  input: { backgroundColor: C.raised, color: C.text, fontSize: 15, padding: 12, borderRadius: R.sm },
  hint: { color: C.faint, fontSize: 12, marginTop: 6 },
});
