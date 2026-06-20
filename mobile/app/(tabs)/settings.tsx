import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { supabase } from '../../lib/supabase';
import Avatar from '../../components/Avatar';
import { C, T } from '../../constants/theme';

const PRACTICE_ID = '00000000-0000-0000-0000-000000000001';

export default function SettingsScreen() {
  const [email,        setEmail]        = useState<string | null>(null);
  const [practiceName, setPracticeName] = useState<string | null>(null);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => {
      setEmail(session?.user?.email ?? null);
    });
    supabase
      .from('practices')
      .select('name')
      .eq('id', PRACTICE_ID)
      .single()
      .then(({ data }) => setPracticeName(data?.name ?? null));
  }, []);

  const handleLogout = () => {
    Alert.alert(
      'Log out',
      'Are you sure you want to log out?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Log out',
          style: 'destructive',
          onPress: () => supabase.auth.signOut(),
        },
      ],
    );
  };

  const version = Constants.expoConfig?.version ?? '—';

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        <Text style={s.title}>Settings</Text>

        {/* Profile card */}
        <View style={s.profileCard}>
          <Avatar
            name={email ?? 'Account'}
            initials={(practiceName ?? email ?? '?')[0].toUpperCase()}
            size={56}
          />
          <View style={{ flex: 1, minWidth: 0 }}>
            <Text style={s.profileName} numberOfLines={1}>{practiceName ?? 'Your practice'}</Text>
            <Text style={s.profileEmail} numberOfLines={1}>{email ?? '…'}</Text>
          </View>
        </View>
        <Text style={s.readonlyHint}>Account and practice details are managed in the web portal.</Text>

        {/* APP */}
        <Text style={s.sectionLabel}>APP</Text>
        <View style={s.card}>
          <Row
            icon="information-circle-outline"
            label="Version"
            value={version}
          />
        </View>

        {/* LOGOUT — de-emphasised, confirmation-gated */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.7} accessibilityLabel="Log out" accessibilityRole="button">
          <Ionicons name="log-out-outline" size={18} color={C.danger} />
          <Text style={s.logoutText}>Log out</Text>
        </TouchableOpacity>
      </ScrollView>
    </SafeAreaView>
  );
}

function Row({
  icon,
  label,
  value,
}: {
  icon: React.ComponentProps<typeof Ionicons>['name'];
  label: string;
  value: string;
}) {
  return (
    <View style={s.row}>
      <Ionicons name={icon} size={20} color={C.muted} />
      <View style={s.rowContent}>
        <Text style={s.rowLabel}>{label}</Text>
        <Text style={s.rowValue}>{value}</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  scroll: { padding: 20, paddingBottom: 60 },
  title:  { ...T.title, color: C.ink, marginBottom: 24 },

  profileCard: {
    flexDirection: 'row', alignItems: 'center', gap: 14,
    backgroundColor: C.paper, borderRadius: 16, padding: 16,
    borderWidth: 1, borderColor: C.rule,
  },
  profileName:  { ...T.headline, color: C.ink },
  profileEmail: { ...T.subhead, color: C.muted, fontWeight: '400', marginTop: 2 },
  readonlyHint: { fontSize: 12, color: C.muted, marginTop: 10, marginBottom: 24, paddingHorizontal: 4, lineHeight: 17 },

  sectionLabel: {
    fontSize:          11,
    fontWeight:        '700',
    color:             C.muted,
    letterSpacing:     0.8,
    marginBottom:      8,
    marginTop:         4,
    paddingHorizontal: 4,
  },
  card: {
    backgroundColor: C.paper,
    borderRadius:    14,
    borderWidth:     1,
    borderColor:     C.rule,
    marginBottom:    20,
    overflow:        'hidden',
  },
  row: {
    flexDirection:     'row',
    alignItems:        'center',
    paddingHorizontal: 16,
    paddingVertical:   14,
    gap:               12,
  },
  rowContent: { flex: 1 },
  rowLabel:   { fontSize: 12, color: C.muted, marginBottom: 2 },
  rowValue:   { fontSize: 15, fontWeight: '500', color: C.ink },

  logoutBtn: {
    flexDirection:   'row',
    alignItems:      'center',
    justifyContent:  'center',
    gap:             7,
    paddingVertical: 14,
    marginTop:       24,
  },
  logoutText: { fontSize: 15, fontWeight: '600', color: C.danger },
});
