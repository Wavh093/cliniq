import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, ActivityIndicator,
} from 'react-native';
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

  const handleStatusChange = useCallback((id: string, newStatus: Appointment['status']) => {
    setAllAppts(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
  }, []);

  const loadMonth = useCallback(async (month: Date) => {
    setLoading(true);
    try {
      const { appointments } = await getAppointments({ month: monthStr(month) });
      setAllAppts(appointments);
    } catch {
      setAllAppts([]);
    } finally {
      setLoading(false);
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
        </View>
      ) : (
        <FlatList
          data={dayAppts}
          keyExtractor={item => item.id}
          renderItem={({ item }) => (
            <AppointmentCard
              appt={item}
              onPress={() => item.patients?.id && router.push(`/patient/${item.patients.id}`)}
              onStatusChange={handleStatusChange}
            />
          )}
          ListEmptyComponent={
            <View style={s.empty}>
              <Text style={s.emptyText}>No appointments on this day.</Text>
            </View>
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
  loader:    { padding: 40, alignItems: 'center' },
  list:      { padding: 16, paddingBottom: 40 },
  empty:     { paddingVertical: 40, alignItems: 'center' },
  emptyText: { color: C.muted, fontSize: 14 },
});
