export const C = {
  bg:      '#f7f0e6',   // Facing Forward warm cream
  bg2:     '#e8f4f7',   // surface accent (original kept)
  paper:   '#FFFFFF',
  ink:     '#0d2d3e',   // Facing Forward dark navy
  inkSoft: '#2c5f70',
  muted:   '#4a8090',   // darkened for readability
  rule:    'rgba(10,74,92,0.12)',
  sage:    '#0a4a5c',   // original primary kept
  sageDep: '#072e3a',
  danger:  '#ba1a1a',   // red alerts unchanged
} as const;

export const STATUS: Record<string, { bg: string; text: string }> = {
  pending:   { bg: '#FEF3C7', text: '#92400E' },
  confirmed: { bg: '#DBEAFE', text: '#1E40AF' },
  completed: { bg: '#D1FAE5', text: '#065F46' },
  cancelled: { bg: '#FEE2E2', text: '#991B1B' },
  no_show:   { bg: '#F3F4F6', text: '#6B7280' },
};
