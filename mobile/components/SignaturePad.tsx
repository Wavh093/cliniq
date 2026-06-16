import React, { useRef, useState } from 'react';
import { View, StyleSheet, TouchableOpacity, Text } from 'react-native';
import Svg, { Path } from 'react-native-svg';
import { C } from '../constants/theme';

interface Point { x: number; y: number; }

interface Props {
  width: number;
  height?: number;
  onChange: (svg: string | null) => void;
}

function pts2d(pts: Point[]): string {
  return pts.map((p, i) => `${i === 0 ? 'M' : 'L'}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(' ');
}

export default function SignaturePad({ width, height = 160, onChange }: Props) {
  const activeRef = useRef<Point[]>([]);
  const [strokes, setStrokes] = useState<Point[][]>([]);
  const [, forceUpdate] = useState(0);
  const onChangeRef = useRef(onChange);
  onChangeRef.current = onChange;

  function emit(all: Point[][]) {
    const valid = all.filter(s => s.length >= 2);
    if (!valid.length) { onChangeRef.current(null); return; }
    const paths = valid.map(s =>
      `<path d="${pts2d(s)}" stroke="#0a4a5c" stroke-width="2.5" fill="none" stroke-linecap="round" stroke-linejoin="round"/>`
    ).join('');
    onChangeRef.current(`<svg xmlns="http://www.w3.org/2000/svg" width="${width}" height="${height}" viewBox="0 0 ${width} ${height}">${paths}</svg>`);
  }

  const clear = () => {
    activeRef.current = [];
    setStrokes([]);
    onChangeRef.current(null);
    forceUpdate(n => n + 1);
  };

  const all = [...strokes, ...(activeRef.current.length > 0 ? [activeRef.current] : [])];
  const isEmpty = all.every(s => s.length < 2);

  return (
    <View>
      <View
        style={[s.pad, { width, height }]}
        onStartShouldSetResponder={() => true}
        onMoveShouldSetResponder={() => true}
        onResponderGrant={e => {
          activeRef.current = [{ x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
          forceUpdate(n => n + 1);
        }}
        onResponderMove={e => {
          activeRef.current = [...activeRef.current, { x: e.nativeEvent.locationX, y: e.nativeEvent.locationY }];
          forceUpdate(n => n + 1);
        }}
        onResponderRelease={() => {
          const done = [...activeRef.current];
          activeRef.current = [];
          setStrokes(prev => {
            const next = [...prev, done];
            emit(next);
            return next;
          });
        }}
        onResponderTerminate={() => { activeRef.current = []; forceUpdate(n => n + 1); }}
      >
        {/* SVG in a non-interactive wrapper so touches pass to parent View */}
        <View style={StyleSheet.absoluteFill} pointerEvents="none">
          <Svg width={width} height={height}>
            {all.map((pts, i) =>
              pts.length >= 2 ? (
                <Path
                  key={i}
                  d={pts2d(pts)}
                  stroke={C.sage}
                  strokeWidth={2.5}
                  fill="none"
                  strokeLinecap="round"
                  strokeLinejoin="round"
                />
              ) : null
            )}
          </Svg>
        </View>
        {isEmpty && (
          <View style={s.hint} pointerEvents="none">
            <Text style={s.hintText}>Draw your signature here</Text>
          </View>
        )}
      </View>
      {!isEmpty && (
        <TouchableOpacity onPress={clear} style={s.clearBtn}>
          <Text style={s.clearText}>Clear</Text>
        </TouchableOpacity>
      )}
    </View>
  );
}

const s = StyleSheet.create({
  pad: {
    backgroundColor: '#f8fafc',
    borderWidth: 1.5,
    borderColor: 'rgba(10,74,92,0.25)',
    borderRadius: 12,
    overflow: 'hidden',
  },
  hint: { ...StyleSheet.absoluteFillObject, alignItems: 'center', justifyContent: 'center' },
  hintText: { fontSize: 14, color: '#94a3b8', fontStyle: 'italic' },
  clearBtn: { alignSelf: 'flex-end', marginTop: 6 },
  clearText: { fontSize: 12, color: C.muted },
});
