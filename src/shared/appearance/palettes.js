/**
 * "Colore principale" of the standalone chat's settings drawer: the 12 presets of 7hub's own drawer
 * (7hub-revolution: theme/with-settings/color-presets.ts), with the same ids, labels and colours, so the chat looks the
 * same wherever it runs and a stored value or a host message means the same thing in both. The ids are 7hub's: 'default'
 * (Blu 7hub), then 'preset1' … 'preset11'. Only the four shades the chat reads are kept (`lighter` / `darker` are not used).
 */

/** The chat's own product blue: what it uses embedded until the host has spoken, and what globals.css starts from. */
export const LEGACY_PRIMARY = {
  main: '#3e97ff',
  light: '#7ec0ff',
  dark: '#2b6ab2',
  contrastText: '#ffffff'
};

export const DEFAULT_PRIMARY_COLOR = 'default';

/** What the drawer shows for each preset. */
export const PRIMARY_COLOR_LABELS = {
  default: 'Blu 7hub',
  preset1: 'Azzurro',
  preset2: 'Viola',
  preset3: 'Cobalto',
  preset4: 'Ambra',
  preset5: 'Rosso',
  preset6: 'Teal',
  preset7: 'Verde',
  preset8: 'Rosa',
  preset9: 'Arancio',
  preset10: 'Indaco',
  preset11: 'Ciano'
};

export const PRIMARY_COLOR_PRESETS = {
  default: { main: '#2f5bea', light: '#8da5f5', dark: '#1e3fb8', contrastText: '#ffffff' },
  preset1: { main: '#078dee', light: '#68cdf9', dark: '#0351ab', contrastText: '#ffffff' },
  preset2: { main: '#7635dc', light: '#b985f4', dark: '#431a9e', contrastText: '#ffffff' },
  preset3: { main: '#0c68e9', light: '#6bb1f8', dark: '#063ba7', contrastText: '#ffffff' },
  preset4: { main: '#fda92d', light: '#fed680', dark: '#b66816', contrastText: '#1c252e' },
  preset5: { main: '#ff3030', light: '#ffc1ac', dark: '#b71833', contrastText: '#ffffff' },
  preset6: { main: '#0d9488', light: '#5eead4', dark: '#0f766e', contrastText: '#ffffff' },
  preset7: { main: '#16a34a', light: '#86efac', dark: '#15803d', contrastText: '#ffffff' },
  preset8: { main: '#db2777', light: '#f9a8d4', dark: '#be185d', contrastText: '#ffffff' },
  preset9: { main: '#ea580c', light: '#fdba74', dark: '#c2410c', contrastText: '#ffffff' },
  preset10: { main: '#4f46e5', light: '#a5b4fc', dark: '#4338ca', contrastText: '#ffffff' },
  preset11: { main: '#0891b2', light: '#67e8f9', dark: '#0e7490', contrastText: '#ffffff' }
};

/** The ids, in the order of the drawer. */
export const PRIMARY_COLOR_KEYS = Object.keys(PRIMARY_COLOR_PRESETS);

/** True for the id of one of the presets above (7hub's ids only: what a host may send). */
export const isPrimaryColorId = id => typeof id === 'string' && Object.hasOwn(PRIMARY_COLOR_PRESETS, id);

// The ids the first version of this menu stored (`accent`), mapped to the preset with the same colour. The old
// "Predefinito" was the unchosen default, and the default is now 7hub's own 'default' (Blu 7hub): the ids coincide.
const LEGACY_PRIMARY_IDS = {
  default: 'default',
  predefinito: 'default',
  blu: 'default',
  blu7hub: 'default',
  viola: 'preset2',
  teal: 'preset6',
  rosa: 'preset8',
  verde: 'preset7',
  ambra: 'preset4',
  arancio: 'preset9'
};

/** The preset id for a stored value, whatever it is: a 7hub id, an id of the first version, or (unknown) the default. */
export function resolvePrimaryColor(value) {
  if (isPrimaryColorId(value)) return value;
  if (typeof value === 'string' && Object.hasOwn(LEGACY_PRIMARY_IDS, value)) return LEGACY_PRIMARY_IDS[value];
  return DEFAULT_PRIMARY_COLOR;
}

/** The four shades of a preset id (a known one: use `isPrimaryColorId` first for what comes from a message). */
export const primaryOf = id => PRIMARY_COLOR_PRESETS[resolvePrimaryColor(id)];

/** "Modalità": 7hub offers Chiaro and Scuro; the standalone chat adds Sistema (follows the operating system). */
export const PREFERENCE_MODES = [
  { id: 'light', name: 'Chiaro' },
  { id: 'dark', name: 'Scuro' },
  { id: 'system', name: 'Sistema' }
];
