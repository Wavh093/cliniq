import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import {
  getTreatmentPlan,
  type TreatmentPlan,
  type TreatmentPlanSession,
} from '../../lib/api';
import ErrorState from '../../components/ErrorState';
import { SkeletonBox } from '../../components/Skeleton';
import { C } from '../../constants/theme';

/** Turn technical errors (404, network) into plain language for the user. */
function friendlyError(raw: string | null): { title: string; message: string } {
  const m = (raw ?? '').toLowerCase();
  if (m.includes('404') || m.includes('not found')) {
    return { title: "This plan couldn't be found", message: 'It may have been removed or the link is out of date.' };
  }
  if (m.includes('network') || m.includes('fetch') || m.includes('timeout')) {
    return { title: "Couldn't load this plan", message: 'Check your connection and try again.' };
  }
  return { title: "Couldn't load this plan", message: 'Something went wrong on our end. Please try again.' };
}

const SESSION_STATUS: Record<string, { bg: string; text: string }> = {
  scheduled:   { bg: '#DBEAFE', text: '#1E40AF' },
  completed:   { bg: '#D1FAE5', text: '#065F46' },
  missed:      { bg: '#FEE2E2', text: '#991B1B' },
  rescheduled: { bg: '#FEF3C7', text: '#92400E' },
};

function formatDate(d: string | null) {
  if (!d) return '—';
  const match = String(d).match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (!match) return d;
  const [, y, m, day] = match;
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return `${parseInt(day)} ${MONTHS[parseInt(m) - 1]} ${y}`;
}

function R(n: number | null) {
  if (n == null) return '—';
  return `R${Number(n).toFixed(2)}`;
}

