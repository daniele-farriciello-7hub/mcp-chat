/**
 * Building blocks of the settings drawer, with the look of 7hub's (7hub-revolution: scripts/components/settings/drawer/
 * styles.tsx, base-option.tsx, swatch-options.tsx, nav-gradient-options.tsx, font-options.tsx): LargeBlock (a card with a
 * pill label on its border, a reset arrow and an info tooltip), SmallBlock, OptionButton (a card to pick one), SwitchOption,
 * SwatchOptions (colour circles), GradientOptions (the themes as tall swatches) and FontSizeSlider.
 *
 * The states are the same as 7hub's, written in globals.css (.opt, .opt-switch, .swatch, .gradient-preview, .font-range,
 * .reset-chip) and following the accent: hover = a soft tint of the primary colour, a neutral border and a slight lift;
 * selected = a solid primary border plus a check badge. Sizes are fixed px: the drawer does not grow with the font-size
 * slider it contains (that would move the slider under the pointer while it is dragged).
 */
'use client';

import { useId } from 'react';
import { Check, Info, RotateCcw } from 'lucide-react';
import Tooltip from '@/shared/ui/Tooltip';

/**
 * Arrow keys move through the radios of a group (and pick them, as native radios do); only the selected one (or, with
 * none selected, the first) is a tab stop. `tabbable` of each option comes from `useTabStop`.
 */
function handleRadioKeys(event) {
  const step = { ArrowRight: 1, ArrowDown: 1, ArrowLeft: -1, ArrowUp: -1 }[event.key];
  if (!step) return;
  const radios = [...event.currentTarget.querySelectorAll('[role="radio"]')];
  const index = radios.indexOf(document.activeElement);
  if (index < 0) return;
  event.preventDefault();
  const next = radios[(index + step + radios.length) % radios.length];
  next.focus();
  next.click();
}

/** Whether option `index` is the tab stop of its group: the selected one, or the first when none is selected. */
export const isTabStop = (selected, anySelected, index) => selected || (!anySelected && index === 0);

export function RadioGroup({ label, className = '', children }) {
  return (
    // the arrow keys are handled for the radios inside: the group itself is not a control
    <div role="radiogroup" aria-label={label} onKeyDown={handleRadioKeys} className={className}>
      {children}
    </div>
  );
}

/** A card with the pill label on its top border. `canReset` + `onReset` show the reset arrow in the pill. */
export function LargeBlock({ title, caption, tooltip, canReset, onReset, className = '', children }) {
  const titleId = useId();
  return (
    <section
      aria-labelledby={titleId}
      className={`relative flex flex-col rounded-2xl border border-[rgb(145_158_171/0.12)] px-4 pb-4 pt-8 ${className}`}
    >
      <span className="absolute -top-3 left-4 inline-flex items-center rounded-[22px] bg-ink px-2.5 text-[13px] font-semibold leading-[22px] text-panel">
        {canReset && (
          <button
            type="button"
            onClick={onReset}
            aria-label={`Ripristina «${title}»`}
            className="reset-chip -ml-1 mr-1 grid place-items-center rounded-full"
          >
            <RotateCcw size={14} aria-hidden className="opacity-65" />
          </button>
        )}
        <span id={titleId}>{title}</span>
        {tooltip && (
          <Tooltip label={tooltip} className="ml-1 -mr-0.5">
            <button
              type="button"
              aria-label={`Informazioni su «${title}»: ${tooltip}`}
              className="grid cursor-help place-items-center rounded-full opacity-50 hover:opacity-90 focus-visible:opacity-90"
            >
              <Info size={14} aria-hidden />
            </button>
          </Tooltip>
        )}
      </span>
      {caption && <span className="text-[12px] leading-[18px] text-slate-soft">{caption}</span>}
      {children}
    </section>
  );
}

/** A sub-section with a small label (a button that resets it, in bold, once it has changed). */
export function SmallBlock({ label, canReset, onReset, className = '', children }) {
  return (
    <div className={`flex flex-col gap-3 ${className}`}>
      <button
        type="button"
        disabled={!canReset}
        onClick={canReset ? onReset : undefined}
        className={`inline-flex items-center gap-0.5 self-start text-[11px] leading-4 transition-colors disabled:cursor-default ${
          canReset ? 'font-bold text-ink hover:text-brand-500' : 'font-semibold text-slate-soft'
        }`}
      >
        {canReset && <RotateCcw size={14} aria-hidden />}
        {label}
      </button>
      {children}
    </div>
  );
}

/** A card to pick one of several: the chosen one has a solid primary border and a check, the others react to the pointer. */
export function OptionButton({ selected, tabbable = true, className = '', children, ...rest }) {
  return (
    <button
      type="button"
      data-selected={selected || undefined}
      tabIndex={tabbable ? 0 : -1}
      className={`opt relative w-full rounded-xl border border-transparent text-[13px] font-semibold leading-[18px] ${className}`}
      {...rest}
    >
      {children}
      {selected && (
        <span
          aria-hidden
          className="absolute right-1.5 top-1.5 grid h-[18px] w-[18px] place-items-center rounded-full bg-brand-500 text-on-brand"
        >
          <Check size={12} strokeWidth={3} />
        </span>
      )}
    </button>
  );
}

