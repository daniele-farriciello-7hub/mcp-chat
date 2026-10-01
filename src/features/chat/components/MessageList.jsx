/**
 * The conversation: welcome screen when empty, then messages, activity rows and — under the latest
 * reply only — suggested next steps. Always follows the bottom.
 */
'use client';

import { useEffect, useRef } from 'react';
import ActivityRow from './ActivityRow';
import { AgentFace } from './AgentMark';
import MessageBubble from './MessageBubble';
import Suggestions from './Suggestions';
import Welcome from './Welcome';

function ThinkingRow() {
  return (
    <div className="flex items-center gap-2" style={{ animation: 'var(--animate-fade-in)' }}>
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-surface">
        <AgentFace size={17} working />
      </span>
      <span className="shimmer-text text-[13px] font-medium">Sto pensando…</span>
    </div>
  );
}

export default function MessageList({ messages, status, userName, onAsk, onNavigate }) {
  const bottomRef = useRef(null);

  useEffect(() => {
    bottomRef.current?.scrollIntoView({ behavior: 'smooth', block: 'end' });
  }, [messages, status]);

  if (messages.length === 0) {
    return (
      <div className="min-h-0 flex-1 overflow-y-auto">
        <Welcome userName={userName} onAsk={onAsk} />
      </div>
    );
  }

  const lastReplyIndex = messages.map(m => m.role).lastIndexOf('assistant');

  return (
    <div
      className="min-h-0 flex-1 overflow-y-auto px-4 py-4"
      aria-live="polite"
      aria-relevant="additions text"
      aria-label="Conversazione con l’assistente"
    >
      <div className="flex flex-col gap-3">
        {messages.map((message, i) => {
          if (message.role === 'activity') return <ActivityRow key={message.id} activity={message} />;

          const isLastReply = i === lastReplyIndex;
          const streaming = status === 'writing' && isLastReply && i === messages.length - 1;

          return (
            <div key={message.id} className="flex flex-col gap-2">
              <MessageBubble message={message} streaming={streaming} onNavigate={onNavigate} />
              {isLastReply && status === 'idle' && <Suggestions items={message.suggestions} onPick={onAsk} />}
            </div>
          );
        })}

        {status === 'thinking' && <ThinkingRow />}
        <div ref={bottomRef} />
      </div>
    </div>
  );
}
