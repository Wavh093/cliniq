import React from 'react';
import { View, Text, StyleSheet, TouchableOpacity } from 'react-native';
import { C, STATUS } from '../constants/theme';
import type { Appointment } from '../lib/api';

export default function AppointmentCard({ appt, onPress }: { appt: Appointment; onPress?: () => void }) {
  const patient     = appt.patients;
  const service     = appt.services;
  const statusStyle = STATUS[appt.status] ?? STATUS.pending;
  const time        = appt.appointment_time?.slice(0, 5) ?? '';

  return (
    <TouchableOpacity style={s.card} onPress={onPress} activeOpacity={onPress ? 0.7 : 1}>
      <View style={s.timeCol}>
        <Text style={s.time}>{time}</Text>
        <View style={[s.pip, { backgroundColor: statusStyle.text }]} />
      </View>
      <View style={s.body}>
        <Text style={s.name}>
          {patient ? `${patient.first_name} ${patient.last_name}` : 'Unknown patient'}
        </Text>
        <Text style={s.service}>{service?.name ?? '—'}</Text>
        {appt.patient_notes ? (
          <Text style={s.notes} numberOfLines={1}>{appt.patient_notes}</Text>
        ) : null}
      </View>
      <View style={[s.badge, { backgroundColor: statusStyle.bg }]}>
        <Text style={[s.badgeText, { color: statusStyle.text }]}>
          {appt.status.replace('_', ' ')}
        </Text>
      </View>
    </TouchableOpacity>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection:  'row',
    alignItems:     'flex-start',
    backgroundColor: C.paper,
    borderRadius:   16,
    padding:        14,
    marginBottom:   10,
    borderWidth:    1,
    borderColor:    C.rule,
    gap:            12,
  },
  timeCol: { alignItems: 'center', gap: 6, paddingTop: 2, width: 42 },
  time:    { fontSize: 13, color: C.inkSoft, letterSpacing: 0.3, fontVariant: ['tabular-nums'] },
  pip:     { width: 6, height: 6, borderRadius: 3 },
  body:    { flex: 1 },
  name:    { fontSize: 15, fontWeight: '600', color: C.ink, marginBottom: 2 },
  service: { fontSize: 13, color: C.muted },
  notes:   { fontSize: 12, color: C.muted, marginTop: 4, fontStyle: 'italic' },
  badge: {
    borderRadius:    4,
    paddingHorizontal: 8,
    paddingVertical: 4,
    alignSelf:       'flex-start',
  },
  badgeText: { fontSize: 11, fontWeight: '500', textTransform: 'capitalize' },
});
