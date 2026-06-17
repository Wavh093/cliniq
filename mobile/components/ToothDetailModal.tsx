import React, { useState, useCallback } from 'react';
import {
  View, Text, Modal, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  upsertToothStatus, addToothNote, deleteToothNote,
  type ToothStatus, type ToothNote,
} from '../lib/api';
import { C } from '../constants/theme';
import { TOOTH_COLORS, STATUS_LABELS, ALL_STATUSES } from './DentalChart';

// ── Tooth names (SA quadrant convention) ────────────────────────────────────
const TOOTH_NAMES: Record<number, string> = {
  11: 'UR Central', 12: 'UR Lateral', 13: 'UR Canine',
  14: 'UR 1st Premolar', 15: 'UR 2nd Premolar',
  16: 'UR 1st Molar',   17: 'UR 2nd Molar', 18: 'UR Wisdom',
  21: 'UL Central', 22: 'UL Lateral', 23: 'UL Canine',
  24: 'UL 1st Premolar', 25: 'UL 2nd Premolar',
  26: 'UL 1st Molar',   27: 'UL 2nd Molar', 28: 'UL Wisdom',
  31: 'LL Central', 32: 'LL Lateral', 33: 'LL Canine',
  34: 'LL 1st Premolar', 35: 'LL 2nd Premolar',
  36: 'LL 1st Molar',   37: 'LL 2nd Molar', 38: 'LL Wisdom',
  41: 'LR Central', 42: 'LR Lateral', 43: 'LR Canine',
  44: 'LR 1st Premolar', 45: 'LR 2nd Premolar',
  46: 'LR 1st Molar',   47: 'LR 2nd Molar', 48: 'LR Wisdom',
};

// Short labels that fit comfortably in a 3-column grid button
const STATUS_SHORT: Record<ToothStatus, string> = {
  healthy:         'Healthy',
  cavity:          'Cavity',
  needs_treatment: 'Treatment',
  filled:          'Filled',
  crown:           'Crown',
  extraction:      'Extracted',
  missing:         'Missing',
  implant:         'Implant',
  bridge:          'Bridge',
};

