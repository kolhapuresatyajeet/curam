// MyCúram design tokens. Built for elderly patients:
// 18px+ text, high contrast, 48px+ touch targets, taps only (no swipes/gestures).
export const t = {
  font: {
    xs: 16,
    sm: 18,      // base body size
    md: 20,
    lg: 24,
    xl: 28,
  },
  touch: {
    minHeight: 56,   // comfortable tap target (exceeds 48px minimum)
    padding: 16,
  },
  colour: {
    ink: '#0f172a',       // near-black text on white
    paper: '#ffffff',
    brand: '#0f766e',     // Cúram teal
    brandDark: '#134e4a',
    danger: '#b91c1c',
    amber: '#92400e',
    line: '#cbd5e1',
    muted: '#334155',     // readable secondary text (not pale grey)
    surface: '#f1f5f9',
  },
  radius: 12,
};
