/**
 * Accent palettes of the standalone chat's appearance menu. They match the host's colour presets
 * (7hub-revolution: theme/with-settings/color-presets.ts) so the chat looks the same wherever it runs.
 * `default` is the chat's own product blue, what it has always used: it is also the colour when a host sends none.
 */

export const LEGACY_PRIMARY = {
  main: '#3e97ff',
  light: '#7ec0ff',
  dark: '#2b6ab2',
  contrastText: '#ffffff'
};

export const ACCENT_PALETTES = [
  { id: 'default', label: 'Predefinito', ...LEGACY_PRIMARY, legacy: true },
  {
    id: 'blu',
    label: 'Blu 7hub',
    main: '#2f5bea',
    light: '#8da5f5',
    dark: '#1e3fb8',
    contrastText: '#ffffff'
  },
  {
    id: 'viola',
    label: 'Viola',
    main: '#7635dc',
    light: '#b985f4',
    dark: '#431a9e',
    contrastText: '#ffffff'
  },
  { id: 'teal', label: 'Teal', main: '#0d9488', light: '#5eead4', dark: '#0f766e', contrastText: '#ffffff' },
  { id: 'rosa', label: 'Rosa', main: '#db2777', light: '#f9a8d4', dark: '#be185d', contrastText: '#ffffff' },
  {
    id: 'verde',
    label: 'Verde',
    main: '#16a34a',
    light: '#86efac',
    dark: '#15803d',
    contrastText: '#ffffff'
  },
  {
    id: 'ambra',
    label: 'Ambra',
    main: '#fda92d',
    light: '#fed680',
    dark: '#b66816',
    contrastText: '#1c252e'
  },
  {
    id: 'arancio',
    label: 'Arancio',
    main: '#ea580c',
    light: '#fdba74',
    dark: '#c2410c',
    contrastText: '#ffffff'
  }
];

export const DEFAULT_ACCENT_ID = 'default';

export const paletteById = id => ACCENT_PALETTES.find(p => p.id === id) ?? ACCENT_PALETTES[0];

export const PREFERENCE_MODES = [
  { id: 'light', name: 'Chiaro' },
  { id: 'dark', name: 'Scuro' },
  { id: 'system', name: 'Sistema' }
];
