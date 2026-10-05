'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSettings } from '@/features/settings/settingsStore';
import {
  endConversation,
  ensureConversation,
  loadActive,
  recordTurn,
  recordUserMessage
} from '@/features/history/conversationStore';
import { streamAgentReply } from './agent';

let turnCounter = 0;
const newMessageId = () =>
  globalThis.crypto?.randomUUID?.() || `m${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

// a slow or failing Firestore must not keep the input locked: past this the chat opens empty
const RESTORE_TIMEOUT_MS = 3000;

const warn = what => error => console.warn(`[history] ${what} failed:`, error?.message || error);

/**
 * A restored conversation whose last question never got a reply (closed tab, crash): the question
 * stays visible with a note, but is kept out of what the model sees — a history ending on two
 * questions in a row is not something the model should have to make sense of.
 */
function markInterrupted(messages) {
  const last = messages.at(-1);
  if (last?.role !== 'user') return messages;
  return [
    ...messages.slice(0, -1),
    { ...last, unanswered: true },
    {
      id: newMessageId(),
      role: 'notice',
      text: 'Risposta interrotta: questa domanda è rimasta senza risposta.'
    }
  ];
}

/**
 * Conversation state. `status` is always visible in the UI: 'restoring' (reading back today's
 * conversation), 'idle' (waiting), 'working' (a tool is running), 'thinking' (understood, no words
 * yet), 'writing' (streaming).
 *
 * With `historyEnabled` on (settings, `features/history`), the conversation survives a reload: it is
 * written when a question is sent and when its reply ends, and read back on mount. A new one starts
 * only on "Nuova conversazione" or when the day changes in Rome. Off, nothing is read or written.
 */
export function useConversation({ uid, context, isAdmin = false }) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState(uid ? 'restoring' : 'idle');
  const conversationRef = useRef(null); // { id, expiresAt } of the stored conversation, if any
  const settingsRef = useRef(null);
  const sentRef = useRef(false); // a question went out before the restore came back

  useEffect(() => {
    if (!uid) return undefined;
    let cancelled = false;
    const timeout = setTimeout(
      () => !cancelled && setStatus(s => (s === 'restoring' ? 'idle' : s)),
      RESTORE_TIMEOUT_MS
    );

    (async () => {
      const settings = await getSettings();
      settingsRef.current = settings;
      if (!settings.historyEnabled) return;
      const active = await loadActive(uid).catch(warn('restore'));
      if (cancelled || sentRef.current || !active) return;
      conversationRef.current = { id: active.id, expiresAt: active.expiresAt };
      setMessages(markInterrupted(active.messages));
    })().finally(() => {
      clearTimeout(timeout);
      if (!cancelled) setStatus(s => (s === 'restoring' ? 'idle' : s));
    });

    return () => {
      cancelled = true;
      clearTimeout(timeout);
    };
  }, [uid]);

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

  /**
   * The stored conversation this question belongs to. If it is not the one on screen (the day
   * changed, or another tab started a new one), the screen starts over too: what the model sees
   * must match what the operator sees.
   */
  const resolveConversation = useCallback(
    async settings => {
      try {
        const conversation = await ensureConversation(uid, {
          email: context?.user?.email,
          userName: context?.user?.name,
          chatModel: settings.chatModel,
          page: context?.page,
          retentionDays: settings.historyRetentionDays
        });
        const changed = conversationRef.current && conversationRef.current.id !== conversation.id;
        conversationRef.current = conversation;
        return { conversation, startedOver: changed || conversation.isNew };
      } catch (error) {
        warn('opening the conversation')(error);
        return { conversation: null, startedOver: false };
      }
    },
    [uid, context]
  );

  const send = useCallback(
    async text => {
      if (status !== 'idle') return;
      sentRef.current = true;
      const questionId = newMessageId();
      const questionAt = Date.now();
      append({ id: questionId, role: 'user', text });
      setStatus('thinking');

      const settings = settingsRef.current || (await getSettings());
      const logging = Boolean(uid && settings.historyEnabled);

      let history = messages;
      let conversation = null;
      if (logging) {
        const resolved = await resolveConversation(settings);
        conversation = resolved.conversation;
        if (resolved.startedOver && messages.length) {
          // a new conversation: keep only the question just asked, on screen and for the model
          history = [];
          setMessages(current => current.slice(current.findIndex(m => m.id === questionId)));
        }
        if (conversation) {
          recordUserMessage(conversation, {
            id: questionId,
            text,
            clientAt: questionAt,
            isFirst: conversation.isNew
          }).catch(warn('saving the question'));
        }
      }

      // tools name their activities by round and position (`read-0-0`), so every turn reuses the
      // same ids: without a per-turn prefix a later turn's end event rewrote an earlier card
      const turn = `t${++turnCounter}:`;
      // what this turn did, kept here for the history write at the end: React state is not
      // readable from inside these callbacks without going stale
      const activities = new Map();
      let replyId = null;
      let replyText = '';

      await streamAgentReply({
        text,
        context,
        history,
        isAdmin,
        // forwarded as-is: every tool's activity payload (label, detail, documentName,
        // databaseLabel, sql for admins…) reaches ActivityRow without listing each field here,
        // so a new field a tool starts sending doesn't need a matching change in this file
        onActivityStart: (rawId, payload) => {
          const id = turn + rawId;
          activities.set(id, { id, ...payload, outcome: 'running' });
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
          if (activities.has(id)) activities.set(id, { ...activities.get(id), ...payload });
          setMessages(current => current.map(m => (m.id === id ? { ...m, ...payload } : m)));
          setStatus('thinking');
        },
        onReplyStart: () => {
          setStatus('writing');
          replyId = newMessageId();
          append({ id: replyId, role: 'assistant', text: '' });
        },
        onChunk: chunk => {
          replyText += chunk;
          updateLastReply(m => ({ ...m, text: m.text + chunk }));
        },
        onDone: ({ card, suggestions, usage, model, durationMs, firstTokenMs, error } = {}) => {
          if (card || suggestions) updateLastReply(m => ({ ...m, card, suggestions }));
          setStatus('idle');
          if (conversation) {
            recordTurn(conversation, {
              activities: [...activities.values()],
              reply: { id: replyId || newMessageId(), text: replyText, clientAt: Date.now() },
              model,
              usage,
              durationMs,
              firstTokenMs,
              error
            }).catch(warn('saving the reply'));
          }
        }
      });
    },
    [status, uid, context, isAdmin, messages, append, updateLastReply, resolveConversation]
  );

  const reset = useCallback(() => {
    const conversation = conversationRef.current;
    conversationRef.current = null;
    // without a local id (restore timed out, say) the store closes whatever the pointer says is open
    if (uid && settingsRef.current?.historyEnabled) {
      endConversation(uid, conversation?.id).catch(warn('closing the conversation'));
    }
    setMessages([]);
    setStatus('idle');
  }, [uid]);

  return { messages, status, send, reset };
}
