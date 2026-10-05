/**
 * Conversation history on the server side (Admin SDK). The browser never reads or writes these
 * collections itself: it calls `http/historyEndpoint.js`, which passes the verified caller here. So
 * an operator can only touch their own conversations, and only an admin of the app can list
 * everyone's — the same server-side gate the `database` endpoint uses, kept in this repo instead
 * of in Firestore security rules managed elsewhere.
 *
 *   apps/assistente-7hub/chatConversations/{id}                 one conversation: who, when, counters
 *   apps/assistente-7hub/chatConversations/{id}/chatMessages/{m} its messages and tool activity
 *   apps/assistente-7hub/chatUsers/{uid}                        pointer to the user's open conversation
 *
 * Prefixed names on purpose: TTL policies apply per collection group across the whole shared
 * project. Both levels carry `expiresAt` for that TTL policy.
 *
 * A conversation lasts until "Nuova conversazione" or until the day changes in Rome.
 */
import { FieldValue, Timestamp, getFirestore } from 'firebase-admin/firestore';
import { canUseApp } from '../auth/firebaseUser.js';

const ROOT = 'apps/assistente-7hub';
const DAY_MS = 24 * 60 * 60 * 1000;
const RESTORE_LIMIT = 200;
const LIST_PAGE = 500;
const MAX_TEXT_CHARS = 200_000;
const MAX_SQL_CHARS = 10_000;
const MAX_ACTIVITIES = 50;
const FIRST_QUESTION_CHARS = 140;
const SETTINGS_TTL_MS = 30_000;

const ACTIVITY_FIELDS = [
  'kind',
  'label',
  'outcome',
  'documentName',
  'documentId',
  'databaseLabel',
  'exportTitle'
];

const db = () => getFirestore();
const conversations = () => db().collection(`${ROOT}/chatConversations`);
const conversationRef = id => conversations().doc(id);
const messagesOf = id => conversationRef(id).collection('chatMessages');
const pointerRef = uid => db().doc(`${ROOT}/chatUsers/${uid}`);

export class HistoryError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const ROME_DAY = new Intl.DateTimeFormat('en-CA', {
  timeZone: 'Europe/Rome',
  year: 'numeric',
  month: '2-digit',
  day: '2-digit'
});
export const romeDay = (date = new Date()) => ROME_DAY.format(date);

let settingsCache = null;
/** `historyEnabled` and retention, read from the shared settings and cached briefly per instance. */
export async function historySettings() {
  if (settingsCache && Date.now() - settingsCache.at < SETTINGS_TTL_MS) return settingsCache.value;
  const snapshot = await db().doc(`${ROOT}/config/settings`).get();
  const data = snapshot.exists ? snapshot.data() : {};
  const value = {
    enabled: data.historyEnabled === true,
    retentionDays: Number(data.historyRetentionDays) > 0 ? Number(data.historyRetentionDays) : 30
  };
  settingsCache = { at: Date.now(), value };
  return value;
}

const text = (value, max) => (typeof value === 'string' ? value.slice(0, max) : '');
const count = value => (Number.isFinite(value) && value > 0 ? Math.round(value) : 0);
const millis = value => (Number.isFinite(value) ? value : Date.now());
const safeId = value => (typeof value === 'string' && /^[A-Za-z0-9_:-]{1,128}$/.test(value) ? value : null);

/** Only the fields worth keeping — never rows or columns of data; SQL only if the tool attached it. */
function storableActivity(activity = {}) {
  const stored = {};
  for (const field of ACTIVITY_FIELDS) {
    if (typeof activity[field] === 'string') stored[field] = activity[field].slice(0, 500);
  }
  if (typeof activity.sql === 'string') stored.sql = activity.sql.slice(0, MAX_SQL_CHARS);
  return stored;
}

/** Firestore Timestamp → epoch ms, for JSON. */
const toMs = value => (value && typeof value.toMillis === 'function' ? value.toMillis() : null);
function serializeConversation(doc) {
  const data = doc.data();
  return {
    ...data,
    id: doc.id,
    startedAt: toMs(data.startedAt),
    lastMessageAt: toMs(data.lastMessageAt),
    endedAt: toMs(data.endedAt),
    expiresAt: toMs(data.expiresAt)
  };
}
function serializeMessage(doc) {
  const data = doc.data();
  return { ...data, id: doc.id, createdAt: toMs(data.createdAt), expiresAt: toMs(data.expiresAt) };
}
const byClientOrder = (a, b) => a.clientAt - b.clientAt || (a.seq || 0) - (b.seq || 0);

// ── operator: always the caller's own data ────────────────────────────────────────────────────

