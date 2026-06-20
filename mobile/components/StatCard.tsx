import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, T, TONES, type StatTone } from '../constants/theme';

interface Props {
  label: string;
  value: string | number;
  sub?:  string;
  tone?: StatTone;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  /** Render the value in a muted style to signal "no data yet" vs a real zero. */
  empty?: boolean;
}

/**
 * Vitals-style metric card. A tinted icon chip plus a tone-coloured value
 * give each metric its own identity so the eye has somewhere to land.
 */
export default function StatCard({ label, value, sub, tone = 'neutral', icon, empty }: Props) {
  const t = TONES[tone];
  return (
    <View style={s.card}>
      {icon ? (
        <View style={[s.chip, { backgroundColor: t.chipBg }]}>
          <Ionicons name={icon} size={15} color={t.chipFg} />
        </View>
      ) : null}
      <Text style={s.label}>{label.toUpperCase()}</Text>
      <Text style={[s.value, { color: empty ? C.muted : t.value }]}>{value}</Text>
      {sub ? <Text style={s.sub}>{sub}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flex:            1,
    backgroundColor: C.paper,
    borderRadius:    16,
    padding:         14,
    borderWidth:     1,
    borderColor:     C.rule,
  },
  chip: {
    width: 30, height: 30, borderRadius: 9,
    alignItems: 'center', justifyContent: 'center', marginBottom: 10,
  },
  label: { ...T.caption, color: C.muted, marginBottom: 4 },
  value: { fontSize: 26, fontWeight: '700' },
  sub:   { ...T.footnote, color: C.muted, marginTop: 2 },
});
