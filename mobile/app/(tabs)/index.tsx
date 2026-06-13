import React, { useState, useCallback, useMemo } from 'react';
import {
  View, Text, FlatList, RefreshControl,
  StyleSheet, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { getAppointments, type Appointment } from '../../lib/api';
import AppointmentCard from '../../components/AppointmentCard';
import StatCard from '../../components/StatCard';
import { C } from '../../constants/theme';
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
      <Text style={s.greet}>
        {greet()}{doctorName ? `, Dr ${doctorName}.` : '.'}
      </Text>
      <Text style={s.date}>{formatLong(today)}</Text>
      <View style={s.stats}>
        <StatCard label="Total"     value={total} />
        <StatCard label="Done"      value={completed} accent={completed > 0 && completed === total} />
        <StatCard label="Remaining" value={remaining} accent={remaining > 0} />
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
          <Text style={s.err}>{error}</Text>
        </View>
      ) : (
        <FlatList
          data={appts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <AppointmentCard
              appt={item}
              onPress={() => item.patients?.id && router.push(`/patient/${item.patients.id}`)}
              onStatusChange={handleStatusChange}
            />
          )}
          ListHeaderComponent={header}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyIcon}>🦷</Text>
              <Text style={s.emptyTitle}>No appointments today</Text>
              <Text style={s.emptyText}>Enjoy the free time, or check the calendar for upcoming sessions.</Text>
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
  greet:     { fontSize: 28, fontWeight: '700', color: C.ink, marginBottom: 4 },
  date:      { fontSize: 13, color: C.muted, marginBottom: 20, letterSpacing: 0.2 },
  stats:     { flexDirection: 'row', gap: 10, marginBottom: 24 },
  section:   { fontSize: 11, letterSpacing: 0.8, color: C.muted, fontWeight: '500', marginBottom: 12 },
  loadingText: { color: C.muted, fontSize: 14, marginTop: 12 },
  empty:      { paddingVertical: 48, alignItems: 'center', paddingHorizontal: 32 },
  emptyIcon:  { fontSize: 40, marginBottom: 12 },
  emptyTitle: { fontSize: 17, fontWeight: '600', color: C.ink, marginBottom: 6, textAlign: 'center' },
  emptyText:  { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
  err:        { color: C.danger, fontSize: 14, textAlign: 'center', padding: 20 },
});
