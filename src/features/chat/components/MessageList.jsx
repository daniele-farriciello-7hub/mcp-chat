/**
 * The conversation: welcome screen when empty, then messages, activity rows and — under the latest
 * reply only — suggested next steps. Always follows the bottom.
 *
 * While the assistant works, the tools' own cards are not shown: one `WorkingIndicator` stands in for
 * all of them. Once the turn ends only the useful ones remain (a file to download, a source to open),
 * once per source — failed or repeated calls are the model's business, not the operator's.
 */
'use client';

import { useEffect, useRef } from 'react';
import ActivityRow from './ActivityRow';
import MessageBubble from './MessageBubble';
import Suggestions from './Suggestions';
import Welcome from './Welcome';
import WorkingIndicator from './WorkingIndicator';

export default function MessageList({ messages, status, userName, onAsk, onNavigate }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  // reading back today's conversation: an empty pane for an instant beats a welcome screen that
  // flashes and is replaced by the restored messages
  if (messages.length === 0 && status === 'restoring') return <div className="min-h-0 flex-1" />;

  if (messages.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Welcome userName={userName} onAsk={onAsk} />
      </div>
    );
  }

  const lastReplyIndex = messages.map(m => m.role).lastIndexOf('assistant');
  const lastUserIndex = messages.map(m => m.role).lastIndexOf('user');
  const busy = status === 'thinking' || status === 'working' || status === 'writing';
  const currentActivities = messages.slice(lastUserIndex + 1).filter(m => m.role === 'activity');
  const runningKind = currentActivities.findLast(m => m.outcome === 'running')?.kind;
  const doneKinds = currentActivities.filter(m => m.outcome === 'done' && m.kind).map(m => m.kind);
  const shownSources = new Set();

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      aria-live="polite"
      aria-relevant="additions text"
      aria-label="Conversazione con l’assistente"
    >
      <div className="flex flex-col gap-3">
        {messages.map((message, i) => {
          if (message.role === 'activity') {
            const useful = message.outcome === 'done' && (message.documentId || message.rows?.length);
            if (!useful || (busy && i > lastUserIndex)) return null;
            const source = message.dedupeKey || message.id;
            if (shownSources.has(source)) return null;
            shownSources.add(source);
            return <ActivityRow key={message.id} activity={message} />;
          }

          if (message.role === 'notice') {
            return (
              <p key={message.id} className="text-center text-[11px] italic text-slate-soft">
                {message.text}
              </p>
            );
          }

          const isLastReply = i === lastReplyIndex;
          const streaming = status === 'writing' && isLastReply && i === messages.length - 1;

          return (
            <div key={message.id} className="flex flex-col gap-2">
              <MessageBubble message={message} streaming={streaming} onNavigate={onNavigate} />
              {isLastReply && status === 'idle' && <Suggestions items={message.suggestions} onPick={onAsk} />}
            </div>
          );
        })}

        {/* once the reply streams it is on screen: a second indicator under it only flickers */}
        {busy && status !== 'writing' && <WorkingIndicator runningKind={runningKind} doneKinds={doneKinds} />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
