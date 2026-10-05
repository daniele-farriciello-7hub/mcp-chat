/**
 * The Storico charts, hand-rolled (no chart library in the bundle for four small charts). Each is a
 * single series in the brand color, so none needs a legend: the section title names it. Bars are
 * thin, rounded at the data end and spaced by a gap; every bar has a hover tooltip with its value.
 */
'use client';

import { useState } from 'react';

const formatDay = day =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString('it-IT', { day: 'numeric', month: 'short' });

/** Questions per day, vertical bars. Zero days keep their slot so gaps in activity are visible. */
export function DayBars({ series }) {
  const [hover, setHover] = useState(null);
  const max = Math.max(1, ...series.map(d => d.value));
  const labelEvery = Math.ceil(series.length / 7);

  return (
    <div className="relative">
      <div
        className="flex h-32 items-end gap-0.5 border-b border-line"
        role="img"
        aria-label="Domande per giorno"
      >
        {series.map((d, i) => (
          <div
            key={d.day}
            className="flex h-full flex-1 items-end"
            onMouseEnter={() => setHover(i)}
            onMouseLeave={() => setHover(null)}
          >
            <div
              className={`w-full rounded-t-[4px] transition-colors ${hover === i ? 'bg-brand-600' : 'bg-brand-500'}`}
              style={{ height: d.value ? `${Math.max(3, (d.value / max) * 100)}%` : 0 }}
            />
          </div>
        ))}
      </div>
      <div className="mt-1 flex gap-0.5 text-[10px] text-slate-soft">
        {series.map((d, i) => (
          <span key={d.day} className="flex-1 truncate text-center">
            {i % labelEvery === 0 ? formatDay(d.day) : ''}
          </span>
        ))}
      </div>
      {hover !== null && (
        <div
          className="pointer-events-none absolute -top-2 z-10 -translate-x-1/2 -translate-y-full whitespace-nowrap rounded-lg bg-ink px-2 py-1 text-[11px] text-white shadow-soft"
          style={{ left: `${((hover + 0.5) / series.length) * 100}%` }}
        >
          {formatDay(series[hover].day)} · <b>{series[hover].value}</b> domande
        </div>
      )}
    </div>
  );
}

/** Ranked horizontal bars with the value at the end of each; nothing to show → one quiet line. */
export function BarList({ items, emptyText = 'Nessun dato nel periodo.' }) {
  const max = Math.max(1, ...items.map(i => i.value));
  if (!items.some(i => i.value > 0)) return <p className="text-[12px] text-slate-soft">{emptyText}</p>;
  return (
    <ul className="flex flex-col gap-2">
      {items.map(item => (
        <li key={item.label} className="group" title={`${item.label}: ${item.value}`}>
          <div className="mb-0.5 flex items-baseline justify-between gap-2 text-[12px]">
            <span className="min-w-0 truncate text-ink">{item.label}</span>
            <span className="shrink-0 font-semibold tabular-nums text-ink">
              {item.value.toLocaleString('it-IT')}
            </span>
          </div>
          <div className="h-2 rounded-full bg-surface">
            <div
              className="h-2 rounded-full bg-brand-500 transition-colors group-hover:bg-brand-600"
              style={{ width: `${(item.value / max) * 100}%` }}
            />
          </div>
        </li>
      ))}
    </ul>
  );
}
