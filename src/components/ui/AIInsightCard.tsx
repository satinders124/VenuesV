import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../../theme/tokens';

type Props = { title: string; message: string; actionLabel?: string; onAction?: () => void; type?: 'info' | 'warning' | 'success'; };
export default function AIInsightCard({ title, message, actionLabel, onAction, type='info' }: Props) {
  const cfg = {
    info: { icon: 'sparkles' as const, color: Colors.brand, bg: Colors.brandSoft },
    warning: { icon: 'warning' as const, color: Colors.amber, bg: 'rgba(247,184,75,0.12)' },
    success: { icon: 'checkmark-circle' as const, color: Colors.brand, bg: Colors.brandSoft },
  }[type];
  return (
    <View style={[s.card, { backgroundColor: cfg.bg, borderColor: cfg.color + '30' }]}>
      <View style={s.top}>
        <View style={[s.icon, { backgroundColor: cfg.color + '18' }]}>
          <Ionicons name={cfg.icon} size={16} color={cfg.color} />
        </View>
        <View style={s.badge}>
          <Text style={s.badgeText}>AI Co-Pilot</Text>
        </View>
      </View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.msg}>{message}</Text>
      {actionLabel && onAction && (
        <TouchableOpacity style={[s.btn, { backgroundColor: cfg.color }]} onPress={onAction}>
          <Text style={s.btnText}>{actionLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  card: { borderWidth: 1, borderRadius: Radius.lg, padding: 14, gap: 10 },
  top: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
  icon: { width: 32, height: 32, borderRadius: 9, alignItems: 'center', justifyContent: 'center' },
  badge: { backgroundColor: 'rgba(0,0,0,0.3)', paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99, borderWidth: 1, borderColor: 'rgba(255,255,255,0.08)' },
  badgeText: { fontSize: 8, fontWeight: '800', color: '#fff', letterSpacing: 0.8, textTransform: 'uppercase' },
  title: { fontSize: 14, fontWeight: '800', color: Colors.text, letterSpacing: -0.2 },
  msg: { fontSize: 13, color: Colors.textSecondary, lineHeight: 18 },
  btn: { alignSelf: 'flex-start', paddingHorizontal: 14, paddingVertical: 8, borderRadius: 9, marginTop: 2 },
  btnText: { fontSize: 12, fontWeight: '800', color: Colors.black },
});
