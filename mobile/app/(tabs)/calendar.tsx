import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet, ActivityIndicator,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { useFocusEffect, router } from 'expo-router';
import { getAppointments, type Appointment } from '../../lib/api';
import AppointmentCard from '../../components/AppointmentCard';
import { C } from '../../constants/theme';

function pad(n: number) { return String(n).padStart(2, '0'); }
function dateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function monthStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }

export default function CalendarScreen() {
  const [allAppts,     setAllAppts]     = useState<Appointment[]>([]);
  const [selectedDate, setSelectedDate] = useState(dateStr(new Date()));
  const [currentMonth, setCurrentMonth] = useState(new Date());
  const [loading,      setLoading]      = useState(true);
  const [refreshing,   setRefreshing]   = useState(false);
  const [error,        setError]        = useState<string | null>(null);

  const handleStatusChange = useCallback((id: string, newStatus: Appointment['status']) => {
    setAllAppts(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
  }, []);

  const loadMonth = useCallback(async (month: Date, isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    setError(null);
    try {
      const { appointments } = await getAppointments({ month: monthStr(month) });
      setAllAppts(appointments);
    } catch {
      setError('Could not load appointments. Pull down to retry.');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { loadMonth(currentMonth); }, [currentMonth, loadMonth]));

  // Build marked dates — up to 3 dots per day
  const markedDates: Record<string, any> = {};
  for (const appt of allAppts) {
    const d = appt.appointment_date;
    if (!markedDates[d]) markedDates[d] = { dots: [] };
    if (markedDates[d].dots.length < 3) markedDates[d].dots.push({ color: C.sage });
  }
  markedDates[selectedDate] = {
    ...(markedDates[selectedDate] ?? {}),
    selected:      true,
    selectedColor: C.sageDep,
  };

  const dayAppts = allAppts.filter(a => a.appointment_date === selectedDate);

  const formatSelected = () =>
    new Date(selectedDate + 'T00:00:00').toLocaleDateString('en-GB', {
      weekday: 'long', day: 'numeric', month: 'long',
    });

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <Calendar
        markingType="multi-dot"
        markedDates={markedDates}
        onDayPress={day => setSelectedDate(day.dateString)}
        onMonthChange={d => setCurrentMonth(new Date(d.year, d.month - 1, 1))}
        theme={{
          backgroundColor:            C.bg,
          calendarBackground:         C.bg,
          textSectionTitleColor:      C.muted,
          selectedDayBackgroundColor: C.sageDep,
          selectedDayTextColor:       '#fff',
          todayTextColor:             C.sageDep,
          dayTextColor:               C.ink,
          textDisabledColor:          C.muted,
          dotColor:                   C.sage,
          selectedDotColor:           '#fff',
          arrowColor:                 C.sageDep,
          monthTextColor:             C.ink,
          textMonthFontWeight:        '600',
          textDayFontSize:            14,
          textMonthFontSize:          16,
        }}
        style={s.calendar}
      />

      <View style={s.dayBar}>
        <Text style={s.dayLabel}>{formatSelected()}</Text>
        <Text style={s.dayCount}>
          {loading
            ? 'Loading…'
            : `${dayAppts.length} appt${dayAppts.length === 1 ? '' : 's'}`}
        </Text>
      </View>

      {loading ? (
        <View style={s.loader}>
          <ActivityIndicator color={C.sage} />
          <Text style={s.loaderText}>Loading appointments…</Text>
        </View>
      ) : (
        <FlatList
          data={dayAppts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <AppointmentCard
              appt={item}
              onPress={() => router.push(`/appointment/${item.id}`)}
              onStatusChange={handleStatusChange}
            />
          )}
          ListHeaderComponent={error ? (
            <View style={s.errorBanner}>
              <Ionicons name="cloud-offline-outline" size={14} color="#92400e" />
              <Text style={s.errorText}>{error}</Text>
            </View>
          ) : null}
          ListEmptyComponent={!error ? (
            <View style={s.empty}>
              <Ionicons name="calendar-outline" size={36} color={C.muted} style={{ marginBottom: 12 }} />
              <Text style={s.emptyTitle}>No appointments</Text>
              <Text style={s.emptyText}>No sessions booked on this day. Tap another date to check.</Text>
            </View>
          ) : null}
          refreshControl={
            <RefreshControl
              refreshing={refreshing}
              onRefresh={() => loadMonth(currentMonth, true)}
              tintColor={C.sage}
              colors={[C.sage]}
            />
          }
          contentContainerStyle={s.list}
        />
      )}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.bg },
  calendar:  { borderBottomWidth: 1, borderBottomColor: C.rule },
  dayBar: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'baseline',
    paddingHorizontal: 20,
    paddingVertical:   12,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    backgroundColor:   C.bg,
  },
  dayLabel:  { fontSize: 15, fontWeight: '600', color: C.ink },
  dayCount:  { fontSize: 12, color: C.muted },
  loader:     { padding: 40, alignItems: 'center', gap: 10 },
  loaderText: { color: C.muted, fontSize: 13 },
  list:       { padding: 16, paddingBottom: 40 },
  errorBanner: {
    flexDirection:    'row',
    alignItems:       'center',
    gap:              8,
    backgroundColor:  '#fef3c7',
    borderRadius:     10,
    padding:          12,
    marginBottom:     12,
  },
  errorText:  { flex: 1, fontSize: 13, color: '#92400e' },
  empty:      { paddingVertical: 48, alignItems: 'center', paddingHorizontal: 32 },
  emptyTitle: { fontSize: 16, fontWeight: '600', color: C.ink, marginBottom: 6, textAlign: 'center' },
  emptyText:  { color: C.muted, fontSize: 14, textAlign: 'center', lineHeight: 20 },
});
