import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, RefreshControl, TouchableOpacity,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { getAppointments, type Appointment } from '../../lib/api';
import AppointmentCard from '../../components/AppointmentCard';
import StatCard from '../../components/StatCard';
import Avatar from '../../components/Avatar';
import { C, T } from '../../constants/theme';
import { supabase } from '../../lib/supabase';


function todayStr() {
  const d = new Date();
  const p = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}`;
}

function greet() {
  const h = new Date().getHours();
  if (h < 12) return 'Good morning';
  if (h < 17) return 'Good afternoon';
  return 'Good evening';
}

/** Extract a short display name from Supabase user metadata or email. */
function parseName(user: any): string | null {
  // Try metadata fields set during signup or admin provisioning
  const meta = user?.user_metadata ?? {};
  const full  = meta.full_name || meta.name || '';
  if (full.trim()) {
    // Return last name only: "Dr Smith" feels more natural than "Dr John Smith"
    const parts = full.trim().split(/\s+/);
    return parts[parts.length - 1];
  }
  // Fall back to the part before @ in the email
  const email = user?.email ?? '';
  const local = email.split('@')[0];
  if (local) {
    // Capitalise first letter
    return local.charAt(0).toUpperCase() + local.slice(1);
  }
  return null;
}

function formatLong(str: string) {
  return new Date(str + 'T00:00:00').toLocaleDateString('en-GB', {
    weekday: 'long', day: 'numeric', month: 'long', year: 'numeric',
  });
}

export default function TodayScreen() {
  const [appts,      setAppts]      = useState<Appointment[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [doctorName, setDoctorName] = useState<string | null>(null);
  const today = todayStr();

  const handleStatusChange = useCallback((id: string, newStatus: Appointment['status']) => {
    setAppts(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
  }, []);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const [{ appointments }, { data: { user } }] = await Promise.all([
        getAppointments({ date: today }),
        supabase.auth.getUser(),
      ]);
      setAppts(appointments);
      if (!doctorName) setDoctorName(parseName(user));
    } catch (e: any) {
      setError(e.message ?? 'Could not load appointments');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [today, doctorName]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total     = appts.length;
  const completed = appts.filter(a => a.status === 'completed').length;
  const remaining = appts.filter(a => a.status === 'pending' || a.status === 'confirmed').length;

  const header = useMemo(() => (
    <View style={s.header}>
      <View style={s.greetRow}>
        <View style={{ flex: 1 }}>
          <Text style={s.greet}>
            {greet()}{doctorName ? `, Dr ${doctorName}` : ''}
          </Text>
          <Text style={s.date}>{formatLong(today)}</Text>
        </View>
        <TouchableOpacity
          onPress={() => router.push('/settings')}
          activeOpacity={0.8}
          accessibilityLabel="Your profile and settings"
          accessibilityRole="button"
        >
          <Avatar
            name={doctorName ?? 'Doctor'}
            initials={(doctorName ?? 'Dr')[0].toUpperCase()}
            size={40}
          />
        </TouchableOpacity>
      </View>
      <View style={s.stats}>
        <StatCard label="Total"     value={total}     tone="neutral"  icon="calendar-outline" />
        <StatCard label="Done"      value={completed} tone="positive" icon="checkmark-circle-outline" />
        <StatCard label="Remaining" value={remaining} tone={remaining > 0 ? 'urgent' : 'neutral'} icon="time-outline" />
      </View>
      <Text style={s.section}>
        {total === 0
          ? 'NO APPOINTMENTS TODAY'
          : `${total} APPOINTMENT${total === 1 ? '' : 'S'} TODAY`}
      </Text>
    </View>
  ), [doctorName, today, total, completed, remaining]);

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.center}>
          <ActivityIndicator color={C.sage} size="large" />
          <Text style={s.loadingText}>Loading today's schedule…</Text>
        </View>
      </SafeAreaView>
    );
  }

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {error ? (
        <View style={s.center}>
          <Ionicons name="cloud-offline-outline" size={36} color={C.muted} style={{ marginBottom: 12 }} />
          <Text style={s.err}>{error}</Text>
          <TouchableOpacity onPress={() => load()} style={s.retryBtn} activeOpacity={0.7}>
            <Text style={s.retryText}>Try again</Text>
          </TouchableOpacity>
        </View>
      ) : (
        <FlatList
          data={appts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <AppointmentCard
              appt={item}
              onPress={() => router.push(`/appointment/${item.id}`)}
              onStatusChange={handleStatusChange}
            />
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🦷</Text>
              <Text style={s.emptyTitle}>No appointments today</Text>
              <Text style={s.emptyText}>Enjoy the free time, or open the calendar to see what's coming up.</Text>
              <TouchableOpacity
                style={s.emptyCta}
                onPress={() => router.push('/calendar')}
                activeOpacity={0.85}
              >
                <Ionicons name="calendar-outline" size={17} color="#fff" />
                <Text style={s.emptyCtaText}>Open calendar</Text>
              </TouchableOpacity>
            </View>
          }
          contentContainerStyle={s.list}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => load(true)}
              tintColor={C.sage}
            />
          }
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  list:      { padding: 20, paddingBottom: 40 },
  header:    { marginBottom: 8 },
  greetRow:  { flexDirection: 'row', alignItems: 'center', gap: 12, marginBottom: 20 },
  greet:     { ...T.title, color: C.ink, marginBottom: 3 },
  date:      { ...T.subhead, color: C.muted, fontWeight: '400', letterSpacing: 0.2 },
  stats:     { flexDirection: 'row', gap: 10, marginBottom: 24 },
  section:   { ...T.eyebrow, color: C.muted, marginBottom: 12 },
  loadingText: { color: C.muted, fontSize: 14, marginTop: 12 },
  empty:      { paddingVertical: 48, alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 40, marginBottom: 12 },
  emptyTitle: { ...T.headline, color: C.ink, marginBottom: 6, textAlign: 'center' },
  emptyText:  { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  emptyCta:   { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.sage, borderRadius: 12, paddingVertical: 12, paddingHorizontal: 22, marginTop: 20 },
  emptyCtaText: { ...T.headline, color: '#fff' },
  err:        { color: C.danger, fontSize: 14, textAlign: 'center', paddingHorizontal: 32, marginBottom: 16 },
  retryBtn:   { backgroundColor: C.bg2, borderRadius: 10, paddingVertical: 10, paddingHorizontal: 24, borderWidth: 1, borderColor: C.rule },
  retryText:  { fontSize: 14, fontWeight: '600', color: C.inkSoft },
});