/** A card with an icon and a switch (on = grey fill and a solid primary border). */
export function SwitchOption({ label, tooltip, selected, icon, onChange }) {
  return (
    <div className="opt-switch relative" data-selected={selected || undefined}>
      <button
        type="button"
        role="switch"
        aria-checked={selected}
        onClick={onChange}
        className="flex w-full flex-col items-start rounded-2xl border border-[rgb(145_158_171/0.12)] py-4 pl-5 pr-4 text-left"
      >
        <span className="mb-6 flex w-full items-center justify-between">
          <span className="opt-switch-icon text-slate-soft">{icon}</span>
          <span
            aria-hidden
            className={`relative -mr-1 inline-block h-4 w-[30px] shrink-0 rounded-full transition-colors ${
              selected ? 'bg-ink' : 'bg-[rgb(145_158_171/0.48)]'
            }`}
          >
            <span
              className={`absolute top-0.5 h-3 w-3 rounded-full bg-panel shadow-sm transition-[left] duration-150 motion-reduce:transition-none ${
                selected ? 'left-[16px]' : 'left-0.5'
              }`}
            />
          </span>
        </span>
        <span className="text-[13px] font-semibold leading-[18px] text-ink">{label}</span>
      </button>
      {tooltip && (
        // a sibling of the switch (a control cannot sit inside another), over its bottom right corner
        <Tooltip label={tooltip} align="right" className="absolute bottom-4 right-4">
          <button
            type="button"
            aria-label={`Informazioni su «${label}»: ${tooltip}`}
            className="grid cursor-help place-items-center text-slate-soft/70 hover:text-slate-soft focus-visible:text-slate-soft"
          >
            <Info size={16} aria-hidden />
          </button>
        </Tooltip>
      )}
    </div>
  );
}

/**
 * Colour circles with a check on the chosen one (Colore principale). options: [{ value, label, color, checkColor }].
 * Six columns: the 12 presets of 7hub are two rows.
 */
export function SwatchOptions({ label, value, options, onChange }) {
  const anySelected = options.some(option => option.value === value);
  return (
    <RadioGroup label={label} className="grid grid-cols-6 justify-items-center gap-y-3">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <Tooltip key={option.value} label={option.label}>
            <button
              type="button"
              role="radio"
              aria-checked={selected}
              aria-label={option.label}
              tabIndex={isTabStop(selected, anySelected, index) ? 0 : -1}
              onClick={() => onChange(option.value)}
              data-selected={selected || undefined}
              className="swatch grid h-9 w-9 place-items-center rounded-full border border-[rgb(145_158_171/0.32)]"
              style={{ background: option.color, color: option.checkColor }}
            >
              {selected && <Check size={20} strokeWidth={3} aria-hidden />}
            </button>
          </Tooltip>
        );
      })}
    </RadioGroup>
  );
}

/**
 * The themes as small vertical bars, like the menu they colour (the colour comes in towards the bottom), with the name
 * under each: circles would look all the same, the themes stay grey-violet for more than half their length.
 * options: [{ value, label, gradient (a CSS gradient built by validate.js#gradientCss) }].
 */
export function GradientOptions({ label, value, options, onChange }) {
  const anySelected = options.some(option => option.value === value);
  return (
    <RadioGroup label={label} className="grid grid-cols-3 gap-3">
      {options.map((option, index) => {
        const selected = option.value === value;
        return (
          <OptionButton
            key={option.value}
            role="radio"
            aria-checked={selected}
            selected={selected}
            tabbable={isTabStop(selected, anySelected, index)}
            onClick={() => onChange(option.value)}
            className="flex flex-col items-center gap-2 py-3 text-[11px]"
          >
            <span
              aria-hidden
              className={`gradient-preview block h-14 w-8 rounded-lg ${
                selected ? 'outline-2 outline-offset-2 outline-ink' : ''
              }`}
              style={{ background: option.gradient }}
            />
            <span className="px-1 text-center leading-snug">{option.label}</span>
          </OptionButton>
        );
      })}
    </RadioGroup>
  );
}

/**
 * The font size slider of 7hub: a thick rail filled with a gradient of the primary colour, a mark per step and the value in a
 * bubble over the thumb. A native range input underneath, so the keyboard and screen readers work as usual.
 */
export function FontSizeSlider({ value, min, max, onChange }) {
  const fraction = (value - min) / (max - min);
  // the thumb is 16px wide: its centre travels from 8px to (width - 8px)
  const at = f => `calc(8px + (100% - 16px) * ${f})`;
  const marks = Array.from({ length: max - min + 1 }, (_, i) => i / (max - min));
  return (
    <div className="relative pt-9">
      <span
        aria-hidden
        className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-md bg-ink px-1.5 py-0.5 text-[11px] font-semibold leading-4 text-panel"
        style={{ left: at(fraction) }}
      >
        {value}px
        <span className="absolute left-1/2 top-full -mt-[3px] h-1.5 w-1.5 -translate-x-1/2 rotate-45 bg-ink" />
      </span>
      <div className="relative h-4">
        <span aria-hidden className="absolute inset-x-0 top-1 h-3 rounded-full bg-[rgb(145_158_171/0.32)]" />
        <span
          aria-hidden
          className="absolute left-0 top-1 h-3 rounded-full"
          style={{
            width: at(fraction),
            background: 'linear-gradient(135deg, var(--accent-light), var(--accent-dark))'
          }}
        />
        {marks.map(mark => (
          <span
            key={mark}
            aria-hidden
            className="absolute top-1/2 h-0.5 w-0.5 -translate-x-1/2 -translate-y-1/2 rounded-full bg-panel/80"
            style={{ left: at(mark) }}
          />
        ))}
        <input
          type="range"
          min={min}
          max={max}
          step={1}
          value={value}
          onChange={event => onChange(Number(event.target.value))}
          aria-label="Dimensione del testo"
          aria-valuetext={`${value} pixel`}
          className="font-range absolute inset-0"
        />
      </div>
    </div>
  );
}
