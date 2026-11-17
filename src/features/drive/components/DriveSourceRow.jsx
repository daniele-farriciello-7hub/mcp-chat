import { useState } from 'react';
import {
  AlertTriangle,
  ChevronDown,
  ExternalLink,
  FileText,
  Folder,
  Loader2,
  RefreshCw,
  Sparkles,
  Trash2,
  Webhook
} from 'lucide-react';
import Button from '@/shared/ui/Button';
import Tooltip from '@/shared/ui/Tooltip';
import { formatTimestamp } from '@/features/documents/format';
import FrequencyPicker from './FrequencyPicker';

const TRIGGER_LABELS = {
  manual: 'manuale',
  schedule: 'pianificata',
  webhook: 'avviata da una notifica di Drive'
};
const ISSUE_TONES = { failed: 'text-danger', source: 'text-danger', skipped: 'text-warn' };
// the scheduler wakes up every 15 minutes (functions/index.js): a source that is due waits for the next one
const DUE_NOTE = 'al prossimo giro (entro 15 minuti)';

const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;

function StatusPill({ source, working }) {
  if (working) {
    return (
      <span className="flex shrink-0 items-center gap-1 rounded-pill bg-brand-50 px-2 py-0.5 text-[10px] font-semibold text-brand-600">
        <Loader2 size={10} className="animate-spin" /> In corso
      </span>
    );
  }
  if (source.status === 'error') {
    return (
      <span className="shrink-0 rounded-pill bg-danger-soft px-2 py-0.5 text-[10px] font-semibold text-danger">
        Errore
      </span>
    );
  }
  if (!source.lastRunAt) {
    return (
      <span className="shrink-0 rounded-pill bg-surface px-2 py-0.5 text-[10px] font-semibold text-slate-soft">
        Da sincronizzare
      </span>
    );
  }
  if (source.lastResult && !source.lastResult.complete) {
    return (
      <span className="shrink-0 rounded-pill bg-warn-soft px-2 py-0.5 text-[10px] font-semibold text-warn">
        Parziale
      </span>
    );
  }
  return (
    <span className="shrink-0 rounded-pill bg-ok-soft px-2 py-0.5 text-[10px] font-semibold text-ok">
      Aggiornato
    </span>
  );
}

function Progress({ progress }) {
  const text =
    progress?.phase === 'files' && progress.total > 0
      ? `Controllo i file: ${progress.done} di ${progress.total}`
      : 'Leggo il contenuto su Drive…';
  return <p className="mt-2 text-[11px] font-medium text-brand-600">{text}</p>;
}

/** What the last run did, as chips: only what is not zero. */
function ResultChips({ result }) {
  const chips = [
    [result.added, 'aggiunti', 'bg-ok-soft text-ok'],
    [result.updated, 'aggiornati', 'bg-brand-50 text-brand-600'],
    [result.removed, 'rimossi', 'bg-surface text-slate-soft'],
    [result.skipped, 'saltati', 'bg-warn-soft text-warn'],
    [result.failed, 'con errore', 'bg-danger-soft text-danger']
  ].filter(([count]) => count > 0);

  return (
    <div className="mt-2 flex flex-wrap items-center gap-1.5">
      {chips.length === 0 && (
        <span className="text-[11px] text-slate-soft">Nessuna novità all’ultimo controllo.</span>
      )}
      {chips.map(([count, label, tone]) => (
        <span key={label} className={`rounded-pill px-2 py-0.5 text-[10px] font-semibold ${tone}`}>
          {count} {label}
        </span>
      ))}
      {result.deferred > 0 && (
        <span className="text-[11px] text-slate-soft">
          {plural(result.deferred, 'file resta', 'file restano')} per il prossimo giro
        </span>
      )}
    </div>
  );
}

