import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { C } from '../constants/theme';

interface Props {
  label: string;
  value: string | number;
  sub?:    string;
  accent?: boolean;
}

export default function StatCard({ label, value, sub, accent }: Props) {
  return (
    <View style={[s.card, accent && s.accent]}>
      <Text style={[s.label, accent && s.accentLabel]}>{label.toUpperCase()}</Text>
      <Text style={[s.value, accent && s.accentValue]}>{value}</Text>
      {sub ? <Text style={[s.sub, accent && s.accentSub]}>{sub}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  card: {
    flex:            1,
    backgroundColor: C.paper,
    borderRadius:    16,
    padding:         16,
    borderWidth:     1,
    borderColor:     C.rule,
  },
  accent: { backgroundColor: C.sage, borderColor: C.sage },
  label:  { fontSize: 10, letterSpacing: 0.8, color: C.muted, marginBottom: 6, fontWeight: '500' },
  value:  { fontSize: 26, fontWeight: '700', color: C.ink },
  sub:    { fontSize: 12, color: C.muted, marginTop: 2 },
  accentLabel: { color: 'rgba(255,255,255,0.7)' },
  accentValue: { color: '#FFFFFF' },
  accentSub:   { color: 'rgba(255,255,255,0.7)' },
});
