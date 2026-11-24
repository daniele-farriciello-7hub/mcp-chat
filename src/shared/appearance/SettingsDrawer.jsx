/**
 * The settings drawer of the standalone chat: a panel on the right with the same sections, labels and options as 7hub's
 * (7hub-revolution: scripts/components/settings/drawer/settings-drawer.tsx) so the two products feel the same: Modalità,
 * Stile menu, Temi coordinati, Colore principale and Font, a reset for each card and "Ripristina tutto" in the header. 7hub's
 * "Colore menu" (plain colours) is left out: the sidebar takes the coordinated themes only. Every choice is applied live and
 * kept in localStorage (appearanceStore.js), with 7hub's own option ids (settingsConfig.js).
 *
 * Accessible as a modal dialog: the focus moves in when it opens and cannot leave it (Tab wraps), Escape and a click outside
 * close it, and the focus goes back to the gear that opened it. There is no dark veil, as in 7hub: the page stays visible so
 * the effect of each choice can be seen.
 */
'use client';

import { useEffect, useId, useRef } from 'react';
import { RotateCcw, X } from 'lucide-react';
import Tooltip from '@/shared/ui/Tooltip';
import { resetAppearancePrefs, setAppearancePrefs, useAppearanceState } from './appearanceStore';
import { drawerIcons } from './drawerIcons';
import {
  FontSizeSlider,
  GradientOptions,
  LargeBlock,
  OptionButton,
  RadioGroup,
  SmallBlock,
  SwatchOptions,
  SwitchOption,
  isTabStop
} from './drawerBlocks';
import { NAV_GRADIENTS, NAV_GRADIENT_KEYS, isNavGradient } from './navGradients';
import {
  PREFERENCE_MODES,
  PRIMARY_COLOR_KEYS,
  PRIMARY_COLOR_LABELS,
  PRIMARY_COLOR_PRESETS
} from './palettes';
import {
  DEFAULT_SETTINGS,
  FONT_SIZE_SLIDER_RANGE,
  SETTING_NAV_STYLES,
  settingsAreDefault
} from './settingsConfig';
import { gradientCss } from './validate';

const MODE_ICONS = { light: drawerIcons.sun, dark: drawerIcons.moon, system: drawerIcons.system };

const NAV_STYLE_OPTIONS = SETTING_NAV_STYLES.map(id => ({
  id,
  label: id === 'floating' ? 'Flottante' : 'Classico',
  icon: id === 'floating' ? drawerIcons.navStyleFloating : drawerIcons.navStyleClassic
}));

const FOCUSABLE = 'button:not([disabled]), input:not([disabled]), [href], [tabindex]:not([tabindex="-1"])';

// the themes as tall bars (the colour comes in towards the bottom, like the menu they colour in 7hub)
const GRADIENT_OPTIONS = NAV_GRADIENT_KEYS.map(key => ({
  value: key,
  label: NAV_GRADIENTS[key].label,
  gradient: gradientCss(NAV_GRADIENTS[key].stops, 180)
}));

const PRIMARY_OPTIONS = PRIMARY_COLOR_KEYS.map(key => ({
  value: key,
  label: PRIMARY_COLOR_LABELS[key],
  color: PRIMARY_COLOR_PRESETS[key].main,
  checkColor: PRIMARY_COLOR_PRESETS[key].contrastText
}));

/**
 * `onClose(viaKeyboard)`: the keyboard (Escape, Enter on "Chiudi") gets the focus back on the gear; a click does not, so the
 * gear's tooltip is not left stuck open under a pointer that has already moved away.
 */
