/**
 * Choices found in 7Hub (several records for a search, several pages for a name), as rows the operator
 * can open with one click. The click goes straight to the host through the bridge: no round trip through
 * the model, so it is instant. An opened row turns green and says so.
 */
'use client';

import { useState } from 'react';
import { ArrowUpRight, Check, Loader2 } from 'lucide-react';
import { callHostTool } from '@/shared/embed/hostBridge';

// one hue per kind of record, light background and dark text (same as the 7Hub badges)
const BADGE = {
  Cliente: 'bg-brand-50 text-brand-700',
  Lead: 'bg-accent-soft text-warn',
  Pagina: 'bg-surface text-slate-soft'
};
const badgeClass = badge => BADGE[badge] || 'bg-ok-soft text-ok';

function OptionRow({ option }) {
  const [state, setState] = useState('idle'); // idle | opening | opened | failed

  const open = async () => {
    if (option.disabled || state === 'opening') return;
    setState('opening');
    try {
      const result = await callHostTool(option.action.tool, option.action.args);
      setState(result?.opened ? 'opened' : 'failed');
    } catch {
      setState('failed');
    }
  };

  const opened = state === 'opened';
  return (
    <button
      type="button"
      onClick={open}
      disabled={option.disabled}
      className={`group flex w-full items-center gap-3 border-t border-line px-3 py-2.5 text-left transition first:border-t-0 ${
        opened ? 'bg-ok-soft' : 'hover:bg-surface'
      } disabled:cursor-not-allowed disabled:opacity-55`}
    >
      {option.badge && (
        <span
          className={`shrink-0 rounded-pill px-2 py-0.5 text-[11px] font-semibold ${badgeClass(option.badge)}`}
        >
          {option.badge}
        </span>
      )}
      <span className="min-w-0 flex-1">
        <span className="block truncate text-[13px] font-semibold text-ink">{option.title}</span>
        {(option.detail || option.disabled) && (
          <span className="block truncate text-[11px] text-slate-soft">
            {option.disabled ? 'Non hai i permessi per aprirlo' : option.detail}
          </span>
        )}
      </span>
      <span
        className={`flex shrink-0 items-center gap-1 text-[12px] font-semibold ${
          opened ? 'text-ok' : state === 'failed' ? 'text-danger' : 'text-brand-600'
        }`}
      >
        {state === 'opening' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : opened ? (
          <>
            <Check size={14} /> Aperto
          </>
        ) : state === 'failed' ? (
          'Non riuscito'
        ) : (
          <>
            Apri{' '}
            <ArrowUpRight
              size={14}
              className="transition group-hover:-translate-y-px group-hover:translate-x-px"
            />
          </>
        )}
      </span>
    </button>
  );
}

export default function OptionsCard({ activity }) {
  return (
    <div
      className="overflow-hidden rounded-card border border-line bg-white shadow-soft"
      style={{ animation: 'var(--animate-fade-up)' }}
      role="list"
      aria-label={activity.label}
    >
      <div className="border-b border-line bg-surface px-3 py-1.5 text-[11px] font-semibold uppercase tracking-[0.08em] text-slate-soft">
        {activity.label}
      </div>
      {activity.options.map(option => (
        <OptionRow key={option.key} option={option} />
      ))}
    </div>
  );
}
