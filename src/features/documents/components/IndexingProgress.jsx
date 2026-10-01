import { Check, Loader2 } from 'lucide-react';
import ProgressBar from './ProgressBar';

const PHASE_LABELS = { reading: 'Gemini legge il documento e scrive la scheda' };

/** The background indexing queue, saying which document is being worked on and what that means. */
export default function IndexingProgress({ queue }) {
  if (!queue) return null;
  const running = queue.done < queue.total;
  const current = [...queue.inProgress.values()].find(entry => entry.phase);

  return (
    <div className="bg-brand-50/40 rounded-xl px-3 py-2.5">
      <div className="flex items-center gap-2">
        {running ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-brand-500" />
        ) : (
          <Check size={14} strokeWidth={3} className="shrink-0 text-ok" />
        )}
        <span className="min-w-0 flex-1 text-[12px] font-semibold text-ink">
          {running ? `Indicizzazione ${queue.done + 1} di ${queue.total}` : 'Indicizzazione completata'}
        </span>
        {queue.failed > 0 && (
          <span className="shrink-0 text-[11px] text-danger">{queue.failed} con errore</span>
        )}
      </div>
      {running && current && (
        <p className="mt-1 truncate text-[11px] text-slate-soft" title={current.document.name}>
          {PHASE_LABELS[current.phase]}: <span className="text-ink">{current.document.name}</span>
        </p>
      )}
      <div className="mt-2">
        <ProgressBar value={queue.done} total={queue.total} tone={running ? 'brand' : 'ok'} />
      </div>
      {running && (
        <p className="mt-1.5 text-[10px] text-slate-soft">
          Può richiedere qualche minuto per documento. Puoi chiudere il pannello: continua da solo.
        </p>
      )}
    </div>
  );
}
