import React, { useState, useCallback } from 'react';
import {
  View, Text, ScrollView, RefreshControl, StyleSheet,
  Dimensions, ActivityIndicator,
} from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import Svg, { Rect, Text as SvgText, G } from 'react-native-svg';
import { useFocusEffect } from 'expo-router';
import { getAnalytics } from '../../lib/api';
import StatCard from '../../components/StatCard';
import { C } from '../../constants/theme';

const SCREEN_W = Dimensions.get('window').width;

function monthLabel(m: string) {
  return new Date(m + '-01').toLocaleDateString('en-GB', { month: 'short' });
}

function formatRand(n: number) {
  return n >= 1000 ? `R${(n / 1000).toFixed(0)}k` : `R${Math.round(n)}`;
}

function BarChart({ data }: { data: { value: number; label: string }[] }) {
  const CHART_W = SCREEN_W - 80;
  const CHART_H = 100;
  const n       = data.length;
  if (!n) return null;

  const max  = Math.max(...data.map(d => d.value), 1);
  const slot = CHART_W / n;
  const barW = Math.floor(slot * 0.55);
  const gapL = Math.floor((slot - barW) / 2);

  return (
    <Svg width={CHART_W} height={CHART_H + 24}>
      {data.map((d, i) => {
        const barH = Math.max((d.value / max) * CHART_H, d.value > 0 ? 3 : 0);
        const x    = i * slot + gapL;
        const y    = CHART_H - barH;
        return (
          <G key={i}>
            <Rect x={x} y={y} width={barW} height={barH} fill={C.sage} rx={3} />
            <SvgText x={x + barW / 2} y={CHART_H + 16} textAnchor="middle" fontSize={10} fill={C.muted}>
              {d.label}
            </SvgText>
            {d.value > 0 && (
              <SvgText x={x + barW / 2} y={y - 5} textAnchor="middle" fontSize={9} fill={C.inkSoft}>
                {d.value}
              </SvgText>
            )}
          </G>
        );
      })}
    </Svg>
  );
}

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

  if (loading) return <View style={s.center}><ActivityIndicator color={C.sage} size="large" /></View>;
  if (error)   return <View style={s.center}><Text style={s.err}>{error}</Text></View>;

  const monthly: any[] = data?.monthly_bookings ?? [];
  const revenue: any[] = data?.revenue          ?? [];
  const current        = monthly[0];
  const currentRev     = revenue[0];
  const chartData      = monthly.slice(0, 6).reverse().map((m: any) => ({
    value: m.total_bookings,
    label: monthLabel(m.month),
  }));

  const demographics: any[] = data?.demographics ?? [];
  const totalPts  = demographics.length;
  const withAid   = demographics.filter((p: any) => p.has_medical_aid).length;
  const lowStock: any[] = data?.low_stock ?? [];

  return (
    <SafeAreaView style={s.safe} edges={['top', 'bottom']}>
      <ScrollView
        contentContainerStyle={s.scroll}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={() => load(true)} tintColor={C.sage} />
        }
      >
        {/* This month */}
        <Text style={s.section}>THIS MONTH</Text>
        {current ? (
          <>
            <View style={s.row}>
              <StatCard label="Bookings"  value={current.total_bookings} />
              <StatCard label="Completed" value={current.completed} accent={current.completed > 0} />
            </View>
            <View style={s.row}>
              <StatCard
                label="Est. Revenue"
                value={currentRev?.total_price_from ? formatRand(currentRev.total_price_from) : '—'}
              />
              <StatCard label="Patients" value={current.unique_patients} />
            </View>
          </>
        ) : (
          <Text style={s.muted}>No bookings yet this month.</Text>
        )}

        {/* Trend chart */}
        {chartData.length > 0 && (
          <>
            <Text style={[s.section, { marginTop: 28 }]}>BOOKINGS TREND</Text>
            <View style={s.card}>
              <BarChart data={chartData} />
            </View>
          </>
        )}

        {/* All-time */}
        <Text style={[s.section, { marginTop: 28 }]}>ALL TIME</Text>
        <View style={s.row}>
          <StatCard label="Total Patients"  value={totalPts} />
          <StatCard
            label="On Medical Aid"
            value={withAid}
            sub={totalPts > 0 ? `${Math.round((withAid / totalPts) * 100)}% of patients` : ''}
          />
        </View>

        {/* Low stock */}
        {lowStock.length > 0 && (
          <>
            <Text style={[s.section, { marginTop: 28 }]}>⚠ LOW STOCK</Text>
            <View style={s.alertCard}>
              {lowStock.map((item: any, i: number) => (
                <View key={item.id} style={[s.alertRow, i === lowStock.length - 1 && { borderBottomWidth: 0 }]}>
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
  section:   { fontSize: 11, letterSpacing: 0.8, color: C.muted, fontWeight: '500', marginBottom: 12 },
  row:       { flexDirection: 'row', gap: 10, marginBottom: 10 },
  card:      { backgroundColor: C.paper, borderRadius: 16, padding: 20, borderWidth: 1, borderColor: C.rule },
  muted:     { fontSize: 14, color: C.muted, marginBottom: 16 },
  err:       { color: C.danger, fontSize: 14, textAlign: 'center', padding: 20 },
  alertCard: { backgroundColor: C.paper, borderRadius: 16, borderWidth: 1, borderColor: C.rule, overflow: 'hidden' },
  alertRow:  { flexDirection: 'row', justifyContent: 'space-between', padding: 14, borderBottomWidth: 1, borderBottomColor: C.rule },
  alertName: { fontSize: 14, color: C.ink },
  alertQty:  { fontSize: 13, color: C.danger, fontWeight: '500' },
});
