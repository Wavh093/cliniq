import React from 'react';
import { View, Text, TouchableOpacity, StyleSheet } from 'react-native';
import { C } from '../constants/theme';
import type { ToothStatus } from '../lib/api';

// ── Colour map ────────────────────────────────────────────────────────────────
export const TOOTH_COLORS: Record<ToothStatus, { fill: string; stroke: string }> = {
  healthy:         { fill: '#EFF9F8', stroke: '#B5D5D8' },
  cavity:          { fill: '#FEF3C7', stroke: '#F59E0B' },
  needs_treatment: { fill: '#FEE2E2', stroke: '#EF4444' },
  filled:          { fill: '#DBEAFE', stroke: '#60A5FA' },
  crown:           { fill: '#FEF9C3', stroke: '#CA8A04' },
  extraction:      { fill: '#F1F5F9', stroke: '#94A3B8' },
  missing:         { fill: '#F8FAFC', stroke: '#E2E8F0' },
  implant:         { fill: '#D1FAE5', stroke: '#34D399' },
  bridge:          { fill: '#E0F2FE', stroke: '#38BDF8' },
};

export const STATUS_LABELS: Record<ToothStatus, string> = {
  healthy:         'Healthy',
  cavity:          'Cavity',
  needs_treatment: 'Treatment Needed',
  filled:          'Filled',
  crown:           'Crown',
  extraction:      'Extracted',
  missing:         'Missing',
  implant:         'Implant',
  bridge:          'Bridge',
};

export const ALL_STATUSES: ToothStatus[] = [
  'healthy', 'cavity', 'needs_treatment', 'filled',
  'crown', 'implant', 'missing', 'extraction', 'bridge',
];

// ── SA quadrant / position → FDI mapping ─────────────────────────────────────
// Quadrants (patient-view from front):
//   a = upper right (viewer's left)   FDI Q1: 11–18
//   b = upper left  (viewer's right)  FDI Q2: 21–28
//   c = lower left  (viewer's right)  FDI Q3: 31–38
//   d = lower right (viewer's left)   FDI Q4: 41–48
// Position 1 = outermost molar · position 8 = central incisor (midline)
export const QUAD_TO_FDI: Record<string, number> = {
  a1:18, a2:17, a3:16, a4:15, a5:14, a6:13, a7:12, a8:11,
  b1:28, b2:27, b3:26, b4:25, b5:24, b6:23, b7:22, b8:21,
  c1:38, c2:37, c3:36, c4:35, c5:34, c6:33, c7:32, c8:31,
  d1:48, d2:47, d3:46, d4:45, d5:44, d6:43, d7:42, d8:41,
};

export const FDI_TO_QUAD: Record<number, string> = Object.fromEntries(
  Object.entries(QUAD_TO_FDI).map(([q, f]) => [f, q])
);

// ── Arch order (viewed from front of patient) ─────────────────────────────────
// Upper L→R: a1…a8 | b8…b1   (a1 = upper-right wisdom, b1 = upper-left wisdom)
// Lower L→R: d1…d8 | c8…c1   (d1 = lower-right wisdom, c1 = lower-left wisdom)
type ToothRef = { quad: string; pos: number };

const UPPER_ARCH: ToothRef[] = [
  {quad:'a',pos:1},{quad:'a',pos:2},{quad:'a',pos:3},{quad:'a',pos:4},
  {quad:'a',pos:5},{quad:'a',pos:6},{quad:'a',pos:7},{quad:'a',pos:8},
  {quad:'b',pos:8},{quad:'b',pos:7},{quad:'b',pos:6},{quad:'b',pos:5},
  {quad:'b',pos:4},{quad:'b',pos:3},{quad:'b',pos:2},{quad:'b',pos:1},
];

const LOWER_ARCH: ToothRef[] = [
  {quad:'d',pos:1},{quad:'d',pos:2},{quad:'d',pos:3},{quad:'d',pos:4},
  {quad:'d',pos:5},{quad:'d',pos:6},{quad:'d',pos:7},{quad:'d',pos:8},
  {quad:'c',pos:8},{quad:'c',pos:7},{quad:'c',pos:6},{quad:'c',pos:5},
  {quad:'c',pos:4},{quad:'c',pos:3},{quad:'c',pos:2},{quad:'c',pos:1},
];

// ── Parabolic arch curve ──────────────────────────────────────────────────────
const N     = 16;  // teeth per arch
const PAD_T = 4;   // minimum top padding inside arch row (px)
const DEPTH = 46;  // vertical amplitude of the curve (px)
export const T_H  = 26;  // tooth height (px)

