'use client';

import { useCallback, useState } from 'react';
import { streamAgentReply } from './agent';

let messageCounter = 0;
let turnCounter = 0;
const newMessageId = () => `m${++messageCounter}`;

/**
 * Conversation state. `status` is always visible in the UI: 'idle' (waiting), 'working' (doing
 * something, shown row by row), 'thinking' (understood, no words yet), 'writing' (streaming).
 */
export function useConversation({ context, isAdmin = false }) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState('idle');

  const append = useCallback(message => {
    setMessages(current => [...current, { id: newMessageId(), ...message }]);
  }, []);

  const updateLastReply = useCallback(change => {
    setMessages(current => {
      const copy = [...current];
      for (let i = copy.length - 1; i >= 0; i--) {
        if (copy[i].role === 'assistant') {
          copy[i] = change(copy[i]);
          break;
        }
      }
      return copy;
    });
  }, []);

  const send = useCallback(
    async text => {
      if (status !== 'idle') return;
      append({ role: 'user', text });
      setStatus('thinking');
      // tools name their activities by round and position (`read-0-0`), so every turn reuses the
      // same ids: without a per-turn prefix a later turn's end event rewrote an earlier card
      const turn = `t${++turnCounter}:`;

      await streamAgentReply({
        text,
        context,
        history: messages,
        isAdmin,
        // forwarded as-is: every tool's activity payload (label, detail, documentName,
        // databaseLabel, sql for admins…) reaches ActivityRow without listing each field here,
        // so a new field a tool starts sending doesn't need a matching change in this file
        onActivityStart: (rawId, payload) => {
          const id = turn + rawId;
          setStatus('working');
          setMessages(current => {
            // a tool whose result can't have changed since the last time it ran in this exchange
            // (same document, same table, the identical query) sets `dedupeKey` — skip a second,
            // identical card for it. The call still runs and the model still gets the result; this
            // only keeps the activity feed from repeating itself.
            const repeated =
              payload.dedupeKey &&
              current.some(
                m => m.role === 'activity' && m.dedupeKey === payload.dedupeKey && m.outcome === 'done'
              );
            if (repeated) return current;
            return [...current, { id, role: 'activity', ...payload, outcome: 'running' }];
          });
        },
        // the label changes tense when the work ends ("Sto leggendo" -> "Letto"); a field a tool
        // doesn't set on end (e.g. label, sql) simply keeps its value from the start payload
        onActivityEnd: (rawId, payload) => {
          const id = turn + rawId;
          setMessages(current => current.map(m => (m.id === id ? { ...m, ...payload } : m)));
          setStatus('thinking');
        },
        onReplyStart: () => {
          setStatus('writing');
          append({ role: 'assistant', text: '' });
        },
        onChunk: chunk => updateLastReply(m => ({ ...m, text: m.text + chunk })),
        onDone: ({ card, suggestions } = {}) => {
          if (card || suggestions) updateLastReply(m => ({ ...m, card, suggestions }));
          setStatus('idle');
        }
      });
    },
    [status, context, isAdmin, messages, append, updateLastReply]
  );

  const reset = useCallback(() => {
    setMessages([]);
    setStatus('idle');
  }, []);

  return { messages, status, send, reset };
}
