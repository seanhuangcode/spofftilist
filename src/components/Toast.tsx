import { Pressable, StyleSheet, Text, View } from 'react-native';

import { undo, type Toast as ToastData } from '../lib/store';
import { C, R } from '../theme';

export function Toast({ toast, top }: { toast?: ToastData; top: number }) {
  if (!toast) return null;
  const decision = toast.undo;
  return (
    <View style={[styles.toast, { top }]} pointerEvents="box-none">
      <Text style={styles.text} numberOfLines={2}>
        {toast.text}
      </Text>
      {decision ? (
        <Pressable onPress={() => undo(decision)} hitSlop={10}>
          <Text style={styles.undo}>Undo</Text>
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  toast: {
    position: 'absolute',
    left: 16,
    right: 16,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    backgroundColor: '#2f2f2f',
    paddingHorizontal: 16,
    paddingVertical: 13,
    borderRadius: R.sm,
    shadowColor: '#000',
    shadowOpacity: 0.4,
    shadowRadius: 12,
    elevation: 8,
  },
  text: { color: C.text, fontSize: 14, flex: 1 },
  undo: { color: C.green, fontWeight: '800', fontSize: 14 },
});
