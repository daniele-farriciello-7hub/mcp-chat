/**
 * Writes the appearance on the document root: a `data-theme` attribute (the dark palette in globals.css hangs
 * on it) and a handful of CSS variables that the accent tokens of globals.css read. Everything written here is
 * built from values already validated by validate.js (hex colours, numbers in range, two fixed words).
 */
import { HOST_BASE_FONT_SIZE, gradientCss } from './validate';
import { LEGACY_PRIMARY } from './palettes';

/** Standalone: the operator's choice. Embedded: the last mode the host sent. Both are read before hydration (earlyScript.js). */
export const PREFS_STORAGE_KEY = 'mcp-chat:appearance';
export const HOST_MODE_STORAGE_KEY = 'mcp-chat:host-mode';

const SCALE_RANGE = [0.8, 1.6];

function setVar(root, name, value) {
  if (value === null || value === undefined) root.style.removeProperty(name);
  else root.style.setProperty(name, value);
}

/**
 * @param {{ mode: 'light'|'dark', primary: object, accent?: object|null, fontSize?: number|null }} appearance
 *   already validated (a host's through sanitizeAppearance, the standalone's from palettes.js)
 */
export function applyAppearance({ mode, primary, accent = null, fontSize = null }) {
  const root = document.documentElement;
  root.setAttribute('data-theme', mode);
  root.style.colorScheme = mode;

  const legacy = primary.main === LEGACY_PRIMARY.main;
  setVar(root, '--accent', primary.main);
  setVar(root, '--accent-light', primary.light);
  setVar(root, '--accent-dark', primary.dark);
  setVar(root, '--accent-contrast', primary.contrastText);
  // the end of the gradient of the assistant's tile: the original blue→violet, or the dark shade of a chosen accent
  setVar(root, '--accent-end', legacy ? null : primary.dark);

  const scale = fontSize
    ? Math.min(SCALE_RANGE[1], Math.max(SCALE_RANGE[0], fontSize / HOST_BASE_FONT_SIZE))
    : 1;
  setVar(root, '--fs-scale', scale === 1 ? null : String(Math.round(scale * 1000) / 1000));

  if (accent) {
    // a horizontal strip (the host's table-header orientation); without stops, the flat start colour
    setVar(root, '--accent-strip', accent.stops ? gradientCss(accent.stops, 90) : accent.start);
    setVar(root, '--accent-glow', accent.glow ?? accent.start);
    root.setAttribute('data-accent-strip', '');
    if (accent.animated && accent.stops) root.setAttribute('data-accent-animated', '');
    else root.removeAttribute('data-accent-animated');
  } else {
    setVar(root, '--accent-strip', null);
    setVar(root, '--accent-glow', null);
    root.removeAttribute('data-accent-strip');
    root.removeAttribute('data-accent-animated');
  }
}
