import React, { useState, useCallback } from 'react';
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
  const today = todayStr();

  const handleStatusChange = useCallback((id: string, newStatus: Appointment['status']) => {
    setAppts(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
  }, []);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      const { appointments } = await getAppointments({ date: today });
      setAppts(appointments);
    } catch (e: any) {
      setError(e.message ?? 'Could not load appointments');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [today]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const total     = appts.length;
  const completed = appts.filter(a => a.status === 'completed').length;
  const remaining = appts.filter(a => a.status === 'pending' || a.status === 'confirmed').length;

  const Header = () => (
    <View style={s.header}>
      <Text style={s.greet}>{greet()}.</Text>
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
  );

  if (loading) {
    return (
      <View style={s.center}>
        <ActivityIndicator color={C.sage} size="large" />
      </View>
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
          ListHeaderComponent={<Header />}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyText}>Clear schedule today.</Text>
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
  empty:     { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: C.muted, fontSize: 15 },
  err:       { color: C.danger, fontSize: 14, textAlign: 'center', padding: 20 },
});