function archMarginTop(i: number, inverted: boolean): number {
  const dist = Math.abs(i - (N - 1) / 2) / ((N - 1) / 2); // 0 = centre, 1 = edge
  return inverted
    ? PAD_T + DEPTH * (dist * dist)       // lower arch: edges sink down
    : PAD_T + DEPTH * (1 - dist * dist);  // upper arch: centre sinks down
}

// ── Arch row sub-component ────────────────────────────────────────────────────
interface Props {
  teeth: Partial<Record<number, { status: ToothStatus; hasNotes: boolean }>>;
  onToothPress?: (fdi: number) => void;
}

function ArchRow({ arch, inverted, teeth, onToothPress }: {
  arch: ToothRef[];
  inverted: boolean;
  teeth: Props['teeth'];
  onToothPress?: (fdi: number) => void;
}) {
  return (
    <View style={s.archRow}>
      {arch.map((t, i) => {
        const key    = `${t.quad}${t.pos}`;
        const fdi    = QUAD_TO_FDI[key];
        const data   = teeth[fdi];
        const status = data?.status ?? 'healthy';
        const col    = TOOTH_COLORS[status];
        return (
          <TouchableOpacity
            key={key}
            style={[
              s.tooth,
              {
                marginTop:       archMarginTop(i, inverted),
                backgroundColor: col.fill,
                borderColor:     col.stroke,
              },
            ]}
            onPress={() => onToothPress?.(fdi)}
            activeOpacity={0.65}
            accessibilityLabel={`${key}: ${STATUS_LABELS[status]}`}
            accessibilityRole="button"
          >
            {data?.hasNotes && <View style={s.noteDot} />}
            <Text style={[s.toothPos, { color: col.stroke }]}>{t.pos}</Text>
          </TouchableOpacity>
        );
      })}
    </View>
  );
}

// ── Main component ────────────────────────────────────────────────────────────
export default function DentalChart({ teeth, onToothPress }: Props) {
  return (
    <View style={s.chart}>
      {/* Upper arch quadrant labels */}
      <View style={s.quadRow}>
        <View style={s.quadHalf}>
          <Text style={s.quadLabel}>a</Text>
        </View>
        <View style={[s.quadHalf, s.quadHalfRight]}>
          <Text style={s.quadLabel}>b</Text>
        </View>
      </View>

      <ArchRow arch={UPPER_ARCH} inverted={false} teeth={teeth} onToothPress={onToothPress} />

      <View style={s.midline}>
        <View style={s.midlineRule} />
        <Text style={s.midlineText}>oral midline</Text>
        <View style={s.midlineRule} />
      </View>

      <ArchRow arch={LOWER_ARCH} inverted teeth={teeth} onToothPress={onToothPress} />

      {/* Lower arch quadrant labels */}
      <View style={s.quadRow}>
        <View style={s.quadHalf}>
          <Text style={s.quadLabel}>d</Text>
        </View>
        <View style={[s.quadHalf, s.quadHalfRight]}>
          <Text style={s.quadLabel}>c</Text>
        </View>
      </View>
    </View>
  );
}

// ── Styles ────────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  chart: {},

  quadRow: {
    flexDirection:     'row',
    paddingHorizontal: 2,
    marginVertical:    3,
  },
  quadHalf: {
    flex:        1,
    alignItems:  'flex-start',
  },
  quadHalfRight: {
    alignItems: 'flex-end',
  },
  quadLabel: {
    fontSize:      12,
    fontWeight:    '800',
    color:         C.inkSoft,
    letterSpacing: 0.5,
  },

  archRow: {
    flexDirection:     'row',
    alignItems:        'flex-start',
    paddingHorizontal: 2,
  },

  tooth: {
    flex:             1,
    height:           T_H,
    borderRadius:     4,
    borderWidth:      1,
    marginHorizontal: 1,
    alignItems:       'center',
    justifyContent:   'center',
  },

  noteDot: {
    position:        'absolute',
    top:             2,
    right:           2,
    width:           4,
    height:          4,
    borderRadius:    2,
    backgroundColor: C.sage,
  },

  toothPos: {
    fontSize:      7,
    fontWeight:    '700',
    letterSpacing: -0.3,
  },

  midline: {
    flexDirection:     'row',
    alignItems:        'center',
    gap:               6,
    marginVertical:    6,
    paddingHorizontal: 2,
  },
  midlineRule: {
    flex:            1,
    height:          StyleSheet.hairlineWidth,
    backgroundColor: C.rule,
  },
  midlineText: {
    fontSize:      9,
    color:         C.muted,
    fontStyle:     'italic',
    fontWeight:    '500',
    letterSpacing: 0.4,
  },
});
