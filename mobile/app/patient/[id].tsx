import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, StyleSheet, Alert, KeyboardAvoidingView, Platform, Linking,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPatient, getDependants, updatePatientNotes, saveSessionNotes } from '../../lib/api';
import DentalChartCard from '../../components/DentalChartCard';
import Avatar from '../../components/Avatar';
import SegmentedControl from '../../components/SegmentedControl';
import { SkeletonBox } from '../../components/Skeleton';
import type { Patient, LinkedPatient, AppointmentSummary } from '../../lib/api';
import { C, T, STATUS } from '../../constants/theme';

// ── Helpers ────────────────────────────────────────────────────────────────

function formatDate(d: string | null) {
  if (!d) return '—';
  return new Date(d + 'T00:00:00').toLocaleDateString('en-GB', {
    day: 'numeric', month: 'long', year: 'numeric',
  });
}

function calcAge(dob: string | null): number | null {
  if (!dob) return null;
  const birth = new Date(dob);
  const now   = new Date();
  let age = now.getFullYear() - birth.getFullYear();
  if (
    now.getMonth() < birth.getMonth() ||
    (now.getMonth() === birth.getMonth() && now.getDate() < birth.getDate())
  ) age--;
  return age;
}

function initials(p: Patient) {
  return `${p.first_name[0] ?? '?'}${p.last_name[0] ?? '?'}`.toUpperCase();
}

// ── Sub-components ─────────────────────────────────────────────────────────

function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <View style={s.section}>
      <Text style={s.sectionTitle}>{title}</Text>
      <View style={s.sectionCard}>{children}</View>
    </View>
  );
}

function Row({ label, value, last }: { label: string; value: string; last?: boolean }) {
  return (
    <View style={[s.row, last && { borderBottomWidth: 0 }]}>
      <Text style={s.rowLabel}>{label}</Text>
      <Text style={s.rowValue}>{value}</Text>
    </View>
  );
}

function ChipRow({ label, items, bg, fg, last }: {
  label: string; items: string[]; bg: string; fg: string; last?: boolean;
}) {
  return (
    <View style={[s.chipRow, last && { borderBottomWidth: 0 }]}>
      <Text style={s.rowLabel}>{label}</Text>
      <View style={s.chipWrap}>
        {items.map((item, i) => (
          <View key={i} style={[s.chip, { backgroundColor: bg }]}>
            <Text style={[s.chipText, { color: fg }]}>{item}</Text>
          </View>
        ))}
      </View>
    </View>
  );
}

// ── Main screen ────────────────────────────────────────────────────────────

