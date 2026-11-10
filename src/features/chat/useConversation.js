'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import { getSettings } from '@/features/settings/settingsStore';
import {
  endConversation,
  recordChoice,
  recordQuestion,
  recordTurn,
  restoreConversation
} from '@/features/history/historyApi';
import { romeDay } from '@/features/history/romeDay';
import { streamAgentReply } from './agent';

let turnCounter = 0;
// activity ids are only unique within a page load (`t1:read-0-0`); stored, they must not collide
// with the same ids from an earlier load in the same conversation
const pageLoadId = Math.random().toString(36).slice(2, 8);
const newMessageId = () =>
  globalThis.crypto?.randomUUID?.() || `m${Date.now().toString(36)}${Math.random().toString(36).slice(2)}`;

// a slow or cold history function must not keep the input locked: past this the chat opens empty
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
 * written when a question is sent and when its reply ends, and read back on mount — always through
 * the `history` function (`historyApi.js`), never straight to Firestore. A new one starts only on
 * "Nuova conversazione" or when the day changes in Rome. Off, nothing is read or written. Saving
 * never delays the reply: the calls run alongside it and a failure only logs a warning.
 */
export function useConversation({ uid, context, isAdmin = false }) {
  const [messages, setMessages] = useState([]);
  const [status, setStatus] = useState(uid ? 'restoring' : 'idle');
  const conversationRef = useRef(null); // { id, day } of the stored conversation, if any
  const settingsRef = useRef(null);
  const sentRef = useRef(false); // a question went out before the restore came back
  // the latest turn's history write: a pick on its card can only be stored after the card is
  const turnWriteRef = useRef(Promise.resolve());

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
      const active = await restoreConversation().catch(warn('restore'));
      if (cancelled || sentRef.current || !active) return;
      conversationRef.current = { id: active.id, day: active.day };
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
      // resolves to the stored conversation ({id, day, isNew}) or null; the turn's write waits on it
      let stored = Promise.resolve(null);
      if (logging) {
        // the day changed since this conversation started: a new one begins, on screen and for the
        // model alike (the server closes the old one when it records this question)
        if (conversationRef.current && conversationRef.current.day !== romeDay() && messages.length) {
          history = [];
          setMessages(current => current.slice(current.findIndex(m => m.id === questionId)));
        }
        // behind the previous write (a picked file's exchange may still be on its way), so the question
        // is never stored ahead of what came before it
        stored = turnWriteRef.current
          .then(() =>
            recordQuestion({
              id: questionId,
              text,
              clientAt: questionAt,
              userName: context?.user?.name,
              page: context?.page,
              chatModel: settings.chatModel
            })
          )
          .then(conversation => {
            if (conversation) conversationRef.current = { id: conversation.id, day: conversation.day };
            return conversation;
          })
          .catch(error => {
            warn('saving the question')(error);
            return null;
          });
      }

      // tools name their activities by round and position (`read-0-0`), so every turn reuses the
      // same ids: without a per-turn prefix a later turn's end event rewrote an earlier card
      const turn = `t${pageLoadId}${++turnCounter}:`;
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
          turnWriteRef.current = stored
            .then(
              conversation =>
                conversation &&
                recordTurn({
                  conversationId: conversation.id,
                  activities: [...activities.values()],
                  reply: { id: replyId || newMessageId(), text: replyText, clientAt: Date.now() },
                  model,
                  usage,
                  durationMs,
                  firstTokenMs,
                  error
                })
            )
            .catch(warn('saving the reply'));
        }
      });
    },
    [status, uid, context, isAdmin, messages, append, updateLastReply]
  );

  /**
   * The operator picked an answer on an `ask_options` card: remembered on that activity, in state and in
   * the stored conversation, so the card stays answered after a reload. The card then sends the answer
   * with `send`. (A file picked on an `offer_files` card goes through `pickFile` instead.)
   */
  const selectOption = useCallback(
    (activityId, selected) => {
      setMessages(current => current.map(m => (m.id === activityId ? { ...m, selected } : m)));
      const conversation = conversationRef.current;
      if (uid && conversation && settingsRef.current?.historyEnabled) {
        turnWriteRef.current
          .then(() => recordChoice({ conversationId: conversation.id, activityId, selected }))
          .catch(warn('saving the choice'));
      }
    },
    [uid]
  );

  /**
   * The operator picked a file on an `offer_files` card. No round trip through the model: the app plays
   * the rest of the exchange itself, as a normal conversation — the operator's pick ("Ho scelto …"), then
   * the answer, which is what `share_file` would have produced (its card, `kind: 'file'`) and a short
   * line. All three go to the end of the conversation, under the model's own line.
   *
   * It is stored as one ordinary turn (`recordQuestion` for the pick, `recordTurn` for the card and the
   * line), so a reload brings the bubbles and the card back in order and the model sees the pair in its
   * history, in strict user / model alternation. The `selected` mark on the choice card (`recordChoice`)
   * is written first: that card's own turn must be stored before either, so everything waits on
   * `turnWriteRef`, and the next write waits on this one.
   */
  const pickFile = useCallback(
    (activityId, { documentId, documentName }) => {
      // the tiles are already off while a reply is being written or after a pick: this only keeps a
      // stray call from adding a second exchange
      if (status !== 'idle') return;
      if (messages.find(m => m.id === activityId)?.selected) return;

      const at = Date.now();
      const name = documentName?.trim();
      const pickText = name ? `Ho scelto ${name}` : 'Ho scelto questo file';
      const replyText = 'Ecco il file.';
      const turn = `t${pageLoadId}${++turnCounter}:`;
      const pick = { id: newMessageId(), role: 'user', text: pickText };
      const sharedFile = {
        id: `${turn}pick-file`,
        role: 'activity',
        kind: 'file',
        outcome: 'done',
        label: 'File pronto',
        documentId,
        documentName: name || ''
      };
      const reply = { id: newMessageId(), role: 'assistant', text: replyText };

      const logging = Boolean(uid && settingsRef.current?.historyEnabled);
      const conversation = conversationRef.current;
      // same as `send`: the day changed since this conversation started, so the pick opens a new one
      // (the server closes the old one when it records it), on screen and for the model alike
      const startsNewDay = logging && conversation && conversation.day !== romeDay();

      setMessages(current => [
        ...(startsNewDay ? [] : current.map(m => (m.id === activityId ? { ...m, selected: documentId } : m))),
        pick,
        sharedFile,
        reply
      ]);

      if (!logging) return;
      turnWriteRef.current = turnWriteRef.current
        .then(async () => {
          if (conversation) {
            await recordChoice({ conversationId: conversation.id, activityId, selected: documentId }).catch(
              warn('saving the choice')
            );
          }
          const stored = await recordQuestion({
            id: pick.id,
            text: pickText,
            clientAt: at,
            userName: context?.user?.name,
            page: context?.page,
            chatModel: settingsRef.current?.chatModel
          });
          if (!stored) return;
          conversationRef.current = { id: stored.id, day: stored.day };
          // same `clientAt` as the pick: the stored sequence numbers (pick 0, card 1, line 2) keep the order
          await recordTurn({
            conversationId: stored.id,
            activities: [sharedFile],
            reply: { id: reply.id, text: replyText, clientAt: at }
          });
        })
        .catch(warn('saving the picked file'));
    },
    [status, uid, context, messages]
  );

  const reset = useCallback(() => {
    conversationRef.current = null;
    // the server closes whichever conversation of this user is open, known here or not — after any write
    // still pending: a picked file's exchange is recorded through the open conversation, and would
    // otherwise start a new one right after this closes it
    if (uid && settingsRef.current?.historyEnabled) {
      turnWriteRef.current = turnWriteRef.current
        .then(() => endConversation())
        .catch(warn('closing the conversation'));
    }
    setMessages([]);
    setStatus('idle');
  }, [uid]);

  return { messages, status, send, reset, selectOption, pickFile };
}
