import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, StyleSheet, TouchableOpacity, TextInput,
  Modal, ActivityIndicator, Alert, Linking, KeyboardAvoidingView, Platform,
} from 'react-native';
import { SafeAreaView, useSafeAreaInsets } from 'react-native-safe-area-context';
import { useLocalSearchParams, router, useFocusEffect } from 'expo-router';
import { Ionicons } from '@expo/vector-icons';
import { Calendar } from 'react-native-calendars';
import {
  getTreatmentPlan, updateTreatmentPlan, addPlanSession,
  updateSessionStatus, saveSessionPayment,
  type TreatmentPlan, type TreatmentPlanSession,
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
  cancelled:   { bg: '#F3F4F6', text: '#6B7280' },
  rescheduled: { bg: '#FEF3C7', text: '#92400E' },
};

const PLAN_STATUS: Record<string, { bg: string; text: string }> = {
  active:    { bg: '#D1FAE5', text: '#065F46' },
  paused:    { bg: '#FEF3C7', text: '#92400E' },
  completed: { bg: '#DBEAFE', text: '#1E40AF' },
  cancelled: { bg: '#F3F4F6', text: '#6B7280' },
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

/** WhatsApp needs the international form: local "082…" must become "2782…". */
function waNumber(phone: string | null | undefined): string | null {
  const digits = String(phone ?? '').replace(/\D/g, '');
  if (!digits) return null;
  if (digits.startsWith('27')) return digits;
  if (digits.startsWith('0'))  return '27' + digits.slice(1);
  return digits;
}

type FullPlan = TreatmentPlan & { treatment_plan_sessions: TreatmentPlanSession[] };

export default function PlanDetailScreen() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const insets = useSafeAreaInsets();
  const [plan,    setPlan]    = useState<FullPlan | null>(null);
  const [loading, setLoading] = useState(true);
  const [error,   setError]   = useState<string | null>(null);
  const [busySession, setBusySession] = useState<string | null>(null);

  const [payFor,   setPayFor]   = useState<TreatmentPlanSession | null>(null);
  const [addOpen,  setAddOpen]  = useState(false);
  const [editOpen, setEditOpen] = useState(false);

  const load = useCallback(() => {
    if (!id) { setError('Plan ID missing'); setLoading(false); return; }
    setLoading(true);
    setError(null);
    getTreatmentPlan(id)
      .then(({ plan: p }) => setPlan(p as FullPlan))
      .catch(e => setError(e.message ?? 'Could not load plan'))
      .finally(() => setLoading(false));
  }, [id]);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  const reload = useCallback(async () => {
    if (!id) return;
    try { const { plan: p } = await getTreatmentPlan(id); setPlan(p as FullPlan); } catch {}
  }, [id]);

  const onSessionAction = async (session: TreatmentPlanSession, status: 'completed' | 'missed' | 'cancelled' | 'scheduled') => {
    if (busySession) return;
    setBusySession(session.id);
    try {
      await updateSessionStatus(session.id, status);
      await reload();
    } catch (e: any) {
      Alert.alert('Could not update session', e.message ?? 'Please try again.');
    } finally {
      setBusySession(null);
    }
  };

  const notifyPatient = async () => {
    if (!plan?.patients) return;
    const wa = waNumber(plan.patients.phone);
    if (!wa) { Alert.alert('No phone number', 'This patient has no phone number on record.'); return; }
    const due = plan.next_session_due ? formatDate(plan.next_session_due) : 'soon';
    const msg = `Hi ${plan.patients.first_name}, this is your dental practice. Your next session for "${plan.title}" is due on ${due}. Please call us to confirm your appointment. Thank you!`;
    const url = `https://wa.me/${wa}?text=${encodeURIComponent(msg)}`;
    const ok = await Linking.canOpenURL(url);
    if (!ok) { Alert.alert('WhatsApp unavailable', 'Could not open WhatsApp on this device.'); return; }
    Linking.openURL(url);
    updateTreatmentPlan(plan.id, { last_notified_at: new Date().toISOString() }).catch(() => {});
  };

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

  const sessions = [...(plan.treatment_plan_sessions ?? [])].sort((a, b) => a.session_number - b.session_number);
  const pct      = plan.total_sessions > 0 ? Math.round((plan.sessions_done / plan.total_sessions) * 100) : 0;
  const payment  = plan.payment_summary as any;
  const isOpen   = plan.status === 'active' || plan.status === 'paused';
  const nextNum  = sessions.length ? Math.max(...sessions.map(x => x.session_number)) + 1 : 1;
  const ps       = PLAN_STATUS[plan.status] ?? PLAN_STATUS.active;

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <View style={s.navRow}>
        <TouchableOpacity style={s.backBtn} onPress={() => router.back()}>
          <Ionicons name="chevron-back" size={22} color={C.sage} />
          <Text style={s.backText}>Plans</Text>
        </TouchableOpacity>
        {isOpen && (
          <TouchableOpacity style={s.editLink} onPress={() => setEditOpen(true)}>
            <Ionicons name="create-outline" size={18} color={C.sage} />
            <Text style={s.editLinkText}>Edit</Text>
          </TouchableOpacity>
        )}
      </View>

      <ScrollView contentContainerStyle={s.scroll} showsVerticalScrollIndicator={false}>
        {/* Hero */}
        <View style={s.heroRow}>
          <Text style={s.planTitle}>{plan.title}</Text>
          <View style={[s.statusBadge, { backgroundColor: ps.bg }]}>
            <Text style={[s.statusText, { color: ps.text }]}>{plan.status}</Text>
          </View>
        </View>
        {plan.patients && (
          <TouchableOpacity onPress={() => plan.patients?.id && router.push(`/patient/${plan.patients!.id}`)}>
            <Text style={s.patientLink}>{plan.patients.first_name} {plan.patients.last_name}  ›</Text>
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
            {plan.next_session_due ? <Text style={s.nextDue}>Next: {formatDate(plan.next_session_due)}</Text> : null}
          </View>
        </View>

        {/* Notify patient */}
        {isOpen && plan.patients?.phone && (
          <TouchableOpacity style={s.notifyBtn} onPress={notifyPatient} activeOpacity={0.85}>
            <Ionicons name="logo-whatsapp" size={18} color="#fff" />
            <Text style={s.notifyText}>Remind patient of next session</Text>
          </TouchableOpacity>
        )}
        {plan.last_notified_at ? (
          <Text style={s.lastNotified}>Last reminded {formatDate(plan.last_notified_at)}</Text>
        ) : null}

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
            <View style={s.payRow}><Text style={s.payLabel}>Total charged</Text><Text style={s.payValue}>{R(payment.total_charged)}</Text></View>
            <View style={s.payRow}><Text style={s.payLabel}>Total paid</Text><Text style={[s.payValue, { color: '#065F46' }]}>{R(payment.total_paid)}</Text></View>
            {(payment.outstanding ?? 0) > 0 && (
              <View style={s.payRow}><Text style={s.payLabel}>Outstanding</Text><Text style={[s.payValue, { color: C.danger }]}>{R(payment.outstanding)}</Text></View>
            )}
          </View>
        ) : null}

        {/* Sessions */}
        <View style={s.card}>
          <View style={s.sessionsHeader}>
            <Text style={s.sectionLabel}>SESSIONS</Text>
            {isOpen && (
              <TouchableOpacity style={s.addSessBtn} onPress={() => setAddOpen(true)}>
                <Ionicons name="add" size={16} color={C.sage} />
                <Text style={s.addSessText}>Add session</Text>
              </TouchableOpacity>
            )}
          </View>
          {sessions.length === 0 && <Text style={s.emptySess}>No sessions recorded yet.</Text>}
          {sessions.map((sess, i) => {
            const st   = SESSION_STATUS[sess.status] ?? SESSION_STATUS.scheduled;
            const appt = sess.appointments;
            const dateStr = appt?.appointment_date ? formatDate(appt.appointment_date)
              : sess.session_date ? formatDate(sess.session_date) : null;
            const busy = busySession === sess.id;
            const ch = Number(sess.amount_charged) || 0;
            const pd = Number(sess.amount_paid) || 0;
            const paidFull = sess.amount_charged != null && ch > 0 && pd >= ch;
            const partial  = sess.amount_charged != null && pd > 0 && pd < ch;
            return (
              <View key={sess.id} style={[s.sessionRow, i === sessions.length - 1 && { borderBottomWidth: 0 }]}>
                <View style={s.sessTopRow}>
                  <View style={{ flex: 1 }}>
                    <Text style={s.sessNum}>Session {sess.session_number}</Text>
                    <Text style={dateStr ? s.sessDate : s.sessDateMuted}>{dateStr ?? 'Not yet scheduled'}</Text>
                    {appt?.services?.name && <Text style={s.sessService}>{appt.services.name}</Text>}
                    {sess.notes ? <Text style={s.sessNotes} numberOfLines={2}>{sess.notes}</Text> : null}
                  </View>
                  <View style={[s.statusBadge, { backgroundColor: st.bg }]}>
                    <Text style={[s.statusText, { color: st.text }]}>{sess.status}</Text>
                  </View>
                </View>

                {/* Payment line */}
                {sess.amount_charged != null && (
                  <View style={s.sessPayLine}>
                    <Text style={s.sessPayText}>Charged {R(sess.amount_charged)} · Paid <Text style={{ color: paidFull ? '#065F46' : partial ? C.warn : C.danger, fontWeight: '600' }}>{R(sess.amount_paid)}</Text></Text>
                    {paidFull && <Text style={s.paidFull}>Paid in full</Text>}
                    {partial  && <Text style={s.partial}>{R(ch - pd)} due</Text>}
                  </View>
                )}

                {/* Actions */}
                <View style={s.sessActions}>
                  {isOpen && sess.status !== 'completed' && sess.status !== 'cancelled' && (
                    <TouchableOpacity style={[s.actBtn, s.actDone]} disabled={busy} onPress={() => onSessionAction(sess, 'completed')}>
                      {busy ? <ActivityIndicator size="small" color="#065F46" /> : <Text style={[s.actText, { color: '#065F46' }]}>✓ Done</Text>}
                    </TouchableOpacity>
                  )}
                  {isOpen && sess.status === 'scheduled' && (
                    <TouchableOpacity style={[s.actBtn, s.actMiss]} disabled={busy} onPress={() => onSessionAction(sess, 'missed')}>
                      <Text style={[s.actText, { color: C.danger }]}>Missed</Text>
                    </TouchableOpacity>
                  )}
                  {isOpen && ['completed', 'missed', 'cancelled'].includes(sess.status) && (
                    <TouchableOpacity style={[s.actBtn, s.actReopen]} disabled={busy} onPress={() => onSessionAction(sess, 'scheduled')}>
                      <Text style={[s.actText, { color: C.muted }]}>↺ Reopen</Text>
                    </TouchableOpacity>
                  )}
                  {isOpen && (
                    <TouchableOpacity style={[s.actBtn, s.actPay]} disabled={busy} onPress={() => setPayFor(sess)}>
                      <Text style={[s.actText, { color: C.sage }]}>{sess.amount_charged != null ? 'Edit payment' : '+ Payment'}</Text>
                    </TouchableOpacity>
                  )}
                  {appt?.id && (
                    <TouchableOpacity style={[s.actBtn, s.actView]} onPress={() => router.push(`/appointment/${appt.id}`)}>
                      <Text style={[s.actText, { color: C.inkSoft }]}>View appt ›</Text>
                    </TouchableOpacity>
                  )}
                </View>
              </View>
            );
          })}
        </View>

        {plan.notes ? (
          <View style={s.card}>
            <Text style={s.sectionLabel}>NOTES</Text>
            <Text style={s.bodyText}>{plan.notes}</Text>
          </View>
        ) : null}
      </ScrollView>

      {payFor && (
        <PaymentModal
          session={payFor}
          onClose={() => setPayFor(null)}
          onSaved={async () => { setPayFor(null); await reload(); }}
        />
      )}
      {addOpen && (
        <AddSessionModal
          planId={plan.id}
          planTotal={plan.total_sessions}
          nextNumber={nextNum}
          existing={sessions}
          onClose={() => setAddOpen(false)}
          onSaved={async () => { setAddOpen(false); await reload(); }}
        />
      )}
      {editOpen && (
        <EditPlanModal
          plan={plan}
          minTotal={sessions.length ? Math.max(...sessions.map(x => x.session_number)) : 1}
          onClose={() => setEditOpen(false)}
          onSaved={async () => { setEditOpen(false); await reload(); }}
        />
      )}
    </SafeAreaView>
  );
}

