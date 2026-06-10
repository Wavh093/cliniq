import React, { useState, useEffect } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Alert, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { supabase } from '../../lib/supabase';
import { C } from '../../constants/theme';

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

        {/* ACCOUNT */}
        <Text style={s.sectionLabel}>ACCOUNT</Text>
        <View style={s.card}>
          <Row
            icon="person-circle-outline"
            label="Signed in as"
            value={email ?? '…'}
          />
        </View>

        {/* PRACTICE */}
        <Text style={s.sectionLabel}>PRACTICE</Text>
        <View style={s.card}>
          <Row
            icon="business-outline"
            label="Practice"
            value={practiceName ?? '…'}
          />
        </View>

        {/* APP */}
        <Text style={s.sectionLabel}>APP</Text>
        <View style={s.card}>
          <Row
            icon="information-circle-outline"
            label="Version"
            value={version}
          />
        </View>

        {/* LOGOUT */}
        <TouchableOpacity style={s.logoutBtn} onPress={handleLogout} activeOpacity={0.8}>
          <Ionicons name="log-out-outline" size={20} color="#fff" />
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
  title:  { fontSize: 28, fontWeight: '700', color: C.ink, marginBottom: 28 },

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
    gap:             8,
    backgroundColor: C.danger,
    borderRadius:    14,
    paddingVertical: 16,
    marginTop:       8,
  },
  logoutText: { fontSize: 16, fontWeight: '600', color: '#fff' },
});
