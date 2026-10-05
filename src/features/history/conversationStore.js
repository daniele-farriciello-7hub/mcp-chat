/**
 * Reads and writes the conversation history (layout in `schema.js`). Every write here is best effort:
 * history must never break the chat, so callers `.catch` and only warn.
 *
 * A conversation lasts until "Nuova conversazione" or until the day changes in Rome. The pointer
 * `chatUsers/{uid}` says which one is open; it is moved inside a transaction, so two tabs (the
 * 7hub iframe and the standalone page) asking at once end up in the same conversation, not two.
 *
 * Writes happen twice per turn — when the question is sent and when the reply ends — never per
 * streamed chunk. Only an allow-list of activity fields is stored: never the rows or columns of a
 * query or export, which are customer data the history does not need.
 */
'use client';

import {
  Timestamp,
  arrayUnion,
  getDoc,
  doc,
  getDocs,
  increment,
  limitToLast,
  orderBy,
  query,
  runTransaction,
  serverTimestamp,
  writeBatch
} from 'firebase/firestore';
import { db } from '@/shared/firebase/app';
import {
  END_REASON,
  conversationRef,
  conversationsCollection,
  messageRef,
  messagesCollection,
  userPointerRef
} from './schema';
import { romeDay } from './romeDay';

const RESTORE_LIMIT = 200;
const MAX_TEXT_CHARS = 200_000;
const MAX_SQL_CHARS = 10_000;
const FIRST_QUESTION_CHARS = 140;
const DAY_MS = 24 * 60 * 60 * 1000;

const ACTIVITY_FIELDS = [
  'kind',
  'label',
  'outcome',
  'documentName',
  'documentId',
  'databaseLabel',
  'exportTitle'
];

/** Only the fields worth keeping, never `rows`/`columns`; SQL only when the tool attached it (admins). */
export function storableActivity(activity) {
  const stored = {};
  for (const field of ACTIVITY_FIELDS) {
    if (activity[field] != null) stored[field] = activity[field];
  }
  if (typeof activity.sql === 'string') stored.sql = activity.sql.slice(0, MAX_SQL_CHARS);
  return stored;
}

const expiryFrom = retentionDays => Timestamp.fromMillis(Date.now() + Math.max(1, retentionDays) * DAY_MS);

/** Stored message → the shape `useConversation` keeps in state. */
function toUiMessage(id, data) {
  if (data.role === 'activity') return { id, role: 'activity', ...data.activity };
  return { id, role: data.role, text: data.text || '' };
}

/**
 * The open conversation of today, with its last messages, or null.
 * @returns {Promise<{id: string, expiresAt: Timestamp, messages: object[]} | null>}
 */
export async function loadActive(uid) {
  const pointer = await getDoc(userPointerRef(uid));
  const { activeConversationId, activeDay } = pointer.exists() ? pointer.data() : {};
  if (!activeConversationId || activeDay !== romeDay()) return null;

  const conversation = await getDoc(conversationRef(activeConversationId));
  if (!conversation.exists() || conversation.data().endedAt) return null;

  const snapshot = await getDocs(
    query(messagesCollection(activeConversationId), orderBy('clientAt'), limitToLast(RESTORE_LIMIT))
  );
  // same millisecond from one client is rare but possible: `seq` breaks the tie
  const messages = snapshot.docs
    .map(d => ({ id: d.id, data: d.data() }))
    .sort((a, b) => a.data.clientAt - b.data.clientAt || (a.data.seq || 0) - (b.data.seq || 0))
    .map(({ id, data }) => toUiMessage(id, data));
  return { id: activeConversationId, expiresAt: conversation.data().expiresAt, messages };
}

/**
 * The conversation the next question belongs to: today's open one, or a new one. A conversation of
 * an earlier day still open is closed here with reason "day".
 * @returns {Promise<{id: string, expiresAt: Timestamp, isNew: boolean}>}
 */
export async function ensureConversation(uid, { email, userName, chatModel, page, retentionDays }) {
  const day = romeDay();
  return runTransaction(db, async transaction => {
    const pointerRef = userPointerRef(uid);
    const pointer = await transaction.get(pointerRef);
    const { activeConversationId, activeDay } = pointer.exists() ? pointer.data() : {};

    let previous = null;
    if (activeConversationId) {
      const snapshot = await transaction.get(conversationRef(activeConversationId));
      if (snapshot.exists() && !snapshot.data().endedAt) previous = snapshot;
    }
    if (previous && activeDay === day) {
      return { id: previous.id, expiresAt: previous.data().expiresAt, isNew: false };
    }

    if (previous) {
      transaction.update(previous.ref, { endedAt: serverTimestamp(), endReason: END_REASON.day });
    }
    const newRef = doc(conversationsCollection());
    const expiresAt = expiryFrom(retentionDays);
    transaction.set(newRef, {
      uid,
      email: email || null,
      userName: userName || null,
      day,
      page: page || null,
      chatModel: chatModel || null,
      startedAt: serverTimestamp(),
      lastMessageAt: serverTimestamp(),
      endedAt: null,
      endReason: null,
      firstQuestion: null,
      userMessages: 0,
      assistantMessages: 0,
      errors: 0,
      tools: { documents: 0, data: 0, export: 0 },
      tokens: { input: 0, output: 0, thinking: 0 },
      documentsOpened: [],
      databases: [],
      expiresAt
    });
    transaction.set(pointerRef, {
      activeConversationId: newRef.id,
      activeDay: day,
      email: email || null,
      name: userName || null,
      updatedAt: serverTimestamp()
    });
    return { id: newRef.id, expiresAt, isNew: true };
  });
}

