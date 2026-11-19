/**
 * "Aspetto" menu of the standalone chat: Chiaro / Scuro / Sistema and an accent colour, kept in localStorage.
 * Embedded in 7hub it renders nothing: the host's own settings (mode, primary colour, font size) win there.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Palette } from 'lucide-react';
import SegmentedControl from '@/shared/ui/SegmentedControl';
import Tooltip from '@/shared/ui/Tooltip';
import { setAppearancePrefs, useAppearanceState } from './appearanceStore';
import { ACCENT_PALETTES, PREFERENCE_MODES } from './palettes';

const SECTION_LABEL = 'mb-1.5 text-fs-11 font-semibold uppercase tracking-[0.12em] text-slate-soft';

export default function AppearanceMenu() {
  const { prefs, embedded } = useAppearanceState();
  const [open, setOpen] = useState(false);
  const rootRef = useRef(null);

  // closes on a click outside and on Escape
  useEffect(() => {
    if (!open) return undefined;
    const onPointerDown = event => {
      if (!rootRef.current?.contains(event.target)) setOpen(false);
    };
    const onKeyDown = event => {
      if (event.key === 'Escape') setOpen(false);
    };
    document.addEventListener('pointerdown', onPointerDown);
    document.addEventListener('keydown', onKeyDown);
    return () => {
      document.removeEventListener('pointerdown', onPointerDown);
      document.removeEventListener('keydown', onKeyDown);
    };
  }, [open]);

  if (embedded) return null;

  const toggle = event => {
    setOpen(value => !value);
    // closing with a mouse click leaves the focus on the button, and the tooltip (shown on focus-within) would stay
    // stuck after the pointer leaves: drop the focus then. Keyboard activation (detail 0) keeps it.
    if (open && event.detail > 0) event.currentTarget.blur();
  };

  return (
    // not `relative`: the panel is positioned against the header (or the login corner), so it opens under the row of
    // buttons, aligned to the right edge, instead of hanging off the button into the left margin.
    // `flex` (not a plain block): the tooltip span is inline-flex, so in a block it would sit on the text baseline
    // inside a line box and end up a few px off from the sibling header buttons
    <div ref={rootRef} className="flex">
      {/* no tooltip while the panel is open: it would sit on top of the panel's first row */}
      <Tooltip label="Aspetto" align="right" disabled={open}>
        <button
          type="button"
          onClick={toggle}
          aria-label="Aspetto"
          aria-haspopup="dialog"
          aria-expanded={open}
          className="rounded-lg p-2 text-slate-soft transition hover:bg-surface hover:text-ink"
        >
          <Palette size={18} />
        </button>
      </Tooltip>

      {open && (
        <div
          role="dialog"
          aria-label="Aspetto"
          className="absolute right-2 top-full z-40 mt-1 w-[264px] max-w-[calc(100vw-16px)] rounded-xl border border-line bg-panel p-3 shadow-lift"
          style={{ animation: 'var(--animate-fade-in)' }}
        >
          <div className={SECTION_LABEL}>Tema</div>
          <SegmentedControl
            ariaLabel="Tema"
            options={PREFERENCE_MODES}
            value={prefs.mode}
            onChange={mode => setAppearancePrefs({ mode })}
          />

          <div className={`${SECTION_LABEL} mt-3`}>Colore</div>
          <div role="radiogroup" aria-label="Colore" className="grid grid-cols-4 gap-1.5">
            {ACCENT_PALETTES.map(palette => {
              const selected = palette.id === prefs.accent;
              return (
                <button
                  key={palette.id}
                  type="button"
                  role="radio"
                  aria-checked={selected}
                  onClick={() => setAppearancePrefs({ accent: palette.id })}
                  className={`flex flex-col items-center gap-1 rounded-lg border px-1 py-1.5 transition ${
                    selected ? 'border-brand-500 bg-brand-50' : 'border-transparent hover:bg-surface'
                  }`}
                >
                  <span
                    className="flex h-6 w-6 items-center justify-center rounded-full"
                    style={{ background: palette.main, color: palette.contrastText }}
                  >
                    {selected && <Check size={13} strokeWidth={3} />}
                  </span>
                  <span className="text-fs-10 font-medium leading-none text-slate-soft">{palette.label}</span>
                </button>
              );
            })}
          </div>
        </div>
      )}
    </div>
  );
}
