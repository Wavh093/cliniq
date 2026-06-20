import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C, T } from '../constants/theme';

interface Props {
  segments: string[];
  value: number;
  onChange: (index: number) => void;
}

/** Horizontal segment tabs (iOS-style) for switching views within a screen. */
export default function SegmentedControl({ segments, value, onChange }: Props) {
  return (
    <View style={s.track}>
      {segments.map((label, i) => {
        const active = i === value;
        return (
          <TouchableOpacity
            key={label}
            style={[s.segment, active && s.segmentActive]}
            onPress={() => onChange(i)}
            activeOpacity={0.8}
            accessibilityRole="tab"
            accessibilityState={{ selected: active }}
          >
            <Text style={[s.label, active && s.labelActive]}>{label}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

const s = StyleSheet.create({
  track: {
    flexDirection: 'row',
    backgroundColor: C.sageSoft,
    borderRadius: 12,
    padding: 4,
    gap: 4,
  },
  segment: {
    flex: 1,
    paddingVertical: 9,
    borderRadius: 9,
    alignItems: 'center',
  },
  segmentActive: {
    backgroundColor: C.paper,
    shadowColor: '#0d2d3e',
    shadowOpacity: 0.08,
    shadowRadius: 4,
    shadowOffset: { width: 0, height: 1 },
    elevation: 1,
  },
  label:       { ...T.subhead, color: C.muted, fontWeight: '600' },
  labelActive: { color: C.ink },
});