function WebhookLine({ source }) {
  const { webhook } = source;
  if (source.frequency === 'manual') return null;
  if (webhook.active) {
    return (
      <p className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-slate-soft">
        <Webhook size={12} className="mt-0.5 shrink-0 text-ok" />
        <span>
          <Tooltip
            label="Quando qualcosa viene aggiunto o tolto nella cartella, Drive avvisa e la sincronizzazione parte al prossimo giro. Le modifiche dentro i file le trova il controllo periodico."
            align="left"
          >
            <span className="font-semibold text-ok">Notifiche di Drive attive</span>
          </Tooltip>
          {webhook.expiresAt && <> · si rinnovano da sole (scadenza {formatTimestamp(webhook.expiresAt)})</>}
        </span>
      </p>
    );
  }
  return (
    <p
      className="mt-1 flex items-start gap-1 text-[11px] leading-snug text-slate-soft"
      title={webhook.error || undefined}
    >
      <Webhook size={12} className="mt-0.5 shrink-0" />
      <span>
        <span className="font-semibold text-ink">Notifiche di Drive non attive</span>
        {' · '}
        {source.lastRunAt
          ? 'le modifiche si trovano confrontando i file a ogni controllo'
          : 'si attivano alla prima sincronizzazione'}
        {webhook.error && <span className="block text-warn">{webhook.error}</span>}
      </span>
    </p>
  );
}