/** Today's open conversation of the caller, with its last messages, or null. */
export async function restore(user) {
  const pointer = await pointerRef(user.uid).get();
  const { activeConversationId, activeDay } = pointer.exists ? pointer.data() : {};
  if (!activeConversationId || activeDay !== romeDay()) return null;

  const conversation = await conversationRef(activeConversationId).get();
  if (!conversation.exists || conversation.data().endedAt || conversation.data().uid !== user.uid)
    return null;

  const snapshot = await messagesOf(activeConversationId)
    .orderBy('clientAt')
    .limitToLast(RESTORE_LIMIT)
    .get();
  const messages = snapshot.docs.map(serializeMessage).sort(byClientOrder);
  return { id: activeConversationId, day: conversation.data().day, messages };
}

/**
 * Records a question, in the conversation it belongs to: today's open one, or a new one (an open
 * conversation of an earlier day is closed with reason "day"). The pointer moves inside a
 * transaction, so two tabs asking at once end up in the same conversation.
 */
export async function recordQuestion(user, body, retentionDays) {
  const id = safeId(body.id);
  const questionText = text(body.text, MAX_TEXT_CHARS);
  if (!id || !questionText.trim()) throw new HistoryError(400, 'id and text are required');
  const day = romeDay();

  return db().runTransaction(async transaction => {
    const pointer = await transaction.get(pointerRef(user.uid));
    const { activeConversationId, activeDay } = pointer.exists ? pointer.data() : {};
    let previous = null;
    if (activeConversationId) {
      const snapshot = await transaction.get(conversationRef(activeConversationId));
      if (snapshot.exists && !snapshot.data().endedAt && snapshot.data().uid === user.uid)
        previous = snapshot;
    }

    let conversation;
    let isNew = false;
    if (previous && activeDay === day) {
      conversation = { ref: previous.ref, expiresAt: previous.data().expiresAt };
    } else {
      if (previous) {
        transaction.update(previous.ref, { endedAt: FieldValue.serverTimestamp(), endReason: 'day' });
      }
      isNew = true;
      const ref = conversations().doc();
      const expiresAt = Timestamp.fromMillis(Date.now() + retentionDays * DAY_MS);
      conversation = { ref, expiresAt };
      transaction.set(ref, {
        uid: user.uid,
        email: user.email || null,
        userName: text(body.userName, 200) || null,
        day,
        page: text(body.page, 500) || null,
        chatModel: text(body.chatModel, 100) || null,
        startedAt: FieldValue.serverTimestamp(),
        lastMessageAt: FieldValue.serverTimestamp(),
        endedAt: null,
        endReason: null,
        firstQuestion: questionText.slice(0, FIRST_QUESTION_CHARS),
        userMessages: 0,
        assistantMessages: 0,
        errors: 0,
        tools: { documents: 0, data: 0, export: 0 },
        tokens: { input: 0, output: 0, thinking: 0 },
        documentsOpened: [],
        databases: [],
        expiresAt
      });
      transaction.set(pointerRef(user.uid), {
        activeConversationId: ref.id,
        activeDay: day,
        email: user.email || null,
        name: text(body.userName, 200) || null,
        updatedAt: FieldValue.serverTimestamp()
      });
    }

    transaction.set(conversation.ref.collection('chatMessages').doc(id), {
      role: 'user',
      text: questionText,
      clientAt: millis(body.clientAt),
      seq: 0,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt: conversation.expiresAt
    });
    transaction.update(conversation.ref, {
      userMessages: FieldValue.increment(1),
      lastMessageAt: FieldValue.serverTimestamp()
    });
    return { id: conversation.ref.id, day, isNew };
  });
}

