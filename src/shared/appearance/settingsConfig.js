/**
 * The standalone chat's own appearance settings (the drawer opened from the gear): the keys, defaults and validation of
 * what is read back from localStorage. The keys and the values of the options are 7hub's own (settings-config.ts / types.ts
 * of 7hub-revolution): `mode`, `primaryColor`, `navColor`, `navAnimated`, `navStyle`, `fontSize`. A host message may carry
 * the same keys (validate.js#sanitizeAppearance), so a setting means the same thing in both places. `navStyle` is only for
 * the standalone sidebar (features/navigation): embedded there is no sidebar, so a host does not send it.
 *
 * `resolveSettings` turns a settings object into what apply.js draws: the host's `appearance` shape (mode, primary,
 * accent, fontSize), the same one a host message ends up as.
 */
import { DEFAULT_NAV_COLOR, navAccent, resolveNavColor } from './navGradients';
import { DEFAULT_PRIMARY_COLOR, primaryOf, resolvePrimaryColor } from './palettes';
import { HOST_BASE_FONT_SIZE } from './validate';

/** The range of the drawer's "Font" slider (7hub: 12-20 px; the base of the app is 13). */
export const FONT_SIZE_SLIDER_RANGE = [12, 20];

export const SETTING_MODES = ['light', 'dark', 'system'];

/** 7hub's "Stile menu": the sidebar flush with the window edges ('classic') or detached, rounded and with a shadow ('floating'). */
export const SETTING_NAV_STYLES = ['classic', 'floating'];

/**
 * 7hub's defaults (primary colour 'default', no menu theme, animated glow on, classic menu, base font size). The mode is
 * "Sistema": the standalone chat follows the operating system until told otherwise.
 */
export const DEFAULT_SETTINGS = {
  mode: 'system',
  primaryColor: DEFAULT_PRIMARY_COLOR,
  navColor: DEFAULT_NAV_COLOR,
  navAnimated: true,
  navStyle: 'classic',
  fontSize: HOST_BASE_FONT_SIZE
};

const clampFontSize = value => {
  const [min, max] = FONT_SIZE_SLIDER_RANGE;
  return Math.round(Math.min(max, Math.max(min, value)));
};

/**
 * Makes anything valid (what localStorage returned, a patch from the drawer): missing or unknown values become the default,
 * ids of the first version of this menu (`accent`) become the preset with the same colour, numbers are put in range.
 * Never throws and does not touch its argument.
 */
export function sanitizeSettings(raw) {
  const source = raw && typeof raw === 'object' ? raw : {};
  const { fontSize } = source;
  return {
    mode: SETTING_MODES.includes(source.mode) ? source.mode : DEFAULT_SETTINGS.mode,
    // `accent` is the key the first version stored
    primaryColor: resolvePrimaryColor(source.primaryColor ?? source.accent),
    navColor: resolveNavColor(source.navColor),
    navAnimated: typeof source.navAnimated === 'boolean' ? source.navAnimated : DEFAULT_SETTINGS.navAnimated,
    navStyle: SETTING_NAV_STYLES.includes(source.navStyle) ? source.navStyle : DEFAULT_SETTINGS.navStyle,
    fontSize:
      typeof fontSize === 'number' && Number.isFinite(fontSize)
        ? clampFontSize(fontSize)
        : DEFAULT_SETTINGS.fontSize
  };
}

export const settingsAreDefault = settings =>
  Object.keys(DEFAULT_SETTINGS).every(key => settings[key] === DEFAULT_SETTINGS[key]);

/** What to draw for these (valid) settings: `{ mode: 'light'|'dark', primary, accent, navStyle, fontSize }`. */
export function resolveSettings(settings, systemDark) {
  return {
    mode: settings.mode === 'system' ? (systemDark ? 'dark' : 'light') : settings.mode,
    primary: primaryOf(settings.primaryColor),
    accent: navAccent(settings.navColor, settings.navAnimated),
    navStyle: settings.navStyle,
    // the base size is the default: nothing to scale
    fontSize: settings.fontSize === HOST_BASE_FONT_SIZE ? null : settings.fontSize
  };
}