export default function PatientDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [patient,    setPatient]    = useState<Patient | null>(null);
  const [dependants, setDependants] = useState<LinkedPatient[]>([]);
  const [loading,    setLoading]    = useState(true);
  const [error,      setError]      = useState<string | null>(null);
  const [tab,        setTab]        = useState(0); // 0 Overview · 1 Chart · 2 History
  const [apptModal,    setApptModal]    = useState<AppointmentSummary | null>(null);
  const [apptClinical, setApptClinical] = useState('');
  const [apptInternal, setApptInternal] = useState('');
  const [apptSaving,   setApptSaving]   = useState(false);

  // Doctor's notes (intake_notes) — inline editing
  const [notesEdit,  setNotesEdit]  = useState(false);
  const [notesText,  setNotesText]  = useState('');
  const [notesSaving,setNotesSaving] = useState(false);

  const saveNotes = useCallback(async () => {
    if (!patient) return;
    setNotesSaving(true);
    try {
      await updatePatientNotes(patient.id, notesText.trim() || null);
      setPatient(p => p ? { ...p, intake_notes: notesText.trim() || null } : p);
      setNotesEdit(false);
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Please try again.');
    } finally {
      setNotesSaving(false);
    }
  }, [patient, notesText]);

  const saveApptNotes = useCallback(async () => {
    if (!apptModal) return;
    setApptSaving(true);
    try {
      await saveSessionNotes(apptModal.id, {
        clinical_notes: apptClinical.trim() || null,
        internal_notes: apptInternal.trim() || null,
      });
      // Reflect saved values back into the patient's appointment list
      setPatient(p => p ? {
        ...p,
        appointments: (p.appointments ?? []).map(a =>
          a.id === apptModal.id
            ? { ...a, clinical_notes: apptClinical.trim() || null, internal_notes: apptInternal.trim() || null } as AppointmentSummary
            : a,
        ),
      } : p);
      setApptModal(null);
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Please try again.');
    } finally {
      setApptSaving(false);
    }
  }, [apptModal, apptClinical, apptInternal]);

  useFocusEffect(useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    getPatient(id)
      .then(async ({ patient: p }) => {
        setPatient(p);
        setNotesText(p.intake_notes ?? '');
        if (p.main_member) {
          const { patients: deps } = await getDependants(id).catch(() => ({ patients: [] }));
          setDependants(deps);
        } else {
          setDependants([]);
        }
      })
      .catch(e => setError(e.message ?? 'Could not load patient'))
      .finally(() => setLoading(false));
  }, [id]));

  // ── Loading / Error ──────────────────────────────────────────────────────

  if (loading || error || !patient) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <View style={s.topBar}>
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn} accessibilityLabel="Go back" accessibilityRole="button">
            <Ionicons name="arrow-back" size={22} color={C.ink} />
          </TouchableOpacity>
          <Text style={s.topBarTitle}>Patient</Text>
        </View>
        {loading ? (
          <View style={s.scroll}>
            <View style={{ alignItems: 'center', paddingTop: 28, paddingBottom: 24 }}>
              <SkeletonBox width={76} height={76} radius={38} />
              <SkeletonBox width={160} height={20} style={{ marginTop: 16 }} />
              <SkeletonBox width={100} height={13} style={{ marginTop: 8 }} />
            </View>
            <SkeletonBox width="100%" height={108} radius={16} style={{ marginTop: 8 }} />
            <SkeletonBox width="100%" height={150} radius={16} style={{ marginTop: 16 }} />
          </View>
        ) : (
          <View style={s.center}>
            <Text style={s.errText}>{error ?? 'Patient not found'}</Text>
          </View>
        )}
      </SafeAreaView>
    );
  }

  // ── Derived data ─────────────────────────────────────────────────────────

  const age        = calcAge(patient.date_of_birth);
  const hasAid     = !!patient.medical_aid_name;
  const isDep      = !patient.main_member && !!patient.main_member_patient_id;
  const allergies  = patient.allergies        ?? [];
  const meds       = patient.medications      ?? [];
  const conditions = patient.medical_conditions ?? [];
  const hasHealth  = allergies.length || meds.length || conditions.length ||
                     patient.previous_dentist || patient.dental_anxiety;
  const appts: AppointmentSummary[] = patient.appointments ?? [];

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Top bar */}
      <View style={s.topBar}>
        <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
          <Ionicons name="arrow-back" size={22} color={C.ink} />
        </TouchableOpacity>
        <Text style={s.topBarTitle}>Patient</Text>
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>

        {/* ── Hero ───────────────────────────────────────────────── */}
        <View style={s.hero}>
          <Avatar
            name={`${patient.first_name} ${patient.last_name}`}
            initials={initials(patient)}
            size={76}
          />
          <Text style={s.heroName}>{patient.first_name} {patient.last_name}</Text>
          {age !== null && (
            <Text style={s.heroSub}>{age} years old</Text>
          )}
          {patient.patient_type && (
            <View style={s.typePill}>
              <Text style={s.typePillText}>{patient.patient_type}</Text>
            </View>
          )}
          {(patient.phone || patient.email) && (
            <View style={s.heroActions}>
              {patient.phone && (
                <TouchableOpacity
                  style={s.actionBtn}
                  activeOpacity={0.8}
                  onPress={() => Linking.openURL(`tel:${patient.phone}`)}
                  accessibilityLabel={`Call ${patient.first_name}`}
                >
                  <Ionicons name="call" size={16} color={C.sage} />
                  <Text style={s.actionText}>Call</Text>
                </TouchableOpacity>
              )}
              {patient.email && (
                <TouchableOpacity
                  style={s.actionBtn}
                  activeOpacity={0.8}
                  onPress={() => Linking.openURL(`mailto:${patient.email}`)}
                  accessibilityLabel={`Email ${patient.first_name}`}
                >
                  <Ionicons name="mail" size={16} color={C.sage} />
                  <Text style={s.actionText}>Email</Text>
                </TouchableOpacity>
              )}
            </View>
          )}
        </View>

        {/* ── Section switcher ───────────────────────────────────── */}
        <View style={s.segmentWrap}>
          <SegmentedControl
            segments={['Overview', 'Chart', 'History']}
            value={tab}
            onChange={setTab}
          />
        </View>

        {tab === 0 && (<>
        {/* ── Doctor's Notes (editable) ─────────────────────────── */}
        <View style={s.drNotesCard}>
          <View style={s.drNotesHeader}>
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
              <Ionicons name="document-text-outline" size={14} color={C.sage} />
              <Text style={s.drNotesLabel}>DOCTOR'S NOTES</Text>
            </View>
            {!notesEdit ? (
              <TouchableOpacity
                onPress={() => { setNotesText(patient.intake_notes ?? ''); setNotesEdit(true); }}
                hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}
                accessibilityLabel="Edit doctor's notes"
                accessibilityRole="button"
              >
                <Ionicons name="pencil-outline" size={16} color={C.sage} />
              </TouchableOpacity>
            ) : (
              <View style={{ flexDirection: 'row', gap: 12, alignItems: 'center' }}>
                <TouchableOpacity onPress={() => setNotesEdit(false)}>
                  <Text style={s.drNotesCancelText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={s.drNotesSaveBtn}
                  onPress={saveNotes}
                  disabled={notesSaving}
                >
                  {notesSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.drNotesSaveBtnText}>Save</Text>}
                </TouchableOpacity>
              </View>
            )}
          </View>

          {notesEdit ? (
            <TextInput
              style={s.drNotesInput}
              value={notesText}
              onChangeText={setNotesText}
              multiline
              autoFocus
              placeholder="Clinical observations, preferences, reminders for next visit…"
              placeholderTextColor={C.muted}
              textAlignVertical="top"
              scrollEnabled={false}
              autoCapitalize="sentences"
              autoCorrect
              accessibilityLabel="Doctor's notes"
            />
          ) : patient.intake_notes ? (
            <Text style={s.drNotesText}>{patient.intake_notes}</Text>
          ) : (
            <TouchableOpacity
              onPress={() => { setNotesText(''); setNotesEdit(true); }}
              activeOpacity={0.7}
            >
              <Text style={s.drNotesPlaceholder}>
                Tap the pencil to add notes about this patient…
              </Text>
            </TouchableOpacity>
          )}
        </View>

        {/* ── Profile ────────────────────────────────────────────── */}
        <Section title="PROFILE">
          <Row label="Date of birth" value={formatDate(patient.date_of_birth)} />
          <Row label="Gender"        value={patient.gender ?? '—'} />
          <Row label="ID number"     value={patient.id_number ?? '—'} />
          <Row
            label="Location"
            value={[patient.suburb, patient.province].filter(Boolean).join(', ') || '—'}
          />
          <Row label="Referred by" value={patient.referral_source ?? '—'} last />
        </Section>

        {/* ── Medical Aid ────────────────────────────────────────── */}
        {hasAid && (
          <Section title="MEDICAL AID">
            <Row label="Scheme"    value={patient.medical_aid_name!} />
            <Row label="Plan"      value={patient.medical_aid_plan ?? '—'} />
            <Row label="Member no." value={patient.medical_aid_number ?? '—'} />
            <Row
              label="Status"
              value={patient.main_member
                ? 'Main member'
                : patient.relationship_to_member ?? 'Dependant'}
            />
            {patient.dependant_code
              ? <Row label="Dep. code"    value={patient.dependant_code} />
              : null
            }
            {!patient.main_member && patient.main_member_name
              ? <Row label="Main member" value={patient.main_member_name} last />
              : <Row label="Status" value={patient.main_member ? 'Primary' : 'Dependant'} last />
            }
          </Section>
        )}

        {/* ── Linked patients ─────────────────────────────────────── */}
        {isDep && patient.main_member_patient_id && (
          <Section title="MAIN MEMBER">
            <TouchableOpacity
              style={[s.linkedRow, { borderBottomWidth: 0 }]}
              onPress={() => router.push(`/patient/${patient.main_member_patient_id}`)}
            >
              <View style={s.linkedAvatar}>
                <Text style={s.linkedAvatarText}>
                  {(patient.main_member_name || 'M')[0].toUpperCase()}
                </Text>
              </View>
              <View style={{ flex: 1 }}>
                <Text style={s.linkedName}>{patient.main_member_name ?? 'Main member'}</Text>
                <Text style={s.linkedSub}>Tap to view profile</Text>
              </View>
              <Ionicons name="chevron-forward" size={16} color={C.muted} />
            </TouchableOpacity>
          </Section>
        )}

        {dependants.length > 0 && (
          <Section title={`DEPENDANTS (${dependants.length})`}>
            {dependants.map((dep, i) => (
              <TouchableOpacity
                key={dep.id}
                style={[s.linkedRow, i === dependants.length - 1 && { borderBottomWidth: 0 }]}
                onPress={() => router.push(`/patient/${dep.id}`)}
              >
                <View style={s.linkedAvatar}>
                  <Text style={s.linkedAvatarText}>{(dep.first_name[0] ?? '?').toUpperCase()}</Text>
                </View>
                <View style={{ flex: 1 }}>
                  <Text style={s.linkedName}>{dep.first_name} {dep.last_name}</Text>
                  <Text style={s.linkedSub}>
                    {dep.relationship_to_member ?? 'Dependant'}
                    {dep.dependant_code ? ` · ${dep.dependant_code}` : ''}
                  </Text>
                </View>
                <Ionicons name="chevron-forward" size={16} color={C.muted} />
              </TouchableOpacity>
            ))}
          </Section>
        )}

        {/* ── Medical history ─────────────────────────────────────── */}
        {!!hasHealth && (
          <Section title="MEDICAL HISTORY">
            {patient.dental_anxiety && (
              <Row label="Dental anxiety"   value={patient.dental_anxiety} />
            )}
            {patient.previous_dentist && (
              <Row label="Previous dentist" value={patient.previous_dentist} />
            )}
            {allergies.length > 0 && (
              <ChipRow label="Allergies"  items={allergies}  bg="#FEE2E2" fg="#991B1B" />
            )}
            {meds.length > 0 && (
              <ChipRow label="Medications" items={meds}      bg="#DBEAFE" fg="#1E40AF" />
            )}
            {conditions.length > 0 && (
              <ChipRow label="Conditions"  items={conditions} bg="#FEF3C7" fg="#92400E" last />
            )}
          </Section>
        )}
        </>)}

        {/* ── Chart tab ──────────────────────────────────────────── */}
        {tab === 1 && <DentalChartCard patientId={patient.id} />}

        {/* ── History tab ────────────────────────────────────────── */}
        {tab === 2 && (appts.length > 0 ? (
          <Section title={`APPOINTMENT HISTORY (${appts.length})`}>
            {appts.map((appt, i) => {
              const st = STATUS[appt.status] ?? STATUS.pending;
              return (
                <TouchableOpacity
                  key={appt.id}
                  style={[s.apptRow, i === appts.length - 1 && { borderBottomWidth: 0 }]}
                  onPress={() => router.push(`/appointment/${appt.id}`)}
                  activeOpacity={0.7}
                >
                  <View style={{ flex: 1 }}>
                    <Text style={s.apptDate}>
                      {new Date(appt.appointment_date + 'T00:00:00').toLocaleDateString('en-GB', {
                        day: 'numeric', month: 'short', year: 'numeric',
                      })}
                      {appt.appointment_time
                        ? `  ·  ${appt.appointment_time.slice(0, 5)}`
                        : ''}
                    </Text>
                    <Text style={s.apptService}>{appt.services?.name ?? '—'}</Text>
                  </View>
                  <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                    <View style={[s.apptBadge, { backgroundColor: st.bg }]}>
                      <Text style={[s.apptBadgeText, { color: st.text }]}>
                        {appt.status.replace('_', ' ')}
                      </Text>
                    </View>
                    <Ionicons name="chevron-forward" size={14} color={C.muted} />
                  </View>
                </TouchableOpacity>
              );
            })}
          </Section>
        ) : (
          <View style={s.tabEmpty}>
            <Ionicons name="time-outline" size={30} color={C.muted} />
            <Text style={s.tabEmptyText}>No appointments recorded yet.</Text>
          </View>
        ))}

      </ScrollView>

      {/* ── Session notes modal ────────────────────────────────────── */}
      <Modal
        visible={apptModal !== null}
        transparent
        animationType="slide"
        onRequestClose={() => setApptModal(null)}
      >
        <KeyboardAvoidingView
          style={{ flex: 1 }}
          behavior={Platform.OS === 'ios' ? 'padding' : 'height'}
        >
          <View style={s.overlay}>
            <TouchableOpacity style={s.overlayBg} activeOpacity={1} onPress={() => setApptModal(null)} />
            <View style={s.sheet}>
              <View style={s.sheetHandle} />

              {/* Header */}
              <View style={s.sheetHeader}>
                <View style={{ flex: 1 }}>
                  <Text style={s.sheetDate}>
                    {apptModal
                      ? new Date(apptModal.appointment_date + 'T00:00:00').toLocaleDateString('en-GB', {
                          day: 'numeric', month: 'long', year: 'numeric',
                        })
                      : ''}
                    {apptModal?.appointment_time
                      ? `  ·  ${apptModal.appointment_time.slice(0, 5)}`
                      : ''}
                  </Text>
                  <Text style={s.sheetService}>{apptModal?.services?.name ?? '—'}</Text>
                </View>
                {apptModal && (() => {
                  const st = STATUS[apptModal.status] ?? STATUS.pending;
                  return (
                    <View style={[s.apptBadge, { backgroundColor: st.bg }]}>
                      <Text style={[s.apptBadgeText, { color: st.text }]}>
                        {apptModal.status.replace('_', ' ')}
                      </Text>
                    </View>
                  );
                })()}
              </View>

              {/* Editable notes body */}
              <ScrollView
                style={s.sheetBody}
                contentContainerStyle={s.sheetBodyContent}
                showsVerticalScrollIndicator={false}
                keyboardShouldPersistTaps="handled"
              >
                {/* Patient notes — read-only (written by patient at booking) */}
                {apptModal?.patient_notes ? (
                  <View style={s.notesGroup}>
                    <Text style={s.notesGroupLabel}>PATIENT NOTES</Text>
                    <Text style={s.notesGroupText}>{apptModal.patient_notes}</Text>
                  </View>
                ) : null}

                {/* Clinical notes — editable */}
                <View style={s.notesGroup}>
                  <Text style={s.notesGroupLabel}>CLINICAL NOTES</Text>
                  <TextInput
                    style={s.notesInput}
                    value={apptClinical}
                    onChangeText={setApptClinical}
                    multiline
                    placeholder="Observations, treatment performed, recommendations…"
                    placeholderTextColor={C.muted}
                    textAlignVertical="top"
                    scrollEnabled={false}
                    editable={!apptSaving}
                  />
                </View>

                {/* Internal notes — editable */}
                <View style={[s.notesGroup, { marginBottom: 4 }]}>
                  <Text style={s.notesGroupLabel}>INTERNAL NOTES</Text>
                  <TextInput
                    style={[s.notesInput, { minHeight: 60 }]}
                    value={apptInternal}
                    onChangeText={setApptInternal}
                    multiline
                    placeholder="Staff-only notes (not visible to patient)…"
                    placeholderTextColor={C.muted}
                    textAlignVertical="top"
                    scrollEnabled={false}
                    editable={!apptSaving}
                  />
                </View>
              </ScrollView>

              {/* Footer buttons */}
              <View style={s.sheetFooter}>
                <TouchableOpacity
                  style={s.closeBtnSecondary}
                  onPress={() => setApptModal(null)}
                  disabled={apptSaving}
                >
                  <Text style={s.closeBtnSecondaryText}>Cancel</Text>
                </TouchableOpacity>
                <TouchableOpacity
                  style={[s.saveApptBtn, apptSaving && { opacity: 0.5 }]}
                  onPress={saveApptNotes}
                  disabled={apptSaving}
                  activeOpacity={0.85}
                >
                  {apptSaving
                    ? <ActivityIndicator size="small" color="#fff" />
                    : <Text style={s.saveApptBtnText}>Save Notes</Text>}
                </TouchableOpacity>
              </View>
            </View>
          </View>
        </KeyboardAvoidingView>
      </Modal>

    </SafeAreaView>
  );
}

