'use client';

import { useState } from 'react';
import { ChevronDown, Loader2, Pencil, Trash2 } from 'lucide-react';
import Button from '@/shared/ui/Button';
import Switch from '@/shared/ui/Switch';
import { deleteConnection, setConnectionEnabled } from '../connectionStore';
import ConnectionForm from './ConnectionForm';
import TableList from './TableList';

const stopEvent = event => {
  event.preventDefault();
  event.stopPropagation();
};

function DeleteButton({ connection }) {
  const [confirming, setConfirming] = useState(false);
  const [deleting, setDeleting] = useState(false);

  if (deleting) return <Loader2 size={14} className="mx-1.5 animate-spin text-slate-soft" />;

  if (confirming) {
    return (
      <span className="flex shrink-0 items-center gap-1" onClick={stopEvent}>
        <button
          type="button"
          onClick={async event => {
            stopEvent(event);
            setDeleting(true);
            try {
              await deleteConnection(connection.id);
            } catch (error) {
              console.error('[database] delete connection failed:', error);
              setDeleting(false);
              setConfirming(false);
            }
          }}
          className="rounded-lg bg-danger px-2 py-1 text-[11px] font-semibold text-white transition hover:opacity-90"
        >
          Elimina
        </button>
        <button
          type="button"
          onClick={event => {
            stopEvent(event);
            setConfirming(false);
          }}
          className="rounded-lg px-1.5 py-1 text-[11px] text-slate-soft transition hover:text-ink"
        >
          Annulla
        </button>
      </span>
    );
  }

  return (
    <Button
      onClick={event => {
        stopEvent(event);
        setConfirming(true);
      }}
      tooltip="Elimina questa connessione"
    >
      <Trash2 size={13} />
    </Button>
  );
}

export default function ConnectionRow({ connection }) {
  const [editing, setEditing] = useState(false);
  const [expanded, setExpanded] = useState(false);

  if (editing) {
    return (
      <ConnectionForm
        connection={connection}
        onSaved={() => setEditing(false)}
        onCancel={() => setEditing(false)}
      />
    );
  }

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-center gap-2">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink">{connection.label}</div>
          <div className="truncate text-[11px] text-slate-soft">
            {connection.user}@{connection.host}:{connection.port} · {connection.database}
          </div>
        </div>
        <Button onClick={() => setEditing(true)} tooltip="Modifica">
          <Pencil size={13} />
        </Button>
        <DeleteButton connection={connection} />
        <Button onClick={() => setExpanded(v => !v)}>
          Tabelle <ChevronDown size={13} className={`transition-transform ${expanded ? 'rotate-180' : ''}`} />
        </Button>
      </div>

      <div className="mt-2">
        <Switch
          checked={Boolean(connection.enabled)}
          onChange={value => setConnectionEnabled(connection.id, value)}
          label="Visibile all'assistente"
          description="Con questa attiva, l'assistente vede le tabelle che hai scelto qui sotto e può interrogarle."
        />
      </div>

      {expanded && <TableList connection={connection} />}
    </div>
  );
}
