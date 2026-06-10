import React, { useState } from 'react';
import {
  View, Text, StyleSheet, TouchableOpacity,
  Modal, Alert, ActivityIndicator,
} from 'react-native';
import { C, STATUS } from '../constants/theme';
import type { Appointment } from '../lib/api';
import { updateAppointmentStatus } from '../lib/api';

// Mirrors the server-side state machine
const TRANSITIONS: Record<string, Appointment['status'][]> = {
  pending:   ['confirmed', 'completed', 'cancelled', 'no_show'],
  confirmed: ['pending',   'completed', 'cancelled', 'no_show'],
  no_show:   ['cancelled'],
  completed: [],
  cancelled: [],
};

const STATUS_LABELS: Record<string, string> = {
  pending:   'Revert to Pending',
  confirmed: 'Confirm',
  completed: 'Mark Complete',
  cancelled: 'Cancel Appointment',
  no_show:   'Mark No Show',
};

interface Props {
  appt: Appointment;
  onPress?: () => void;
  onStatusChange?: (id: string, newStatus: Appointment['status']) => void;
}

export default function AppointmentCard({ appt, onPress, onStatusChange }: Props) {
  const [modalVisible, setModalVisible] = useState(false);
  const [updating,     setUpdating]     = useState(false);

  const patient      = appt.patients;
  const service      = appt.services;
  const statusStyle  = STATUS[appt.status] ?? STATUS.pending;
  const time         = appt.appointment_time?.slice(0, 5) ?? '';
  const nextStatuses = TRANSITIONS[appt.status] ?? [];
  const canUpdate    = nextStatuses.length > 0 && !!onStatusChange;

  const handleSelectStatus = async (newStatus: Appointment['status']) => {
    setUpdating(true);
    try {
      await updateAppointmentStatus(appt.id, newStatus);
      onStatusChange?.(appt.id, newStatus);
      setModalVisible(false);
    } catch (e: any) {
      Alert.alert('Could not update', e.message ?? 'Please try again.');
    } finally {
      setUpdating(false);
    }
  };

  return (
    <>
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

        {/* Status badge — tappable when transitions exist */}
        <TouchableOpacity
          style={[s.badge, { backgroundColor: statusStyle.bg }]}
          onPress={canUpdate ? () => setModalVisible(true) : undefined}
          disabled={updating || !canUpdate}
          activeOpacity={canUpdate ? 0.7 : 1}
          hitSlop={{ top: 8, bottom: 8, left: 4, right: 4 }}
        >
          {updating ? (
            <ActivityIndicator size="small" color={statusStyle.text} style={s.badgeSpinner} />
          ) : (
            <Text style={[s.badgeText, { color: statusStyle.text }]}>
              {appt.status.replace('_', ' ')}{canUpdate ? ' ▾' : ''}
            </Text>
          )}
        </TouchableOpacity>
      </TouchableOpacity>

      {/* Status picker sheet */}
      <Modal
        visible={modalVisible}
        transparent
        animationType="slide"
        onRequestClose={() => setModalVisible(false)}
      >
        <TouchableOpacity
          style={s.overlay}
          activeOpacity={1}
          onPress={() => !updating && setModalVisible(false)}
        >
          <View style={s.sheet}>
            <View style={s.handle} />

            <Text style={s.sheetPatient}>
              {patient ? `${patient.first_name} ${patient.last_name}` : 'Appointment'}
            </Text>
            <Text style={s.sheetSub}>
              {time}{service?.name ? `  ·  ${service.name}` : ''}
            </Text>

            <Text style={s.sheetLabel}>UPDATE STATUS</Text>

            {nextStatuses.map(st => {
              const st_style = STATUS[st] ?? STATUS.pending;
              return (
                <TouchableOpacity
                  key={st}
                  style={[s.statusBtn, { backgroundColor: st_style.bg }]}
                  onPress={() => handleSelectStatus(st)}
                  disabled={updating}
                  activeOpacity={0.75}
                >
                  <View style={[s.statusDot, { backgroundColor: st_style.text }]} />
                  <Text style={[s.statusBtnText, { color: st_style.text }]}>
                    {STATUS_LABELS[st] ?? st}
                  </Text>
                </TouchableOpacity>
              );
            })}

            <TouchableOpacity
              style={s.dismissBtn}
              onPress={() => setModalVisible(false)}
              disabled={updating}
            >
              <Text style={s.dismissText}>Dismiss</Text>
            </TouchableOpacity>
          </View>
        </TouchableOpacity>
      </Modal>
    </>
  );
}

const s = StyleSheet.create({
  card: {
    flexDirection:   'row',
    alignItems:      'flex-start',
    backgroundColor: C.paper,
    borderRadius:    16,
    padding:         14,
    marginBottom:    10,
    borderWidth:     1,
    borderColor:     C.rule,
    gap:             12,
  },
  timeCol:     { alignItems: 'center', gap: 6, paddingTop: 2, width: 42 },
  time:        { fontSize: 13, color: C.inkSoft, letterSpacing: 0.3, fontVariant: ['tabular-nums'] },
  pip:         { width: 6, height: 6, borderRadius: 3 },
  body:        { flex: 1 },
  name:        { fontSize: 15, fontWeight: '600', color: C.ink, marginBottom: 2 },
  service:     { fontSize: 13, color: C.muted },
  notes:       { fontSize: 12, color: C.muted, marginTop: 4, fontStyle: 'italic' },
  badge: {
    borderRadius:      4,
    paddingHorizontal: 8,
    paddingVertical:   4,
    alignSelf:         'flex-start',
    minWidth:          62,
    alignItems:        'center',
  },
  badgeSpinner: { width: 62 },
  badgeText:    { fontSize: 11, fontWeight: '500', textTransform: 'capitalize' },

  // Modal
  overlay: {
    flex:            1,
    backgroundColor: 'rgba(0,0,0,0.45)',
    justifyContent:  'flex-end',
  },
  sheet: {
    backgroundColor:      C.paper,
    borderTopLeftRadius:  22,
    borderTopRightRadius: 22,
    padding:              24,
    paddingBottom:        44,
    gap:                  10,
  },
  handle: {
    width:           36,
    height:          4,
    borderRadius:    2,
    backgroundColor: C.rule,
    alignSelf:       'center',
    marginBottom:    10,
  },
  sheetPatient: { fontSize: 18, fontWeight: '700', color: C.ink },
  sheetSub:     { fontSize: 13, color: C.muted, marginBottom: 4 },
  sheetLabel: {
    fontSize:      10,
    fontWeight:    '700',
    letterSpacing: 0.8,
    color:         C.muted,
    marginTop:     4,
    marginBottom:  2,
  },
  statusBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    borderRadius:   12,
    paddingVertical:  13,
    paddingHorizontal: 16,
  },
  statusDot:     { width: 8, height: 8, borderRadius: 4 },
  statusBtnText: { fontSize: 15, fontWeight: '600' },
  dismissBtn: {
    marginTop:       6,
    paddingVertical: 14,
    alignItems:      'center',
    borderRadius:    12,
    borderWidth:     1,
    borderColor:     C.rule,
  },
  dismissText: { fontSize: 15, color: C.muted, fontWeight: '500' },
});
