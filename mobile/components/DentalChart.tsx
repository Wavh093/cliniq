import React from 'react';
import { View, Text, StyleSheet, useWindowDimensions } from 'react-native';
import Svg, { G, Rect, Text as SvgText, Line } from 'react-native-svg';
import { C } from '../constants/theme';
import type { ToothStatus } from '../lib/api';

// ── Layout constants (SVG units = logical pixels) ────────────────────────────
const LABEL_H    = 12;
const BODY_H     = 28;
const ARCH_GAP   = 8;
const MIDLINE_W  = 6;
const TOOTH_GAP  = 1.5;
const CARD_PAD   = 32; // card horizontal padding consumed by parent

const UPPER_LABEL_Y   = LABEL_H;                                        // baseline
const UPPER_BODY_Y    = LABEL_H + 2;
const LOWER_BODY_Y    = UPPER_BODY_Y + BODY_H + ARCH_GAP;
const LOWER_LABEL_Y   = LOWER_BODY_Y + BODY_H + 2 + LABEL_H - 2;      // baseline
const CHART_H         = LOWER_LABEL_Y + 4;

// FDI column order — 16 slots: 0-7 = left half, 8-15 = right half
// upper: 18 17 16 15 14 13 12 11 | 21 22 23 24 25 26 27 28
// lower: 48 47 46 45 44 43 42 41 | 31 32 33 34 35 36 37 38
const UPPER_FDIS = [18, 17, 16, 15, 14, 13, 12, 11, 21, 22, 23, 24, 25, 26, 27, 28];
const LOWER_FDIS = [48, 47, 46, 45, 44, 43, 42, 41, 31, 32, 33, 34, 35, 36, 37, 38];

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

interface Props {
  teeth: Partial<Record<number, { status: ToothStatus; hasNotes: boolean }>>;
  onToothPress?: (fdi: number) => void;
}

export default function DentalChart({ teeth, onToothPress }: Props) {
  const { width: screenW } = useWindowDimensions();
  const chartW    = screenW - CARD_PAD;
  const halfW     = (chartW - MIDLINE_W) / 2;
  const cellW     = halfW / 8;
  const bodyW     = cellW - TOOTH_GAP;

  function toothX(col: number): number {
    return col < 8
      ? col * cellW
      : halfW + MIDLINE_W + (col - 8) * cellW;
  }

  function renderTooth(fdi: number, col: number, isUpper: boolean) {
    const data   = teeth[fdi];
    const status = data?.status ?? 'healthy';
    const colors = TOOTH_COLORS[status] ?? TOOTH_COLORS.healthy;
    const x      = toothX(col);
    const bodyX  = x + TOOTH_GAP / 2;
    const bodyY  = isUpper ? UPPER_BODY_Y : LOWER_BODY_Y;
    const labelY = isUpper ? UPPER_LABEL_Y : LOWER_LABEL_Y;
    // hit area covers full cell height including label
    const hitY   = isUpper ? 0 : LOWER_BODY_Y - 2;
    const hitH   = BODY_H + LABEL_H + 4;

    return (
      <G key={fdi} onPress={() => onToothPress?.(fdi)}>
        {/* Transparent hit area for easier tapping */}
        <Rect x={x} y={hitY} width={cellW} height={hitH} fill="transparent" />
        {/* Tooth body */}
        <Rect
          x={bodyX}
          y={bodyY}
          width={bodyW}
          height={BODY_H}
          rx={2.5}
          fill={colors.fill}
          stroke={colors.stroke}
          strokeWidth={1}
        />
        {/* Note indicator dot */}
        {data?.hasNotes && (
          <Rect
            x={bodyX + bodyW - 5}
            y={bodyY + 3}
            width={4}
            height={4}
            rx={2}
            fill={C.sage}
          />
        )}
        {/* FDI number label */}
        <SvgText
          x={x + cellW / 2}
          y={labelY}
          textAnchor="middle"
          fontSize={7.5}
          fill={C.muted}
          fontWeight="600"
          letterSpacing={-0.2}
        >
          {fdi}
        </SvgText>
      </G>
    );
  }

  return (
    <View>
      {/* Arch orientation labels */}
      <View style={s.orientRow}>
        <Text style={s.orientSide}>R</Text>
        <Text style={s.orientArch}>UPPER</Text>
        <Text style={s.orientSide}>L</Text>
      </View>

      <Svg width={chartW} height={CHART_H}>
        {/* Vertical midline */}
        <Line
          x1={halfW + MIDLINE_W / 2}
          y1={0}
          x2={halfW + MIDLINE_W / 2}
          y2={CHART_H}
          stroke={C.rule}
          strokeWidth={0.75}
          strokeDasharray="3,3"
        />
        {/* Horizontal arch separator */}
        <Line
          x1={0}
          y1={UPPER_BODY_Y + BODY_H + ARCH_GAP / 2}
          x2={chartW}
          y2={UPPER_BODY_Y + BODY_H + ARCH_GAP / 2}
          stroke={C.rule}
          strokeWidth={0.75}
          strokeDasharray="3,3"
        />
        {/* Upper teeth */}
        {UPPER_FDIS.map((fdi, col) => renderTooth(fdi, col, true))}
        {/* Lower teeth */}
        {LOWER_FDIS.map((fdi, col) => renderTooth(fdi, col, false))}
      </Svg>

      <View style={[s.orientRow, { marginTop: 2 }]}>
        <Text style={s.orientSide}>R</Text>
        <Text style={s.orientArch}>LOWER</Text>
        <Text style={s.orientSide}>L</Text>
      </View>
    </View>
  );
}

const s = StyleSheet.create({
  orientRow: {
    flexDirection:  'row',
    justifyContent: 'space-between',
    alignItems:     'center',
    paddingHorizontal: 2,
  },
  orientArch: {
    fontSize:    9,
    fontWeight:  '700',
    color:       C.muted,
    letterSpacing: 1.2,
  },
  orientSide: {
    fontSize:   9,
    fontWeight: '700',
    color:      C.muted,
    width:      16,
    textAlign:  'center',
  },
});