// ── Styles ─────────────────────────────────────────────────────────────────

const s = StyleSheet.create({
  safe:   { flex: 1, backgroundColor: C.bg },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center' },
  errText:{ color: C.danger, fontSize: 14, textAlign: 'center', padding: 20 },
  scroll: { padding: 20, paddingBottom: 48 },

  // Top bar
  topBar:      { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 16, paddingVertical: 12, backgroundColor: C.bg, borderBottomWidth: 1, borderBottomColor: C.rule },
  backBtn:     { padding: 8, marginRight: 10 },
  topBarTitle: { fontSize: 16, fontWeight: '600', color: C.ink },

  // Hero
  hero:          { alignItems: 'center', paddingTop: 24, paddingBottom: 20 },
  heroName:      { ...T.title2, color: C.ink, textAlign: 'center', marginTop: 14 },
  heroSub:       { fontSize: 14, color: C.muted, marginTop: 4 },
  typePill:      { marginTop: 10, backgroundColor: C.bg2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 4 },
  typePillText:  { fontSize: 12, color: C.inkSoft, textTransform: 'capitalize', fontWeight: '500' },
  heroActions:   { flexDirection: 'row', gap: 10, marginTop: 18 },
  actionBtn:     { flexDirection: 'row', alignItems: 'center', gap: 7, backgroundColor: C.sageSoft, borderRadius: 22, paddingHorizontal: 22, paddingVertical: 10 },
  actionText:    { ...T.subhead, color: C.sage, fontWeight: '700' },

  // Section switcher
  segmentWrap:   { marginBottom: 20 },
  tabEmpty:      { alignItems: 'center', paddingVertical: 56, gap: 12 },
  tabEmptyText:  { fontSize: 14, color: C.muted },

  // Sections
  section:      { marginBottom: 20 },
  sectionTitle: { fontSize: 11, letterSpacing: 0.8, color: C.muted, fontWeight: '500', marginBottom: 8 },
  sectionCard:  { backgroundColor: C.paper, borderRadius: 16, borderWidth: 1, borderColor: C.rule, overflow: 'hidden' },

  // Row
  row:      { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rule },
  rowLabel: { fontSize: 13, color: C.muted, flex: 1 },
  rowValue: { fontSize: 13, color: C.ink, fontWeight: '500', flex: 2, textAlign: 'right' },

  // Chip row
  chipRow:  { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rule },
  chipWrap: { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 6 },
  chip:     { borderRadius: 10, paddingHorizontal: 10, paddingVertical: 4 },
  chipText: { fontSize: 12, fontWeight: '500' },

  // Notes (inside medical history section — kept for chips layout)
  notesBlock: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rule },
  notesText:  { fontSize: 13, color: C.inkSoft, marginTop: 4, lineHeight: 20 },

  // Doctor's Notes card
  drNotesCard: {
    backgroundColor: C.paper, borderRadius: 16,
    padding: 16, marginBottom: 20,
    borderWidth: 1, borderColor: C.rule,
  },
  drNotesHeader:     { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 10 },
  drNotesLabel:      { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.sage },
  drNotesCancelText: { fontSize: 13, color: C.muted },
  drNotesSaveBtn:    { backgroundColor: C.sage, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 5 },
  drNotesSaveBtnText:{ color: '#fff', fontSize: 13, fontWeight: '600' },
  drNotesInput: {
    fontSize: 14, color: C.ink, minHeight: 80, lineHeight: 22,
    paddingTop: 0, textAlignVertical: 'top',
  },
  drNotesText:       { fontSize: 14, color: C.inkSoft, lineHeight: 22 },
  drNotesPlaceholder:{ fontSize: 14, color: C.muted, fontStyle: 'italic', lineHeight: 22 },

  // Linked patients
  linkedRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rule, gap: 10 },
  linkedAvatar:    { width: 38, height: 38, borderRadius: 19, backgroundColor: C.bg2, alignItems: 'center', justifyContent: 'center' },
  linkedAvatarText:{ fontSize: 15, fontWeight: '700', color: C.sage },
  linkedName:      { fontSize: 14, fontWeight: '600', color: C.ink },
  linkedSub:       { fontSize: 12, color: C.muted, marginTop: 1 },

  // Appointment history
  apptRow:       { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rule, gap: 10 },
  apptDate:      { fontSize: 13, fontWeight: '500', color: C.ink, marginBottom: 2 },
  apptService:   { fontSize: 12, color: C.muted },
  apptBadge:     { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  apptBadgeText: { fontSize: 11, fontWeight: '500', textTransform: 'capitalize' },

  // Notes modal / bottom sheet
  overlay:        { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
  overlayBg:      { ...StyleSheet.absoluteFillObject },
  sheet: {
    backgroundColor: C.paper, borderTopLeftRadius: 24, borderTopRightRadius: 24,
    paddingBottom: 36, maxHeight: '80%',
  },
  sheetHandle:     { width: 40, height: 4, borderRadius: 2, backgroundColor: C.rule, alignSelf: 'center', marginTop: 12, marginBottom: 14 },
  sheetHeader:     { flexDirection: 'row', alignItems: 'flex-start', paddingHorizontal: 20, paddingBottom: 16, borderBottomWidth: 1, borderBottomColor: C.rule, gap: 12 },
  sheetDate:       { fontSize: 14, fontWeight: '600', color: C.ink, marginBottom: 3 },
  sheetService:    { fontSize: 13, color: C.muted },
  sheetBody:       { maxHeight: 340 },
  sheetBodyContent:{ paddingHorizontal: 20, paddingTop: 18, paddingBottom: 8 },
  notesGroup:      { marginBottom: 22 },
  notesGroupLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.muted, marginBottom: 8 },
  notesGroupText:  { fontSize: 14, color: C.inkSoft, lineHeight: 22 },
  noNotesWrap:     { paddingVertical: 36, alignItems: 'center', gap: 10 },
  noNotesText:     { fontSize: 14, color: C.muted, textAlign: 'center' },

  // Editable notes input
  notesInput: {
    fontSize: 14, color: C.ink, lineHeight: 22,
    minHeight: 90, paddingTop: 4,
    textAlignVertical: 'top',
    borderWidth: 1, borderColor: C.rule,
    borderRadius: 12, padding: 12,
    backgroundColor: C.bg, marginTop: 6,
  },

  // Sheet footer
  sheetFooter: {
    flexDirection: 'row', gap: 10,
    paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8,
    borderTopWidth: 1, borderTopColor: C.rule,
  },
  closeBtnSecondary: {
    flex: 1, backgroundColor: C.bg2, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
    borderWidth: 1, borderColor: C.rule,
  },
  closeBtnSecondaryText: { fontSize: 14, fontWeight: '600', color: C.inkSoft },
  saveApptBtn: {
    flex: 2, backgroundColor: C.sage, borderRadius: 12,
    paddingVertical: 14, alignItems: 'center',
  },
  saveApptBtnText: { fontSize: 14, fontWeight: '700', color: '#fff' },
});
