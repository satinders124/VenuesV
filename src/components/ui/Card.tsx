import React from 'react';
import { View, StyleSheet, ViewStyle } from 'react-native';
import { Colors, Radius } from '../../theme/tokens';

type Props = {
  children: React.ReactNode;
  style?: ViewStyle;
  padded?: boolean;
  elevated?: boolean;
};
export default function Card({ children, style, padded=true, elevated=false }: Props) {
  return (
    <View style={[s.card, padded && s.padded, elevated && s.elevated, style]}>
      {children}
    </View>
  );
}
const s = StyleSheet.create({
  card: { backgroundColor: Colors.surface, borderWidth: 1, borderColor: Colors.border, borderRadius: Radius.lg, overflow: 'hidden' },
  padded: { padding: 16 },
  elevated: { shadowColor: '#000', shadowOffset: { width: 0, height: 8 }, shadowOpacity: 0.25, shadowRadius: 16, elevation: 8 },
});
