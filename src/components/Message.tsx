import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';

import { C, R } from '../theme';

type Props = { title?: string; text?: string; busy?: boolean; action?: { label: string; onPress: () => void } };

/** A full-screen message, spinner, or both (used by the login screens). */
export function Message({ title, text, busy, action }: Props) {
  return (
    <View style={styles.center}>
      {busy ? <ActivityIndicator color={C.green} /> : null}
      {title ? <Text style={styles.title}>{title}</Text> : null}
      {text ? <Text style={styles.text}>{text}</Text> : null}
      {action ? (
        <Pressable style={styles.btn} onPress={action.onPress}>
          <Text style={styles.btnText}>{action.label}</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, backgroundColor: C.bg, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 10 },
  title: { color: C.text, fontSize: 22, fontWeight: '800', textAlign: 'center' },
  text: { color: C.sub, fontSize: 15, textAlign: 'center', lineHeight: 21 },
  btn: { backgroundColor: C.green, paddingHorizontal: 22, paddingVertical: 12, borderRadius: R.pill, marginTop: 12 },
  btnText: { color: C.onGreen, fontWeight: '800', fontSize: 15 },
});