// ── Payment modal ──────────────────────────────────────────────────
function PaymentModal({ session, onClose, onSaved }: {
  session: TreatmentPlanSession; onClose: () => void; onSaved: () => void;
}) {
  const [charged, setCharged] = useState(session.amount_charged != null ? String(session.amount_charged) : '');
  const [paid,    setPaid]    = useState(session.amount_paid != null ? String(session.amount_paid) : '');
  const [method,  setMethod]  = useState<string | null>(session.payment_method ?? null);
  const [saving,  setSaving]  = useState(false);

  const save = async () => {
    const c = charged !== '' ? parseFloat(charged) : null;
    const p = paid !== '' ? parseFloat(paid) : 0;
    if (c != null && (isNaN(c) || c < 0)) { Alert.alert('Invalid amount', 'Amount charged must be a positive number.'); return; }
    if (isNaN(p) || p < 0) { Alert.alert('Invalid amount', 'Amount paid must be a positive number.'); return; }
    if (c != null && p > c) { Alert.alert('Invalid amount', 'Amount paid cannot exceed amount charged.'); return; }
    setSaving(true);
    try {
      await saveSessionPayment(session.id, {
        amount_charged: c,
        amount_paid: p,
        payment_method: method,
        payment_notes: null,
        paid_at: p > 0 ? new Date().toISOString() : null,
      });
      onSaved();
    } catch (e: any) {
      Alert.alert('Could not save payment', e.message ?? 'Please try again.');
      setSaving(false);
    }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.modalHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close-circle" size={28} color={C.ink} />
          </TouchableOpacity>
          <Text style={s.modalTitle}>Session {session.session_number} payment</Text>
          <View style={{ width: 28 }} />
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>AMOUNT CHARGED (R)</Text>
            <TextInput style={s.input} value={charged} onChangeText={setCharged} keyboardType="numeric" placeholder="0" placeholderTextColor={C.muted} />
            <Text style={[s.fieldLabel, { marginTop: 16 }]}>AMOUNT PAID (R)</Text>
            <TextInput style={s.input} value={paid} onChangeText={setPaid} keyboardType="numeric" placeholder="0" placeholderTextColor={C.muted} />
            <Text style={[s.fieldLabel, { marginTop: 16 }]}>PAYMENT METHOD</Text>
            <View style={s.methodRow}>
              {(['cash', 'card', 'eft', 'medical_aid'] as const).map(m => (
                <TouchableOpacity key={m} style={[s.methodChip, method === m && s.methodChipActive]} onPress={() => setMethod(m)}>
                  <Text style={[s.methodChipText, method === m && s.methodChipTextActive]}>{m === 'medical_aid' ? 'MED AID' : m.toUpperCase()}</Text>
                </TouchableOpacity>
              ))}
            </View>
            <TouchableOpacity style={[s.primaryBtn, saving && s.btnDim]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Save payment</Text>}
            </TouchableOpacity>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Add session modal ──────────────────────────────────────────────
function AddSessionModal({ planId, planTotal, nextNumber, existing, onClose, onSaved }: {
  planId: string; planTotal: number; nextNumber: number;
  existing: TreatmentPlanSession[]; onClose: () => void; onSaved: () => void;
}) {
  const [date,   setDate]   = useState<string | null>(null);
  const [notes,  setNotes]  = useState('');
  const [calOpen, setCalOpen] = useState(false);
  const [saving, setSaving] = useState(false);
  const exceeds = nextNumber > planTotal;

  const save = async () => {
    // Out-of-order date guard, mirroring the web
    if (date) {
      const prev = existing.filter(x => x.session_number < nextNumber && x.session_date)
        .sort((a, b) => b.session_number - a.session_number)[0];
      if (prev?.session_date && date < prev.session_date) {
        Alert.alert('Date out of order', `Session ${nextNumber} cannot be before session ${prev.session_number} (${formatDate(prev.session_date)}).`);
        return;
      }
    }
    setSaving(true);
    try {
      await addPlanSession({ plan_id: planId, session_number: nextNumber, session_date: date, notes: notes.trim() || null });
      if (exceeds) {
        await updateTreatmentPlan(planId, { total_sessions: nextNumber }).catch(() => {});
      }
      onSaved();
    } catch (e: any) {
      Alert.alert('Could not add session', e.message ?? 'Please try again.');
      setSaving(false);
    }
  };

  if (calOpen) {
    return (
      <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={() => setCalOpen(false)}>
        <SafeAreaView style={s.safe} edges={['top']}>
          <View style={s.modalHeader}>
            <Text style={s.modalTitle}>Select session date</Text>
            <TouchableOpacity onPress={() => setCalOpen(false)}><Text style={{ color: C.muted }}>Cancel</Text></TouchableOpacity>
          </View>
          <Calendar
            minDate={new Date().toISOString().slice(0, 10)}
            onDayPress={(d: any) => { setDate(d.dateString); setCalOpen(false); }}
            markedDates={date ? { [date]: { selected: true, selectedColor: C.sage } } : {}}
            theme={{ selectedDayBackgroundColor: C.sage, todayTextColor: C.sage, arrowColor: C.sage }}
          />
        </SafeAreaView>
      </Modal>
    );
  }

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.modalHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close-circle" size={28} color={C.ink} />
          </TouchableOpacity>
          <Text style={s.modalTitle}>Add session {nextNumber}</Text>
          <View style={{ width: 28 }} />
        </View>
        <ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
          {exceeds && (
            <View style={s.warnBanner}>
              <Text style={s.warnText}>This exceeds the planned {planTotal} session{planTotal !== 1 ? 's' : ''} — the plan will be extended to {nextNumber}.</Text>
            </View>
          )}
          <Text style={s.fieldLabel}>SESSION DATE</Text>
          <TouchableOpacity style={s.dateBtn} onPress={() => setCalOpen(true)}>
            <Ionicons name="calendar-outline" size={16} color={C.sage} />
            <Text style={[s.dateBtnText, !date && { color: C.muted }]}>{date ? formatDate(date) : 'Optional — pick a date'}</Text>
          </TouchableOpacity>
          {date ? <Text style={s.hint}>An appointment will be auto-created for this date.</Text> : null}
          <Text style={[s.fieldLabel, { marginTop: 16 }]}>NOTES</Text>
          <TextInput style={[s.input, { minHeight: 72, textAlignVertical: 'top' }]} value={notes} onChangeText={setNotes} multiline placeholder="Optional notes for this session…" placeholderTextColor={C.muted} />
          <TouchableOpacity style={[s.primaryBtn, saving && s.btnDim]} onPress={save} disabled={saving}>
            {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Add session</Text>}
          </TouchableOpacity>
        </ScrollView>
      </SafeAreaView>
    </Modal>
  );
}

// ── Edit plan modal ────────────────────────────────────────────────
function EditPlanModal({ plan, minTotal, onClose, onSaved }: {
  plan: FullPlan; minTotal: number; onClose: () => void; onSaved: () => void;
}) {
  const [title, setTitle] = useState(plan.title);
  const [total, setTotal] = useState(String(plan.total_sessions));
  const [desc,  setDesc]  = useState(plan.description ?? '');
  const [saving, setSaving] = useState(false);

  const save = async () => {
    if (!title.trim()) { Alert.alert('Missing title', 'Plan title is required.'); return; }
    const t = parseInt(total, 10);
    if (isNaN(t) || t < minTotal) { Alert.alert('Invalid total', `Total sessions must be at least ${minTotal}.`); return; }
    if (t > 50) { Alert.alert('Invalid total', 'Total sessions cannot exceed 50.'); return; }
    setSaving(true);
    try {
      await updateTreatmentPlan(plan.id, { title: title.trim(), total_sessions: t, description: desc.trim() || null });
      onSaved();
    } catch (e: any) {
      Alert.alert('Could not save', e.message ?? 'Please try again.');
      setSaving(false);
    }
  };

  const changeStatus = async (status: 'paused' | 'active' | 'cancelled') => {
    setSaving(true);
    try { await updateTreatmentPlan(plan.id, { status }); onSaved(); }
    catch (e: any) { Alert.alert('Could not update', e.message ?? 'Please try again.'); setSaving(false); }
  };

  return (
    <Modal visible animationType="slide" presentationStyle="pageSheet" onRequestClose={onClose}>
      <SafeAreaView style={s.safe} edges={['top']}>
        <View style={s.modalHeader}>
          <TouchableOpacity onPress={onClose} hitSlop={{ top: 12, bottom: 12, left: 12, right: 12 }}>
            <Ionicons name="close-circle" size={28} color={C.ink} />
          </TouchableOpacity>
          <Text style={s.modalTitle}>Edit plan</Text>
          <View style={{ width: 28 }} />
        </View>
        <KeyboardAvoidingView behavior={Platform.OS === 'ios' ? 'padding' : undefined} style={{ flex: 1 }}>
          <ScrollView contentContainerStyle={s.modalScroll} keyboardShouldPersistTaps="handled">
            <Text style={s.fieldLabel}>PLAN TITLE</Text>
            <TextInput style={s.input} value={title} onChangeText={setTitle} placeholder="Plan title" placeholderTextColor={C.muted} />
            <Text style={[s.fieldLabel, { marginTop: 16 }]}>TOTAL SESSIONS</Text>
            <TextInput style={s.input} value={total} onChangeText={setTotal} keyboardType="numeric" placeholder="1" placeholderTextColor={C.muted} />
            <Text style={[s.fieldLabel, { marginTop: 16 }]}>DESCRIPTION</Text>
            <TextInput style={[s.input, { minHeight: 72, textAlignVertical: 'top' }]} value={desc} onChangeText={setDesc} multiline placeholder="What this plan covers…" placeholderTextColor={C.muted} />
            <TouchableOpacity style={[s.primaryBtn, saving && s.btnDim]} onPress={save} disabled={saving}>
              {saving ? <ActivityIndicator color="#fff" /> : <Text style={s.primaryBtnText}>Save changes</Text>}
            </TouchableOpacity>

            <View style={s.dangerZone}>
              {plan.status === 'active' && (
                <TouchableOpacity style={s.secondaryBtn} disabled={saving} onPress={() => changeStatus('paused')}>
                  <Text style={s.secondaryBtnText}>Pause plan</Text>
                </TouchableOpacity>
              )}
              {plan.status === 'paused' && (
                <TouchableOpacity style={s.secondaryBtn} disabled={saving} onPress={() => changeStatus('active')}>
                  <Text style={s.secondaryBtnText}>Resume plan</Text>
                </TouchableOpacity>
              )}
              <TouchableOpacity
                style={[s.secondaryBtn, { borderColor: 'rgba(186,26,26,0.3)' }]}
                disabled={saving}
                onPress={() => Alert.alert('Cancel plan?', 'This marks the plan and its pending sessions as cancelled.', [
                  { text: 'Keep plan', style: 'cancel' },
                  { text: 'Cancel plan', style: 'destructive', onPress: () => changeStatus('cancelled') },
                ])}
              >
                <Text style={[s.secondaryBtnText, { color: C.danger }]}>Cancel plan</Text>
              </TouchableOpacity>
            </View>
          </ScrollView>
        </KeyboardAvoidingView>
      </SafeAreaView>
    </Modal>
  );
}

const s = StyleSheet.create({
  safe:    { flex: 1, backgroundColor: C.bg },
  navRow:  { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingRight: 16 },
  backBtn: { flexDirection: 'row', alignItems: 'center', paddingHorizontal: 12, paddingTop: 8, paddingBottom: 4, gap: 2 },
  backText:{ fontSize: 16, color: C.sage },
  editLink:{ flexDirection: 'row', alignItems: 'center', gap: 3, paddingVertical: 6 },
  editLinkText: { fontSize: 15, color: C.sage, fontWeight: '500' },
  scroll:  { padding: 16, paddingBottom: 52 },

  heroRow:     { flexDirection: 'row', alignItems: 'flex-start', justifyContent: 'space-between', gap: 10 },
  planTitle:   { flex: 1, fontSize: 24, fontWeight: '700', color: C.ink, marginBottom: 4 },
  patientLink: { fontSize: 15, color: C.sage, fontWeight: '500', marginBottom: 16, marginTop: 2 },

  card: { backgroundColor: C.paper, borderRadius: 16, padding: 16, marginBottom: 12, borderWidth: 1, borderColor: C.rule },
  sectionLabel: { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.muted, marginBottom: 12 },
  bodyText: { fontSize: 14, color: C.inkSoft, lineHeight: 21 },

  progressRow:  { flexDirection: 'row', justifyContent: 'space-between', marginBottom: 8 },
  progressLabel:{ fontSize: 13, color: C.muted },
  progressValue:{ fontSize: 13, fontWeight: '600', color: C.ink },
  track: { height: 7, borderRadius: 4, backgroundColor: C.bg2, flexDirection: 'row', overflow: 'hidden', marginBottom: 8 },
  fill:  { backgroundColor: C.sage, borderRadius: 4 },
  progressMeta: { flexDirection: 'row', justifyContent: 'space-between' },
  pctLabel:     { fontSize: 12, color: C.muted },
  nextDue:      { fontSize: 12, color: C.sage, fontWeight: '500' },

  notifyBtn: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 8, backgroundColor: '#25D366', borderRadius: 14, paddingVertical: 13, marginBottom: 6 },
  notifyText:{ fontSize: 15, fontWeight: '600', color: '#fff' },
  lastNotified: { fontSize: 11, color: C.muted, textAlign: 'center', marginBottom: 12 },

  payRow:   { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 7, borderBottomWidth: 1, borderBottomColor: C.rule },
  payLabel: { fontSize: 14, color: C.muted },
  payValue: { fontSize: 14, fontWeight: '600', color: C.ink },

  sessionsHeader: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  addSessBtn:  { flexDirection: 'row', alignItems: 'center', gap: 2, marginBottom: 10 },
  addSessText: { fontSize: 13, color: C.sage, fontWeight: '600' },
  emptySess:   { fontSize: 13, color: C.muted, paddingVertical: 4 },

  sessionRow:   { paddingVertical: 12, borderBottomWidth: 1, borderBottomColor: C.rule },
  sessTopRow:   { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'flex-start', gap: 8 },
  sessNum:      { fontSize: 12, fontWeight: '700', color: C.muted, marginBottom: 2, letterSpacing: 0.3 },
  sessDate:     { fontSize: 14, fontWeight: '500', color: C.ink },
  sessDateMuted:{ fontSize: 14, color: C.muted, fontStyle: 'italic' },
  sessService:  { fontSize: 12, color: C.muted, marginTop: 2 },
  sessNotes:    { fontSize: 12, color: C.muted, marginTop: 4 },
  sessPayLine:  { flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 6, flexWrap: 'wrap' },
  sessPayText:  { fontSize: 12, color: C.muted },
  paidFull:     { fontSize: 11, color: '#065F46', fontWeight: '600' },
  partial:      { fontSize: 11, color: C.warn, fontWeight: '600' },

  sessActions:  { flexDirection: 'row', flexWrap: 'wrap', gap: 6, marginTop: 10 },
  actBtn:       { borderRadius: 8, borderWidth: 1, paddingHorizontal: 10, paddingVertical: 6 },
  actText:      { fontSize: 12, fontWeight: '600' },
  actDone:      { borderColor: 'rgba(6,95,70,0.3)', backgroundColor: '#ECFDF5' },
  actMiss:      { borderColor: 'rgba(186,26,26,0.3)' },
  actReopen:    { borderColor: C.rule },
  actPay:       { borderColor: 'rgba(10,74,92,0.3)' },
  actView:      { borderColor: C.rule },

  statusBadge:  { borderRadius: 4, paddingHorizontal: 8, paddingVertical: 3, alignSelf: 'flex-start' },
  statusText:   { fontSize: 10, fontWeight: '600', textTransform: 'capitalize' },

  // Modals
  modalHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', paddingHorizontal: 16, paddingVertical: 14, borderBottomWidth: 1, borderBottomColor: C.rule },
  modalTitle:  { fontSize: 16, fontWeight: '700', color: C.ink },
  modalScroll: { padding: 20 },
  fieldLabel:  { fontSize: 10, fontWeight: '700', letterSpacing: 0.8, color: C.muted, marginBottom: 8 },
  input:       { backgroundColor: C.paper, borderWidth: 1, borderColor: C.rule, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12, fontSize: 15, color: C.ink },
  methodRow:   { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
  methodChip:  { borderWidth: 1, borderColor: C.rule, borderRadius: 8, paddingHorizontal: 14, paddingVertical: 8, backgroundColor: C.paper },
  methodChipActive: { backgroundColor: C.sage, borderColor: C.sage },
  methodChipText:   { fontSize: 12, color: C.inkSoft, fontWeight: '600' },
  methodChipTextActive: { color: '#fff' },
  primaryBtn:  { backgroundColor: C.sage, borderRadius: 14, paddingVertical: 15, alignItems: 'center', marginTop: 24 },
  primaryBtnText: { fontSize: 16, fontWeight: '700', color: '#fff' },
  btnDim:      { opacity: 0.55 },
  dateBtn:     { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: C.paper, borderWidth: 1, borderColor: C.rule, borderRadius: 12, paddingHorizontal: 14, paddingVertical: 12 },
  dateBtnText: { fontSize: 15, color: C.ink, fontWeight: '500' },
  hint:        { fontSize: 12, color: C.sage, marginTop: 6 },
  warnBanner:  { backgroundColor: '#FEF3C7', borderColor: '#FCD34D', borderWidth: 1, borderRadius: 10, padding: 12, marginBottom: 16 },
  warnText:    { fontSize: 13, color: '#92400E', lineHeight: 19 },
  dangerZone:  { marginTop: 28, gap: 10 },
  secondaryBtn:{ borderWidth: 1, borderColor: C.rule, borderRadius: 12, paddingVertical: 13, alignItems: 'center' },
  secondaryBtnText: { fontSize: 15, fontWeight: '600', color: C.inkSoft },
});
