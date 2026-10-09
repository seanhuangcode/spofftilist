// Phone side of "move the login to your phone": paste the code made on a computer.

import { useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import { loginWithCode } from '../lib/session';
import { requestSync } from '../lib/sync';
import { C, R } from '../theme';

export function CodeLogin() {
  const [code, setCode] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const submit = async () => {
    if (!code.trim() || busy) return;
    setBusy(true);
    setError(null);
    try {
      await loginWithCode(code);
      requestSync();
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
      setBusy(false);
    }
  };

  return (
    <View style={styles.box}>
      <Text style={styles.title}>Log in with a code from your computer</Text>
      <Text style={styles.text}>
        On your computer, open seanhuangcode.github.io/spofftilist, log in, then go to Settings → Move login to your
        phone. Scan its QR code, or copy the code and paste it here.
      </Text>
      <View style={styles.row}>
        <TextInput
          style={styles.input}
          value={code}
          onChangeText={setCode}
          placeholder="Paste login code"
          placeholderTextColor={C.faint}
          autoCapitalize="none"
          autoCorrect={false}
          onSubmitEditing={submit}
        />
        <Pressable style={[styles.btn, (!code.trim() || busy) && { opacity: 0.4 }]} onPress={submit} disabled={busy}>
          {busy ? <ActivityIndicator color={C.onGreen} size="small" /> : <Text style={styles.btnText}>Log in</Text>}
        </Pressable>
      </View>
      {error ? <Text style={styles.error}>{error}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  box: { marginTop: 24, backgroundColor: C.card, borderRadius: R.md, padding: 14, gap: 8 },
  title: { color: C.text, fontWeight: '800', fontSize: 15 },
  text: { color: C.sub, fontSize: 13, lineHeight: 18 },
  row: { flexDirection: 'row', gap: 8, marginTop: 4 },
  input: { flex: 1, backgroundColor: C.raised, color: C.text, fontSize: 15, padding: 12, borderRadius: R.sm },
  btn: { backgroundColor: C.green, borderRadius: R.pill, paddingHorizontal: 18, justifyContent: 'center' },
  btnText: { color: C.onGreen, fontWeight: '800' },
  error: { color: C.red, fontSize: 13 },
});
