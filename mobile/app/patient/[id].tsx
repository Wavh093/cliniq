import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, TouchableOpacity,
  ActivityIndicator, StyleSheet,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { getPatient, getDependants } from '../../lib/api';
import type { Patient, LinkedPatient, AppointmentSummary } from '../../lib/api';
import { C, STATUS } from '../../constants/theme';

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
  return `${p.first_name[0] ?? ''}${p.last_name[0] ?? ''}`.toUpperCase();
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

  useFocusEffect(useCallback(() => {
    if (!id) return;
    setLoading(true);
    setError(null);

    getPatient(id)
      .then(async ({ patient: p }) => {
        setPatient(p);
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
          <TouchableOpacity onPress={() => router.back()} style={s.backBtn}>
            <Ionicons name="arrow-back" size={22} color={C.ink} />
          </TouchableOpacity>
          <Text style={s.topBarTitle}>Patient</Text>
        </View>
        <View style={s.center}>
          {loading
            ? <ActivityIndicator color={C.sage} size="large" />
            : <Text style={s.errText}>{error ?? 'Patient not found'}</Text>
          }
        </View>
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
                     patient.previous_dentist || patient.dental_anxiety || patient.intake_notes;
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
          <View style={s.avatar}>
            <Text style={s.avatarText}>{initials(patient)}</Text>
          </View>
          <Text style={s.heroName}>{patient.first_name} {patient.last_name}</Text>
          {age !== null && (
            <Text style={s.heroSub}>{age} years old</Text>
          )}
          <View style={s.heroContacts}>
            {patient.phone && (
              <View style={s.contactPill}>
                <Ionicons name="call-outline" size={12} color={C.inkSoft} />
                <Text style={s.contactPillText}>{patient.phone}</Text>
              </View>
            )}
            {patient.email && (
              <View style={s.contactPill}>
                <Ionicons name="mail-outline" size={12} color={C.inkSoft} />
                <Text style={s.contactPillText}>{patient.email}</Text>
              </View>
            )}
          </View>
          {patient.patient_type && (
            <View style={s.typePill}>
              <Text style={s.typePillText}>{patient.patient_type}</Text>
            </View>
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
                  {(patient.main_member_name ?? 'M')[0].toUpperCase()}
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
                  <Text style={s.linkedAvatarText}>{dep.first_name[0].toUpperCase()}</Text>
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
            {patient.intake_notes && (
              <View style={[s.notesBlock, { borderBottomWidth: 0 }]}>
                <Text style={s.rowLabel}>Notes</Text>
                <Text style={s.notesText}>{patient.intake_notes}</Text>
              </View>
            )}
          </Section>
        )}

        {/* ── Appointment history ──────────────────────────────────── */}
        {appts.length > 0 && (
          <Section title={`APPOINTMENT HISTORY (${appts.length})`}>
            {appts.map((appt, i) => {
              const st = STATUS[appt.status] ?? STATUS.pending;
              return (
                <View
                  key={appt.id}
                  style={[s.apptRow, i === appts.length - 1 && { borderBottomWidth: 0 }]}
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
                    {appt.patient_notes && (
                      <Text style={s.apptNotes} numberOfLines={1}>{appt.patient_notes}</Text>
                    )}
                  </View>
                  <View style={[s.apptBadge, { backgroundColor: st.bg }]}>
                    <Text style={[s.apptBadgeText, { color: st.text }]}>
                      {appt.status.replace('_', ' ')}
                    </Text>
                  </View>
                </View>
              );
            })}
          </Section>
        )}

      </ScrollView>
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
  backBtn:     { padding: 4, marginRight: 10 },
  topBarTitle: { fontSize: 16, fontWeight: '600', color: C.ink },

  // Hero
  hero:          { alignItems: 'center', paddingTop: 28, paddingBottom: 24 },
  avatar:        { width: 76, height: 76, borderRadius: 38, backgroundColor: C.sage, alignItems: 'center', justifyContent: 'center', marginBottom: 14 },
  avatarText:    { fontSize: 28, fontWeight: '700', color: '#fff' },
  heroName:      { fontSize: 22, fontWeight: '700', color: C.ink, textAlign: 'center' },
  heroSub:       { fontSize: 14, color: C.muted, marginTop: 4 },
  heroContacts:  { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12, justifyContent: 'center' },
  contactPill:   { flexDirection: 'row', alignItems: 'center', gap: 5, backgroundColor: C.paper, borderWidth: 1, borderColor: C.rule, borderRadius: 20, paddingHorizontal: 12, paddingVertical: 5 },
  contactPillText: { fontSize: 12, color: C.inkSoft },
  typePill:      { marginTop: 10, backgroundColor: C.bg2, borderRadius: 10, paddingHorizontal: 14, paddingVertical: 4 },
  typePillText:  { fontSize: 12, color: C.inkSoft, textTransform: 'capitalize', fontWeight: '500' },

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

  // Notes
  notesBlock: { paddingHorizontal: 14, paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rule },
  notesText:  { fontSize: 13, color: C.inkSoft, marginTop: 4, lineHeight: 20 },

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
  apptNotes:     { fontSize: 11, color: C.muted, fontStyle: 'italic', marginTop: 2 },
  apptBadge:     { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 4, alignSelf: 'flex-start' },
  apptBadgeText: { fontSize: 11, fontWeight: '500', textTransform: 'capitalize' },
});
