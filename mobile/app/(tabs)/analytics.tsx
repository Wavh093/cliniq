import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl, StyleSheet,
  TouchableOpacity, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Circle } from 'react-native-svg';
import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from 'expo-router';
import { getAnalytics } from '../../lib/api';
import StatCard from '../../components/StatCard';
import { C } from '../../constants/theme';

// ── Helpers ──────────────────────────────────────────────────────

/** Format a month field from DB (YYYY-MM, YYYY-MM-DD, or ISO timestamp) */
function monthDisplay(m: string) {
  const match = String(m ?? '').match(/^(\d{4})-(\d{2})/);
  if (!match) return String(m ?? '');
  const MONTHS = [
    'January','February','March','April','May','June',
    'July','August','September','October','November','December',
  ];
  return `${MONTHS[parseInt(match[2], 10) - 1]} ${match[1]}`;
}

function formatRand(n: number) {
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000)      return `R${(n / 1000).toFixed(0)}k`;
  return `R${Math.round(n)}`;
}

// ── Donut chart ──────────────────────────────────────────────────
function DonutChart({
  filled, total, color = C.sage, size = 120, stroke = 16,
}: {
  filled: number; total: number; color?: string; size?: number; stroke?: number;
}) {
  const R    = (size - stroke) / 2;
  const circ = 2 * Math.PI * R;
  const pct  = total > 0 ? Math.min(filled / total, 1) : 0;
  const arc  = pct * circ;
  // strokeDashoffset = circ * 0.25 rotates start to 12 o'clock
  const offset    = circ * 0.25;
  const pctLabel  = total > 0 ? `${Math.round(pct * 100)}%` : '—';

  return (
    <View style={{ alignItems: 'center', justifyContent: 'center', width: size, height: size }}>
      <Svg width={size} height={size} style={{ position: 'absolute' }}>
        {/* Track */}
        <Circle cx={size / 2} cy={size / 2} r={R}
          stroke={C.bg2} strokeWidth={stroke} fill="none" />
        {/* Fill arc */}
        {pct > 0 && (
          <Circle cx={size / 2} cy={size / 2} r={R}
            stroke={color}
            strokeWidth={stroke}
            fill="none"
            strokeDasharray={`${arc} ${circ - arc}`}
            strokeDashoffset={offset}
            strokeLinecap="butt"
          />
        )}
      </Svg>
      <Text style={{ fontSize: 28, fontWeight: '700', color: C.ink, letterSpacing: -0.5 }}>{pctLabel}</Text>
      <Text style={{ fontSize: 10, color: C.muted, fontWeight: '600', letterSpacing: 0.4, marginTop: -2 }}>ON AID</Text>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────
export default function AnalyticsScreen() {
  const [data,       setData]       = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);
  const [monthIdx,   setMonthIdx]   = useState(0);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setData(await getAnalytics());
      setMonthIdx(0); // always reset to current month on (re)load
    } catch (e: any) {
      setError(e.message ?? 'Could not load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <SafeAreaView style={s.safe} edges={['top', 'bottom']}><View style={s.center}><ActivityIndicator color={C.sage} size="large" /></View></SafeAreaView>;
  }
  if (error) {
    return <SafeAreaView style={s.safe} edges={['top', 'bottom']}><View style={s.center}><Text style={s.err}>{error}</Text></View></SafeAreaView>;
  }

  const monthly: any[] = data?.monthly_bookings ?? [];
  const revenue: any[] = data?.revenue          ?? [];

  // Selected month data
  const current    = monthly[monthIdx] ?? null;
  const currentRev = revenue.find((r: any) =>
    String(r.month ?? '').substring(0, 7) === String(current?.month ?? '').substring(0, 7)
  ) ?? null;

  const demographics: any[] = data?.demographics ?? [];
  const totalPts  = demographics.length;
  const withAid   = demographics.filter((p: any) => p.has_medical_aid).length;
  const noAid     = totalPts - withAid;

  const lowStock: any[] = data?.low_stock ?? [];

  const canGoBack    = monthIdx < monthly.length - 1; // older
  const canGoForward = monthIdx > 0;                  // newer

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.sage} />
        }
      >
        <Text style={s.pageTitle}>Analytics</Text>

        {/* ── Month picker ── */}
        <View style={s.picker}>
          <TouchableOpacity
            onPress={() => setMonthIdx(i => i + 1)}
            disabled={!canGoBack}
            style={s.arrowBtn}
            accessibilityLabel="Previous month"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-back" size={20} color={canGoBack ? C.ink : C.rule} />
          </TouchableOpacity>

          <Text style={s.pickerLabel}>
            {current ? monthDisplay(current.month) : '—'}
          </Text>

          <TouchableOpacity
            onPress={() => setMonthIdx(i => i - 1)}
            disabled={!canGoForward}
            style={s.arrowBtn}
            accessibilityLabel="Next month"
            accessibilityRole="button"
          >
            <Ionicons name="chevron-forward" size={20} color={canGoForward ? C.ink : C.rule} />
          </TouchableOpacity>
        </View>

        {/* ── THIS MONTH ── */}
        <Text style={s.section}>THIS MONTH</Text>
        {current ? (
          <>
            <View style={s.row}>
              <StatCard label="Bookings"  value={current.total_bookings ?? 0} tone="neutral"  icon="calendar-outline" />
              <StatCard label="Completed" value={current.completed ?? 0}      tone="positive" icon="checkmark-circle-outline" />
            </View>
            <View style={s.row}>
              <StatCard
                label="Est. Revenue"
                value={currentRev?.total_price_from ? formatRand(currentRev.total_price_from) : '—'}
                sub={currentRev?.total_price_from ? undefined : 'No data yet'}
                empty={!currentRev?.total_price_from}
                tone="brand"
                icon="cash-outline"
              />
              <StatCard label="Patients" value={current.unique_patients ?? 0} tone="neutral" icon="people-outline" />
            </View>
          </>
        ) : (
          <Text style={s.muted}>No bookings recorded for this month.</Text>
        )}

        {/* ── ALL TIME ── */}
        <Text style={[s.section, { marginTop: 28 }]}>ALL TIME</Text>

        <View style={s.row}>
          <StatCard label="Total Patients" value={totalPts} tone="neutral" icon="people-outline" />
          <StatCard label="On Medical Aid" value={withAid}  tone="brand"   icon="card-outline" />
        </View>

        {/* Medical aid donut */}
        {totalPts > 0 && (
          <View style={s.card}>
            <Text style={s.cardTitle}>Medical Aid Breakdown</Text>
            <View style={s.donutRow}>
              <DonutChart filled={withAid} total={totalPts} color={C.sage} />
              <View style={s.legend}>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: C.sage }]} />
                  <View>
                    <Text style={s.legendLabel}>On Medical Aid</Text>
                    <Text style={s.legendValue}>{withAid} patients</Text>
                  </View>
                </View>
                <View style={s.legendItem}>
                  <View style={[s.legendDot, { backgroundColor: C.bg2 }]} />
                  <View>
                    <Text style={s.legendLabel}>Cash / Self-pay</Text>
                    <Text style={s.legendValue}>{noAid} patients</Text>
                  </View>
                </View>
              </View>
            </View>
          </View>
        )}

        {/* ── LOW STOCK ── */}
        {lowStock.length > 0 && (
          <>
            <Text style={[s.section, { marginTop: 28 }]}>SUPPLIES</Text>
            <View style={s.alertCard}>
              <View style={s.alertHeader}>
                <Ionicons name="warning-outline" size={16} color={C.warn} />
                <Text style={s.alertHeaderText}>Running low</Text>
                <View style={s.alertCountPill}>
                  <Text style={s.alertCountText}>{lowStock.length}</Text>
                </View>
              </View>
              {lowStock.map((item: any, i: number) => (
                <View
                  key={item.id}
                  style={[s.alertRow, i === lowStock.length - 1 && { borderBottomWidth: 0 }]}
                >
                  <Text style={s.alertName}>{item.name}</Text>
                  <Text style={s.alertQty}>{item.current_qty} {item.unit}</Text>
                </View>
              ))}
            </View>
          </>
        )}
      </ScrollView>
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  safe:      { flex: 1, backgroundColor: C.bg },
  center:    { flex: 1, alignItems: 'center', justifyContent: 'center', backgroundColor: C.bg },
  scroll:    { padding: 20, paddingBottom: 48 },
  pageTitle: { fontSize: 28, fontWeight: '700', color: C.ink, marginBottom: 20 },
  section:   { fontSize: 11, letterSpacing: 0.8, color: C.muted, fontWeight: '600', marginBottom: 12 },
  row:       { flexDirection: 'row', gap: 10, marginBottom: 10 },
  muted:     { fontSize: 14, color: C.muted, marginBottom: 16 },
  err:       { color: C.danger, fontSize: 14, textAlign: 'center', padding: 20 },

  // Month picker
  picker: {
    flexDirection: 'row', alignItems: 'center', justifyContent: 'center',
    gap: 12, marginBottom: 20,
    backgroundColor: C.paper, borderRadius: 14,
    paddingVertical: 12, paddingHorizontal: 8,
    borderWidth: 1, borderColor: C.rule,
  },
  arrowBtn:    { padding: 10, margin: -6 },
  pickerLabel: { fontSize: 16, fontWeight: '600', color: C.ink, minWidth: 160, textAlign: 'center' },

  card: {
    backgroundColor: C.paper, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: C.rule, marginBottom: 10,
  },
  cardTitle: { fontSize: 13, fontWeight: '600', color: C.ink, marginBottom: 16 },

  // Donut
  donutRow:    { flexDirection: 'row', alignItems: 'center', gap: 24 },
  legend:      { flex: 1, gap: 14 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot:   { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 13, color: C.muted },
  legendValue: { fontSize: 15, fontWeight: '600', color: C.ink },

  // Low stock
  alertCard: {
    backgroundColor: C.paper, borderRadius: 16,
    borderWidth: 1, borderColor: C.warnSoft, overflow: 'hidden',
  },
  alertHeader: {
    flexDirection: 'row', alignItems: 'center', gap: 8,
    backgroundColor: C.warnSoft, paddingHorizontal: 14, paddingVertical: 10,
  },
  alertHeaderText: { flex: 1, fontSize: 13, fontWeight: '700', color: C.warn },
  alertCountPill:  { backgroundColor: C.warn, borderRadius: 10, minWidth: 20, paddingHorizontal: 6, paddingVertical: 1, alignItems: 'center' },
  alertCountText:  { fontSize: 11, fontWeight: '700', color: '#fff' },
  alertRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: 14, borderBottomWidth: 1, borderBottomColor: C.rule,
  },
  alertName: { fontSize: 14, color: C.ink },
  alertQty:  { fontSize: 13, color: C.warn, fontWeight: '600' },
});