function fmtDate(iso: string): string {
  const d = new Date(iso);
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${d.getDate()} ${MONTHS[d.getMonth()]} ${d.getFullYear()}`;
}

// ── Component ────────────────────────────────────────────────────────────────
interface Props {
  visible: boolean;
  onClose: () => void;
  patientId: string;
  appointmentId?: string | null;
  toothFdi: number;
  currentStatus: ToothStatus;
  notes: ToothNote[];
  onStatusChange: (fdi: number, status: ToothStatus) => void;
  onNoteAdded: (note: ToothNote) => void;
  onNoteDeleted: (noteId: string, toothFdi: number) => void;
}

export default function ToothDetailModal({
  visible, onClose,
  patientId, appointmentId,
  toothFdi, currentStatus, notes,
  onStatusChange, onNoteAdded, onNoteDeleted,
}: Props) {
  const insets = useSafeAreaInsets();

  const [selectedStatus, setSelectedStatus] = useState<ToothStatus>(currentStatus);
  const [savingStatus,   setSavingStatus]   = useState(false);
  const [noteText,       setNoteText]       = useState('');
  const [savingNote,     setSavingNote]     = useState(false);

  const handleOpen = useCallback(() => {
    setSelectedStatus(currentStatus);
    setNoteText('');
  }, [currentStatus]);

  const saveStatus = useCallback(async (status: ToothStatus) => {
    if (status === currentStatus && status === selectedStatus) return;
    setSelectedStatus(status);
    if (status === currentStatus) return; // already saved, just UI update
    setSavingStatus(true);
    try {
      await upsertToothStatus(patientId, toothFdi, status);
      onStatusChange(toothFdi, status);
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Please try again.');
      setSelectedStatus(currentStatus);
    } finally {
      setSavingStatus(false);
    }
  }, [patientId, toothFdi, currentStatus, selectedStatus, onStatusChange]);

  const saveNote = useCallback(async () => {
    if (!noteText.trim()) return;
    setSavingNote(true);
    try {
      const note = await addToothNote(patientId, toothFdi, noteText, appointmentId);
      onNoteAdded(note);
      setNoteText('');
    } catch (e: any) {
      Alert.alert('Could not save note', e.message ?? 'Please try again.');
    } finally {
      setSavingNote(false);
    }
  }, [patientId, toothFdi, noteText, appointmentId, onNoteAdded]);

  const confirmDeleteNote = useCallback((note: ToothNote) => {
    Alert.alert(
      'Delete note?',
      `"${note.note.slice(0, 60)}${note.note.length > 60 ? '…' : ''}"`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteToothNote(note.id);
              onNoteDeleted(note.id, note.tooth_fdi);
            } catch (e: any) {
              Alert.alert('Could not delete', e.message ?? 'Please try again.');
            }
          },
        },
      ],
    );
  }, [onNoteDeleted]);

  // 3-column grid: 9 statuses → 3 rows of 3
  const statusRows: ToothStatus[][] = [];
  for (let i = 0; i < ALL_STATUSES.length; i += 3) {
    statusRows.push(ALL_STATUSES.slice(i, i + 3) as ToothStatus[]);
  }

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onShow={handleOpen}
      onRequestClose={onClose}
    >
      {/* Backdrop — tap to dismiss */}
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose} />

      <KeyboardAvoidingView
        style={s.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[s.sheetInner, { paddingBottom: Math.max(insets.bottom, 16) }]}>
          {/* Drag handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={[s.statusIndicator, { backgroundColor: TOOTH_COLORS[selectedStatus].fill, borderColor: TOOTH_COLORS[selectedStatus].stroke }]} />
              <View>
                <Text style={s.toothNumber}>Tooth {toothFdi}</Text>
                <Text style={s.toothName}>{TOOTH_NAMES[toothFdi] ?? `FDI ${toothFdi}`}</Text>
              </View>
            </View>
            <TouchableOpacity
              onPress={onClose}
              hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
            >
              <Ionicons name="close" size={22} color={C.inkSoft} />
            </TouchableOpacity>
          </View>

          {/* ── Status grid ─────────────────────────────────────── */}
          <Text style={s.sectionLabel}>STATUS</Text>
          <View style={s.statusGrid}>
            {statusRows.map((row, ri) => (
              <View key={ri} style={s.statusRow}>
                {row.map(st => {
                  const col    = TOOTH_COLORS[st];
                  const active = selectedStatus === st;
                  return (
                    <TouchableOpacity
                      key={st}
                      style={[
                        s.statusBtn,
                        { backgroundColor: col.fill, borderColor: active ? col.stroke : C.rule },
                        active && s.statusBtnActive,
                      ]}
                      onPress={() => saveStatus(st)}
                      disabled={savingStatus}
                      activeOpacity={0.7}
                      accessibilityLabel={STATUS_LABELS[st]}
                      accessibilityState={{ selected: active }}
                    >
                      {savingStatus && active ? (
                        <ActivityIndicator size="small" color={col.stroke} style={{ height: 18 }} />
                      ) : (
                        <View style={s.statusBtnContent}>
                          <View style={[s.statusDot, { backgroundColor: col.stroke }]} />
                          <Text style={[s.statusBtnText, { color: col.stroke }]} numberOfLines={1}>
                            {STATUS_SHORT[st]}
                          </Text>
                        </View>
                      )}
                      {active && !savingStatus && (
                        <Ionicons
                          name="checkmark-circle"
                          size={14}
                          color={col.stroke}
                          style={s.checkIcon}
                        />
                      )}
                    </TouchableOpacity>
                  );
                })}
              </View>
            ))}
          </View>

          {/* ── Notes ───────────────────────────────────────────── */}
          <Text style={[s.sectionLabel, { marginTop: 14 }]}>
            NOTES{notes.length > 0 ? ` (${notes.length})` : ''}
          </Text>

          <ScrollView
            style={s.notesList}
            showsVerticalScrollIndicator={false}
            keyboardShouldPersistTaps="handled"
          >
            {notes.length === 0 && (
              <Text style={s.emptyNotes}>No notes for this tooth.</Text>
            )}
            {notes.map(note => (
              <View key={note.id} style={s.noteItem}>
                <View style={s.noteItemHeader}>
                  <Text style={s.noteDate}>{fmtDate(note.created_at)}</Text>
                  {note.appointments && (
                    <View style={s.apptPill}>
                      <Text style={s.apptPillText} numberOfLines={1}>
                        {note.appointments.services?.name ?? 'Appointment'}
                      </Text>
                    </View>
                  )}
                  <TouchableOpacity
                    onPress={() => confirmDeleteNote(note)}
                    hitSlop={{ top: 8, bottom: 8, left: 8, right: 8 }}
                    style={{ marginLeft: 'auto' }}
                  >
                    <Ionicons name="trash-outline" size={15} color={C.muted} />
                  </TouchableOpacity>
                </View>
                <Text style={s.noteText}>{note.note}</Text>
              </View>
            ))}
          </ScrollView>

          {/* ── Add note ────────────────────────────────────────── */}
          <View style={s.addNoteRow}>
            <TextInput
              style={s.noteInput}
              value={noteText}
              onChangeText={setNoteText}
              placeholder="Add a clinical note…"
              placeholderTextColor={C.muted}
              multiline
              maxLength={500}
              autoCapitalize="sentences"
              autoCorrect
              editable={!savingNote}
            />
            <TouchableOpacity
              style={[s.noteBtn, (!noteText.trim() || savingNote) && s.noteBtnDim]}
              onPress={saveNote}
              disabled={!noteText.trim() || savingNote}
              activeOpacity={0.8}
            >
              {savingNote
                ? <ActivityIndicator size="small" color="#fff" />
                : <Ionicons name="arrow-up" size={18} color="#fff" />}
            </TouchableOpacity>
          </View>
        </View>
      </KeyboardAvoidingView>
    </Modal>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  overlay: {
    ...StyleSheet.absoluteFillObject,
    backgroundColor: 'rgba(0,0,0,0.42)',
  },
  sheet: {
    position: 'absolute',
    bottom:   0,
    left:     0,
    right:    0,
  },
  sheetInner: {
    backgroundColor:      C.paper,
    borderTopLeftRadius:  22,
    borderTopRightRadius: 22,
    paddingHorizontal:    20,
    paddingTop:           12,
    maxHeight:            '88%',
  },
  handle: {
    width:           40,
    height:          4,
    backgroundColor: C.rule,
    borderRadius:    2,
    alignSelf:       'center',
    marginBottom:    16,
  },

  // Header
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    marginBottom:   16,
  },
  headerLeft: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  statusIndicator: {
    width:        20,
    height:       28,
    borderRadius: 4,
    borderWidth:  2,
  },
  toothNumber: { fontSize: 20, fontWeight: '800', color: C.ink },
  toothName:   { fontSize: 12, color: C.muted, marginTop: 1 },

  sectionLabel: {
    fontSize:      10,
    fontWeight:    '700',
    letterSpacing: 0.8,
    color:         C.muted,
    marginBottom:  8,
  },

  // Status grid — 3 equal-width columns per row
  statusGrid: { gap: 6 },
  statusRow:  { flexDirection: 'row', gap: 6 },
  statusBtn: {
    flex:            1,
    borderRadius:    10,
    borderWidth:     1.5,
    paddingVertical: 10,
    paddingHorizontal: 8,
    minHeight:       44,
    justifyContent:  'center',
    alignItems:      'center',
  },
  statusBtnActive: {
    shadowColor:   '#000',
    shadowOffset:  { width: 0, height: 1 },
    shadowOpacity: 0.12,
    shadowRadius:  3,
    elevation:     2,
  },
  statusBtnContent: {
    flexDirection: 'row',
    alignItems:    'center',
    gap:           5,
  },
  statusDot: {
    width:        7,
    height:       7,
    borderRadius: 4,
    flexShrink:   0,
  },
  statusBtnText: {
    fontSize:   11,
    fontWeight: '600',
    flexShrink: 1,
  },
  checkIcon: {
    position: 'absolute',
    top:       4,
    right:     4,
  },

  // Notes
  notesList:  { maxHeight: 140, marginBottom: 10 },
  emptyNotes: { fontSize: 13, color: C.muted, fontStyle: 'italic', paddingVertical: 6 },
  noteItem: {
    backgroundColor: C.bg,
    borderRadius:    10,
    padding:         10,
    marginBottom:    6,
  },
  noteItemHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  noteDate:       { fontSize: 11, color: C.muted, fontWeight: '600' },
  apptPill: {
    backgroundColor:  C.bg2,
    borderRadius:     6,
    paddingHorizontal: 6,
    paddingVertical:   2,
    maxWidth:          120,
  },
  apptPillText: { fontSize: 10, color: C.inkSoft, fontWeight: '500' },
  noteText:     { fontSize: 13, color: C.ink, lineHeight: 19 },

  // Add note
  addNoteRow: {
    flexDirection:  'row',
    alignItems:     'flex-end',
    gap:            8,
    borderTopWidth: 1,
    borderTopColor: C.rule,
    paddingTop:     10,
    marginTop:      4,
  },
  noteInput: {
    flex:              1,
    backgroundColor:   C.bg,
    borderRadius:      12,
    paddingHorizontal: 12,
    paddingVertical:   10,
    fontSize:          14,
    color:             C.ink,
    maxHeight:         80,
    lineHeight:        20,
  },
  noteBtn: {
    backgroundColor: C.sage,
    borderRadius:    12,
    width:           40,
    height:          40,
    alignItems:      'center',
    justifyContent:  'center',
  },
  noteBtnDim: { opacity: 0.4 },
});
