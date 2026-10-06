/**
 * One conversation, read-only, for an admin: questions and answers as the operator saw them, plus
 * model, tokens and timing under each reply.
 */
'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft, Loader2 } from 'lucide-react';
import MessageBubble from '@/features/chat/components/MessageBubble';
import { loadTranscript } from '../historyApi';

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

  // the conversation as the operator saw it: tool steps are recorded but not shown here
  const visible = messages?.filter(m => m.role === 'user' || m.role === 'assistant');
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
        {visible?.map(m => (
          <div key={m.id} className="flex flex-col gap-1">
            <MessageBubble message={{ role: m.role, text: m.text }} />
            {m.role === 'assistant' && <ReplyMeta message={m} />}
          </div>
        ))}
      </div>
    </div>
  );
}
