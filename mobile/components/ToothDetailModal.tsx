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

// ── Helpers ──────────────────────────────────────────────────────────────────

const TOOTH_NAMES: Record<number, string> = {
  18: 'UR 3rd Molar',    17: 'UR 2nd Molar',    16: 'UR 1st Molar',
  15: 'UR 2nd Premolar', 14: 'UR 1st Premolar', 13: 'UR Canine',
  12: 'UR Lateral Inc.', 11: 'UR Central Inc.',
  21: 'UL Central Inc.', 22: 'UL Lateral Inc.', 23: 'UL Canine',
  24: 'UL 1st Premolar', 25: 'UL 2nd Premolar',
  26: 'UL 1st Molar',    27: 'UL 2nd Molar',    28: 'UL 3rd Molar',
  31: 'LL Central Inc.', 32: 'LL Lateral Inc.', 33: 'LL Canine',
  34: 'LL 1st Premolar', 35: 'LL 2nd Premolar',
  36: 'LL 1st Molar',    37: 'LL 2nd Molar',    38: 'LL 3rd Molar',
  41: 'LR Central Inc.', 42: 'LR Lateral Inc.', 43: 'LR Canine',
  44: 'LR 1st Premolar', 45: 'LR 2nd Premolar',
  46: 'LR 1st Molar',    47: 'LR 2nd Molar',    48: 'LR 3rd Molar',
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
    if (status === currentStatus) {
      setSelectedStatus(status);
      return;
    }
    setSelectedStatus(status);
    setSavingStatus(true);
    try {
      await upsertToothStatus(patientId, toothFdi, status);
      onStatusChange(toothFdi, status);
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Please try again.');
      setSelectedStatus(currentStatus); // revert
    } finally {
      setSavingStatus(false);
    }
  }, [patientId, toothFdi, currentStatus, onStatusChange]);

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
    Alert.alert('Delete note?', `"${note.note.slice(0, 60)}${note.note.length > 60 ? '…' : ''}"`, [
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
    ]);
  }, [onNoteDeleted]);

  return (
    <Modal
      visible={visible}
      animationType="slide"
      transparent
      onShow={handleOpen}
      onRequestClose={onClose}
    >
      <TouchableOpacity style={s.overlay} activeOpacity={1} onPress={onClose} />

      <KeyboardAvoidingView
        style={s.sheet}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      >
        <View style={[s.sheetInner, { paddingBottom: insets.bottom + 16 }]}>
          {/* Drag handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <View>
              <Text style={s.toothNumber}>Tooth {toothFdi}</Text>
              <Text style={s.toothName}>{TOOTH_NAMES[toothFdi] ?? `FDI ${toothFdi}`}</Text>
            </View>
            <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
              <Ionicons name="close" size={22} color={C.inkSoft} />
            </TouchableOpacity>
          </View>

          {/* Status selector */}
          <Text style={s.sectionLabel}>STATUS</Text>
          <ScrollView
            horizontal
            showsHorizontalScrollIndicator={false}
            style={s.statusScroll}
            contentContainerStyle={s.statusRow}
          >
            {ALL_STATUSES.map((st) => {
              const colors  = TOOTH_COLORS[st];
              const active  = selectedStatus === st;
              return (
                <TouchableOpacity
                  key={st}
                  style={[
                    s.statusPill,
                    { backgroundColor: colors.fill, borderColor: colors.stroke },
                    active && s.statusPillActive,
                  ]}
                  onPress={() => saveStatus(st)}
                  disabled={savingStatus}
                  activeOpacity={0.75}
                >
                  {savingStatus && active ? (
                    <ActivityIndicator size="small" color={colors.stroke} />
                  ) : (
                    <>
                      {active && (
                        <Ionicons name="checkmark" size={12} color={colors.stroke} style={{ marginRight: 3 }} />
                      )}
                      <Text style={[s.statusPillText, { color: colors.stroke }]}>
                        {STATUS_LABELS[st]}
                      </Text>
                    </>
                  )}
                </TouchableOpacity>
              );
            })}
          </ScrollView>

          {/* Notes */}
          <Text style={[s.sectionLabel, { marginTop: 16 }]}>
            NOTES {notes.length > 0 && `(${notes.length})`}
          </Text>

          <ScrollView style={s.notesList} showsVerticalScrollIndicator={false}>
            {notes.length === 0 && (
              <Text style={s.emptyNotes}>No notes recorded for this tooth.</Text>
            )}
            {notes.map((note) => (
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

          {/* Add note */}
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
    backgroundColor: 'rgba(0,0,0,0.4)',
  },
  sheet: {
    position:        'absolute',
    bottom:          0,
    left:            0,
    right:           0,
    justifyContent:  'flex-end',
  },
  sheetInner: {
    backgroundColor: C.paper,
    borderTopLeftRadius:  20,
    borderTopRightRadius: 20,
    paddingHorizontal:    20,
    paddingTop:           12,
    maxHeight:            '80%',
  },
  handle: {
    width:           40,
    height:          4,
    backgroundColor: C.rule,
    borderRadius:    2,
    alignSelf:       'center',
    marginBottom:    16,
  },
  header: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'flex-start',
    marginBottom:   16,
  },
  toothNumber: { fontSize: 22, fontWeight: '800', color: C.ink },
  toothName:   { fontSize: 13, color: C.muted, marginTop: 1 },

  sectionLabel: {
    fontSize:     10,
    fontWeight:   '700',
    letterSpacing: 0.8,
    color:        C.muted,
    marginBottom: 8,
  },

  statusScroll:       { marginHorizontal: -20 },
  statusRow:          { flexDirection: 'row', gap: 8, paddingHorizontal: 20, paddingBottom: 4 },
  statusPill: {
    flexDirection:   'row',
    alignItems:      'center',
    borderRadius:    20,
    paddingVertical:   7,
    paddingHorizontal: 12,
    borderWidth:     1.5,
    minHeight:       34,
  },
  statusPillActive: { shadowColor: '#000', shadowOffset: { width: 0, height: 1 }, shadowOpacity: 0.15, shadowRadius: 3, elevation: 2 },
  statusPillText: { fontSize: 12, fontWeight: '600' },

  notesList:  { maxHeight: 160, marginBottom: 12 },
  emptyNotes: { fontSize: 13, color: C.muted, fontStyle: 'italic', paddingVertical: 8 },
  noteItem: {
    backgroundColor: C.bg,
    borderRadius:    10,
    padding:         10,
    marginBottom:    6,
  },
  noteItemHeader: { flexDirection: 'row', alignItems: 'center', gap: 6, marginBottom: 4 },
  noteDate:       { fontSize: 11, color: C.muted, fontWeight: '600' },
  apptPill: {
    backgroundColor: C.bg2,
    borderRadius:    6,
    paddingHorizontal: 6,
    paddingVertical: 2,
    maxWidth:        120,
  },
  apptPillText: { fontSize: 10, color: C.inkSoft, fontWeight: '500' },
  noteText:     { fontSize: 13, color: C.ink, lineHeight: 19 },

  addNoteRow: {
    flexDirection:  'row',
    alignItems:     'flex-end',
    gap:            8,
    borderTopWidth: 1,
    borderTopColor: C.rule,
    paddingTop:     12,
    marginTop:      4,
  },
  noteInput: {
    flex:            1,
    backgroundColor: C.bg,
    borderRadius:    12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize:        14,
    color:           C.ink,
    maxHeight:       80,
    lineHeight:      20,
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
