/**
 * What the assistant is doing, said as it would say it to a person: never function names,
 * parameters or JSON. `outcome` is 'running' | 'done' | 'failed'.
 *
 * The one exception is `sql`: `query_database` attaches it only when the signed-in operator is an
 * admin (`tools/queryDatabase.js`), collapsed behind "Mostra query" so it never clutters the row
 * for everyone else who wouldn't get anything from raw SQL anyway.
 *
 * `columns`/`rows` ride along on a successful `query_database` or `export_excel` result (for every
 * operator, not just admins — it's the data they already received, not the query that produced it)
 * so the row can offer "Scarica come Excel" without asking the server again. `exportTitle` names
 * the file when the source isn't a database connection (`databaseLabel` covers that case already).
 */
'use client';

import { useState } from 'react';
import {
  Check,
  ChevronDown,
  CircleAlert,
  Database,
  Download,
  ExternalLink,
  FileText,
  Loader2,
  LoaderCircle
} from 'lucide-react';
import Tooltip from '@/shared/ui/Tooltip';
import { getDocumentUrlById } from '@/features/documents/documentStore';
import { downloadXlsx, slugify } from '@/shared/xlsx';

const BORDER = { running: 'border-brand-200', failed: 'border-warn/40', done: 'border-ok/30' };
const BADGE = {
  running: 'bg-brand-50 text-brand-500',
  failed: 'bg-warn-soft text-warn',
  done: 'bg-ok-soft text-ok'
};

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

/** "Mostra query" toggle, admin-only (`activity.sql` is only ever set for one). */
function QueryDisclosure({ sql }) {
  const [open, setOpen] = useState(false);
  return (
    <div className="mt-1">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex items-center gap-1 text-[10px] font-medium text-slate-soft transition hover:text-brand-600"
      >
        <ChevronDown size={10} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
        {open ? 'Nascondi query' : 'Mostra query'}
      </button>
      {open && (
        <pre className="mt-1 overflow-x-auto rounded-lg bg-surface px-2 py-1.5 text-[10px] leading-snug text-ink">
          <code>{sql}</code>
        </pre>
      )}
    </div>
  );
}

export default function ActivityRow({ activity }) {
  const {
    label,
    documentName,
    documentId,
    databaseLabel,
    exportTitle,
    detail,
    sql,
    columns,
    rows,
    outcome = 'running',
    message
  } = activity;

  return (
    <div
      className={`flex items-start gap-2.5 rounded-card border bg-white px-3 py-2 shadow-soft ${BORDER[outcome]}`}
      style={{ animation: 'var(--animate-fade-up)' }}
    >
      <span className={`flex h-6 w-6 shrink-0 items-center justify-center rounded-md ${BADGE[outcome]}`}>
        {outcome === 'running' && <LoaderCircle size={14} className="animate-spin" />}
        {outcome === 'done' && <Check size={14} />}
        {outcome === 'failed' && <CircleAlert size={14} />}
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
          {outcome === 'running' && <span className="font-normal text-slate-soft"> · in corso</span>}
        </div>
        {detail && outcome !== 'failed' && <div className="mt-0.5 text-[11px] text-slate-soft">{detail}</div>}
        {outcome === 'failed' && message && <div className="mt-0.5 text-[11px] text-ink">{message}</div>}
        {sql && <QueryDisclosure sql={sql} />}
      </div>

      {documentId && <OpenDocumentButton documentId={documentId} documentName={documentName} />}
      {rows?.length > 0 && (
        <DownloadButton filenameHint={exportTitle || databaseLabel} columns={columns} rows={rows} />
      )}
    </div>
  );
}
