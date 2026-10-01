/**
 * Tables read from one connection: which ones the assistant may see (`enabled` is the real
 * allowlist, not just a hint — see `functions/src/db/validateSelect.js`) and, for each, its card.
 * Everything starts disabled: a wide schema sent on every single chat message is real cost and real
 * exposure, so turning a table on is a deliberate choice, never the scan's default.
 */
'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Loader2, RefreshCw, Sparkles } from 'lucide-react';
import Button from '@/shared/ui/Button';
import ProgressBar from '@/features/documents/components/ProgressBar';
import { useTables } from '../useConnections';
import { useSchemaScan } from '../useSchemaScan';
import { useCardQueue } from '../useCardQueue';
import { enqueueForCardDrafting, isCardQueued } from '../cardQueue';
import { setTableEnabled } from '../connectionStore';
import TableCardEditor from './TableCardEditor';

// rough estimate only, to warn before the prompt gets too heavy — never shown as an exact figure
function estimateTokens(tables) {
  const chars = tables.reduce((sum, t) => {
    const cardChars = (t.card?.summary?.length || 0) + Object.values(t.card?.columns || {}).join('').length;
    return sum + t.name.length + t.columns.length * 20 + cardChars;
  }, 0);
  return Math.round(chars / 4);
}

function TableRow({ connectionId, allowSampling, table }) {
  const [expanded, setExpanded] = useState(false);
  const queued = isCardQueued(connectionId, table.id);
  const hasCard = Boolean(table.card?.summary);

  return (
    <div className={`rounded-lg border ${table.removed ? 'border-line opacity-50' : 'border-line'}`}>
      <div className="flex items-center gap-2 px-2.5 py-2">
        <input
          type="checkbox"
          checked={Boolean(table.enabled)}
          disabled={table.removed}
          onChange={e => setTableEnabled(connectionId, table.id, e.target.checked)}
          className="h-4 w-4 shrink-0 accent-brand-500"
          aria-label={`Attiva ${table.name}`}
        />
        <div className="min-w-0 flex-1">
          <div className="flex items-center gap-1.5 text-[12px] font-semibold text-ink">
            <span className="truncate">{table.name}</span>
            {table.kind === 'view' && (
              <span className="shrink-0 rounded-pill bg-line px-1.5 py-0.5 text-[9px] font-bold uppercase text-slate-soft">
                Vista
              </span>
            )}
            {table.removed && (
              <span className="shrink-0 text-[10px] font-normal text-danger">non esiste più</span>
            )}
          </div>
          <div className="text-[10px] text-slate-soft">
            {table.approxRows != null ? `~${table.approxRows.toLocaleString('it-IT')} righe · ` : ''}
            {table.columns.length} colonne
            {hasCard ? ' · scheda pronta' : queued ? ' · scrivo la scheda…' : ' · nessuna scheda'}
          </div>
        </div>
        <Button
          onClick={() => enqueueForCardDrafting(connectionId, allowSampling, [table])}
          disabled={queued || table.removed}
          tooltip="Fai scrivere la scheda a Gemini"
        >
          {queued ? <Loader2 size={13} className="animate-spin" /> : <Sparkles size={13} />}
        </Button>
        <Button onClick={() => setExpanded(v => !v)}>
          <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </Button>
      </div>
      {expanded && (
        <div className="px-2.5 pb-2.5">
          <TableCardEditor connectionId={connectionId} table={table} />
        </div>
      )}
    </div>
  );
}

export default function TableList({ connection }) {
  const { tables, loadError } = useTables(connection.id);
  const { scan, scanning, error: scanError } = useSchemaScan();
  const queue = useCardQueue();

  const visibleTables = useMemo(() => tables || [], [tables]);
  const enabledTables = useMemo(() => visibleTables.filter(t => t.enabled && !t.removed), [visibleTables]);
  const missingCards = useMemo(
    () => enabledTables.filter(t => !t.card?.summary && !isCardQueued(connection.id, t.id)),
    [enabledTables, connection.id]
  );

  return (
    <div className="mt-2 flex flex-col gap-2 border-t border-line pt-2.5">
      <div className="flex items-center justify-between gap-2">
        <Button onClick={() => scan(connection.id)} disabled={scanning}>
          {scanning ? <Loader2 size={13} className="animate-spin" /> : <RefreshCw size={13} />}
          {tables?.length ? 'Aggiorna schema' : 'Leggi le tabelle'}
        </Button>
        {missingCards.length > 0 && (
          <Button
            onClick={() => enqueueForCardDrafting(connection.id, connection.allowSampling, missingCards)}
          >
            <Sparkles size={13} /> Scrivi {missingCards.length} sched{missingCards.length === 1 ? 'a' : 'e'}{' '}
            mancanti
          </Button>
        )}
      </div>

      {scanError && <p className="text-[11px] text-danger">{scanError}</p>}
      {loadError && <p className="text-[11px] text-danger">{loadError}</p>}

      {queue && (
        <div className="rounded-lg bg-brand-50/40 px-2.5 py-2">
          <div className="flex items-center justify-between text-[11px] font-medium text-ink">
            <span>
              Scrivo le schede: {queue.done} di {queue.total}
            </span>
            {queue.failed > 0 && <span className="text-danger">{queue.failed} con errore</span>}
          </div>
          <div className="mt-1.5">
            <ProgressBar
              value={queue.done}
              total={queue.total}
              tone={queue.done < queue.total ? 'brand' : 'ok'}
            />
          </div>
        </div>
      )}

      {enabledTables.length > 0 && (
        <p className="text-[10px] text-slate-soft">
          {enabledTables.length} tabell{enabledTables.length === 1 ? 'a attiva' : 'e attive'} · circa{' '}
          {estimateTokens(enabledTables).toLocaleString('it-IT')} token aggiunti a ogni messaggio
        </p>
      )}

      {!tables && !scanning && (
        <p className="text-[11px] text-slate-soft">Nessuna tabella letta: prova prima la connessione.</p>
      )}

      <div className="flex flex-col gap-1.5">
        {visibleTables.map(table => (
          <TableRow
            key={table.id}
            connectionId={connection.id}
            allowSampling={connection.allowSampling}
            table={table}
          />
        ))}
      </div>
    </div>
  );
}
