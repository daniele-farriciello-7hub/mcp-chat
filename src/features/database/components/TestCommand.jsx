/**
 * "Prova ora" of a command without AI: runs it as this admin, with the saved settings, and says how many
 * rows came back and how long it took, or why it did not run (the server's own reason, in Italian).
 */
'use client';

import { useState } from 'react';
import { CircleAlert, CircleCheck, Loader2 } from 'lucide-react';
import Button from '@/shared/ui/Button';
import { testCommand } from '@/features/chat/commands/commandsAdminApi';

const seconds = ms => (ms / 1000).toLocaleString('it-IT', { maximumFractionDigits: 1 });

export default function TestCommand({ commandId, disabled }) {
  const [state, setState] = useState({ status: 'idle' });

  const run = async () => {
    setState({ status: 'running' });
    try {
      setState({ status: 'ok', ...(await testCommand(commandId)) });
    } catch (error) {
      setState({ status: 'failed', message: error?.message || 'Non è riuscita.' });
    }
  };

  return (
    <div className="flex flex-col gap-2">
      <div>
        <Button onClick={run} disabled={disabled || state.status === 'running'}>
          {state.status === 'running' ? <Loader2 size={14} className="animate-spin" /> : null} Prova ora
        </Button>
      </div>
      {state.status === 'ok' && (
        <p className="flex items-start gap-1.5 rounded-xl bg-ok-soft px-3 py-2 text-fs-12 text-ok">
          <CircleCheck size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span>
            Funziona: {state.rowCount.toLocaleString('it-IT')} {state.rowCount === 1 ? 'riga' : 'righe'} in{' '}
            {seconds(state.tookMs)} s.
          </span>
        </p>
      )}
      {state.status === 'failed' && (
        <p className="flex items-start gap-1.5 rounded-xl bg-danger-soft px-3 py-2 text-fs-12 text-danger">
          <CircleAlert size={14} className="mt-0.5 shrink-0" aria-hidden="true" />
          <span className="min-w-0 break-words">{state.message}</span>
        </p>
      )}
    </div>
  );
}
