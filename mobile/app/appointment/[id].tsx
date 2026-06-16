import React, { useState, useCallback, useRef } from 'react';
import {
  View, Text, ScrollView, TextInput, TouchableOpacity,
  StyleSheet, ActivityIndicator, Alert, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getAppointment, getPatient, saveSessionNotes, updateAppointmentStatus,
  type Appointment, type AppointmentSummary,
} from '../../lib/api';
import { C, STATUS } from '../../constants/theme';
import SickNoteModal from '../../components/SickNoteModal';
import ReferralLetterModal from '../../components/ReferralLetterModal';

// Server-side state machine (mirrored)
const TRANSITIONS: Record<string, string[]> = {
  pending:   ['confirmed', 'completed', 'cancelled', 'no_show'],
  confirmed: ['completed', 'cancelled', 'no_show'],
  no_show:   ['cancelled'],
  completed: [],
  cancelled: [],
};

// ── Helpers ──────────────────────────────────────────────────────

function calcAge(dob: string | null) {
  if (!dob) return null;
  const birth = new Date(dob);
  const now   = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (now.getMonth() < birth.getMonth() ||
      (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())) age--;
  return age;
}

function fmtDate(d: string) {
  const match = String(d ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return d;
  const [, y, m, day] = match;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(day)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

function fmtLong(d: string) {
  const match = String(d ?? '').match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return d;
  const [, y, m, day] = match;
  const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  const DAYS = ['Sunday','Monday','Tuesday','Wednesday','Thursday','Friday','Saturday'];
  const dateObj = new Date(`${y}-${m}-${day}T12:00:00`);
  return `${DAYS[dateObj.getDay()]}, ${parseInt(day)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

// ── Screen ───────────────────────────────────────────────────────

export default function SessionScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();

  const [appt,     setAppt]     = useState<Appointment | null>(null);
  const [prevNote, setPrevNote] = useState<AppointmentSummary | null>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState<string | null>(null);
  const [saving,   setSaving]   = useState(false);

  const [sickNoteVisible, setSickNoteVisible]     = useState(false);
  const [referralVisible, setReferralVisible]     = useState(false);

  // Editable note fields
  const [clinicalNotes, setClinicalNotes] = useState('');
  const [internalNotes, setInternalNotes] = useState('');
  const origClinical = useRef('');
  const origInternal = useRef('');

  const isDirty =
    clinicalNotes !== origClinical.current ||
    internalNotes !== origInternal.current;

  useFocusEffect(useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);
    setPrevNote(null);

    getAppointment(id)
      .then(async ({ appointment: a }) => {
        if (!a) {
          setError('Appointment not found');
          return;
        }
        setAppt(a);
        const cn  = a.clinical_notes  ?? '';
        const in_ = a.internal_notes  ?? '';
        setClinicalNotes(cn);
        setInternalNotes(in_);
        origClinical.current = cn;
        origInternal.current = in_;

        // Load previous visit notes async (non-blocking)
        if (a.patients?.id) {
          getPatient(a.patients.id)
            .then(({ patient: p }) => {
              const prev = (p.appointments ?? []).find(
                (x: AppointmentSummary) =>
                  x.id !== a.id &&
                  x.status === 'completed' &&
                  !!(x as any).clinical_notes,
              ) as (AppointmentSummary & { clinical_notes: string }) | undefined;
              if (prev) setPrevNote(prev as AppointmentSummary);
            })
            .catch(() => {}); // non-critical
        }
      })
      .catch(e => setError(e.message ?? 'Could not load session'))
      .finally(() => setLoading(false));
  }, [id]));

  // ── Save ──────────────────────────────────────────────────────

  const save = useCallback(async (andComplete = false): Promise<boolean> => {
    if (!appt) return false;
    setSaving(true);
    try {
      await saveSessionNotes(appt.id, {
        clinical_notes: clinicalNotes.trim() || null,
        internal_notes: internalNotes.trim() || null,
      });
      origClinical.current = clinicalNotes;
      origInternal.current = internalNotes;

      if (andComplete) {
        await updateAppointmentStatus(appt.id, 'completed');
      }
      return true;
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Please try again.');
      return false;
    } finally {
      setSaving(false);
    }
  }, [appt, clinicalNotes, internalNotes]);

  // ── Back ──────────────────────────────────────────────────────

  const handleBack = useCallback(() => {
    if (isDirty) {
      Alert.alert('Unsaved notes', 'You have unsaved clinical notes.', [
        {
          text: 'Discard',
          style: 'destructive',
          onPress: () => router.back(),
        },
        {
          text: 'Save & go back',
          onPress: async () => {
            const ok = await save();
            if (ok) router.back();
          },
        },
        { text: 'Stay', style: 'cancel' },
      ]);
    } else {
      router.back();
    }
  }, [isDirty, save]);

  // ── Complete ─────────────────────────────────────────────────

  const handleComplete = useCallback(() => {
    Alert.alert(
      'Complete session?',
      clinicalNotes.trim()
        ? 'Notes will be saved. You can then generate patient documents.'
        : 'No clinical notes recorded. Mark complete anyway?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Complete',
          onPress: async () => {
            const ok = await save(true);
            if (ok) {
              // Stay on screen — update local status so document section becomes visible
              setAppt(prev => prev ? { ...prev, status: 'completed' } : prev);
            }
          },
        },
      ],
    );
  }, [clinicalNotes, save]);

  // ── Other status changes ─────────────────────────────────────

  const handleStatus = useCallback((newStatus: string) => {
    const label = newStatus.replace('_', ' ');
    Alert.alert(
      `Mark as ${label}?`,
      isDirty ? 'Your notes will be saved first.' : undefined,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Confirm',
          style: newStatus === 'cancelled' ? 'destructive' : 'default',
          onPress: async () => {
            if (isDirty) {
              const saved = await save();
              if (!saved) return;
            }
            try {
              if (!appt) return;
              await updateAppointmentStatus(appt.id, newStatus as Appointment['status']);
              router.back();
            } catch (e: any) {
              Alert.alert('Error', e.message);
            }
          },
        },
      ],
    );
  }, [appt, isDirty, save]);

  // ── Loading / Error ──────────────────────────────────────────

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.center}>
          <ActivityIndicator color={C.sage} size="large" />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !appt) {
    return (
      <SafeAreaView style={s.safe} edges={['top']}>
        <TouchableOpacity style={s.topBarErr} onPress={() => router.back()}>
          <Ionicons name="arrow-back" size={22} color={C.ink} />
          <Text style={s.topBarErrText}>Back</Text>
        </TouchableOpacity>
        <View style={s.center}>
          <Text style={s.errText}>{error ?? 'Session not found'}</Text>
        </View>
      </SafeAreaView>
    );
  }

  // ── Derived ──────────────────────────────────────────────────

  const patient     = appt.patients;
  const service     = appt.services;
  const st          = STATUS[appt.status] ?? STATUS.pending;
  const time        = appt.appointment_time?.slice(0, 5) ?? '';
  const transitions = TRANSITIONS[appt.status] ?? [];
  const isTerminal  = transitions.length === 0;
  const canComplete = transitions.includes('completed');
  const canNoShow   = transitions.includes('no_show');
  const canCancel   = transitions.includes('cancelled');
  const canConfirm  = transitions.includes('confirmed');

  const age        = calcAge(patient?.date_of_birth ?? null);
  const allergies  = patient?.allergies        ?? [];
  const conditions = patient?.medical_conditions ?? [];
  const meds       = patient?.medications       ?? [];
  const hasHealth  = allergies.length || conditions.length || meds.length;

  return (
    <SafeAreaView style={s.safe} edges={['top']}>
      {/* ── Top bar ─────────────────────────────────────────── */}
      <View style={s.topBar}>
        <TouchableOpacity
          onPress={handleBack}
          style={s.backBtn}
          hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
          accessibilityLabel="Go back"
          accessibilityRole="button"
        >
          <Ionicons name="arrow-back" size={22} color={C.ink} />
        </TouchableOpacity>

        <View style={{ flex: 1, marginHorizontal: 12 }}>
          <Text style={s.topName} numberOfLines={1}>
            {patient
              ? `${patient.first_name} ${patient.last_name}`
              : 'Session'}
          </Text>
          {age !== null && (
            <Text style={s.topAge}>{age} yrs old</Text>
          )}
        </View>

        {saving ? (
          <ActivityIndicator size="small" color={C.sage} style={{ width: 64 }} />
        ) : isDirty ? (
          <TouchableOpacity
            style={s.saveBtn}
            onPress={() => save()}
            activeOpacity={0.8}
            accessibilityLabel="Save notes"
            accessibilityRole="button"
          >
            <Text style={s.saveBtnText}>Save</Text>
          </TouchableOpacity>
        ) : (
          <View style={[s.statusPill, { backgroundColor: st.bg }]}>
            <Text style={[s.statusPillText, { color: st.text }]}>
              {appt.status.replace('_', ' ')}
            </Text>
          </View>
        )}
      </View>

      <KeyboardAvoidingView
        style={{ flex: 1 }}
        behavior={Platform.OS === 'ios' ? 'padding' : undefined}
        keyboardVerticalOffset={58}
      >
        <ScrollView
          contentContainerStyle={s.scroll}
          keyboardShouldPersistTaps="handled"
          showsVerticalScrollIndicator={false}
        >
          {/* ── Allergy alert ──────────────────────────────────── */}
          {allergies.length > 0 && (
            <View style={s.allergyBanner}>
              <Ionicons name="warning" size={18} color="#fff" />
              <Text style={s.allergyBannerText}>
                ALLERGIES  ·  {allergies.join('  ·  ')}
              </Text>
            </View>
          )}

          {/* ── Session header card ────────────────────────────── */}
          <View style={s.sessionCard}>
            <Text style={s.sessionService}>{service?.name ?? '—'}</Text>
            <Text style={s.sessionDate}>{fmtLong(appt.appointment_date)}</Text>
            <Text style={s.sessionMeta}>
              {time}
              {appt.duration_minutes ? `  ·  ${appt.duration_minutes} min` : ''}
              {service?.price_from ? `  ·  from R${service.price_from}` : ''}
            </Text>
            {appt.patient_notes ? (
              <View style={s.patientNoteRow}>
                <Ionicons name="person-outline" size={12} color={C.muted} />
                <Text style={s.patientNoteText}>{appt.patient_notes}</Text>
              </View>
            ) : null}
          </View>

          {/* ── Clinical notes ─────────────────────────────────── */}
          <View style={s.notesCard}>
            <View style={s.notesLabelRow}>
              <Text style={s.notesLabel}>CLINICAL NOTES</Text>
              {isTerminal && <Text style={s.readonlyHint}>read-only</Text>}
            </View>
            <TextInput
              style={[s.clinicalInput, isTerminal && s.readonlyInput]}
              value={clinicalNotes}
              onChangeText={setClinicalNotes}
              multiline
              placeholder={
                isTerminal
                  ? 'No clinical notes recorded.'
                  : 'What was observed, treated, and recommended…'
              }
              placeholderTextColor={C.muted}
              editable={!isTerminal && !saving}
              textAlignVertical="top"
              scrollEnabled={false}
              autoCorrect
              autoCapitalize="sentences"
              accessibilityLabel="Clinical notes"
            />
          </View>

          {/* ── Internal notes ─────────────────────────────────── */}
          <View style={s.notesCard}>
            <Text style={s.notesLabel}>INTERNAL NOTES</Text>
            <TextInput
              style={[s.internalInput, isTerminal && s.readonlyInput]}
              value={internalNotes}
              onChangeText={setInternalNotes}
              multiline
              placeholder={
                isTerminal
                  ? 'No internal notes recorded.'
                  : 'Staff-only notes (not visible to patient)…'
              }
              placeholderTextColor={C.muted}
              editable={!isTerminal && !saving}
              textAlignVertical="top"
              scrollEnabled={false}
              autoCapitalize="sentences"
              autoCorrect
              accessibilityLabel="Internal notes"
            />
          </View>

          {/* ── Patient health summary ────────────────────────── */}
          {!!hasHealth && (
            <View style={s.healthCard}>
              <Text style={s.notesLabel}>PATIENT HEALTH</Text>

              {allergies.length > 0 && (
                <View style={s.healthSection}>
                  <Text style={s.healthSectionLabel}>Allergies</Text>
                  <View style={s.chipRow}>
                    {allergies.map((a, i) => (
                      <View key={i} style={[s.chip, s.chipRed]}>
                        <Text style={s.chipRed_}>{a}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {conditions.length > 0 && (
                <View style={s.healthSection}>
                  <Text style={s.healthSectionLabel}>Medical conditions</Text>
                  <View style={s.chipRow}>
                    {conditions.map((c, i) => (
                      <View key={i} style={[s.chip, s.chipAmber]}>
                        <Text style={s.chipAmber_}>{c}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}

              {meds.length > 0 && (
                <View style={s.healthSection}>
                  <Text style={s.healthSectionLabel}>Medications</Text>
                  <View style={s.chipRow}>
                    {meds.map((m, i) => (
                      <View key={i} style={[s.chip, s.chipBlue]}>
                        <Text style={s.chipBlue_}>{m}</Text>
                      </View>
                    ))}
                  </View>
                </View>
              )}
            </View>
          )}

          {/* ── Previous visit notes ───────────────────────────── */}
          {prevNote && (
            <View style={s.prevCard}>
              <Text style={s.notesLabel}>
                LAST VISIT — {fmtDate(prevNote.appointment_date)}
              </Text>
              <Text style={s.prevService}>{prevNote.services?.name ?? '—'}</Text>
              <Text style={s.prevText}>{(prevNote as any).clinical_notes}</Text>
            </View>
          )}

          {/* ── View full profile ──────────────────────────────── */}
          {patient?.id && (
            <TouchableOpacity
              style={s.profileLink}
              onPress={() => router.push(`/patient/${patient.id}`)}
              activeOpacity={0.7}
            >
              <Ionicons name="person-circle-outline" size={18} color={C.sage} />
              <Text style={s.profileLinkText}>View full patient profile</Text>
              <Ionicons name="chevron-forward" size={14} color={C.sage} />
            </TouchableOpacity>
          )}

          {/* ── Actions ────────────────────────────────────────── */}
          {!isTerminal && (
            <View style={s.actions}>
              {/* Confirm (pending → confirmed) */}
              {canConfirm && appt.status === 'pending' && (
                <TouchableOpacity
                  style={[s.confirmBtn, saving && s.btnDim]}
                  onPress={() => handleStatus('confirmed')}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkmark-circle-outline" size={18} color={C.sage} />
                  <Text style={s.confirmBtnText}>Confirm Arrival</Text>
                </TouchableOpacity>
              )}

              {/* Complete session */}
              {canComplete && (
                <TouchableOpacity
                  style={[s.completeBtn, saving && s.btnDim]}
                  onPress={handleComplete}
                  disabled={saving}
                  activeOpacity={0.85}
                >
                  <Ionicons name="checkmark-circle" size={20} color="#fff" />
                  <Text style={s.completeBtnText}>Complete Session</Text>
                </TouchableOpacity>
              )}

              {/* Secondary: No show + Cancel */}
              {(canNoShow || canCancel) && (
                <View style={s.secondaryRow}>
                  {canNoShow && (
                    <TouchableOpacity
                      style={[s.secondaryBtn, saving && s.btnDim]}
                      onPress={() => handleStatus('no_show')}
                      disabled={saving}
                      activeOpacity={0.8}
                    >
                      <Text style={s.secondaryBtnText}>No Show</Text>
                    </TouchableOpacity>
                  )}
                  {canCancel && (
                    <TouchableOpacity
                      style={[s.secondaryBtn, s.cancelBtn, saving && s.btnDim]}
                      onPress={() => handleStatus('cancelled')}
                      disabled={saving}
                      activeOpacity={0.8}
                    >
                      <Text style={[s.secondaryBtnText, { color: C.danger }]}>
                        Cancel
                      </Text>
                    </TouchableOpacity>
                  )}
                </View>
              )}
            </View>
          )}

          {/* Terminal state label */}
          {isTerminal && (
            <View style={s.terminalRow}>
              <View style={[s.statusPill, { backgroundColor: st.bg, paddingHorizontal: 18, paddingVertical: 8 }]}>
                <Text style={[s.statusPillText, { color: st.text, fontSize: 13 }]}>
                  Session {appt.status.replace('_', ' ')}
                </Text>
              </View>
            </View>
          )}

          {/* ── Patient documents (completed sessions only) ─────── */}
          {appt.status === 'completed' && (
            <View style={s.docsCard}>
              <View style={s.docsHeaderRow}>
                <Ionicons name="document-text-outline" size={15} color={C.sage} />
                <Text style={s.docsTitle}>PATIENT DOCUMENTS</Text>
              </View>
              <TouchableOpacity
                style={s.docBtn}
                onPress={() => setSickNoteVisible(true)}
                activeOpacity={0.75}
              >
                <Ionicons name="medkit-outline" size={20} color={C.sage} />
                <View style={s.docBtnText}>
                  <Text style={s.docBtnLabel}>Sick Note</Text>
                  <Text style={s.docBtnSub}>Medical certificate for work / school</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.muted} />
              </TouchableOpacity>
              <View style={s.docDivider} />
              <TouchableOpacity
                style={s.docBtn}
                onPress={() => setReferralVisible(true)}
                activeOpacity={0.75}
              >
                <Ionicons name="paper-plane-outline" size={20} color={C.sage} />
                <View style={s.docBtnText}>
                  <Text style={s.docBtnLabel}>Referral Letter</Text>
                  <Text style={s.docBtnSub}>Refer patient to a specialist</Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.muted} />
              </TouchableOpacity>
            </View>
          )}

          <View style={{ height: 48 }} />
        </ScrollView>
      </KeyboardAvoidingView>

      {/* Document modals */}
      {appt && (
        <>
          <SickNoteModal
            visible={sickNoteVisible}
            onClose={() => setSickNoteVisible(false)}
            appointment={appt}
          />
          <ReferralLetterModal
            visible={referralVisible}
            onClose={() => setReferralVisible(false)}
            appointment={appt}
          />
        </>
      )}
    </SafeAreaView>
  );
}

// ── Styles ────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  errText: { color: C.danger, fontSize: 14, textAlign: 'center', padding: 20 },

  topBarErr:    { flexDirection: 'row', alignItems: 'center', gap: 8, padding: 16 },
  topBarErrText:{ fontSize: 16, color: C.ink },

  // Top bar
  topBar: {
    flexDirection:   'row',
    alignItems:      'center',
    paddingHorizontal: 16,
    paddingVertical: 12,
    backgroundColor: C.bg,
    borderBottomWidth: 1,
    borderBottomColor: C.rule,
  },
  backBtn:  { padding: 8 },
  topName:  { fontSize: 16, fontWeight: '700', color: C.ink },
  topAge:   { fontSize: 12, color: C.muted },
  saveBtn:  { backgroundColor: C.sage, borderRadius: 8, paddingHorizontal: 16, paddingVertical: 7 },
  saveBtnText: { color: '#fff', fontSize: 13, fontWeight: '600' },
  statusPill:     { borderRadius: 6, paddingHorizontal: 10, paddingVertical: 5 },
  statusPillText: { fontSize: 11, fontWeight: '600', textTransform: 'capitalize' },

  scroll: { padding: 16, paddingTop: 12 },

  // Allergy banner
  allergyBanner: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            10,
    backgroundColor:'#dc2626',
    borderRadius:   12,
    paddingVertical: 12,
    paddingHorizontal: 16,
    marginBottom:   12,
  },
  allergyBannerText: {
    color: '#fff', fontSize: 13, fontWeight: '700', flex: 1, letterSpacing: 0.2,
  },

  // Session header
  sessionCard: {
    backgroundColor: C.paper, borderRadius: 16,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.rule,
  },
  sessionService: { fontSize: 20, fontWeight: '700', color: C.ink, marginBottom: 4 },
  sessionDate:    { fontSize: 13, color: C.muted, marginBottom: 2 },
  sessionMeta:    { fontSize: 13, color: C.muted },
  patientNoteRow: { flexDirection: 'row', alignItems: 'flex-start', gap: 6, marginTop: 10 },
  patientNoteText:{ fontSize: 12, color: C.inkSoft, flex: 1, fontStyle: 'italic', lineHeight: 18 },

  // Notes cards
  notesCard: {
    backgroundColor: C.paper, borderRadius: 16,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.rule,
  },
  notesLabelRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  notesLabel:    { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.muted },
  readonlyHint:  { fontSize: 10, color: C.muted, fontStyle: 'italic' },
  clinicalInput: { fontSize: 15, color: C.ink, minHeight: 140, lineHeight: 23, paddingTop: 0 },
  internalInput: { fontSize: 14, color: C.ink, minHeight: 80, lineHeight: 21, paddingTop: 0 },
  readonlyInput: { color: C.inkSoft },

  // Health card
  healthCard: {
    backgroundColor: C.paper, borderRadius: 16,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.rule,
  },
  healthSection:      { marginTop: 10 },
  healthSectionLabel: { fontSize: 11, color: C.muted, fontWeight: '500', marginBottom: 6 },
  chipRow:            { flexDirection: 'row', flexWrap: 'wrap', gap: 6 },
  chip:               { borderRadius: 8, paddingHorizontal: 10, paddingVertical: 4 },
  chipRed:            { backgroundColor: '#FEE2E2' },
  chipRed_:           { fontSize: 12, color: '#991B1B', fontWeight: '500' },
  chipAmber:          { backgroundColor: '#FEF3C7' },
  chipAmber_:         { fontSize: 12, color: '#92400E', fontWeight: '500' },
  chipBlue:           { backgroundColor: '#DBEAFE' },
  chipBlue_:          { fontSize: 12, color: '#1E40AF', fontWeight: '500' },

  // Previous visit card
  prevCard: {
    backgroundColor: C.bg2, borderRadius: 16,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.rule,
  },
  prevService: { fontSize: 12, color: C.muted, marginBottom: 6, marginTop: 4 },
  prevText:    { fontSize: 14, color: C.inkSoft, lineHeight: 22 },

  // Profile link
  profileLink: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            8,
    paddingVertical: 12,
    paddingHorizontal: 4,
    marginBottom:   8,
  },
  profileLinkText: { flex: 1, fontSize: 14, color: C.sage, fontWeight: '500' },

  // Actions
  actions:     { gap: 10, marginTop: 4 },
  confirmBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:             8,
    backgroundColor: C.bg2,
    borderRadius:   14,
    paddingVertical: 14,
    borderWidth:    1,
    borderColor:    C.sage,
  },
  confirmBtnText: { color: C.sage, fontSize: 15, fontWeight: '700' },
  completeBtn: {
    flexDirection:  'row',
    alignItems:     'center',
    justifyContent: 'center',
    gap:             8,
    backgroundColor: C.sage,
    borderRadius:   14,
    paddingVertical: 16,
  },
  completeBtnText: { color: '#fff', fontSize: 16, fontWeight: '700' },
  secondaryRow:   { flexDirection: 'row', gap: 10 },
  secondaryBtn: {
    flex:           1,
    backgroundColor: C.paper,
    borderRadius:   12,
    paddingVertical: 13,
    alignItems:     'center',
    borderWidth:    1,
    borderColor:    C.rule,
  },
  cancelBtn:         { borderColor: '#fca5a5' },
  secondaryBtnText:  { fontSize: 14, fontWeight: '600', color: C.inkSoft },
  btnDim:            { opacity: 0.5 },
  terminalRow:       { alignItems: 'center', marginTop: 8 },

  // Patient documents section
  docsCard: {
    backgroundColor: C.paper, borderRadius: 16,
    paddingTop: 14, marginTop: 16,
    borderWidth: 1, borderColor: C.rule,
    overflow: 'hidden',
  },
  docsHeaderRow: {
    flexDirection: 'row', alignItems: 'center', gap: 6,
    paddingHorizontal: 16, marginBottom: 10,
  },
  docsTitle: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.sage },
  docBtn: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    paddingHorizontal: 16, paddingVertical: 14,
  },
  docBtnText: { flex: 1 },
  docBtnLabel: { fontSize: 14, fontWeight: '600', color: C.ink },
  docBtnSub:   { fontSize: 12, color: C.muted, marginTop: 1 },
  docDivider:  { height: 1, backgroundColor: C.rule, marginLeft: 52 },
});
