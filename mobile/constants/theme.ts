export const C = {
  bg:      '#f7f0e6',   // Facing Forward warm cream
  bg2:     '#e8f4f7',   // surface accent (original kept)
  paper:   '#FFFFFF',
  ink:     '#0d2d3e',   // Facing Forward dark navy
  inkSoft: '#2c5f70',
  muted:   '#4a8090',   // darkened for readability
  rule:    'rgba(10,74,92,0.12)',
  hair:    'rgba(10,74,92,0.07)',  // hairline separators inside lists
  sage:    '#0a4a5c',   // original primary kept
  sageDep: '#072e3a',
  sageSoft:'#e1edf0',   // soft teal tint for chips / icon wells
  danger:  '#ba1a1a',   // red alerts unchanged

  // Semantic vitals palette — used for metric cards and status accents
  success:    '#0f7a52',
  successSoft:'#dcefe6',
  warn:       '#b45309',
  warnSoft:   '#f6e8cf',
} as const;

// ── Status badges (appointments) ───────────────────────────────────
export const STATUS: Record<string, { bg: string; text: string }> = {
  pending:   { bg: '#FEF3C7', text: '#92400E' },
  confirmed: { bg: '#DBEAFE', text: '#1E40AF' },
  completed: { bg: '#D1FAE5', text: '#065F46' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  no_show:   { bg: '#F3F4F6', text: '#6B7280' },
};

// ── Type scale ─────────────────────────────────────────────────────
// A clear, iOS-grade hierarchy so headings stop competing with subtitles.
export const T = {
  largeTitle: { fontSize: 32, fontWeight: '700' as const, letterSpacing: -0.5 },
  title:      { fontSize: 26, fontWeight: '700' as const, letterSpacing: -0.3 },
  title2:     { fontSize: 22, fontWeight: '700' as const, letterSpacing: -0.2 },
  headline:   { fontSize: 17, fontWeight: '600' as const },
  body:       { fontSize: 15, fontWeight: '400' as const },
  callout:    { fontSize: 14, fontWeight: '400' as const },
  subhead:    { fontSize: 13, fontWeight: '500' as const },
  footnote:   { fontSize: 12, fontWeight: '400' as const },
  caption:    { fontSize: 11, fontWeight: '500' as const },
  // Section eyebrow — small uppercase label that opens a grouped section
  eyebrow:    { fontSize: 11, fontWeight: '700' as const, letterSpacing: 0.8 },
} as const;

// ── Metric tones (vitals-style stat cards) ─────────────────────────
export type StatTone = 'neutral' | 'positive' | 'urgent' | 'brand';
export const TONES: Record<StatTone, { value: string; chipBg: string; chipFg: string }> = {
  neutral:  { value: C.ink,     chipBg: C.sageSoft,    chipFg: C.sage },
  positive: { value: C.success, chipBg: C.successSoft, chipFg: C.success },
  urgent:   { value: C.warn,    chipBg: C.warnSoft,    chipFg: C.warn },
  brand:    { value: C.sage,    chipBg: C.sageSoft,    chipFg: C.sage },
};

// ── Avatar palette ─────────────────────────────────────────────────
// Warm, cream-compatible pairs. Picked deterministically per name so a
// patient keeps the same colour everywhere and lists become scannable.
export const AVATAR_COLORS: { bg: string; fg: string }[] = [
  { bg: '#d9ebef', fg: '#0a4a5c' }, // teal
  { bg: '#d8ece1', fg: '#15724f' }, // green
  { bg: '#f3e6cf', fg: '#8a5a12' }, // amber
  { bg: '#e7ddec', fg: '#6b3f7a' }, // plum
  { bg: '#f0dde0', fg: '#9c4452' }, // rose
  { bg: '#dde6f2', fg: '#355a86' }, // blue
  { bg: '#efe0d6', fg: '#8a5436' }, // clay
  { bg: '#dfe4e6', fg: '#44565c' }, // slate
];

export function avatarColor(seed: string): { bg: string; fg: string } {
  let h = 0;
  for (let i = 0; i < seed.length; i++) h = (h * 31 + seed.charCodeAt(i)) >>> 0;
  return AVATAR_COLORS[h % AVATAR_COLORS.length];
}