type FullPlan = TreatmentPlan & { treatment_plan_sessions: TreatmentPlanSession[] };

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const [plan,    setPlan]    = useState<FullPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);

  const load = useCallback(() => {
    if (!id) {
      setError('Plan ID missing');
      setLoading(false);
      return;
    }
    setLoading(true);
    setError(null);
    getTreatmentPlan(id)
      .then(({ plan: p }) => setPlan(p as FullPlan))
      .catch(e => setError(e.message ?? 'Could not load plan'))
      .finally(() => setLoading(false));
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={C.sage} />
          <Text style={s.backText}>Plans</Text>
        </TouchableOpacity>
        <View style={s.scroll}>
          <SkeletonBox width="70%" height={26} />
          <SkeletonBox width="40%" height={14} style={{ marginTop: 10 }} />
          <SkeletonBox width="100%" height={96} radius={16} style={{ marginTop: 20 }} />
          <SkeletonBox width="100%" height={120} radius={16} style={{ marginTop: 12 }} />
        </View>
      </SafeAreaView>
    );
  }

  if (error || !plan) {
    const fe = friendlyError(error);
    return (
      <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={C.sage} />
          <Text style={s.backText}>Plans</Text>
        </TouchableOpacity>
        <ErrorState
          title={fe.title}
          message={fe.message}
          icon="document-text-outline"
          onRetry={load}
          onBack={() => router.back()}
        />
      </SafeAreaView>
    );
  }

  const sessions = plan.treatment_plan_sessions ?? [];
  const pct      = plan.total_sessions > 0
    ? Math.round((plan.sessions_done / plan.total_sessions) * 100) : 0;
  const payment  = plan.payment_summary as any;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      {/* Nav bar */}
      <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
        <Ionicons name="chevron-back" size={22} color={C.sage} />
        <Text style={s.backText}>Plans</Text>
      </TouchableOpacity>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <Text style={s.planTitle}>{plan.title}</Text>
        {plan.patients && (
          <TouchableOpacity
            onPress={() => plan.patients?.id && router.push(`/patient/${plan.patients!.id}`)}
          >
            <Text style={s.patientLink}>
              {plan.patients.first_name} {plan.patients.last_name}  ›
            </Text>
          </TouchableOpacity>
        )}

        {/* Progress */}
        <View style={s.card}>
          <View style={s.progressRow}>
            <Text style={s.progressLabel}>Progress</Text>
            <Text style={s.progressValue}>{plan.sessions_done} / {plan.total_sessions} sessions</Text>
          </View>
          <View style={s.track}>
            {pct > 0  && <View style={[s.fill, { flex: pct }]} />}
            {pct < 100 && <View style={{ flex: 100 - pct }} />}
          </View>
          <View style={s.progressMeta}>
            <Text style={s.pctLabel}>{pct}% complete</Text>
            {plan.next_session_due
              ? <Text style={s.nextDue}>Next: {formatDate(plan.next_session_due)}</Text>
              : null}
          </View>
        </View>

        {/* Description */}
        {plan.description ? (
          <View style={s.card}>
            <Text style={s.sectionLabel}>ABOUT</Text>
            <Text style={s.bodyText}>{plan.description}</Text>
          </View>
        ) : null}

        {/* Payment summary */}
        {payment ? (
          <View style={s.card}>
            <Text style={s.sectionLabel}>PAYMENTS</Text>
            <View style={s.payRow}>
              <Text style={s.payLabel}>Total charged</Text>
              <Text style={s.payValue}>{R(payment.total_charged)}</Text>
            </View>
            <View style={s.payRow}>
              <Text style={s.payLabel}>Total paid</Text>
              <Text style={[s.payValue, { color: '#065F46' }]}>{R(payment.total_paid)}</Text>
            </View>
            {(payment.outstanding ?? 0) > 0 && (
              <View style={s.payRow}>
                <Text style={s.payLabel}>Outstanding</Text>
                <Text style={[s.payValue, { color: C.danger }]}>{R(payment.outstanding)}</Text>
              </View>
            )}
          </View>
        ) : null}

        {/* Sessions list */}
        {sessions.length > 0 && (
          <View style={s.card}>
            <Text style={s.sectionLabel}>SESSIONS</Text>
            {sessions.map((sess, i) => {
              const st   = SESSION_STATUS[sess.status] ?? SESSION_STATUS.scheduled;
              const appt = sess.appointments;
              const dateStr = appt?.appointment_date
                ? formatDate(appt.appointment_date)
                : sess.session_date
                  ? formatDate(sess.session_date)
                  : null;
              const hasAppt = !!appt?.id;
              const Wrapper = hasAppt ? TouchableOpacity : View;
              const wrapperProps = hasAppt
                ? { activeOpacity: 0.7, onPress: () => router.push(`/appointment/${appt!.id}`) }
                : {};
              return (
                <Wrapper
                  key={sess.id}
                  style={[s.sessionRow, i === sessions.length - 1 && { borderBottomWidth: 0 }, !hasAppt && { opacity: 0.6 }]}
                  {...wrapperProps}
                >
                  <View style={s.sessLeft}>
                    <Text style={s.sessNum}>Session {sess.session_number}</Text>
                    <Text style={dateStr ? s.sessDate : s.sessDateMuted}>
                      {dateStr ?? 'Not yet scheduled'}
                    </Text>
                    {appt?.services?.name && (
                      <Text style={s.sessService}>{appt.services.name}</Text>
                    )}
                    {sess.notes ? (
                      <Text style={s.sessNotes} numberOfLines={2}>{sess.notes}</Text>
                    ) : null}
                  </View>
                  <View style={s.sessRight}>
                    <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                      <Text style={[s.statusText, { color: st.text }]}>
                        {sess.status}
                      </Text>
                    </View>
                    {sess.amount_charged != null && (
                      <Text style={s.sessAmount}>{R(sess.amount_charged)}</Text>
                    )}
                    {hasAppt ? (
                      <Ionicons name="chevron-forward" size={16} color={C.muted} style={{ marginTop: 2 }} />
                    ) : (
                      <Text style={{ fontSize: 10, color: C.muted, fontStyle: 'italic' }}>No appt</Text>
                    )}
                  </View>
                </Wrapper>
              );
            })}
          </View>
        )}

        {/* Notes */}
        {plan.notes ? (
          <View style={s.card}>
            <Text style={s.sectionLabel}>NOTES</Text>
            <Text style={s.bodyText}>{plan.notes}</Text>
          </View>
        ) : null}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  center:  { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, gap: 2 },
  backText:{ fontSize: 16, color: C.sage },
  scroll:  { padding: 16, paddingBottom: 52 },

  planTitle:   { fontSize: 26, fontWeight: '700', color: C.ink, marginBottom: 4 },
  patientLink: { fontSize: 15, color: C.sage, fontWeight: '500', marginBottom: 16 },

  card: {
    backgroundColor: C.paper, borderRadius: 16,
    padding: 16, marginBottom: 12,
    borderWidth: 1, borderColor: C.rule,
  },
  sectionLabel: {
    fontSize: 10, fontWeight: '700', letterSpacing: 0.8,
    color: C.muted, marginBottom: 12,
  },
  bodyText: { fontSize: 14, color: C.inkSoft, lineHeight: 21 },

  progressRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel:{ fontSize: 13, color: C.muted },
  progressValue:{ fontSize: 13, fontWeight: '600', color: C.ink },
  track: {
    height: 7, borderRadius: 4, backgroundColor: C.bg2,
    flexDirection: 'row', overflow: 'hidden', marginBottom: 8,
  },
  fill:         { backgroundColor: C.sage, borderRadius: 4 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  pctLabel:     { fontSize: 12, color: C.muted },
  nextDue:      { fontSize: 12, color: C.sage, fontWeight: '500' },

  payRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.rule },
  payLabel: { fontSize: 14, color: C.muted },
  payValue: { fontSize: 14, fontWeight: '600', color: C.ink },

  sessionRow: {
    flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start',
    paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rule,
    gap: 8,
  },
  sessLeft:     { flex: 1 },
  sessRight:    { alignItems: 'flex-end', gap: 6 },
  sessNum:      { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 2, letterSpacing: 0.3 },
  sessDate:     { fontSize: 14, fontWeight: '500', color: C.ink },
  sessDateMuted:{ fontSize: 14, color: C.muted, fontStyle: 'italic' },
  sessService:  { fontSize: 12, color: C.muted, marginTop: 2 },
  sessNotes:    { fontSize: 12, color: C.muted, marginTop: 4 },
  sessAmount:   { fontSize: 12, color: C.muted },
  statusBadge:  { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3 },
  statusText:   { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },
});
