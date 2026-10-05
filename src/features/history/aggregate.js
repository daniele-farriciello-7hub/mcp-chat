/**
 * Pure numbers for the Storico tab, from the loaded conversation documents (`schema.js`). No
 * Firestore here, so it can be checked in plain node.
 */

const sum = (list, pick) => list.reduce((total, item) => total + (pick(item) || 0), 0);

/** Headline numbers for the KPI tiles. */
export function kpis(conversations) {
  const questions = sum(conversations, c => c.userMessages);
  const replies = sum(conversations, c => c.assistantMessages);
  const errors = sum(conversations, c => c.errors);
  return {
    conversations: conversations.length,
    questions,
    users: new Set(conversations.map(c => c.uid)).size,
    questionsPerConversation: conversations.length ? questions / conversations.length : 0,
    errorRate: replies ? errors / replies : 0,
    tokens: {
      input: sum(conversations, c => c.tokens?.input),
      output: sum(conversations, c => c.tokens?.output),
      thinking: sum(conversations, c => c.tokens?.thinking)
    }
  };
}

/** Every Rome day from `fromDay` to `toDay` inclusive ('YYYY-MM-DD'), so empty days show as zero. */
export function daysBetween(fromDay, toDay) {
  const days = [];
  const cursor = new Date(`${fromDay}T12:00:00Z`);
  const end = new Date(`${toDay}T12:00:00Z`);
  while (cursor <= end) {
    days.push(cursor.toISOString().slice(0, 10));
    cursor.setUTCDate(cursor.getUTCDate() + 1);
  }
  return days;
}

/** Questions asked per day (a conversation counts on its own day — it never spans two). */
export function questionsPerDay(conversations, fromDay, toDay) {
  const byDay = new Map(daysBetween(fromDay, toDay).map(day => [day, 0]));
  for (const c of conversations) {
    if (byDay.has(c.day)) byDay.set(c.day, byDay.get(c.day) + (c.userMessages || 0));
  }
  return [...byDay].map(([day, value]) => ({ day, value }));
}

export function toolTotals(conversations) {
  return [
    { label: 'Documenti letti', value: sum(conversations, c => c.tools?.documents) },
    { label: 'Interrogazioni al database', value: sum(conversations, c => c.tools?.data) },
    { label: 'File Excel preparati', value: sum(conversations, c => c.tools?.export) }
  ];
}

/** Most active users by questions asked, top `limit`. */
export function topUsers(conversations, limit = 8) {
  const byUser = new Map();
  for (const c of conversations) {
    const entry = byUser.get(c.uid) || { label: c.userName || c.email || c.uid, value: 0 };
    entry.value += c.userMessages || 0;
    byUser.set(c.uid, entry);
  }
  return [...byUser.values()].sort((a, b) => b.value - a.value).slice(0, limit);
}

/** Documents opened in the most conversations, top `limit`. */
export function topDocuments(conversations, limit = 8) {
  const counts = new Map();
  for (const c of conversations) {
    for (const name of c.documentsOpened || []) counts.set(name, (counts.get(name) || 0) + 1);
  }
  return [...counts]
    .map(([label, value]) => ({ label, value }))
    .sort((a, b) => b.value - a.value)
    .slice(0, limit);
}

/** The users present in the loaded conversations, for the filter. */
export function usersIn(conversations) {
  const users = new Map();
  for (const c of conversations) {
    if (!users.has(c.uid)) {
      users.set(c.uid, {
        uid: c.uid,
        label: c.userName || c.email || c.uid,
        email: c.email,
        name: c.userName
      });
    }
  }
  return [...users.values()].sort((a, b) => a.label.localeCompare(b.label));
}

/** 'in corso' | 'chiusa' (reset) | 'fine giornata': an open conversation of an earlier day is over. */
export function conversationState(conversation, today) {
  if (conversation.endReason === 'reset') return 'reset';
  if (conversation.endReason === 'day' || conversation.day < today) return 'day';
  return 'open';
}
