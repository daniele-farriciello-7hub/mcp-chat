/**
 * What the assistant is doing, said as it would say it to a person: never function names,
 * parameters or JSON. `outcome` is 'running' | 'done' | 'failed'.
 *
 * Only finished, useful cards reach this component (`MessageList.jsx` filters the rest): the source
 * a document answer came from, or the data an operator can download. No SQL is shown here.
 *
 * `columns`/`rows` ride along on a successful `query_database` or `export_excel` result (for every
 * operator, not just admins — it's the data they already received, not the query that produced it)
 * so the row can offer "Scarica come Excel" without asking the server again. `exportTitle` names
 * the file when the source isn't a database connection (`databaseLabel` covers that case already).
 */
'use client';

import { useState } from 'react';
import { Check, Database, Download, ExternalLink, FileText, Loader2 } from 'lucide-react';
import Tooltip from '@/shared/ui/Tooltip';
import { getDocumentUrlById } from '@/features/documents/documentStore';
import { downloadXlsx, slugify } from '@/shared/xlsx';

/** Opens the document the assistant just read, so the operator can check the source. */
function OpenDocumentButton({ documentId, documentName }) {
  const [opening, setOpening] = useState(false);
  const [failed, setFailed] = useState(false);

  const open = async () => {
    setOpening(true);
    setFailed(false);
    try {
      const url = await getDocumentUrlById(documentId);
      if (url) window.open(url, '_blank', 'noopener,noreferrer');
      else setFailed(true);
    } catch (error) {
      console.error('[chat] opening the document failed:', error);
      setFailed(true);
    } finally {
      setOpening(false);
    }
  };

  return (
    <Tooltip
      label={failed ? 'Documento non più disponibile' : 'Apri il documento'}
      align="right"
      className="self-center"
    >
      <button
        type="button"
        onClick={open}
        disabled={opening || failed}
        aria-label={`Apri ${documentName || 'il documento'}`}
        className="rounded-lg p-1.5 text-slate-soft transition hover:bg-surface hover:text-brand-600 disabled:opacity-40"
      >
        {opening ? <Loader2 size={14} className="animate-spin" /> : <ExternalLink size={14} />}
      </button>
    </Tooltip>
  );
}

/** yyyymmdd-hhmm, local time — compact and sorts naturally in a downloads folder. */
function timestampTag() {
  const now = new Date();
  const pad = n => String(n).padStart(2, '0');
  return (
    `${now.getFullYear()}${pad(now.getMonth() + 1)}${pad(now.getDate())}` +
    `-${pad(now.getHours())}${pad(now.getMinutes())}`
  );
}

/** Saves the query's result set as an Excel file. */
function DownloadButton({ filenameHint, columns, rows }) {
  const [state, setState] = useState('idle'); // 'idle' | 'saving' | 'saved'

  const save = async () => {
    setState('saving');
    const base = ['assistente', slugify(filenameHint), timestampTag()].filter(Boolean).join('-');
    try {
      await downloadXlsx(base, columns, rows);
      setState('saved');
    } catch (error) {
      console.error('[chat] xlsx export failed:', error);
      setState('idle');
    }
    setTimeout(() => setState('idle'), 2000);
  };

  return (
    <Tooltip label="Scarica come Excel" align="right" className="self-center">
      <button
        type="button"
        onClick={save}
        disabled={state === 'saving'}
        aria-label="Scarica il risultato come file Excel"
        className="rounded-lg p-1.5 text-slate-soft transition hover:bg-surface hover:text-brand-600 disabled:opacity-40"
      >
        {state === 'saved' ? (
          <Check size={14} className="text-ok" />
        ) : state === 'saving' ? (
          <Loader2 size={14} className="animate-spin" />
        ) : (
          <Download size={14} />
        )}
      </button>
    </Tooltip>
  );
}

export default function ActivityRow({ activity }) {
  const { label, documentName, documentId, databaseLabel, exportTitle, columns, rows } = activity;

  return (
    <div
      className="flex items-start gap-2.5 rounded-card border border-ok/30 bg-white px-3 py-2 shadow-soft"
      style={{ animation: 'var(--animate-fade-up)' }}
    >
      <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-ok-soft text-ok">
        <Check size={14} />
      </span>

      <div className="min-w-0 flex-1">
        {/* wraps instead of truncating: the message list scrolls, and a floating tooltip inside a
            scrolling container gets clipped at its edge no matter which side it opens on */}
        <div className="text-[12px] font-medium text-ink">
          {label}
          {documentName && (
            <>
              {' '}
              <FileText size={12} className="inline-block -translate-y-px text-brand-500" />{' '}
              <span className="font-semibold">{documentName}</span>
            </>
          )}
          {databaseLabel && (
            <>
              {' '}
              <Database size={12} className="inline-block -translate-y-px text-brand-500" />{' '}
              <span className="font-semibold">{databaseLabel}</span>
            </>
          )}
        </div>
      </div>

      {documentId && <OpenDocumentButton documentId={documentId} documentName={documentName} />}
      {rows?.length > 0 && (
        <DownloadButton filenameHint={exportTitle || databaseLabel} columns={columns} rows={rows} />
      )}
    </div>
  );
}
