/**
 * Clickable answers to a question the assistant could not settle on its own (`ask_options`): one row per
 * option, in the same card style as `OptionsCard`. A click sends that option's text as the operator's next
 * message, through the normal send path, so the model carries on with it. "Altro…" only puts the cursor in
 * the message box; the card stays usable until a message goes out. Once `answered` (a message followed the
 * card, whether clicked or typed) the pick is marked and every row is off.
 */
'use client';

import { Check, ChevronRight, Pencil } from 'lucide-react';

const ROW_CLASS =
  'group flex w-full items-center gap-3 border-t border-line px-3 py-2.5 text-left transition first:border-t-0';

export default function ChoiceCard({ activity, answered, onSelect, onAsk, onOther }) {
  const { label, choices, allowOther, selected } = activity;

  const pick = choice => {
    if (answered) return;
    onSelect(activity.id, choice);
    onAsk(choice);
  };

  return (
    <div
      className="overflow-hidden rounded-card border border-line bg-white shadow-soft"
      style={{ animation: 'var(--animate-fade-up)' }}
      role="group"
      aria-label={label}
    >
      <div className="border-b border-line bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-soft">
        {label}
      </div>
      {choices.map(choice => {
        const chosen = choice === selected;
        return (
          <button
            key={choice}
            type="button"
            onClick={() => pick(choice)}
            disabled={answered}
            aria-pressed={answered ? chosen : undefined}
            className={`${ROW_CLASS} ${
              chosen ? 'bg-ok-soft' : answered ? 'opacity-55' : 'hover:bg-surface'
            } disabled:cursor-default`}
          >
            <span className="min-w-0 flex-1 text-[13px] font-semibold text-ink">{choice}</span>
            {chosen ? (
              <Check size={14} className="shrink-0 text-ok" aria-label="Scelta" />
            ) : (
              !answered && (
                <ChevronRight
                  size={14}
                  className="shrink-0 text-brand-600 transition group-hover:translate-x-px"
                  aria-hidden="true"
                />
              )
            )}
          </button>
        );
      })}
      {allowOther && (
        <button
          type="button"
          onClick={onOther}
          disabled={answered}
          className={`${ROW_CLASS} text-slate-soft ${
            answered ? 'opacity-55' : 'hover:bg-surface hover:text-ink'
          } disabled:cursor-default`}
        >
          <span className="min-w-0 flex-1 text-[13px]">Altro…</span>
          {!answered && <Pencil size={13} className="shrink-0" aria-hidden="true" />}
        </button>
      )}
    </div>
  );
}
