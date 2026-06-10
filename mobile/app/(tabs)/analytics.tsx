import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl, StyleSheet,
  Dimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect, Text as SvgText, G, Circle } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { getAnalytics } from '../../lib/api';
import StatCard from '../../components/StatCard';
import { C } from '../../constants/theme';

const SCREEN_W = Dimensions.get('window').width;

// Robust month label — handles 'YYYY-MM', 'YYYY-MM-DD', full ISO timestamps
function monthLabel(m: string) {
  const match = String(m ?? '').match(/^(\d{4})-(\d{2})/);
  if (!match) return String(m ?? '');
  const MONTHS = ['Jan','Feb','Mar','Apr','May','Jun','Jul','Aug','Sep','Oct','Nov','Dec'];
  return MONTHS[parseInt(match[2], 10) - 1] ?? match[2];
}

function formatRand(n: number) {
  if (n >= 1_000_000) return `R${(n / 1_000_000).toFixed(1)}m`;
  if (n >= 1000)      return `R${(n / 1000).toFixed(0)}k`;
  return `R${Math.round(n)}`;
}

// ── Bar chart ────────────────────────────────────────────────────
function BarChart({ data }: { data: { value: number; label: string }[] }) {
  const CHART_W = SCREEN_W - 80;
  const CHART_H = 110;
  const n       = data.length;
  if (!n) return null;

  const max  = Math.max(...data.map(d => d.value), 1);
  const slot = CHART_W / n;
  const barW = Math.floor(slot * 0.52);
  const gapL = Math.floor((slot - barW) / 2);

  return (
    <Svg width={CHART_W} height={CHART_H + 28}>
      {data.map((d, i) => {
        const barH = Math.max((d.value / max) * CHART_H, d.value > 0 ? 4 : 0);
        const x    = i * slot + gapL;
        const y    = CHART_H - barH;
        return (
          <G key={i}>
            <Rect x={x} y={y} width={barW} height={barH} fill={C.sage} rx={4} />
            <SvgText
              x={x + barW / 2} y={CHART_H + 18}
              textAnchor="middle" fontSize={11} fill={C.muted}
            >
              {d.label}
            </SvgText>
            {d.value > 0 && (
              <SvgText
                x={x + barW / 2} y={y - 6}
                textAnchor="middle" fontSize={10} fill={C.inkSoft}
              >
                {d.value}
              </SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
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
  const offset = circ * 0.25;
  const pctLabel = total > 0 ? `${Math.round(pct * 100)}%` : '—';

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
      <Text style={{ fontSize: 18, fontWeight: '700', color: C.ink }}>{pctLabel}</Text>
    </View>
  );
}

// ── Screen ───────────────────────────────────────────────────────
export default function AnalyticsScreen() {
  const [data,       setData]       = useState<any>(null);
  const [loading,    setLoading]    = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [error,      setError]      = useState<string | null>(null);

  const load = useCallback(async (refresh = false) => {
    refresh ? setRefreshing(true) : setLoading(true);
    setError(null);
    try {
      setData(await getAnalytics());
    } catch (e: any) {
      setError(e.message ?? 'Could not load analytics');
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, []);

  useFocusEffect(useCallback(() => { load(); }, [load]));

  if (loading) {
    return <View style={s.center}><ActivityIndicator color={C.sage} size="large" /></View>;
  }
  if (error) {
    return <View style={s.center}><Text style={s.err}>{error}</Text></View>;
  }

  const monthly: any[]  = data?.monthly_bookings ?? [];
  const revenue: any[]  = data?.revenue          ?? [];
  const current         = monthly[0];
  const currentRev      = revenue[0];

  // Last 6 months (most recent first → reverse for chart)
  const chartData = monthly.slice(0, 6).reverse().map((m: any) => ({
    value: m.total_bookings ?? 0,
    label: monthLabel(m.month),
  }));

  const demographics: any[] = data?.demographics ?? [];
  const totalPts  = demographics.length;
  const withAid   = demographics.filter((p: any) => p.has_medical_aid).length;
  const noAid     = totalPts - withAid;

  const lowStock: any[] = data?.low_stock ?? [];

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.sage} />
        }
      >
        <Text style={s.pageTitle}>Analytics</Text>

        {/* ── THIS MONTH ── */}
        <Text style={s.section}>THIS MONTH</Text>
        {current ? (
          <>
            <View style={s.row}>
              <StatCard label="Bookings"  value={current.total_bookings ?? 0} />
              <StatCard label="Completed" value={current.completed ?? 0} accent={(current.completed ?? 0) > 0} />
            </View>
            <View style={s.row}>
              <StatCard
                label="Est. Revenue"
                value={currentRev?.total_price_from ? formatRand(currentRev.total_price_from) : '—'}
              />
              <StatCard label="Patients" value={current.unique_patients ?? 0} />
            </View>
          </>
        ) : (
          <Text style={s.muted}>No bookings yet this month.</Text>
        )}

        {/* ── BOOKINGS TREND (bar chart) ── */}
        {chartData.length > 0 && (
          <>
            <Text style={[s.section, { marginTop: 28 }]}>BOOKINGS TREND</Text>
            <View style={s.card}>
              <BarChart data={chartData} />
            </View>
          </>
        )}

        {/* ── ALL TIME ── */}
        <Text style={[s.section, { marginTop: 28 }]}>ALL TIME</Text>

        {/* Total patients stat */}
        <View style={s.row}>
          <StatCard label="Total Patients" value={totalPts} />
          <StatCard label="On Medical Aid" value={withAid} />
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
            <Text style={[s.section, { marginTop: 28 }]}>LOW STOCK</Text>
            <View style={s.alertCard}>
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

  card: {
    backgroundColor: C.paper, borderRadius: 16, padding: 20,
    borderWidth: 1, borderColor: C.rule, marginBottom: 10,
  },
  cardTitle:  { fontSize: 13, fontWeight: '600', color: C.ink, marginBottom: 16 },

  // Donut
  donutRow: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            24,
  },
  legend:      { flex: 1, gap: 14 },
  legendItem:  { flexDirection: 'row', alignItems: 'center', gap: 10 },
  legendDot:   { width: 10, height: 10, borderRadius: 5 },
  legendLabel: { fontSize: 13, color: C.muted },
  legendValue: { fontSize: 15, fontWeight: '600', color: C.ink },

  // Low stock
  alertCard: {
    backgroundColor: C.paper, borderRadius: 16,
    borderWidth: 1, borderColor: C.rule, overflow: 'hidden',
  },
  alertRow: {
    flexDirection: 'row', justifyContent: 'space-between',
    padding: 14, borderBottomWidth: 1, borderBottomColor: C.rule,
  },
  alertName: { fontSize: 14, color: C.ink },
  alertQty:  { fontSize: 13, color: C.danger, fontWeight: '500' },
});
