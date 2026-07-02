import React, { useState, useCallback } from 'react';
import {
  View, Text, FlatList, StyleSheet, TouchableOpacity, Modal, TextInput,
  ActivityIndicator, Alert, KeyboardAvoidingView, Platform, ScrollView,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useFocusEffect, router } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getTreatmentPlans, createTreatmentPlan, searchPatients,
  type TreatmentPlan, type PatientSummary,
} from '../../lib/api';
import { SkeletonList } from '../../components/Skeleton';
import { C, T } from '../../constants/theme';

function ProgressBar({ done, total }: { done: number; total: number }) {
  const pct = total > 0 ? Math.min(done / total, 1) : 0;
  return (
    <View style={pb.track}>
      {pct > 0 && <View style={[pb.fill, { flex: pct }]} />}
      {pct < 1 && <View style={{ flex: 1 - pct }} />}
    </View>
  );
}
const pb = StyleSheet.create({
  track: {
    height: 8, borderRadius: 4, backgroundColor: C.bg2,
    flexDirection: 'row', overflow: 'hidden',
  },
  fill: { backgroundColor: C.sage, borderRadius: 4 },
});

/** Flag plans whose next session is overdue or imminent. */
function planUrgency(item: TreatmentPlan): { color: string; label: string } | null {
  if (item.status !== 'active' || !item.next_session_due) return null;
  const m = String(item.next_session_due).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!m) return null;
  const due = new Date(+m[1], +m[2] - 1, +m[3]);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((due.getTime() - today.getTime()) / 86_400_000);
  if (days < 0)  return { color: C.danger, label: 'Overdue' };
  if (days <= 3) return { color: C.warn,   label: 'Due soon' };
  return null;
}

function formatDate(d: string | null) {
  if (!d) return null;
  const match = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return d;
  const [, y, m, day] = match;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(day)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

const STATUS_COLOR: Record<string, string> = {
  active:    C.sage,
  paused:    '#d97706',
  completed: '#16a34a',
  cancelled: C.muted,
};

export default function PlansScreen() {
  const [plans,   setPlans]   = useState<TreatmentPlan[]>([]);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [createOpen, setCreateOpen] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      // Load active + paused plans
      const [active, paused] = await Promise.all([
        getTreatmentPlans('active'),
        getTreatmentPlans('paused'),
      ]);
      setPlans([...active.plans, ...paused.plans]);
    } catch (e: any) {
      setError(e.message ?? 'Could not load plans');
    } finally {
      setLoading(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const renderItem = ({ item }: { item: TreatmentPlan }) => {
    const patient  = item.patients;
    const pct      = item.total_sessions > 0
      ? Math.round((item.sessions_done / item.total_sessions) * 100) : 0;
    const nextDue  = formatDate(item.next_session_due);
    const dotColor = STATUS_COLOR[item.status] ?? C.muted;
    const urg      = planUrgency(item);

    return (
      <TouchableOpacity
        style={[s.card, urg && { borderLeftWidth: 4, borderLeftColor: urg.color }]}
        onPress={() => router.push(`/plan/${item.id}`)}
        activeOpacity={0.75}
      >
        <View style={s.cardTop}>
          <View style={s.cardMid}>
            <Text style={s.planTitle} numberOfLines={1}>{item.title}</Text>
            {patient && (
              <Text style={s.patientName}>
                {patient.first_name} {patient.last_name}
              </Text>
            )}
          </View>
          <View style={[s.statusBadge, { backgroundColor: dotColor + '22', borderColor: dotColor + '44' }]}>
            <View style={[s.statusDot, { backgroundColor: dotColor }]} />
            <Text style={[s.statusBadgeText, { color: dotColor }]}>
              {item.status.charAt(0).toUpperCase() + item.status.slice(1)}
            </Text>
          </View>
        </View>

        <View style={s.progressRow}>
          <View style={{ flex: 1 }}>
            <ProgressBar done={item.sessions_done} total={item.total_sessions} />
          </View>
          <Text style={s.pctInline}>{pct}%</Text>
        </View>

        <View style={s.cardBottom}>
          <Text style={s.sessText}>
            {item.sessions_done} of {item.total_sessions} sessions
          </Text>
          {urg
            ? <Text style={[s.nextDue, { color: urg.color }]}>{urg.label} · {nextDue}</Text>
            : nextDue
              ? <Text style={s.nextDue}>Next: {nextDue}</Text>
              : <Text style={s.pct}>Complete</Text>}
        </View>
      </TouchableOpacity>
    );
  };

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.header}>
        <Text style={s.title}>Plans</Text>
        {!loading && !error && plans.length > 0 && (
          <Text style={s.subtitle}>
            {plans.length} active plan{plans.length === 1 ? '' : 's'}
          </Text>
        )}
      </View>

      {loading ? (
        <SkeletonList count={4} />
      ) : error ? (
        <View style={s.center}><Text style={s.err}>{error}</Text></View>
      ) : (
        <FlatList
          data={plans}
          keyExtractor={item => item.id}
          renderItem={renderItem}
          ListEmptyComponent={
            <View style={s.empty}>
              <Ionicons name="document-text-outline" size={40} color={C.muted} style={{ marginBottom: 12 }} />
              <Text style={s.emptyText}>No active treatment plans.</Text>
            </View>
          }
          contentContainerStyle={s.list}
        />
      )}

      {/* Create-plan FAB */}
      <TouchableOpacity style={s.fab} onPress={() => setCreateOpen(true)} activeOpacity={0.85} accessibilityLabel="New treatment plan">
        <Ionicons name="add" size={28} color="#fff" />
      </TouchableOpacity>

      {createOpen && (
        <CreatePlanModal
          onClose={() => setCreateOpen(false)}
          onCreated={(planId) => { setCreateOpen(false); load(); if (planId) router.push(`/plan/${planId}`); }}
        />
      )}
    </SafeAreaView>
  );
}

