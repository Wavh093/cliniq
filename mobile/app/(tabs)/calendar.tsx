import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, FlatList, RefreshControl, StyleSheet, ActivityIndicator,
  Modal, TextInput, TouchableOpacity, ScrollView, Alert,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { SafeAreaView } from 'react-native-safe-area-context';
import { Calendar } from 'react-native-calendars';
import { useFocusEffect, router } from 'expo-router';
import {
  getAppointments, getTimeBlocks, createTimeBlock, deleteTimeBlock,
  type Appointment,
} from '../../lib/api';
import AppointmentCard from '../../components/AppointmentCard';
import { C, T } from '../../constants/theme';

function pad(n: number) { return String(n).padStart(2, '0'); }
function dateStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}-${pad(d.getDate())}`; }
function monthStr(d: Date) { return `${d.getFullYear()}-${pad(d.getMonth()+1)}`; }

// ── Block Time Modal ──────────────────────────────────────────────────────────
function BlockTimeModal({
  visible,
  initialDate,
  onClose,
  onCreated,
}: {
  visible: boolean;
  initialDate: string;
  onClose: () => void;
  onCreated: () => void;
}) {
  const [date,      setDate]      = useState(initialDate);
  const [startTime, setStartTime] = useState('');
  const [endTime,   setEndTime]   = useState('');
  const [reason,    setReason]    = useState('');
  const [saving,    setSaving]    = useState(false);

  useEffect(() => {
    if (visible) {
      setDate(initialDate);
      setStartTime('');
      setEndTime('');
      setReason('');
    }
  }, [visible, initialDate]);

  const handleSubmit = async () => {
    if (!date || !startTime || !endTime) {
      Alert.alert('Missing fields', 'Please fill in start and end times.');
      return;
    }
    if (startTime >= endTime) {
      Alert.alert('Invalid time range', 'Start time must be before end time.');
      return;
    }
    setSaving(true);
    try {
      await createTimeBlock({
        start_datetime: `${date}T${startTime}:00`,
        end_datetime:   `${date}T${endTime}:00`,
        reason:         reason.trim() || undefined,
      });
      onCreated();
      onClose();
    } catch (e: any) {
      Alert.alert('Could not block time', e.message ?? 'Please try again.');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Modal
      visible={visible}
      animationType="slide"
      presentationStyle="pageSheet"
      onRequestClose={onClose}
    >
      <SafeAreaView style={bm.safe}>
        {/* Header */}
        <View style={bm.header}>
          <Text style={bm.title}>Block Time</Text>
          <TouchableOpacity
            onPress={onClose}
            hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          >
            <Ionicons name="close" size={22} color={C.inkSoft} />
          </TouchableOpacity>
        </View>

        <ScrollView contentContainerStyle={bm.body} keyboardShouldPersistTaps="handled">
          {/* Date (pre-filled, read-only) */}
          <Text style={bm.label}>DATE</Text>
          <View style={[bm.field, { justifyContent: 'center' }]}>
            <Text style={{ color: C.ink, fontSize: 15 }}>{date}</Text>
          </View>

          {/* Start time */}
          <Text style={bm.label}>START TIME</Text>
          <TextInput
            style={bm.field}
            value={startTime}
            onChangeText={setStartTime}
            placeholder="09:00"
            placeholderTextColor={C.muted}
            keyboardType="numeric"
          />

          {/* End time */}
          <Text style={bm.label}>END TIME</Text>
          <TextInput
            style={bm.field}
            value={endTime}
            onChangeText={setEndTime}
            placeholder="10:00"
            placeholderTextColor={C.muted}
            keyboardType="numeric"
          />

          {/* Reason */}
          <Text style={bm.label}>REASON (OPTIONAL)</Text>
          <TextInput
            style={[bm.field, { minHeight: 60 }]}
            value={reason}
            onChangeText={setReason}
            placeholder="e.g. Hospital run, Lunch break"
            placeholderTextColor={C.muted}
            multiline
          />

          {/* Submit */}
          <TouchableOpacity
            style={[bm.submitBtn, saving && { opacity: 0.6 }]}
            onPress={handleSubmit}
            disabled={saving}
            activeOpacity={0.8}
          >
            {saving
              ? <ActivityIndicator color="#fff" />
              : <Text style={bm.submitText}>Block Time</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

const bm = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.paper },
  header: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    padding:          20,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  title: { fontSize: 18, fontWeight: '700', color: C.ink },
  body:  { padding: 20 },
  label: {
    fontSize:      10,
    fontWeight:    '700',
    letterSpacing: 0.8,
    color:         C.muted,
    marginTop:     14,
    marginBottom:   6,
  },
  field: {
    backgroundColor:   C.bg,
    borderRadius:      10,
    paddingHorizontal: 14,
    paddingVertical:   12,
    fontSize:          15,
    color:             C.ink,
    borderWidth:       1,
    borderColor:       C.rule,
  },
  submitBtn: {
    backgroundColor: C.sage,
    borderRadius:    12,
    paddingVertical: 14,
    alignItems:      'center',
    marginTop:       20,
  },
  submitText: { color: '#fff', fontSize: 15, fontWeight: '700' },
});

// ── Calendar Screen ───────────────────────────────────────────────────────────
type DayItem =
  | { _type: 'appt';  data: Appointment }
  | { _type: 'block'; data: any };

export default function CalendarScreen() {
  const [allAppts,       setAllAppts]       = useState<Appointment[]>([]);
  const [timeBlocks,     setTimeBlocks]     = useState<any[]>([]);
  const [selectedDate,   setSelectedDate]   = useState(dateStr(new Date()));
  const [currentMonth,   setCurrentMonth]   = useState(new Date());
  const [loading,        setLoading]        = useState(true);
  const [refreshing,     setRefreshing]     = useState(false);
  const [error,          setError]          = useState<string | null>(null);
  const [showBlockModal, setShowBlockModal] = useState(false);

  const handleStatusChange = useCallback((id: string, newStatus: Appointment['status']) => {
    setAllAppts(prev => prev.map(a => a.id === id ? { ...a, status: newStatus } : a));
  }, []);

  const loadTimeBlocks = useCallback(() => {
    getTimeBlocks().then(d => setTimeBlocks(d.time_blocks || [])).catch(() => {});
  }, []);

  const handleDeleteBlock = useCallback(async (id: string) => {
    try {
      await deleteTimeBlock(id);
      setTimeBlocks(prev => prev.filter(b => b.id !== id));
    } catch (e: any) {
      Alert.alert('Could not delete', e.message ?? 'Please try again.');
    }
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

  useFocusEffect(useCallback(() => {
    loadMonth(currentMonth);
    loadTimeBlocks();
  }, [currentMonth, loadMonth, loadTimeBlocks]));

  // Build marked dates — up to 3 dots per day
  const markedDates: Record<string, any> = {};
  for (const appt of allAppts) {
    const d = appt.appointment_date;
    if (!markedDates[d]) markedDates[d] = { dots: [] };
    if (markedDates[d].dots.length < 3) markedDates[d].dots.push({ color: C.sage });
  }
  for (const block of timeBlocks) {
    const d = block.start_datetime?.slice(0, 10);
    if (!d) continue;
    if (!markedDates[d]) markedDates[d] = { dots: [] };
    if (markedDates[d].dots.length < 3) markedDates[d].dots.push({ color: '#94a3b8' });
  }
  markedDates[selectedDate] = {
    ...(markedDates[selectedDate] ?? {}),
    selected:      true,
    selectedColor: C.sageDep,
  };

  const dayAppts  = allAppts.filter(a => a.appointment_date === selectedDate);
  const dayBlocks = timeBlocks.filter(b => b.start_datetime?.slice(0, 10) === selectedDate);

  const dayItems: DayItem[] = [
    ...dayBlocks.map(b => ({ _type: 'block' as const, data: b })),
    ...dayAppts.map(a  => ({ _type: 'appt'  as const, data: a })),
  ];

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
          textMonthFontWeight:        '700',
          textDayFontWeight:          '500',
          textDayHeaderFontWeight:    '600',
          textDayFontSize:            14,
          textMonthFontSize:          16,
          textDayHeaderFontSize:      11,
        }}
        style={s.calendar}
      />

      <View style={s.dayBar}>
        <Text style={s.dayLabel}>{formatSelected()}</Text>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
          <TouchableOpacity
            style={s.blockTimeBtn}
            onPress={() => setShowBlockModal(true)}
            activeOpacity={0.7}
          >
            <Text style={s.blockTimeBtnText}>Block Time</Text>
          </TouchableOpacity>
          <View style={[s.dayCountPill, dayAppts.length > 0 && s.dayCountPillActive]}>
            <Text style={[s.dayCount, dayAppts.length > 0 && s.dayCountActive]}>
              {loading
                ? '…'
                : `${dayAppts.length} appt${dayAppts.length === 1 ? '' : 's'}`}
            </Text>
          </View>
        </View>
      </View>

      {loading ? (
        <View style={s.loader}>
          <ActivityIndicator color={C.sage} />
          <Text style={s.loaderText}>Loading appointments…</Text>
        </View>
      ) : (
        <FlatList
          data={dayItems}
          keyExtractor={item =>
            item._type === 'appt' ? item.data.id : `block-${item.data.id}`}
          renderItem={({ item }) => {
            if (item._type === 'block') {
              const b  = item.data;
              const st = (b.start_datetime ?? '').slice(11, 16);
              const en = (b.end_datetime   ?? '').slice(11, 16);
              return (
                <View style={s.blockCard}>
                  <View style={s.blockBar} />
                  <View style={s.blockBody}>
                    <Text style={s.blockTitle}>🚫 Blocked: {st}–{en}</Text>
                    {b.reason ? <Text style={s.blockReason}>{b.reason}</Text> : null}
                  </View>
                  <TouchableOpacity
                    onPress={() => handleDeleteBlock(b.id)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ paddingLeft: 8 }}
                  >
                    <Ionicons name="trash-outline" size={18} color="#94a3b8" />
                  </TouchableOpacity>
                </View>
              );
            }
            return (
              <AppointmentCard
                appt={item.data}
                onPress={() => router.push(`/appointment/${item.data.id}`)}
                onStatusChange={handleStatusChange}
              />
            );
          }}
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

      <BlockTimeModal
        visible={showBlockModal}
        initialDate={selectedDate}
        onClose={() => setShowBlockModal(false)}
        onCreated={loadTimeBlocks}
      />
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.bg },
  calendar:  { borderBottomWidth: 1, borderBottomColor: C.rule, paddingBottom: 4 },
  dayBar: {
    flexDirection:    'row',
    justifyContent:   'space-between',
    alignItems:       'center',
    paddingHorizontal: 20,
    paddingVertical:   10,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
    backgroundColor:   C.bg,
  },
  dayLabel:  { ...T.headline, color: C.ink },
  dayCountPill:       { backgroundColor: C.bg2, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 4 },
  dayCountPillActive: { backgroundColor: C.sageSoft },
  dayCount:           { fontSize: 12, color: C.muted, fontWeight: '600' },
  dayCountActive:     { color: C.sage },
  blockTimeBtn: {
    borderWidth:       1.5,
    borderColor:       C.sage,
    borderRadius:      8,
    paddingVertical:   6,
    paddingHorizontal: 12,
  },
  blockTimeBtnText: {
    color:      C.sage,
    fontSize:   13,
    fontWeight: '600',
  },
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
  // Time block card
  blockCard: {
    flexDirection:   'row',
    alignItems:      'center',
    backgroundColor: '#f1f5f9',
    borderRadius:    10,
    marginBottom:    8,
    overflow:        'hidden',
    paddingVertical: 10,
    paddingRight:    12,
  },
  blockBar: {
    width:           4,
    alignSelf:       'stretch',
    backgroundColor: '#94a3b8',
    marginRight:     12,
  },
  blockBody:   { flex: 1 },
  blockTitle:  { fontSize: 14, fontWeight: '700', color: C.ink },
  blockReason: { fontSize: 12, color: C.inkSoft, marginTop: 2 },
});