function IssueList({ errors }) {
  const [open, setOpen] = useState(false);
  if (!errors?.length) return null;
  return (
    <div className="mt-2">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 text-[11px] font-semibold text-brand-600 transition hover:text-brand-700"
      >
        Dettagli ({errors.length}){' '}
        <ChevronDown size={12} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ul className="mt-1.5 flex flex-col gap-1.5 rounded-lg bg-surface px-2.5 py-2">
          {errors.map((issue, index) => (
            <li key={index} className="text-[11px] leading-snug">
              <span className="break-words font-medium text-ink">{issue.name}</span>
              <span className={`block ${ISSUE_TONES[issue.kind] || 'text-slate-soft'}`}>{issue.reason}</span>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

/**
 * One Drive source: what it is, how often it is synchronised, how the last run went and what the admin
 * can do with it. All state lives in `DriveView`; this only shows it and calls back.
 * `busy` is what this browser asked for and is still waiting on: 'sync' | 'reindex' | 'remove' | 'save'.
 */
export default function DriveSourceRow({
  source,
  documentCount,
  busy,
  message,
  onSchedule,
  onSync,
  onRemove
}) {
  const [confirming, setConfirming] = useState(null); // null | 'reindex' | 'remove'
  const working = source.status === 'running' || busy === 'sync' || busy === 'reindex';
  const locked = working || busy === 'remove';
  const Icon = source.kind === 'folder' ? Folder : FileText;
  const result = source.lastResult;

  const confirmAction = async kind => {
    setConfirming(null);
    if (kind === 'remove') await onRemove(source);
    else await onSync(source, { force: true });
  };

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-start gap-2.5">
        <Icon size={16} className="mt-0.5 shrink-0 text-brand-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5">
            <Tooltip label={source.name} align="left" className="block min-w-0">
              <span className="block truncate text-[13px] font-semibold text-ink">{source.name}</span>
            </Tooltip>
            {source.url && (
              <Tooltip label="Apri su Google Drive" align="left">
                <a
                  href={source.url}
                  target="_blank"
                  rel="noopener noreferrer"
                  aria-label={`Apri ${source.name} su Google Drive`}
                  className="shrink-0 text-slate-soft transition hover:text-brand-600"
                >
                  <ExternalLink size={12} />
                </a>
              </Tooltip>
            )}
          </div>
          <div className="mt-0.5 text-[10px] text-slate-soft">
            {source.kind === 'folder' ? 'Cartella' : 'File PDF'} ·{' '}
            {plural(documentCount, 'documento', 'documenti')} in archivio
          </div>
        </div>
        <StatusPill source={source} working={working} />
      </div>

      {working && <Progress progress={source.progress} />}
      {!working && source.runError && (
        <p className="mt-2 flex items-start gap-1 text-[11px] leading-snug text-danger">
          <AlertTriangle size={12} className="mt-0.5 shrink-0" /> {source.runError}
        </p>
      )}
      {message && (
        <p className="mt-2 rounded-lg bg-danger-soft px-2.5 py-2 text-[11px] text-danger">{message}</p>
      )}

      <div className="mt-3">
        <FrequencyPicker
          frequency={source.frequency}
          dailyHour={source.dailyHour}
          onChange={schedule => onSchedule(source, schedule)}
          disabled={busy === 'save' || busy === 'remove'}
          ariaLabel={`Frequenza di ${source.name}`}
        />
      </div>

      <div className="mt-2.5 text-[11px] leading-snug text-slate-soft">
        <p>
          Ultima sincronizzazione:{' '}
          <span className="text-ink">
            {source.lastRunAt ? formatTimestamp(source.lastRunAt) : 'mai'}
            {result?.trigger && TRIGGER_LABELS[result.trigger] && ` (${TRIGGER_LABELS[result.trigger]})`}
          </span>
        </p>
        <p>
          Prossima:{' '}
          <span className="text-ink">
            {source.frequency === 'manual'
              ? 'solo quando premi «Sincronizza ora»'
              : source.due || !source.nextRunAt
                ? DUE_NOTE
                : formatTimestamp(source.nextRunAt)}
          </span>
        </p>
        <WebhookLine source={source} />
      </div>

      {result && <ResultChips result={result} />}
      {result?.ignored > 0 && (
        <p className="mt-1 text-[11px] text-slate-soft">
          {plural(result.ignored, 'file non PDF ignorato', 'file non PDF ignorati')}.
        </p>
      )}
      {source.reindexPending && !working && (
        <p className="mt-1 text-[11px] text-warn">
          Reindicizzazione da completare: continua al prossimo giro.
        </p>
      )}
      <IssueList errors={result?.errors} />

      {confirming ? (
        <div className="mt-3 rounded-lg bg-surface px-2.5 py-2">
          <p className="text-[12px] leading-snug text-ink">
            {confirming === 'remove'
              ? `Rimuovere «${source.name}»? I suoi ${plural(documentCount, 'documento esce', 'documenti escono')} dall’archivio e l’assistente non li vede più; quelli che arrivano anche da un’altra sorgente restano. Su Drive non cambia nulla.`
              : 'Riscrivo la scheda di tutti i file di questa sorgente? Costa una chiamata a Gemini per ogni file e può richiedere un po’.'}
          </p>
          <div className="mt-2 flex items-center gap-1">
            <button
              type="button"
              onClick={() => confirmAction(confirming)}
              className={`rounded-lg px-2.5 py-1 text-[11px] font-semibold text-white transition hover:opacity-90 ${
                confirming === 'remove' ? 'bg-danger' : 'bg-brand-500'
              }`}
            >
              {confirming === 'remove' ? 'Rimuovi' : 'Reindicizza'}
            </button>
            <button
              type="button"
              onClick={() => setConfirming(null)}
              className="rounded-lg px-1.5 py-1 text-[11px] text-slate-soft transition hover:text-ink"
            >
              Annulla
            </button>
          </div>
        </div>
      ) : (
        <div className="mt-3 flex flex-wrap items-center gap-2">
          <Button
            primary
            onClick={() => onSync(source, { force: false })}
            disabled={locked}
            tooltip="Controlla subito cosa è cambiato su Drive"
            tooltipAlign="left"
          >
            {working ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />} Sincronizza
            ora
          </Button>
          <Button
            onClick={() => setConfirming('reindex')}
            disabled={locked}
            tooltip="Riscrive la scheda di ogni file, ad esempio dopo aver cambiato modello o istruzioni"
          >
            <Sparkles size={13} /> Reindicizza tutto
          </Button>
          <Button
            onClick={() => setConfirming('remove')}
            disabled={locked}
            tooltip="Scollega e togli i suoi documenti dall’archivio"
            tooltipAlign="right"
          >
            {busy === 'remove' ? <Loader2 size={13} className="animate-spin" /> : <Trash2 size={13} />}{' '}
            Rimuovi
          </Button>
        </div>
      )}
    </div>
  );
}
