// Computer side of "move the login to your phone": a QR code (opens Spofftilist already logged in) and a
// code to paste. For phones whose Safari can't load Spotify's login page (iOS 15 and older).

import qrcode from 'qrcode-generator';
import { useMemo, useState } from 'react';
import { Image, Pressable, StyleSheet, Text, View } from 'react-native';

import { loginTransferCode, loginTransferLink } from '../lib/session';
import { C, R } from '../theme';

export function LoginTransfer() {
  const [shown, setShown] = useState(false);
  const [copied, setCopied] = useState(false);
  const link = shown ? loginTransferLink() : null;
  const code = shown ? loginTransferCode() : null;

  const qr = useMemo(() => {
    if (!link) return null;
    const q = qrcode(0, 'L');
    q.addData(link);
    q.make();
    return q.createDataURL(6, 4);
  }, [link]);

  if (!shown) {
    return (
      <Pressable style={styles.btn} onPress={() => setShown(true)}>
        <Text style={styles.btnText}>Show QR code and login code</Text>
      </Pressable>
    );
  }
  if (!link || !code) return <Text style={styles.muted}>Log in on this device first.</Text>;

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(code);
      setCopied(true);
    } catch {
      setCopied(false);
    }
  };

  return (
    <View style={{ gap: 10 }}>
      {qr ? <Image source={{ uri: qr }} style={styles.qr} accessibilityLabel="QR code that logs your phone in" /> : null}
      <Text style={styles.muted}>
        Scan with your iPhone Camera: Spofftilist opens in Safari, already logged in. To use the Home Screen icon
        instead, copy the code below and paste it on the Spofftilist welcome screen.
      </Text>
      <Text style={styles.code} selectable numberOfLines={3}>
        {code}
      </Text>
      <Pressable style={styles.btn} onPress={copy}>
        <Text style={styles.btnText}>{copied ? 'Copied ✓' : 'Copy code'}</Text>
      </Pressable>
      <Text style={styles.warn}>This code is your Spotify login. Don&apos;t share it with anyone.</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  qr: { width: 240, height: 240, alignSelf: 'center', borderRadius: R.sm, backgroundColor: '#fff' },
  muted: { color: C.faint, fontSize: 13, lineHeight: 18 },
  code: { color: C.sub, fontSize: 12, backgroundColor: C.raised, padding: 10, borderRadius: R.sm, fontFamily: 'monospace' },
  btn: { backgroundColor: C.green, borderRadius: R.pill, paddingVertical: 11, alignItems: 'center' },
  btnText: { color: C.onGreen, fontWeight: '800', fontSize: 15 },
  warn: { color: C.amber, fontSize: 12 },
});
