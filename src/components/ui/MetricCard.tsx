import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Colors, Radius } from '../../theme/tokens';
import { Ionicons } from '@expo/vector-icons';

type Props = {
  icon: keyof typeof Ionicons.glyphMap;
  iconColor: string;
  value: string | number;
  label: string;
  trend?: string;
  trendUp?: boolean;
};
export default function MetricCard({ icon, iconColor, value, label, trend, trendUp }: Props) {
  return (
    <View style={s.card}>
      <View style={[s.iconWrap, { backgroundColor: iconColor + '18' }]}>
        <Ionicons name={icon} size={18} color={iconColor} />
      </View>
      <View style={s.bottom}>
        <Text style={s.value}>{value}</Text>
        <Text style={s.label}>{label}</Text>
        {trend && <Text style={[s.trend, { color: trendUp ? Colors.brand : Colors.red }]}>{trend}</Text>}
      </View>
    </View>
  );
}
const s = StyleSheet.create({
  card: { flex: 1, minWidth: '47%', backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: 14, gap: 12 },
  iconWrap: { width: 36, height: 36, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  bottom: { gap: 2 },
  value: { fontSize: 22, fontWeight: '900', color: Colors.text, letterSpacing: -0.5 },
  label: { fontSize: 11, color: Colors.textMuted, fontWeight: '600' },
  trend: { fontSize: 10, fontWeight: '700', marginTop: 2 },
});
