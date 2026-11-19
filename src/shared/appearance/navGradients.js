/**
 * The "Temi coordinati" of 7hub's settings drawer (7hub-revolution: scripts/components/settings/nav-gradients.ts),
 * with the same ids, labels, colours and stops. In 7hub each one paints the menu and the table headers; here it paints
 * the accent strip across the top of the chat. Every theme starts from a dark tint and lets a colour in towards one side.
 *
 * 7hub writes the stops as `color-mix(in oklab, …)` strings. Here every stop is resolved to a hex colour with the same
 * OKLab maths the browser uses (and that 7hub's own assistant-appearance.ts uses to send them to the chat), so a theme is
 * plain validated data: `validate.js#gradientCss` is the only place a CSS gradient is built, for the swatches and the strip.
 *
 * `navColor` ids stored by the chat and sent by the host are these keys, plus 'default' (no theme: no strip).
 */

// Colours of 7hub's logo (assets/images/7hub_logo.svg)
export const logoColors = {
  violet: '#504b69',
  violetDark: '#2c2a3c',
  // violet lightened, to close the gradient of the plain violet theme
  violetLight: '#8c87a6',
  magenta: '#f83693',
  yellow: '#ffb400',
  cyan: '#00badb'
};

// ── OKLab mix (what `color-mix(in oklab, a, b N%)` computes) ──────────────────────────────────────────────

const toLinear = c => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4);
const fromLinear = c => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055);
const clamp01 = v => Math.min(1, Math.max(0, v));

function hexToOklab(hex) {
  const [r, g, b] = [1, 3, 5].map(i => toLinear(parseInt(hex.slice(i, i + 2), 16) / 255));
  const l = Math.cbrt(0.4122214708 * r + 0.5363325363 * g + 0.0514459929 * b);
  const m = Math.cbrt(0.2119034982 * r + 0.6806995451 * g + 0.1073969566 * b);
  const s = Math.cbrt(0.0883024619 * r + 0.2817188376 * g + 0.6299787005 * b);
  return [
    0.2104542553 * l + 0.793617785 * m - 0.0040720468 * s,
    1.9779984951 * l - 2.428592205 * m + 0.4505937099 * s,
    0.0259040371 * l + 0.7827717662 * m - 0.808675766 * s
  ];
}

function oklabToHex([L, a, b]) {
  const l = (L + 0.3963377774 * a + 0.2158037573 * b) ** 3;
  const m = (L - 0.1055613458 * a - 0.0638541728 * b) ** 3;
  const s = (L - 0.0894841775 * a - 1.291485548 * b) ** 3;
  const linear = [
    4.0767416621 * l - 3.3077115913 * m + 0.2309699292 * s,
    -1.2684380046 * l + 2.6097574011 * m - 0.3413193965 * s,
    -0.0041960863 * l - 0.7034186147 * m + 1.707614701 * s
  ];
  return `#${linear
    .map(c =>
      Math.round(fromLinear(clamp01(c)) * 255)
        .toString(16)
        .padStart(2, '0')
    )
    .join('')}`;
}

/** `percent` of `color` mixed into `base`, in OKLab: the hex of `color-mix(in oklab, base, color percent%)`. */
function mixOklab(base, color, percent) {
  const [from, to] = [hexToOklab(base), hexToOklab(color)];
  const t = percent / 100;
  return oklabToHex(from.map((v, i) => v + (to[i] - v) * t));
}

// ── The themes ─────────────────────────────────────────────────────────────────────────────────────────────

const stops = pairs => pairs.map(([color, at]) => ({ color, at }));

// the violet with a percentage of a colour: the logo themes stop half way instead of reaching the full colour
const mix = (color, percent) => mixOklab(logoColors.violet, color, percent);

// Dark start tints of the coordinated themes: the text stays white on all of them
const coordinatedBase = {
  rosa: '#5e2447',
  corallo: '#5a2b2a',
  smeraldo: '#0f3b33',
  oceano: '#0c2f4e',
  lavanda: '#352c63',
  ambra: '#3a2a14',
  grafite: '#22262c',
  bosco: '#1d3629'
};

