import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { Colors, Radius } from '../../theme/tokens';

type Props = { icon: keyof typeof Ionicons.glyphMap; title: string; subtitle: string; ctaLabel?: string; onCta?: () => void; };
export default function EmptyState({ icon, title, subtitle, ctaLabel, onCta }: Props) {
  return (
    <View style={s.wrap}>
      <View style={s.iconRing}>
        <Ionicons name={icon} size={32} color={Colors.textMuted} />
      </View>
      <Text style={s.title}>{title}</Text>
      <Text style={s.sub}>{subtitle}</Text>
      {ctaLabel && onCta && (
        <TouchableOpacity style={s.btn} onPress={onCta}>
          <Text style={s.btnText}>{ctaLabel}</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}
const s = StyleSheet.create({
  wrap: { alignItems: 'center', padding: 32, gap: 10, backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg },
  iconRing: { width: 64, height: 64, borderRadius: 32, backgroundColor: Colors.surfaceRaised, borderWidth: 1, borderColor: Colors.border, alignItems: 'center', justifyContent: 'center', marginBottom: 4 },
  title: { fontSize: 15, fontWeight: '700', color: Colors.text },
  sub: { fontSize: 13, color: Colors.textMuted, textAlign: 'center', lineHeight: 18 },
  btn: { marginTop: 8, backgroundColor: Colors.brand, paddingHorizontal: 18, paddingVertical: 10, borderRadius: 10 },
  btnText: { color: Colors.black, fontWeight: '800', fontSize: 13 },
});
