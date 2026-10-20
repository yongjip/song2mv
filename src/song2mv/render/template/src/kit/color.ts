// Colour helpers shared by the kit. Keep these names and signatures: every asset file imports them.

/** Thin dark ink for outlines, where an asset uses them */
export const INK = "#101436";

/** "#rrggbb" darkened (k < 1) or lightened (k > 1) */
export function shade(hex: string, k: number): string {
  const m = /^#([0-9a-f]{2})([0-9a-f]{2})([0-9a-f]{2})$/i.exec(hex);
  if (!m) return hex;
  const c = [1, 2, 3].map((i) => parseInt(m[i], 16));
  const f = (v: number) => Math.round(k <= 1 ? v * k : v + (255 - v) * (k - 1)).toString(16).padStart(2, "0");
  return `#${c.map(f).join("")}`;
}

const rgb = (hex: string) => [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16));
/** Mix two "#rrggbb" colours: k = 0 gives a, 1 gives b */
export function mix(a: string, b: string, k: number): string {
  const x = rgb(a), y = rgb(b);
  return `#${x.map((v, i) => Math.round(v + (y[i] - v) * Math.max(0, Math.min(1, k))).toString(16).padStart(2, "0")).join("")}`;
}
