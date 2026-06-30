import React, { useState, useCallback, useEffect } from 'react';
import {
  View, Text, Modal, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Ionicons } from '@expo/vector-icons';
import {
  upsertToothStatus, addToothNote, deleteToothNote,
  getDentalSurfaces, saveDentalSurface,
  type ToothStatus, type ToothNote,
} from '../lib/api';
import { C } from '../constants/theme';
import { TOOTH_COLORS, STATUS_LABELS, ALL_STATUSES, FDI_TO_QUAD } from './DentalChart';

// ── Tooth names (SA quadrant convention) ────────────────────────────────────
const TOOTH_NAMES: Record<number, string> = {
  // a = Upper Right
  11: 'Upper Right Central',   12: 'Upper Right Lateral',   13: 'Upper Right Canine',
  14: 'Upper Right 1st PM',    15: 'Upper Right 2nd PM',
  16: 'Upper Right 1st Molar', 17: 'Upper Right 2nd Molar', 18: 'Upper Right Wisdom',
  // b = Upper Left
  21: 'Upper Left Central',    22: 'Upper Left Lateral',    23: 'Upper Left Canine',
  24: 'Upper Left 1st PM',     25: 'Upper Left 2nd PM',
  26: 'Upper Left 1st Molar',  27: 'Upper Left 2nd Molar',  28: 'Upper Left Wisdom',
  // c = Lower Left
  31: 'Lower Left Central',    32: 'Lower Left Lateral',    33: 'Lower Left Canine',
  34: 'Lower Left 1st PM',     35: 'Lower Left 2nd PM',
  36: 'Lower Left 1st Molar',  37: 'Lower Left 2nd Molar',  38: 'Lower Left Wisdom',
  // d = Lower Right
  41: 'Lower Right Central',   42: 'Lower Right Lateral',   43: 'Lower Right Canine',
  44: 'Lower Right 1st PM',    45: 'Lower Right 2nd PM',
  46: 'Lower Right 1st Molar', 47: 'Lower Right 2nd Molar', 48: 'Lower Right Wisdom',
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

// ── Surface quadrant diagram (module-level, not exported) ────────────────────
type SurfaceRecord = { tooth_fdi: number; surface: string; status: string; notes?: string | null };

const QuadrantDiagram = ({
  toothFdi,
  surfaces,
  activeSurface,
  onPress,
}: {
  toothFdi: number;
  surfaces: SurfaceRecord[];
  activeSurface: string | null;
  onPress: (surface: string) => void;
}) => {
  const getCol = (surface: string) => {
    const found = surfaces.find(s => s.tooth_fdi === toothFdi && s.surface === surface);
    const status = (found?.status ?? 'healthy') as ToothStatus;
    return TOOTH_COLORS[status];
  };

  const segBase = (surface: string) => ({
    position: 'absolute' as const,
    borderRadius: 4,
    justifyContent: 'center' as const,
    alignItems: 'center' as const,
    backgroundColor: getCol(surface).fill,
    borderWidth: activeSurface === surface ? 2.5 : 2,
    borderColor: activeSurface === surface ? C.sage : getCol(surface).stroke,
  });

  const lbl = (text: string, surface: string) => (
    <Text style={{ fontSize: 11, fontWeight: '700', color: C.inkSoft }}>
      {text}
    </Text>
  );

  return (
    <View style={{ width: 100, height: 100, alignSelf: 'center' }}>
      {/* Occlusal — top */}
      <TouchableOpacity
        style={[segBase('occlusal'), { top: 0, left: '25%', width: '50%', height: '33%' }]}
        onPress={() => onPress('occlusal')}
        activeOpacity={0.7}
      >
        {lbl('O', 'occlusal')}
      </TouchableOpacity>

      {/* Lingual — bottom */}
      <TouchableOpacity
        style={[segBase('lingual'), { bottom: 0, left: '25%', width: '50%', height: '33%' }]}
        onPress={() => onPress('lingual')}
        activeOpacity={0.7}
      >
        {lbl('L', 'lingual')}
      </TouchableOpacity>

      {/* Mesial — left */}
      <TouchableOpacity
        style={[segBase('mesial'), { top: '25%', left: 0, width: '33%', height: '50%' }]}
        onPress={() => onPress('mesial')}
        activeOpacity={0.7}
      >
        {lbl('M', 'mesial')}
      </TouchableOpacity>

      {/* Distal — right */}
      <TouchableOpacity
        style={[segBase('distal'), { top: '25%', right: 0, width: '33%', height: '50%' }]}
        onPress={() => onPress('distal')}
        activeOpacity={0.7}
      >
        {lbl('D', 'distal')}
      </TouchableOpacity>

      {/* Center dot */}
      <View
        pointerEvents="none"
        style={{
          position: 'absolute',
          top: '37%', left: '37%',
          width: '26%', height: '26%',
          borderRadius: 13,
          backgroundColor: C.rule,
        }}
      />
    </View>
  );
};

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

  // Surface state
  const [surfaces,      setSurfaces]      = useState<SurfaceRecord[]>([]);
  const [activeSurface, setActiveSurface] = useState<string | null>(null);
  const [surfaceNote,   setSurfaceNote]   = useState('');
  const [surfaceSaving, setSurfaceSaving] = useState(false);

  const handleOpen = useCallback(() => {
    setSelectedStatus(currentStatus);
    setNoteText('');
    setSurfaces([]);
    setActiveSurface(null);
    setSurfaceNote('');
    getDentalSurfaces(patientId)
      .then(d => setSurfaces(d.surfaces || []))
      .catch(() => {});
  }, [currentStatus, patientId]);

  // Reset activeSurface when the tooth changes while the modal is open
  useEffect(() => {
    if (visible) { setActiveSurface(null); setSurfaceNote(''); }
  }, [toothFdi, visible]);

  // Pre-fill the note field when a surface is selected
  useEffect(() => {
    if (activeSurface === null) { setSurfaceNote(''); return; }
    const rec = surfaces.find(s => s.tooth_fdi === toothFdi && s.surface === activeSurface);
    setSurfaceNote(rec?.notes ?? '');
  }, [activeSurface, surfaces, toothFdi]);

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

  const handleSurfaceSave = useCallback(async (status: ToothStatus) => {
    if (!activeSurface) return;
    setSurfaceSaving(true);
    const note = surfaceNote.trim() || null;
    try {
      await saveDentalSurface(patientId, toothFdi, activeSurface, status, note);
      setSurfaces(prev => {
        const without = prev.filter(
          s => !(s.tooth_fdi === toothFdi && s.surface === activeSurface),
        );
        return [...without, { tooth_fdi: toothFdi, surface: activeSurface, status, notes: note }];
      });
      setActiveSurface(null);
    } catch (e: any) {
      Alert.alert('Could not save surface', e.message ?? 'Please try again.');
    } finally {
      setSurfaceSaving(false);
    }
  }, [patientId, toothFdi, activeSurface, surfaceNote]);

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
        <View style={[s.sheetInner, { paddingBottom: 16 }]}>
          {/* Drag handle */}
          <View style={s.handle} />

          {/* Header */}
          <View style={s.header}>
            <View style={s.headerLeft}>
              <View style={[s.statusIndicator, { backgroundColor: TOOTH_COLORS[selectedStatus].fill, borderColor: TOOTH_COLORS[selectedStatus].stroke }]} />
              <View>
                <Text style={s.toothNumber}>{FDI_TO_QUAD[toothFdi] ?? `FDI ${toothFdi}`}</Text>
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

          {/* ── Surface Conditions ───────────────────────────────── */}
          <View style={s.divider} />

          <Text style={s.surfaceSectionLabel}>SURFACE CONDITIONS</Text>

          <QuadrantDiagram
            toothFdi={toothFdi}
            surfaces={surfaces}
            activeSurface={activeSurface}
            onPress={setActiveSurface}
          />

          {activeSurface !== null && (
            <>
              <TextInput
                style={s.surfaceNoteInput}
                value={surfaceNote}
                onChangeText={setSurfaceNote}
                placeholder={`Note for ${activeSurface} surface…`}
                placeholderTextColor={C.muted}
                multiline
                maxLength={300}
                autoCapitalize="sentences"
                autoCorrect
                editable={!surfaceSaving}
              />
              <ScrollView
                horizontal
                showsHorizontalScrollIndicator={false}
                style={{ marginTop: 8 }}
                contentContainerStyle={{ gap: 6, paddingBottom: 2 }}
                keyboardShouldPersistTaps="handled"
              >
                {(ALL_STATUSES as ToothStatus[]).map(st => {
                  const col = TOOTH_COLORS[st];
                  return (
                    <TouchableOpacity
                      key={st}
                      style={[
                        s.surfaceStatusBtn,
                        { backgroundColor: col.fill, borderColor: col.stroke },
                      ]}
                      onPress={() => handleSurfaceSave(st)}
                      disabled={surfaceSaving}
                      activeOpacity={0.7}
                    >
                      {surfaceSaving ? (
                        <ActivityIndicator size="small" color={col.stroke} />
                      ) : (
                        <Text style={[s.surfaceStatusText, { color: col.stroke }]}>
                          {STATUS_SHORT[st]}
                        </Text>
                      )}
                    </TouchableOpacity>
                  );
                })}
              </ScrollView>
            </>
          )}

          <View style={[s.divider, { marginTop: 12, marginBottom: 14 }]} />

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
        {/* Fills safe-area gap below rounded sheet on iPhone home-bar devices */}
        <View style={{ backgroundColor: C.paper, height: insets.bottom }} />
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

  // Divider
  divider: {
    height:          1,
    backgroundColor: C.rule,
    marginBottom:    12,
  },

  // Section labels
  sectionLabel: {
    fontSize:      10,
    fontWeight:    '700',
    letterSpacing: 0.8,
    color:         C.muted,
    marginBottom:  8,
  },
  surfaceSectionLabel: {
    fontSize:      11,
    fontWeight:    '600',
    color:         C.muted,
    marginBottom:  6,
  },

  surfaceNoteInput: {
    backgroundColor:   C.bg,
    borderRadius:      10,
    paddingHorizontal: 10,
    paddingVertical:   8,
    fontSize:          13,
    color:             C.ink,
    maxHeight:         70,
    lineHeight:        19,
    marginTop:         8,
  },

  // Surface status picker buttons (horizontal scroll)
  surfaceStatusBtn: {
    borderRadius:      8,
    borderWidth:       1.5,
    paddingVertical:   6,
    paddingHorizontal: 10,
    minWidth:          60,
    alignItems:        'center',
  },
  surfaceStatusText: {
    fontSize:   11,
    fontWeight: '600',
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
