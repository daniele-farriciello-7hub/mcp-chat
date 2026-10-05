/**
 * The browser side of the conversation history: every read and write goes through the `history`
 * Cloud Function (`functions/src/http/historyEndpoint.js`), never straight to Firestore. The server
 * takes the user from the verified token and checks admin rights itself, so an operator can only
 * reach their own conversations.
 *
 * Firestore timestamps come back as epoch milliseconds; `withTimestamps` wraps them so the
 * components can keep calling `.toDate()` / `.toMillis()`.
 */
'use client';

import { callFunction } from '@/shared/firebase/functions';

const timestamp = ms => (ms == null ? null : { toMillis: () => ms, toDate: () => new Date(ms) });
const withTimestamps = c => ({
  ...c,
  startedAt: timestamp(c.startedAt),
  lastMessageAt: timestamp(c.lastMessageAt),
  endedAt: timestamp(c.endedAt)
});

/** Stored message → the shape `useConversation` keeps in state. */
function toUiMessage(message) {
  if (message.role === 'activity') return { id: message.id, role: 'activity', ...message.activity };
  return { id: message.id, role: message.role, text: message.text || '' };
}

// ── operator ────────────────────────────────────────────────────────────────

/** Today's open conversation with its messages in chat shape, or null. */
export async function restoreConversation() {
  const { conversation } = await callFunction('history', 'restore');
  if (!conversation) return null;
  return { id: conversation.id, day: conversation.day, messages: conversation.messages.map(toUiMessage) };
}

/** Records the question; resolves to the conversation it landed in (`{id, day, isNew}`), or null when off. */
export async function recordQuestion(question) {
  const result = await callFunction('history', 'question', question);
  return result.disabled ? null : result;
}

/** Records the end of a turn: tool activity (allow-listed again on the server), reply, usage, timing. */
export const recordTurn = turn => callFunction('history', 'turn', turn);

/** "Nuova conversazione": the server closes whatever conversation of the caller is open. */
export const endConversation = () => callFunction('history', 'reset');

// ── admin ───────────────────────────────────────────────────────────────────

/** A page of conversations started in the last `rangeDays`; pass `afterStartedAt` for the next one. */
export async function listConversations(rangeDays, afterStartedAt = null) {
  const page = await callFunction('history', 'list', { rangeDays, afterStartedAt });
  return { conversations: page.conversations.map(withTimestamps), nextAfter: page.nextAfter };
}

/** One conversation's full transcript, oldest first. */
export async function loadTranscript(conversationId) {
  const { messages } = await callFunction('history', 'transcript', { conversationId });
  return messages;
}
