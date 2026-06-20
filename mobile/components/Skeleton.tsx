import React, { useEffect, useRef, useState } from 'react';
import { Animated, View, StyleSheet, AccessibilityInfo, ViewStyle } from 'react-native';
import { C } from '../constants/theme';

interface BoxProps {
  width?: number | string;
  height?: number;
  radius?: number;
  style?: ViewStyle;
}

/** A single shimmering placeholder block. Respects Reduce Motion. */
export function SkeletonBox({ width = '100%', height = 14, radius = 8, style }: BoxProps) {
  const opacity = useRef(new Animated.Value(0.5)).current;
  const [reduceMotion, setReduceMotion] = useState(false);

  useEffect(() => {
    let mounted = true;
    AccessibilityInfo.isReduceMotionEnabled().then(v => mounted && setReduceMotion(v));
    if (reduceMotion) return;
    const loop = Animated.loop(
      Animated.sequence([
        Animated.timing(opacity, { toValue: 1, duration: 650, useNativeDriver: true }),
        Animated.timing(opacity, { toValue: 0.5, duration: 650, useNativeDriver: true }),
      ]),
    );
    loop.start();
    return () => { mounted = false; loop.stop(); };
  }, [opacity, reduceMotion]);

  return (
    <Animated.View
      style={[
        { width: width as any, height, borderRadius: radius, backgroundColor: C.rule, opacity },
        style,
      ]}
    />
  );
}

/** A card-shaped skeleton matching the app's list rows. */
export function SkeletonCard() {
  return (
    <View style={s.card}>
      <SkeletonBox width={44} height={44} radius={22} />
      <View style={s.cardBody}>
        <SkeletonBox width="55%" height={14} />
        <SkeletonBox width="35%" height={11} style={{ marginTop: 8 }} />
      </View>
    </View>
  );
}

/** A stack of skeleton cards for list loading states. */
export function SkeletonList({ count = 5 }: { count?: number }) {
  return (
    <View style={s.list}>
      {Array.from({ length: count }).map((_, i) => <SkeletonCard key={i} />)}
    </View>
  );
}

const s = StyleSheet.create({
  list: { padding: 16, gap: 10 },
  card: {
    flexDirection: 'row', alignItems: 'center', gap: 12,
    backgroundColor: C.paper, borderRadius: 14, padding: 14,
    borderWidth: 1, borderColor: C.rule,
  },
  cardBody: { flex: 1 },
});
