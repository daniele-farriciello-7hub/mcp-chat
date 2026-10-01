import { useState } from 'react';
import { ChevronDown, Loader2, RefreshCw, Upload } from 'lucide-react';
import Tooltip from '@/shared/ui/Tooltip';
import { MODELS } from '@/features/settings/models';
import { formatFileSize, formatTimestamp } from '@/features/documents/format';
import { canIndexNow } from '@/features/documents/indexability';
import { enqueueForIndexing } from '@/features/documents/indexingQueue';
import { useIndexingQueue } from '@/features/documents/useIndexingQueue';
import DeleteDocumentButton from './DeleteDocumentButton';
import FileActionButton from './FileActionButton';
import FileTypeIcon from './FileTypeIcon';

// the panel is narrow: "Gemini 3.1 Pro (anteprima)" would push the date out of sight
const modelName = id => (MODELS.find(model => model.id === id)?.name || id).replace(/\s*\(.*\)$/, '');

function CardSection({ title, hint, children }) {
  return (
    <section>
      <h4 className="text-[10px] font-bold uppercase tracking-[0.1em] text-slate-soft">
        {title}
        {hint && <span className="ml-1.5 font-normal normal-case tracking-normal">· {hint}</span>}
      </h4>
      <div className="mt-1.5">{children}</div>
    </section>
  );
}

function ReindexButton({ document, busy }) {
  const disabled = busy || !canIndexNow(document);
  return (
    <Tooltip
      label={busy ? 'Scheda in rigenerazione…' : 'Rigenera la scheda, ad esempio dopo aver cambiato modello'}
      align="right"
    >
      <button
        type="button"
        onClick={() => enqueueForIndexing([document])}
        disabled={disabled}
        aria-label={`Rigenera la scheda di ${document.name}`}
        className="rounded-lg p-1.5 text-slate-soft transition hover:bg-surface hover:text-brand-600 disabled:cursor-not-allowed disabled:opacity-40"
      >
        {busy ? <Loader2 size={14} className="animate-spin" /> : <RefreshCw size={14} />}
      </button>
    </Tooltip>
  );
}

/** An indexed document. Expanding it shows the index card exactly as the assistant sees it. */
export default function IndexedDocumentRow({ document }) {
  const [expanded, setExpanded] = useState(false);
  const queue = useIndexingQueue();
  const reindexing = Boolean(queue?.inProgress?.has(document.id));
  const card = document.indexCard || {};

  const meta = [
    formatTimestamp(document.indexedAt),
    document.indexedWithModel && modelName(document.indexedWithModel),
    formatFileSize(document.sizeBytes)
  ]
    .filter(Boolean)
    .join(' · ');

  return (
    <div className={expanded ? 'bg-surface/40' : ''}>
      <div className="flex items-start gap-2.5 px-3 py-2.5">
        <FileTypeIcon mimeType={document.mimeType} size={15} className="mt-0.5 shrink-0 text-brand-500" />
        <button
          type="button"
          onClick={() => setExpanded(v => !v)}
          aria-expanded={expanded}
          className="min-w-0 flex-1 text-left"
        >
          <Tooltip label={document.name} align="left" className="block w-full">
            <span className="block truncate text-[13px] font-medium text-ink">{document.name}</span>
          </Tooltip>
          <span className="mt-1 flex flex-wrap items-center gap-x-2 gap-y-1">
            <span className="rounded-pill bg-ok-soft px-1.5 py-0.5 text-[10px] font-semibold text-ok">
              {reindexing ? 'In aggiornamento' : 'Pronto per la chat'}
            </span>
            <span className="flex min-w-0 items-center gap-1 text-[10px] text-slate-soft" title={meta}>
              <Upload size={10} />
              <span className="truncate">{meta}</span>
            </span>
          </span>
          <span className="mt-1 inline-flex items-center gap-1 text-[11px] font-semibold text-brand-600">
            {expanded ? 'Nascondi la scheda' : 'Vedi la scheda'}
            <ChevronDown size={12} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
          </span>
        </button>
        <div className="flex shrink-0 items-center">
          <ReindexButton document={document} busy={reindexing} />
          <FileActionButton document={document} />
          <DeleteDocumentButton document={document} disabled={reindexing} />
        </div>
      </div>

      {expanded && (
        <div className="mx-3 mb-3 ml-9 flex flex-col gap-3 rounded-xl border border-line bg-white p-3">
          <p className="rounded-lg bg-brand-50/60 px-2.5 py-2 text-[11px] leading-snug text-slate-soft">
            Questa è la <span className="font-semibold text-ink">scheda</span> che Gemini ha scritto leggendo
            il documento. L’assistente la legge a ogni domanda per capire se il documento è pertinente, e solo
            in quel caso apre il file completo per rispondere.
          </p>

          {card.summary && (
            <CardSection title="Di cosa parla">
              <p className="text-[12px] leading-relaxed text-ink">{card.summary}</p>
            </CardSection>
          )}

          {card.banks?.length > 0 && (
            <CardSection title="Istituti" hint="a chi si riferisce il documento">
              <ul className="flex flex-wrap gap-1">
                {card.banks.map(bank => (
                  <li
                    key={bank}
                    className="rounded-pill bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600"
                  >
                    {bank}
                  </li>
                ))}
              </ul>
            </CardSection>
          )}

          {card.products?.length > 0 && (
            <CardSection title="Prodotti" hint="mutuo, cessione del quinto, lead…">
              <ul className="flex flex-wrap gap-1">
                {card.products.map(product => (
                  <li
                    key={product}
                    className="rounded-pill bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600"
                  >
                    {product}
                  </li>
                ))}
              </ul>
            </CardSection>
          )}

          {card.topics?.length > 0 && (
            <CardSection title="Argomenti trattati" hint={`${card.topics.length}`}>
              <ul className="flex flex-wrap gap-1">
                {card.topics.map(topic => (
                  <li
                    key={topic}
                    className="rounded-pill bg-brand-50 px-2 py-0.5 text-[11px] font-medium text-brand-600"
                  >
                    {topic}
                  </li>
                ))}
              </ul>
            </CardSection>
          )}

          {card.keywords?.length > 0 && (
            <CardSection title="Parole chiave" hint="termini e sigle che fanno scegliere questo documento">
              <ul className="flex flex-wrap gap-1">
                {card.keywords.map(keyword => (
                  <li
                    key={keyword}
                    className="rounded-md border border-line px-1.5 py-0.5 text-[10px] text-slate-soft"
                  >
                    {keyword}
                  </li>
                ))}
              </ul>
            </CardSection>
          )}
        </div>
      )}
    </div>
  );
}
