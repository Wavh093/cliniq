import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { C, T } from '../constants/theme';

interface Props {
  /** Short, human-readable headline. */
  title: string;
  /** One line explaining what to do next. */
  message?: string;
  icon?: React.ComponentProps<typeof Ionicons>['name'];
  onRetry?: () => void;
  onBack?: () => void;
  retryLabel?: string;
  backLabel?: string;
}

/**
 * Friendly, full-screen error state. Never surfaces raw codes — callers
 * should map technical errors (404, network) to plain language first.
 */
export default function ErrorState({
  title,
  message,
  icon = 'alert-circle-outline',
  onRetry,
  onBack,
  retryLabel = 'Try again',
  backLabel = 'Go back',
}: Props) {
  return (
    <View style={s.wrap}>
      <View style={s.iconWell}>
        <Ionicons name={icon} size={30} color={C.muted} />
      </View>
      <Text style={s.title}>{title}</Text>
      {message ? <Text style={s.message}>{message}</Text> : null}
      <View style={s.actions}>
        {onRetry && (
          <TouchableOpacity style={s.primary} onPress={onRetry} activeOpacity={0.85}>
            <Text style={s.primaryText}>{retryLabel}</Text>
          </TouchableOpacity>
        )}
        {onBack && (
          <TouchableOpacity style={s.secondary} onPress={onBack} activeOpacity={0.7}>
            <Text style={s.secondaryText}>{backLabel}</Text>
          </TouchableOpacity>
        )}
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  wrap: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 32 },
  iconWell: {
    width: 64, height: 64, borderRadius: 32, backgroundColor: C.sageSoft,
    alignItems: 'center', justifyContent: 'center', marginBottom: 18,
  },
  title:   { ...T.headline, color: C.ink, textAlign: 'center', marginBottom: 6 },
  message: { ...T.callout, color: C.muted, textAlign: 'center', lineHeight: 20, marginBottom: 22 },
  actions: { alignSelf: 'stretch', gap: 10 },
  primary: {
    backgroundColor: C.sage, borderRadius: 12, paddingVertical: 13, alignItems: 'center',
  },
  primaryText: { ...T.headline, color: '#fff' },
  secondary: { paddingVertical: 12, alignItems: 'center' },
  secondaryText: { ...T.subhead, color: C.sage, fontWeight: '600' },
});