// ── Create plan modal ──────────────────────────────────────────────
function CreatePlanModal({ onClose, onCreated }: { onClose: () => void; onCreated: (id?: string) => void }) {
  const [patient, setPatient] = useState<PatientSummary | null>(null);
  const [query,   setQuery]   = useState('');
  const [results, setResults] = useState<PatientSummary[]>([]);
  const [searching, setSearching] = useState(false);
  const [title,   setTitle]   = useState('');
  const [total,   setTotal]   = useState('2');
  const [desc,    setDesc]    = useState('');
  const [saving,  setSaving]  = useState(false);

  const runSearch = useCallback((q: string) => {
    setQuery(q);
    if (!q.trim()) { setResults([]); return; }
    setSearching(true);
    searchPatients(q, 6)
      .then(r => setResults(r.patients))
      .catch(() => setResults([]))
      .finally(() => setSearching(false));
  }, []);

  const save = async () => {
    if (!patient) { Alert.alert('Select a patient', 'Please choose a patient for this plan.'); return; }
    if (!title.trim()) { Alert.alert('Missing title', 'Please enter a plan title.'); return; }
    const t = parseInt(total, 10);
    if (isNaN(t) || t < 1 || t > 50) { Alert.alert('Invalid total', 'Total sessions must be between 1 and 50.'); return; }
    setSaving(true);
    try {
      const { plan } = await createTreatmentPlan({
        patient_id: patient.id, title: title.trim(), total_sessions: t, description: desc.trim() || null,
      });
      onCreated(plan?.id);
    } catch (e: any) {
      Alert.alert('Could not create plan', e.message ?? 'Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={cm.header}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close-circle" size={28} color={C.ink} />
          </TouchableOpacity>
          <Text style={cm.title}>New treatment plan</Text>
          <View style={{ width: 28 }} />
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={cm.scroll} keyboardShouldPersistTaps="handled">
            <Text style={cm.label}>PATIENT</Text>
            {patient ? (
              <View style={cm.pickedPatient}>
                <Text style={cm.pickedName}>{patient.first_name} {patient.last_name}</Text>
                <TouchableOpacity onPress={() => { setPatient(null); setQuery(''); setResults([]); }}>
                  <Text style={cm.changeText}>Change</Text>
                </TouchableOpacity>
              </View>
            ) : (
              <>
                <TextInput style={cm.input} value={query} onChangeText={runSearch} placeholder="Search by name or phone…" placeholderTextColor={C.muted} autoCapitalize="words" />
                {searching && <ActivityIndicator size="small" color={C.sage} style={{ marginTop: 8 }} />}
                {results.map(p => (
                  <TouchableOpacity key={p.id} style={cm.resultRow} onPress={() => { setPatient(p); setResults([]); setQuery(''); }}>
                    <Text style={cm.resultName}>{p.first_name} {p.last_name}</Text>
                    <Text style={cm.resultSub}>{p.phone || p.email || ''}</Text>
                  </TouchableOpacity>
                ))}
              </>
            )}

            <Text style={[cm.label, { marginTop: 18 }]}>PLAN TITLE</Text>
            <TextInput style={cm.input} value={title} onChangeText={setTitle} placeholder="e.g. Root Canal — Tooth 16" placeholderTextColor={C.muted} />

            <Text style={[cm.label, { marginTop: 18 }]}>TOTAL SESSIONS</Text>
            <TextInput style={cm.input} value={total} onChangeText={setTotal} keyboardType="numeric" placeholder="2" placeholderTextColor={C.muted} />

            <Text style={[cm.label, { marginTop: 18 }]}>DESCRIPTION</Text>
            <TextInput style={[cm.input, { minHeight: 72, textAlignVertical: 'top' }]} value={desc} onChangeText={setDesc} multiline placeholder="Procedures, tooth numbers, notes…" placeholderTextColor={C.muted} />

            <TouchableOpacity style={[cm.primaryBtn, saving && { opacity: 0.55 }]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={cm.primaryBtnText}>Create plan</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const cm = StyleSheet.create({
  header: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.rule },
  title:  { fontSize: 16, fontWeight: '700', color: C.ink },
  scroll: { padding: 20 },
  label:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.muted, marginBottom: 8 },
  input:  { backgroundColor: C.paper, borderWidth: 1, borderColor: C.rule, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.ink },
  pickedPatient: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', backgroundColor: C.paper, borderWidth: 1, borderColor: C.rule, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  pickedName: { fontSize: 15, fontWeight: '600', color: C.ink },
  changeText: { fontSize: 13, color: C.sage, fontWeight: '600' },
  resultRow:  { paddingVertical: 10, paddingHorizontal: 4, borderBottomWidth: 1, borderBottomColor: C.hair },
  resultName: { fontSize: 15, color: C.ink, fontWeight: '500' },
  resultSub:  { fontSize: 12, color: C.muted, marginTop: 1 },
  primaryBtn: { backgroundColor: C.sage, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 26 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
});

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  header:  { paddingHorizontal: 20, paddingTop: 12, paddingBottom: 8 },
  title:   { ...T.title, color: C.ink },
  subtitle:{ ...T.subhead, color: C.muted, fontWeight: '400', marginTop: 2 },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center' },
  list:   { padding: 16, paddingBottom: 40 },
  empty:  { paddingVertical: 64, alignItems: 'center' },
  emptyText: { color: C.muted, fontSize: 15 },
  err:    { color: C.danger, fontSize: 14, textAlign: 'center', padding: 20 },

  card: {
    backgroundColor: C.paper,
    borderRadius: 16,
    padding: 16,
    marginBottom: 10,
    borderWidth: 1,
    borderColor: C.rule,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: 10,
    marginBottom: 14,
  },
  cardMid:   { flex: 1 },
  planTitle: { ...T.headline, color: C.ink },
  patientName: { fontSize: 13, color: C.muted, marginTop: 2 },
  progressRow: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  pctInline:   { fontSize: 13, fontWeight: '700', color: C.sage, minWidth: 34, textAlign: 'right' },
  sessText:    { ...T.subhead, color: C.inkSoft, fontWeight: '600' },
  cardBottom: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
    marginTop: 10,
  },
  statusBadge: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 5,
    borderRadius: 6,
    borderWidth: 1,
    paddingHorizontal: 8,
    paddingVertical: 3,
  },
  statusDot:       { width: 6, height: 6, borderRadius: 3 },
  statusBadgeText: { fontSize: 11, fontWeight: '600' },
  pct:     { fontSize: 12, color: C.muted },
  nextDue: { fontSize: 12, color: C.sage, fontWeight: '500' },
  fab: {
    position: 'absolute', right: 20, bottom: 28,
    width: 56, height: 56, borderRadius: 28, backgroundColor: C.sage,
    alignItems: 'center', justifyContent: 'center',
    shadowColor: '#000', shadowOpacity: 0.2, shadowRadius: 8, shadowOffset: { width: 0, height: 4 }, elevation: 5,
  },
});
