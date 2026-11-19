/**
 * Validation of the appearance the host sends (7hub-revolution: its light/dark mode, primary colour,
 * coordinated menu theme and font size). The values arrive through postMessage, so nothing is trusted:
 * only known keys survive, colours must be hex, numbers must be in range. Nothing here ever builds CSS
 * from a received string; `gradientCss` rebuilds a gradient from validated hex stops and numbers.
 */

const HEX_RE = /^#(?:[0-9a-f]{3}|[0-9a-f]{6})$/i;

export const MODES = ['light', 'dark'];
export const FONT_SIZE_RANGE = [10, 24];
/** the host's base font size: the chat scales its own sizes by `fontSize / HOST_BASE_FONT_SIZE` */
export const HOST_BASE_FONT_SIZE = 13;
const MAX_STOPS = 8;

/** '#abc' / '#AABBCC' → '#aabbcc'; anything else → null. */
export function normalizeHex(value) {
  if (typeof value !== 'string') return null;
  const trimmed = value.trim();
  if (!HEX_RE.test(trimmed)) return null;
  const digits = trimmed.slice(1).toLowerCase();
  return `#${digits.length === 3 ? [...digits].map(c => c + c).join('') : digits}`;
}

const channels = hex => [1, 3, 5].map(i => parseInt(hex.slice(i, i + 2), 16));
const toHex = values =>
  `#${values
    .map(v =>
      Math.round(Math.min(255, Math.max(0, v)))
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;

/** sRGB mix of two validated hex colours: `percent` of `b` into `a`. */
export function mixHex(a, b, percent) {
  const [ca, cb] = [channels(a), channels(b)];
  return toHex(ca.map((v, i) => v + (cb[i] - v) * (percent / 100)));
}

/** True when text on this colour must be dark (perceived luminance, as the host does). */
export function isLightHex(hex) {
  const [r, g, b] = channels(hex);
  return (r * 299 + g * 587 + b * 114) / 1000 > 150;
}

/**
 * The host's primary colour: `main` is required, `light`, `dark` and `contrastText` are derived when missing
 * or invalid. Returns null without a valid `main`.
 */
export function sanitizePrimary(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const main = normalizeHex(raw.main);
  if (!main) return null;
  return {
    main,
    light: normalizeHex(raw.light) ?? mixHex(main, '#ffffff', 35),
    dark: normalizeHex(raw.dark) ?? mixHex(main, '#000000', 25),
    contrastText: normalizeHex(raw.contrastText) ?? (isLightHex(main) ? '#1c252e' : '#ffffff')
  };
}

function sanitizeStops(raw) {
  if (!Array.isArray(raw) || raw.length < 2 || raw.length > MAX_STOPS) return null;
  const stops = [];
  for (const stop of raw) {
    const color = normalizeHex(stop?.color);
    const at = Number(stop?.at);
    if (!color || !Number.isFinite(at) || at < 0 || at > 100) return null;
    stops.push({ color, at: Math.round(at * 10) / 10 });
  }
  return stops;
}

/**
 * The coordinated menu theme: a start colour and, for a gradient theme, its stops and glow. The host also sends
 * the CSS strings of its own gradients; they are ignored on purpose (they may contain colour functions, and
 * CSS is never taken from a message): the gradient is rebuilt from `stops`.
 */
export function sanitizeAccent(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const stops = sanitizeStops(raw.stops);
  const start = normalizeHex(raw.start) ?? stops?.[0].color ?? null;
  if (!start) return null;
  const glow = normalizeHex(raw.glow);
  return {
    start,
    ...(stops ? { stops } : {}),
    ...(glow ? { glow } : {}),
    ...(raw.glowAt === 'top' || raw.glowAt === 'bottom' ? { glowAt: raw.glowAt } : {}),
    animated: raw.animated === true
  };
}

export function sanitizeFontSize(raw) {
  const value = Number(raw);
  if (!Number.isFinite(value)) return null;
  const [min, max] = FONT_SIZE_RANGE;
  return Math.round(Math.min(max, Math.max(min, value)) * 10) / 10;
}

export const sanitizeMode = raw => (MODES.includes(raw) ? raw : null);

/**
 * The host's `appearance` object, reduced to what the chat understands. Every key is optional: a missing or
 * invalid one is simply left out (the chat keeps its own default for it). Returns null if nothing valid is left.
 */
export function sanitizeAppearance(raw) {
  if (!raw || typeof raw !== 'object') return null;
  const mode = sanitizeMode(raw.mode);
  const primary = sanitizePrimary(raw.primary);
  const accent = sanitizeAccent(raw.accent);
  const fontSize = sanitizeFontSize(raw.fontSize);
  const result = {
    ...(mode ? { mode } : {}),
    ...(primary ? { primary } : {}),
    ...(accent ? { accent } : {}),
    ...(fontSize !== null ? { fontSize } : {})
  };
  return Object.keys(result).length ? result : null;
}

/** `linear-gradient(<angle>deg, #hex 0%, …)` from validated stops: the only place a gradient string is made. */
export function gradientCss(stops, angle) {
  return `linear-gradient(${Number(angle)}deg, ${stops.map(s => `${s.color} ${s.at}%`).join(', ')})`;
}