export default function SettingsDrawer({ open, onClose }) {
  const { prefs } = useAppearanceState();
  const panelRef = useRef(null);
  const titleId = useId();
  // the effect below must not restart (and pull the focus back to the panel) when the parent passes a new function
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  const hasTheme = isNavGradient(prefs.navColor);
  const [minSize, maxSize] = FONT_SIZE_SLIDER_RANGE;

  // focus in on open; Tab wraps inside; Escape closes; focus that strays outside is pulled back
  useEffect(() => {
    if (!open) return undefined;
    const panel = panelRef.current;
    panel?.focus({ preventScroll: true });

    const onKeyDown = event => {
      if (event.key === 'Escape') {
        event.preventDefault();
        onCloseRef.current(true);
        return;
      }
      if (event.key !== 'Tab' || !panel) return;
      const items = [...panel.querySelectorAll(FOCUSABLE)].filter(item => item.tabIndex >= 0);
      if (!items.length) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey && (document.activeElement === first || document.activeElement === panel)) {
        event.preventDefault();
        last.focus();
      } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    const onFocusIn = event => {
      if (panel && !panel.contains(event.target)) panel.focus({ preventScroll: true });
    };
    document.addEventListener('keydown', onKeyDown);
    document.addEventListener('focusin', onFocusIn);
    return () => {
      document.removeEventListener('keydown', onKeyDown);
      document.removeEventListener('focusin', onFocusIn);
    };
  }, [open]);

  const closeFromButton = event => onClose(event.detail === 0);

  return (
    <>
      {/* a click outside closes it (the invisible backdrop of 7hub's drawer); only while open, so it never blocks the page */}
      {open && <div className="fixed inset-0 z-[79]" onClick={() => onClose(false)} aria-hidden />}
      <aside
        ref={panelRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        tabIndex={-1}
        inert={!open}
        data-open={open || undefined}
        className="settings-drawer fixed inset-y-0 right-0 z-[80] flex w-[min(360px,100vw)] flex-col border-l border-line/60 bg-surface/90 outline-none backdrop-blur-xl"
      >
        <div className="flex items-center py-4 pl-5 pr-2">
          <h2 id={titleId} className="grow text-[18px] font-semibold leading-tight text-ink">
            Impostazioni
          </h2>
          <Tooltip label="Ripristina tutto">
            <button
              type="button"
              onClick={resetAppearancePrefs}
              aria-label="Ripristina tutte le impostazioni"
              className="hdr-btn hdr-btn-lift"
            >
              {/* the dot: 7hub's Badge (8px, error.main), centred on the corner of the icon, when something differs from the defaults */}
              <span className="relative inline-flex">
                <RotateCcw size={20} aria-hidden />
                {!settingsAreDefault(prefs) && (
                  <span
                    aria-hidden
                    className="absolute right-0 top-0 h-2 w-2 -translate-y-1/2 translate-x-1/2 rounded-full bg-[#ff5630]"
                  />
                )}
              </span>
            </button>
          </Tooltip>
          <Tooltip label="Chiudi" align="right">
            <button
              type="button"
              onClick={closeFromButton}
              aria-label="Chiudi le impostazioni"
              className="hdr-btn hdr-btn-lift"
            >
              <X size={20} aria-hidden />
            </button>
          </Tooltip>
        </div>

        <div className="flex flex-1 flex-col gap-12 overflow-y-auto overscroll-contain px-5 pb-10 pt-4">
          <LargeBlock
            title="Modalità"
            tooltip="Tema chiaro o scuro per tutta l'app. Sistema segue quello del dispositivo."
            canReset={prefs.mode !== DEFAULT_SETTINGS.mode}
            onReset={() => setAppearancePrefs({ mode: DEFAULT_SETTINGS.mode })}
          >
            <RadioGroup label="Modalità" className="grid grid-cols-3 gap-3">
              {PREFERENCE_MODES.map((mode, index) => {
                const selected = prefs.mode === mode.id;
                return (
                  <OptionButton
                    key={mode.id}
                    role="radio"
                    aria-checked={selected}
                    selected={selected}
                    tabbable={isTabStop(selected, true, index)}
                    onClick={() => setAppearancePrefs({ mode: mode.id })}
                    className="flex flex-col items-center justify-center gap-2 py-4"
                  >
                    {MODE_ICONS[mode.id]}
                    {mode.name}
                  </OptionButton>
                );
              })}
            </RadioGroup>
          </LargeBlock>

          <LargeBlock
            title="Stile menu"
            tooltip="Classico: il menu laterale occupa tutta l'altezza, a filo dei bordi. Flottante: staccato dai bordi, con angoli arrotondati e ombra."
            canReset={prefs.navStyle !== DEFAULT_SETTINGS.navStyle}
            onReset={() => setAppearancePrefs({ navStyle: DEFAULT_SETTINGS.navStyle })}
          >
            <RadioGroup label="Stile menu" className="grid grid-cols-2 gap-3">
              {NAV_STYLE_OPTIONS.map((style, index) => {
                const selected = prefs.navStyle === style.id;
                return (
                  <OptionButton
                    key={style.id}
                    role="radio"
                    aria-checked={selected}
                    selected={selected}
                    tabbable={isTabStop(selected, true, index)}
                    onClick={() => setAppearancePrefs({ navStyle: style.id })}
                    className="flex flex-col items-center justify-center gap-2 py-3"
                  >
                    {style.icon}
                    {style.label}
                  </OptionButton>
                );
              })}
            </RadioGroup>
          </LargeBlock>

          <LargeBlock
            title="Temi coordinati"
            caption="Menu laterale e striscia in cima"
            tooltip="Una sfumatura che colora il menu laterale e la striscia in cima all'assistente, come in 7hub cambia insieme menu e intestazioni delle tabelle."
            canReset={hasTheme || prefs.navAnimated !== DEFAULT_SETTINGS.navAnimated}
            onReset={() =>
              setAppearancePrefs({
                navColor: DEFAULT_SETTINGS.navColor,
                navAnimated: DEFAULT_SETTINGS.navAnimated
              })
            }
            className="gap-4"
          >
            <GradientOptions
              label="Temi coordinati"
              value={prefs.navColor}
              options={GRADIENT_OPTIONS}
              onChange={navColor => setAppearancePrefs({ navColor })}
            />
            {hasTheme && (
              <SwitchOption
                label="Sfondo animato"
                tooltip="Un leggero bagliore che si muove sul menu laterale e sulla striscia. Resta fermo se nel sistema è attivo «riduci movimento»."
                selected={prefs.navAnimated}
                icon={drawerIcons.siderbarDuotone}
                onChange={() => setAppearancePrefs({ navAnimated: !prefs.navAnimated })}
              />
            )}
          </LargeBlock>

          <LargeBlock
            title="Colore principale"
            tooltip="Pulsanti, link, messaggi e anelli di focus."
            canReset={prefs.primaryColor !== DEFAULT_SETTINGS.primaryColor}
            onReset={() => setAppearancePrefs({ primaryColor: DEFAULT_SETTINGS.primaryColor })}
          >
            <SwatchOptions
              label="Colore principale"
              value={prefs.primaryColor}
              options={PRIMARY_OPTIONS}
              onChange={primaryColor => setAppearancePrefs({ primaryColor })}
            />
          </LargeBlock>

          <LargeBlock title="Font" className="gap-5">
            <SmallBlock
              label="Dimensione"
              canReset={prefs.fontSize !== DEFAULT_SETTINGS.fontSize}
              onReset={() => setAppearancePrefs({ fontSize: DEFAULT_SETTINGS.fontSize })}
              className="gap-5"
            >
              <FontSizeSlider
                value={prefs.fontSize}
                min={minSize}
                max={maxSize}
                onChange={fontSize => setAppearancePrefs({ fontSize })}
              />
            </SmallBlock>
          </LargeBlock>
        </div>
      </aside>
    </>
  );
}
