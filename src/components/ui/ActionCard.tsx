import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../../theme/tokens';

type Props = { icon: keyof typeof Ionicons.glyphMap; iconColor: string; title: string; subtitle: string; badge?: string; onPress?: () => void; };
export default function ActionCard({ icon, iconColor, title, subtitle, badge, onPress }: Props) {
  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={0.7}>
      <View style={[s.icon, { backgroundColor: iconColor + '14', borderColor: iconColor + '25' }]}>
        <Ionicons name={icon} size={20} color={iconColor} />
      </View>
      <View style={s.mid}>
        <Text style={s.title}>{title}</Text>
        <Text style={s.sub}>{subtitle}</Text>
      </View>
      {badge ? (
        <View style={[s.badge, { backgroundColor: iconColor + '14' }]}>
          <Text style={[s.badgeText, { color: iconColor }]}>{badge}</Text>
        </View>
      ) : (
        <Ionicons name="chevron-forward" size={14} color={Colors.textMuted} />
      )}
    </TouchableOpacity>
  );
}
const s = StyleSheet.create({
  card: { flexDirection: 'row', alignItems: 'center', gap: 12, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, padding: 14 },
  icon: { width: 40, height: 40, borderRadius: 11, borderWidth: 1, alignItems: 'center', justifyContent: 'center' },
  mid: { flex: 1, gap: 2 },
  title: { fontSize: 13, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 11, color: Colors.textMuted, lineHeight: 14 },
  badge: { paddingHorizontal: 8, paddingVertical: 4, borderRadius: 99 },
  badgeText: { fontSize: 10, fontWeight: '800' },
});