/** A dark tint that takes `accent` towards one side: from the bottom (like the logo themes) or from the top. */
function coordinated(label, base, accent, end, glowAt = 'bottom') {
  const mid = mixOklab(base, accent, Math.round(end / 2));
  const last = mixOklab(base, accent, end);
  return {
    label,
    stops:
      glowAt === 'bottom'
        ? stops([
            [base, 0],
            [base, 62],
            [mid, 82],
            [last, 100]
          ])
        : stops([
            [last, 0],
            [mid, 18],
            [base, 40],
            [base, 100]
          ]),
    glow: accent,
    glowAt
  };
}

/** `{ label, stops: [{ color, at }], glow, glowAt }` per id, in the order of the drawer. */
export const NAV_GRADIENTS = {
  viola: {
    label: 'Viola',
    stops: stops([
      [logoColors.violet, 0],
      [logoColors.violet, 62],
      [mix(logoColors.violetLight, 40), 82],
      [mix(logoColors.violetLight, 80), 100]
    ]),
    glow: '#a9a4c2',
    glowAt: 'bottom'
  },
  magenta: {
    label: 'Viola e magenta',
    stops: stops([
      [logoColors.violet, 0],
      [logoColors.violet, 62],
      [mix(logoColors.magenta, 22), 82],
      [mix(logoColors.magenta, 45), 100]
    ]),
    glow: logoColors.magenta,
    glowAt: 'bottom'
  },
  ciano: {
    label: 'Viola e ciano',
    stops: stops([
      [logoColors.violet, 0],
      [logoColors.violet, 62],
      [mix(logoColors.cyan, 22), 82],
      [mix(logoColors.cyan, 45), 100]
    ]),
    glow: logoColors.cyan,
    glowAt: 'bottom'
  },
  giallo: {
    label: 'Viola e giallo',
    stops: stops([
      [logoColors.violet, 0],
      [logoColors.violet, 66],
      [mix(logoColors.yellow, 18), 84],
      [mix(logoColors.yellow, 38), 100]
    ]),
    glow: mix(logoColors.yellow, 80),
    glowAt: 'bottom'
  },
  aurora: {
    label: 'Magenta e viola',
    stops: stops([
      [mix(logoColors.magenta, 45), 0],
      [mix(logoColors.magenta, 22), 18],
      [logoColors.violet, 40],
      [logoColors.violet, 100]
    ]),
    glow: logoColors.magenta,
    glowAt: 'top'
  },
  notte: {
    label: 'Notte',
    stops: stops([
      [logoColors.violetDark, 0],
      [logoColors.violetDark, 30],
      [logoColors.violet, 100]
    ]),
    glow: '#a9a4c2',
    glowAt: 'bottom'
  },
  rosa: coordinated('Rosa', coordinatedBase.rosa, '#f0529c', 60, 'top'),
  corallo: coordinated('Corallo', coordinatedBase.corallo, '#ff7a59', 55),
  smeraldo: coordinated('Verde smeraldo', coordinatedBase.smeraldo, '#1fcb8e', 55),
  oceano: coordinated('Oceano', coordinatedBase.oceano, '#14c2d6', 54),
  lavanda: coordinated('Lavanda', coordinatedBase.lavanda, '#a58bff', 58),
  ambra: coordinated('Ambra', coordinatedBase.ambra, '#f0a81c', 52),
  grafite: coordinated('Grafite e acciaio', coordinatedBase.grafite, '#6f8aa8', 75),
  bosco: coordinated('Bosco e salvia', coordinatedBase.bosco, '#8fc49a', 52)
};

export const NAV_GRADIENT_KEYS = Object.keys(NAV_GRADIENTS);
export const DEFAULT_NAV_COLOR = 'default';

/** True for the id of one of the themes above (not for 'default', not for anything unknown). */
export const isNavGradient = id => typeof id === 'string' && Object.hasOwn(NAV_GRADIENTS, id);

/** A known id, or 'default' (no theme). */
export const resolveNavColor = id => (isNavGradient(id) ? id : DEFAULT_NAV_COLOR);

/**
 * The accent the chat draws (a shape `validate.js#sanitizeAccent` also produces) for a theme id: the strip's start
 * colour, stops and glow. `animated` is the "Sfondo animato" switch. null for 'default' and for unknown ids.
 */
export function navAccent(id, animated) {
  if (!isNavGradient(id)) return null;
  const { stops: themeStops, glow, glowAt } = NAV_GRADIENTS[id];
  return {
    start: themeStops[0].color,
    stops: themeStops,
    glow,
    glowAt,
    animated: animated === true
  };
}