/** The end of a turn in one batch: tool activity, the reply and the conversation's counters. */
export async function recordTurn(user, body) {
  const conversationId = safeId(body.conversationId);
  if (!conversationId) throw new HistoryError(400, 'conversationId is required');
  const ref = conversationRef(conversationId);
  const snapshot = await ref.get();
  // someone else's conversation looks exactly like a missing one: no hint that it exists
  if (!snapshot.exists || snapshot.data().uid !== user.uid)
    throw new HistoryError(404, 'conversation not found');
  const { expiresAt } = snapshot.data();

  const activities = (Array.isArray(body.activities) ? body.activities : []).slice(0, MAX_ACTIVITIES);
  const reply = body.reply || {};
  const replyText = text(reply.text, MAX_TEXT_CHARS);
  const clientAt = millis(reply.clientAt);
  const usage = {
    input: count(body.usage?.input),
    output: count(body.usage?.output),
    thinking: count(body.usage?.thinking)
  };
  const failed = body.error === true;

  const batch = db().batch();
  let seq = 1;
  for (const activity of activities) {
    const id = safeId(activity.id);
    if (!id) continue;
    batch.set(ref.collection('chatMessages').doc(id), {
      role: 'activity',
      activity: storableActivity(activity),
      clientAt,
      seq: seq++,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt
    });
  }
  const replyId = safeId(reply.id);
  if (replyText && replyId) {
    batch.set(ref.collection('chatMessages').doc(replyId), {
      role: 'assistant',
      text: replyText,
      clientAt,
      seq: seq++,
      model: text(body.model, 100) || null,
      usage,
      durationMs: Number.isFinite(body.durationMs) ? Math.round(body.durationMs) : null,
      firstTokenMs: Number.isFinite(body.firstTokenMs) ? Math.round(body.firstTokenMs) : null,
      error: failed,
      createdAt: FieldValue.serverTimestamp(),
      expiresAt
    });
  }

  const kinds = activities.map(a => a?.kind);
  const documents = [...new Set(activities.map(a => a?.documentName).filter(n => typeof n === 'string'))];
  const databases = [...new Set(activities.map(a => a?.databaseLabel).filter(n => typeof n === 'string'))];
  batch.update(ref, {
    assistantMessages: FieldValue.increment(replyText ? 1 : 0),
    errors: FieldValue.increment(failed ? 1 : 0),
    'tools.documents': FieldValue.increment(kinds.filter(k => k === 'documents').length),
    'tools.data': FieldValue.increment(kinds.filter(k => k === 'data').length),
    'tools.export': FieldValue.increment(kinds.filter(k => k === 'export').length),
    'tokens.input': FieldValue.increment(usage.input),
    'tokens.output': FieldValue.increment(usage.output),
    'tokens.thinking': FieldValue.increment(usage.thinking),
    lastMessageAt: FieldValue.serverTimestamp(),
    ...(documents.length ? { documentsOpened: FieldValue.arrayUnion(...documents.slice(0, 50)) } : {}),
    ...(databases.length ? { databases: FieldValue.arrayUnion(...databases.slice(0, 50)) } : {})
  });
  await batch.commit();
  return { ok: true };
}

/** "Nuova conversazione": closes the caller's open conversation and clears their pointer. */
export async function endConversation(user) {
  const pointer = await pointerRef(user.uid).get();
  const conversationId = pointer.exists ? pointer.data().activeConversationId : null;
  const batch = db().batch();
  if (conversationId) {
    const conversation = await conversationRef(conversationId).get();
    if (conversation.exists && conversation.data().uid === user.uid && !conversation.data().endedAt) {
      batch.update(conversation.ref, { endedAt: FieldValue.serverTimestamp(), endReason: 'reset' });
    }
  }
  batch.set(
    pointerRef(user.uid),
    { activeConversationId: null, activeDay: null, updatedAt: FieldValue.serverTimestamp() },
    { merge: true }
  );
  await batch.commit();
  return { ok: true };
}

// ── admin only: everyone's data ────────────────────────────────────────────────────────────

/** Conversations started in the last `rangeDays`, newest first, a page at a time. */
export async function listConversations(body) {
  const rangeDays = Math.min(366, Math.max(1, Number(body.rangeDays) || 30));
  const from = Timestamp.fromMillis(Date.now() - rangeDays * DAY_MS);
  let query = conversations().where('startedAt', '>=', from).orderBy('startedAt', 'desc').limit(LIST_PAGE);
  if (Number.isFinite(body.afterStartedAt))
    query = query.startAfter(Timestamp.fromMillis(body.afterStartedAt));
  const snapshot = await query.get();
  const items = snapshot.docs.map(serializeConversation);
  return {
    conversations: items,
    nextAfter: snapshot.docs.length === LIST_PAGE ? items.at(-1).startedAt : null
  };
}

/** One conversation's full transcript, oldest first. */
export async function transcript(body) {
  const conversationId = safeId(body.conversationId);
  if (!conversationId) throw new HistoryError(400, 'conversationId is required');
  const snapshot = await messagesOf(conversationId).orderBy('clientAt').get();
  return { messages: snapshot.docs.map(serializeMessage).sort(byClientOrder) };
}

/** Everyone who may use the app (same rule as the login), for the Storico user filter. */
export async function appUsers() {
  const snapshot = await db().collection('users').get();
  const users = snapshot.docs
    .filter(d => canUseApp(d.data()))
    .map(d => ({ uid: d.id, email: d.data().email || '', name: d.data().nome || '' }))
    .filter(u => u.email)
    .sort((a, b) => a.email.localeCompare(b.email));
  return { users };
}
