/**
 * The outcome of an operation shown as a card, not a sentence, so it is obvious what was actually
 * written in the system. The button asks the host to navigate: an iframe cannot move its parent.
 *
 * card: { icon: 'application'|'document', title, status?: { tone: 'pending'|'done', text },
 *         rows?: [{ label, value }], action?: { url, label } }
 */
import { ArrowUpRight, FileSignature, FileText } from 'lucide-react';

const ICONS = { application: FileSignature, document: FileText };

const TONES = {
  pending: 'bg-accent-soft text-warn',
  done: 'bg-ok-soft text-ok'
};

export default function ResultCard({ card, onNavigate }) {
  const Icon = ICONS[card.icon] || FileText;

  return (
    <div
      className="mt-2 overflow-hidden rounded-card border border-line bg-white shadow-soft"
      style={{ animation: 'var(--animate-fade-up)' }}
    >
      <div className="flex items-start gap-2.5 px-3 pt-3">
        <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-brand-50 text-brand-500">
          <Icon size={16} />
        </span>
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-bold leading-snug text-ink">{card.title}</div>
          {card.status && (
            <span
              className={`mt-1 inline-block rounded-pill px-2 py-0.5 text-[10px] font-bold tracking-[0.08em] ${
                TONES[card.status.tone] || TONES.pending
              }`}
            >
              {card.status.text}
            </span>
          )}
        </div>
      </div>

      {card.rows?.length > 0 && (
        <dl className="mt-2.5 divide-y divide-line border-t border-line text-[12px]">
          {card.rows.map(row => (
            <div key={row.label} className="flex items-baseline justify-between gap-3 px-3 py-1.5">
              <dt className="shrink-0 text-slate-soft">{row.label}</dt>
              <dd className="min-w-0 truncate text-right font-medium text-ink">{row.value}</dd>
            </div>
          ))}
        </dl>
      )}

      {card.action?.url && (
        <div className="border-t border-line p-2">
          <button
            type="button"
            onClick={() => onNavigate?.(card.action.url)}
            className="inline-flex w-full items-center justify-center gap-1.5 rounded-lg bg-brand-500 px-3 py-2 text-[12px] font-semibold text-white transition hover:bg-brand-600"
          >
            {card.action.label || 'Apri'}
            <ArrowUpRight size={14} />
          </button>
        </div>
      )}
    </div>
  );
}
