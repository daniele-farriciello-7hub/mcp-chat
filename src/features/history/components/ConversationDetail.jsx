/**
 * One conversation, read-only, for an admin: questions and answers as the operator saw them, plus
 * model, tokens and timing under each reply. The tool cards the chat leaves in the conversation (a
 * clarification, a shared file, a chart, a source) come back in order, read-only: nothing can be picked
 * or asked from here.
 */
'use client';

import { useEffect, useState } from 'react';
import { ArrowLeft } from 'lucide-react';
import MessageBubble from '@/features/chat/components/MessageBubble';
import ActivityRow from '@/features/chat/components/ActivityRow';
import ChoiceCard from '@/features/chat/components/ChoiceCard';
import FileChoiceCard from '@/features/chat/components/FileChoiceCard';
import SharedFileCard from '@/features/chat/components/SharedFileCard';
import ChatChart from '@/features/charts/ChatChart';
import { loadTranscript, toUiMessage } from '../historyApi';
import { SkeletonConversation } from '@/shared/ui/Skeleton';

function ReplyMeta({ message }) {
  const parts = [
    message.model,
    // a rate limit made the turn leave the model the operator had chosen
    message.fallbackFrom && `riserva al posto di ${message.fallbackFrom}`,
    message.usage &&
      `${(message.usage.input + message.usage.output + message.usage.thinking).toLocaleString('it-IT')} token`,
    message.durationMs != null && `${(message.durationMs / 1000).toFixed(1)} s`,
    message.error && 'errore'
  ].filter(Boolean);
  const detail = message.error ? message.errorDetail : null;
  if (!parts.length && !detail) return null;
  return (
    <div className="ml-9 flex flex-col gap-0.5 text-[10px]">
      {parts.length > 0 && <div className="text-slate-soft">{parts.join(' · ')}</div>}
      {detail && (
        <div className="line-clamp-3 break-words text-danger" title={detail}>
          {detail}
        </div>
      )}
    </div>
  );
}

const noop = () => {};

/**
 * A failed database call (`query_database`, `export_database`) as the operator never saw it: the chat
 * hides it, but the admin needs the reason and the query to tell why it failed. Same look as `ReplyMeta`'s
 * error line (small, `text-danger`), the SQL folded away in a monospace block. A failure stored with
 * neither (before these fields existed) has nothing to add and stays hidden, as before.
 */
function FailedCall({ activity }) {
  const { label, databaseLabel, errorDetail, sql } = activity;
  return (
    <div className="flex flex-col gap-0.5 text-[10px]">
      <div className="text-slate-soft">{[label, databaseLabel].filter(Boolean).join(' · ')}</div>
      {errorDetail && (
        <div className="line-clamp-3 break-words text-danger" title={errorDetail}>
          {errorDetail}
        </div>
      )}
      {sql && (
        <details>
          <summary className="w-fit cursor-pointer select-none text-slate-soft hover:text-brand-600">
            SQL
          </summary>
          <pre className="mt-1 max-h-48 overflow-auto whitespace-pre-wrap break-words rounded-lg bg-surface px-2 py-1.5 font-mono text-[10px] text-ink">
            {sql}
          </pre>
        </details>
      )}
    </div>
  );
}

/**
 * The card the live chat (`MessageList`) draws for a stored tool step, or null when it shows none. Same
 * picks as there, with three differences: a history view is always decided, so clarification cards are
 * `answered` (the stored `selected` marks the pick) with every handler a no-op; only what is stored can
 * be drawn (no rows, no `options`: the server never keeps those); and a failed database call is shown,
 * with its reason and SQL, which the chat never draws.
 */
function activityCard(activity) {
  if (activity.outcome === 'failed' && (activity.errorDetail || activity.sql)) {
    return <FailedCall activity={activity} />;
  }
  if (activity.outcome !== 'done') return null;
  if (activity.chart) return <ChatChart chart={activity.chart} />;
  if (activity.kind === 'choice' && activity.choices?.length) {
    return <ChoiceCard activity={activity} answered onSelect={noop} onAsk={noop} onOther={noop} />;
  }
  if (activity.kind === 'file_choice' && activity.files?.length) {
    return <FileChoiceCard activity={activity} answered onPickFile={noop} onAsk={noop} />;
  }
  if (activity.documentId && activity.kind === 'file') return <SharedFileCard activity={activity} />;
  // a source worth opening or a data export to download, as in the chat
  if (activity.documentId || activity.exportQuery) return <ActivityRow activity={activity} />;
  return null;
}

export default function ConversationDetail({ conversation, onBack }) {
  const [messages, setMessages] = useState(null);
  const [error, setError] = useState(null);

  useEffect(() => {
    loadTranscript(conversation.id).then(setMessages).catch(setError);
  }, [conversation.id]);

  // the conversation as the operator saw it: their questions, the replies and the tool cards that stayed
  // in view; the tool steps the chat hides (running, nothing to open) stay hidden here too, except the
  // failed database calls, which an admin reads here with their reason
  const visible = messages?.flatMap(m => {
    if (m.role === 'activity') {
      const card = activityCard(toUiMessage(m));
      return card ? [{ m, card }] : [];
    }
    return m.role === 'user' || m.role === 'assistant' ? [{ m }] : [];
  });
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
      {!messages && !error && <SkeletonConversation />}
      {messages?.length === 0 && <p className="text-[12px] text-slate-soft">Nessun messaggio salvato.</p>}
      <div className="flex flex-col gap-3">
        {visible?.map(({ m, card }) =>
          card ? (
            // the cards are drawn for the chat panel's width: keep them at it instead of stretching
            <div key={m.id} className="w-full max-w-md">
              {card}
            </div>
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
