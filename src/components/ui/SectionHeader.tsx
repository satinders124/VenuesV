import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Colors } from '../../theme/tokens';

type Props = { title: string; subtitle?: string; actionLabel?: string; onAction?: () => void; };
export default function SectionHeader({ title, subtitle, actionLabel, onAction }: Props) {
  return (
    <View style={s.wrap}>
      <View style={s.left}>
        <Text style={s.title}>{title}</Text>
        {subtitle && <Text style={s.sub}>{subtitle}</Text>}
      </View>
      {actionLabel && onAction && (
        <TouchableOpacity onPress={onAction} style={s.action}>
          <Text style={s.actionText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-end', marginBottom: 12, gap: 12 },
  left: { flex: 1 },
  title: { fontSize: 16, fontWeight: '800', color: Colors.text, letterSpacing: -0.3 },
  sub: { fontSize: 12, color: Colors.textMuted, marginTop: 3 },
  action: { paddingVertical: 6, paddingHorizontal: 10, backgroundColor: Colors.surfaceRaised, borderRadius: 8, borderWidth: 1, borderColor: Colors.border },
  actionText: { fontSize: 11, fontWeight: '700', color: Colors.blue },
});