/** The question, written as it is sent. */
export async function recordUserMessage(conversation, { id, text, clientAt, isFirst }) {
  const batch = writeBatch(db);
  batch.set(messageRef(conversation.id, id), {
    role: 'user',
    text: text.slice(0, MAX_TEXT_CHARS),
    clientAt,
    seq: 0,
    createdAt: serverTimestamp(),
    expiresAt: conversation.expiresAt
  });
  batch.update(conversationRef(conversation.id), {
    userMessages: increment(1),
    lastMessageAt: serverTimestamp(),
    ...(isFirst ? { firstQuestion: text.slice(0, FIRST_QUESTION_CHARS) } : {})
  });
  await batch.commit();
}

/**
 * The end of a turn in one batch: the tool activity, the reply and the conversation's counters.
 * @param {object} turn `{activities, reply: {id, text, clientAt}, model, usage, durationMs,
 *   firstTokenMs, error}` — `activities` in the order they started, already reduced to their final
 *   state.
 */
export async function recordTurn(conversation, turn) {
  const { activities, reply, model, usage, durationMs, firstTokenMs, error } = turn;
  const batch = writeBatch(db);
  let seq = 1;
  for (const activity of activities) {
    batch.set(messageRef(conversation.id, activity.id), {
      role: 'activity',
      activity: storableActivity(activity),
      clientAt: reply.clientAt,
      seq: seq++,
      createdAt: serverTimestamp(),
      expiresAt: conversation.expiresAt
    });
  }
  if (reply.text) {
    batch.set(messageRef(conversation.id, reply.id), {
      role: 'assistant',
      text: reply.text.slice(0, MAX_TEXT_CHARS),
      clientAt: reply.clientAt,
      seq: seq++,
      model: model || null,
      usage: usage || null,
      durationMs: durationMs ?? null,
      firstTokenMs: firstTokenMs ?? null,
      error: Boolean(error),
      createdAt: serverTimestamp(),
      expiresAt: conversation.expiresAt
    });
  }

  const count = kind => activities.filter(a => a.kind === kind).length;
  const documents = [...new Set(activities.map(a => a.documentName).filter(Boolean))];
  const databases = [...new Set(activities.map(a => a.databaseLabel).filter(Boolean))];
  batch.update(conversationRef(conversation.id), {
    assistantMessages: increment(reply.text ? 1 : 0),
    errors: increment(error ? 1 : 0),
    'tools.documents': increment(count('documents')),
    'tools.data': increment(count('data')),
    'tools.export': increment(count('export')),
    'tokens.input': increment(usage?.input || 0),
    'tokens.output': increment(usage?.output || 0),
    'tokens.thinking': increment(usage?.thinking || 0),
    lastMessageAt: serverTimestamp(),
    ...(documents.length ? { documentsOpened: arrayUnion(...documents) } : {}),
    ...(databases.length ? { databases: arrayUnion(...databases) } : {})
  });
  await batch.commit();
}

/** "Nuova conversazione": closes the conversation (or the one the pointer names) and clears the pointer. */
export async function endConversation(uid, conversationId) {
  if (!conversationId) {
    const pointer = await getDoc(userPointerRef(uid));
    conversationId = pointer.exists() ? pointer.data().activeConversationId : null;
    if (!conversationId) return;
  }
  const batch = writeBatch(db);
  batch.update(conversationRef(conversationId), {
    endedAt: serverTimestamp(),
    endReason: END_REASON.reset
  });
  batch.set(
    userPointerRef(uid),
    { activeConversationId: null, activeDay: null, updatedAt: serverTimestamp() },
    { merge: true }
  );
  await batch.commit();
}

/** Admin side (Storico): one conversation's full transcript, oldest first. */
export async function loadTranscript(conversationId) {
  const snapshot = await getDocs(query(messagesCollection(conversationId), orderBy('clientAt')));
  return snapshot.docs
    .map(d => ({ id: d.id, ...d.data() }))
    .sort((a, b) => a.clientAt - b.clientAt || (a.seq || 0) - (b.seq || 0));
}
