/**
 * One conversation, read-only, for an admin: the messages as the operator saw them, plus what is
 * hidden from operators — every tool step (failed ones included), the SQL when it was recorded, the
 * model, tokens and timings of each reply.
 */
'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import MessageBubble from '@/features/chat/components/MessageBubble';
import { loadTranscript } from '../conversationStore';

const OUTCOME = { done: 'text-ok', failed: 'text-danger', running: 'text-warn' };

function ActivityLine({ activity }) {
  const { label, documentName, databaseLabel, exportTitle, outcome, sql } = activity;
  const target = documentName || databaseLabel || exportTitle;
  return (
    <div className="ml-9 rounded-lg bg-surface px-2.5 py-1.5 text-[11px] text-slate-soft">
      <span className={`font-semibold ${OUTCOME[outcome] || ''}`}>●</span> {label}
      {target && <span className="font-semibold text-ink"> {target}</span>}
      {outcome === 'failed' && <span className="text-danger"> · non riuscito</span>}
      {sql && (
        <details className="mt-1">
          <summary className="cursor-pointer text-[10px]">Query</summary>
          <pre className="mt-1 overflow-x-auto whitespace-pre-wrap text-[10px] text-ink">{sql}</pre>
        </details>
      )}
    </div>
  );
}

function ReplyMeta({ message }) {
  const parts = [
    message.model,
    message.usage &&
      `${(message.usage.input + message.usage.output + message.usage.thinking).toLocaleString('it-IT')} token`,
    message.durationMs != null && `${(message.durationMs / 1000).toFixed(1)} s`,
    message.error && 'errore'
  ].filter(Boolean);
  return parts.length ? <div className="ml-9 text-[10px] text-slate-soft">{parts.join(' · ')}</div> : null;
}

export default function ConversationDetail({ conversation, onBack }) {
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTranscript(conversation.id).then(setMessages).catch(setError);
  }, [conversation.id]);

  const started = conversation.startedAt?.toDate?.();
  return (
    <div className="flex flex-col gap-4">
      <button
        type="button"
        onClick={onBack}
        className="flex w-fit items-center gap-1 text-[12px] font-semibold text-brand-600 hover:underline"
      >
        <ArrowLeft size={14} /> Torna allo storico
      </button>
      <div>
        <div className="text-[14px] font-bold text-ink">{conversation.userName || conversation.email}</div>
        <div className="text-[11px] text-slate-soft">
          {started?.toLocaleString('it-IT', { dateStyle: 'medium', timeStyle: 'short' })}
          {conversation.page && ` · pagina ${conversation.page}`}
          {` · ${conversation.userMessages || 0} domande`}
        </div>
      </div>

      {error && <p className="text-[12px] text-danger">Non riesco a leggere questa conversazione.</p>}
      {!messages && !error && <Loader2 size={16} className="animate-spin text-brand-500" />}
      {messages?.length === 0 && <p className="text-[12px] text-slate-soft">Nessun messaggio salvato.</p>}
      <div className="flex flex-col gap-3">
        {messages?.map(m =>
          m.role === 'activity' ? (
            <ActivityLine key={m.id} activity={m.activity || {}} />
          ) : (
            <div key={m.id} className="flex flex-col gap-1">
              <MessageBubble message={{ role: m.role, text: m.text }} />
              {m.role === 'assistant' && <ReplyMeta message={m} />}
            </div>
          )
        )}
      </div>
    </div>
  );
}
