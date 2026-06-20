import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { avatarColor } from '../constants/theme';

interface Props {
  /** Full name or stable seed used to pick a consistent colour. */
  name: string;
  /** Initials to display (1–2 chars). */
  initials: string;
  size?: number;
}

/** Round initial avatar with a deterministic, name-hashed colour. */
export default function Avatar({ name, initials, size = 44 }: Props) {
  const { bg, fg } = avatarColor(name || initials || '?');
  return (
    <View
      style={[
        s.wrap,
        { width: size, height: size, borderRadius: size / 2, backgroundColor: bg },
      ]}
    >
      <Text style={[s.text, { color: fg, fontSize: Math.round(size * 0.36) }]}>
        {initials}
      </Text>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { alignItems: 'center', justifyContent: 'center' },
  text: { fontWeight: '700' },
});
