/**
 * The current upload batch as one collapsible card: a single line with progress while uploading,
 * and when finished, what happened plus the obvious next step — indexing what was just uploaded.
 */
import { useEffect, useState } from 'react';
import { AlertTriangle, Check, ChevronDown, Circle, FileWarning, Loader2, Sparkles, X } from 'lucide-react';
import Button from '@/shared/ui/Button';
import Tooltip from '@/shared/ui/Tooltip';
import ProgressBar from './ProgressBar';

const STATUS_ICONS = {
  queued: <Circle size={12} className="text-line" />,
  uploading: <Loader2 size={12} className="animate-spin text-brand-500" />,
  done: <Check size={12} strokeWidth={3} className="text-ok" />,
  failed: <AlertTriangle size={12} className="text-danger" />,
  duplicate: <FileWarning size={12} className="text-warn" />
};

function headline({ total, done, failed, duplicates, running, current }) {
  if (running) {
    return `Caricamento ${done + failed + duplicates + 1} di ${total}${current ? ` · ${current.name}` : ''}`;
  }
  const parts = [];
  if (done) parts.push(done === total ? `${total} file caricati` : `${done} di ${total} file caricati`);
  if (duplicates) parts.push(`${duplicates} già presenti`);
  if (failed) parts.push(`${failed} non caricati`);
  if (parts.length === 0) return `${total} file`;
  return parts.join(' · ');
}

export default function UploadProgressPanel({
  uploads,
  summary,
  onReplace,
  onReplaceAll,
  onIndexUploaded,
  onDismiss
}) {
  // a long batch starts collapsed; failures open it so the reasons are visible
  const [expanded, setExpanded] = useState(uploads.length <= 3);

  // a batch that needs a decision (duplicates) or failed outright opens on its own — but only to
  // open it, never to close it: replacing one duplicate briefly sets `running` again, and that
  // must not collapse a list the admin still has other duplicates to go through in.
  useEffect(() => {
    if (!summary.running && (summary.duplicates > 0 || (summary.failed > 0 && summary.done === 0))) {
      setExpanded(true);
    }
  }, [summary.running, summary.duplicates, summary.failed, summary.done]);

  if (uploads.length === 0) return null;

  const canIndex = !summary.running && summary.done > 0;

  return (
    <div className="rounded-xl border border-line">
      <div className="flex items-center gap-2 px-3 py-2.5">
        {summary.running ? (
          <Loader2 size={14} className="shrink-0 animate-spin text-brand-500" />
        ) : summary.failed ? (
          <AlertTriangle size={14} className="shrink-0 text-warn" />
        ) : (
          <Check size={14} strokeWidth={3} className="shrink-0 text-ok" />
        )}
        <span className="min-w-0 flex-1 truncate text-[12px] font-semibold text-ink">
          {headline(summary)}
        </span>
        <Tooltip label={expanded ? 'Nascondi l’elenco' : 'Mostra i file'} align="right">
          <button
            type="button"
            onClick={() => setExpanded(!expanded)}
            aria-expanded={expanded}
            aria-label={expanded ? 'Nascondi l’elenco' : 'Mostra i file'}
            className="rounded-lg p-1 text-slate-soft transition hover:bg-surface hover:text-ink"
          >
            <ChevronDown size={15} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </button>
        </Tooltip>
        {!summary.running && (
          <Tooltip label="Chiudi" align="right">
            <button
              type="button"
              onClick={onDismiss}
              aria-label="Chiudi il riepilogo del caricamento"
              className="rounded-lg p-1 text-slate-soft transition hover:bg-surface hover:text-ink"
            >
              <X size={15} />
            </button>
          </Tooltip>
        )}
      </div>

      {summary.running && (
        <div className="px-3 pb-2.5">
          <ProgressBar value={summary.done + summary.failed} total={summary.total} />
        </div>
      )}

      {expanded && !summary.running && summary.duplicates > 1 && (
        <div className="flex items-center justify-between gap-2 border-t border-line px-3 py-2">
          <span className="text-[11px] text-slate-soft">{summary.duplicates} file già presenti.</span>
          <button
            type="button"
            onClick={onReplaceAll}
            className="shrink-0 rounded-lg border border-line px-2 py-0.5 text-[11px] font-semibold text-brand-600 transition hover:border-brand-300 hover:bg-brand-50"
          >
            Sostituisci tutti
          </button>
        </div>
      )}

      {expanded && (
        <ul className="max-h-48 overflow-y-auto border-t border-line px-3 py-2">
          {uploads.map((upload, index) => (
            <li key={index} className="flex items-start gap-2 py-1 text-[11px]">
              <span className="mt-0.5 shrink-0">{STATUS_ICONS[upload.status]}</span>
              <span className="min-w-0 flex-1">
                <Tooltip label={upload.name} align="left" className="block w-full">
                  <span
                    className={`block truncate ${upload.status === 'queued' ? 'text-slate-soft' : 'text-ink'}`}
                  >
                    {upload.name}
                  </span>
                </Tooltip>
                {upload.error && <span className="block text-danger">{upload.error}</span>}
                {upload.status === 'duplicate' && (
                  <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1">
                    <span className="text-warn">Esiste già un documento con questo nome.</span>
                    <button
                      type="button"
                      onClick={() => onReplace(index)}
                      className="rounded-lg border border-line px-2 py-0.5 text-[11px] font-semibold text-brand-600 transition hover:border-brand-300 hover:bg-brand-50"
                    >
                      Sostituisci
                    </button>
                  </span>
                )}
              </span>
            </li>
          ))}
        </ul>
      )}

      {canIndex && (
        <div className="flex items-center gap-2 border-t border-line bg-brand-50/50 px-3 py-2.5">
          <p className="min-w-0 flex-1 text-[11px] leading-snug text-slate-soft">
            I file sono nell’archivio, ma l’assistente li potrà usare solo dopo l’indicizzazione.
          </p>
          <Button primary onClick={onIndexUploaded}>
            <Sparkles size={14} /> Indicizza {summary.done === 1 ? 'il file' : `i ${summary.done} file`}
          </Button>
        </div>
      )}
    </div>
  );
}
