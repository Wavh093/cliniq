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

// ── SA quadrant layout ───────────────────────────────────────────────────────
// Each row reads from midline (tooth 1 = central incisor) outward (tooth 8 = wisdom).
// UR = Q1 FDI 11–18 | UL = Q2 FDI 21–28 | LL = Q3 FDI 31–38 | LR = Q4 FDI 41–48
const ROWS = [
  { key: 'UR', fdis: [11, 12, 13, 14, 15, 16, 17, 18] },
  { key: 'UL', fdis: [21, 22, 23, 24, 25, 26, 27, 28] },
  { key: 'LL', fdis: [31, 32, 33, 34, 35, 36, 37, 38] },
  { key: 'LR', fdis: [41, 42, 43, 44, 45, 46, 47, 48] },
] as const;

// ── Component ────────────────────────────────────────────────────────────────
interface Props {
  teeth: Partial<Record<number, { status: ToothStatus; hasNotes: boolean }>>;
  onToothPress?: (fdi: number) => void;
}

export default function DentalChart({ teeth, onToothPress }: Props) {
  return (
    <View style={s.chart}>
      {ROWS.map((row, i) => (
        <React.Fragment key={row.key}>
          {/* Oral midline separator between upper and lower arches */}
          {i === 2 && (
            <View style={s.midline}>
              <View style={s.midlineRule} />
              <Text style={s.midlineText}>oral midline</Text>
              <View style={s.midlineRule} />
            </View>
          )}

          <View style={s.row}>
            {/* Quadrant label */}
            <Text style={s.quadLabel}>{row.key}</Text>

            {/* Tooth cells — flex:1 on each cell means width is always correct
                regardless of screen size or parent padding */}
            <View style={s.teeth}>
              {row.fdis.map(fdi => {
                const data   = teeth[fdi];
                const status = data?.status ?? 'healthy';
                const col    = TOOTH_COLORS[status];
                return (
                  <TouchableOpacity
                    key={fdi}
                    style={[s.tooth, { backgroundColor: col.fill, borderColor: col.stroke }]}
                    onPress={() => onToothPress?.(fdi)}
                    activeOpacity={0.65}
                    accessibilityLabel={`Tooth ${fdi}: ${STATUS_LABELS[status]}`}
                    accessibilityRole="button"
                  >
                    {data?.hasNotes && <View style={s.noteDot} />}
                    <Text style={[s.fdiNum, { color: col.stroke }]}>{fdi}</Text>
                  </TouchableOpacity>
                );
              })}
            </View>
          </View>
        </React.Fragment>
      ))}
    </View>
  );
}

// ── Styles ───────────────────────────────────────────────────────────────────
const s = StyleSheet.create({
  chart: { gap: 3 },

  midline: {
    flexDirection:  'row',
    alignItems:     'center',
    gap:            6,
    marginVertical: 5,
    paddingLeft:    30,
  },
  midlineRule: {
    flex:            1,
    height:          StyleSheet.hairlineWidth,
    backgroundColor: C.rule,
  },
  midlineText: {
    fontSize:    9,
    color:       C.muted,
    fontStyle:   'italic',
    fontWeight:  '500',
    letterSpacing: 0.4,
  },

  row: { flexDirection: 'row', alignItems: 'stretch' },

  quadLabel: {
    width:       30,
    fontSize:    9,
    fontWeight:  '700',
    color:       C.muted,
    letterSpacing: 0.5,
    lineHeight:  40,   // matches tooth height → vertically centres single-line text
    textAlign:   'center',
  },

  teeth: { flex: 1, flexDirection: 'row', gap: 2 },

  tooth: {
    flex:          1,
    height:        40,
    borderRadius:  4,
    borderWidth:   1,
    alignItems:    'center',
    justifyContent: 'center',
  },

  noteDot: {
    position:        'absolute',
    top:             3,
    right:           3,
    width:           5,
    height:          5,
    borderRadius:    3,
    backgroundColor: C.sage,
  },

  fdiNum: {
    fontSize:    8,
    fontWeight:  '700',
    letterSpacing: -0.5,
  },
});
