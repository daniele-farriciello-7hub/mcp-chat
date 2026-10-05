/**
 * Firestore layout of the conversation history. The single place where these paths are spelled out.
 *
 *   apps/assistente-7hub/chatConversations/{id}               one conversation: who, when, counters
 *   apps/assistente-7hub/chatConversations/{id}/chatMessages/{m} its messages and tool activity
 *   apps/assistente-7hub/chatUsers/{uid}                      pointer to the user's open conversation
 *
 * Names are prefixed on purpose: TTL policies apply per collection group across the whole shared
 * project, so a TTL on a generic `messages` group could delete other apps' data. Both
 * `chatConversations` and `chatMessages` carry `expiresAt` for that TTL policy.
 *
 * Who may read what is enforced by Firestore security rules managed outside this repo (README):
 * an operator reads and writes only their own, an admin of this app reads everyone's.
 */
import { collection, doc } from 'firebase/firestore';
import { db } from '@/shared/firebase/app';
import { FIRESTORE_ROOT } from '@/shared/firebase/paths';

export const conversationsCollection = () => collection(db, ...FIRESTORE_ROOT, 'chatConversations');
export const conversationRef = id => doc(db, ...FIRESTORE_ROOT, 'chatConversations', id);
export const messagesCollection = conversationId =>
  collection(db, ...FIRESTORE_ROOT, 'chatConversations', conversationId, 'chatMessages');
export const messageRef = (conversationId, messageId) =>
  doc(db, ...FIRESTORE_ROOT, 'chatConversations', conversationId, 'chatMessages', messageId);
export const userPointerRef = uid => doc(db, ...FIRESTORE_ROOT, 'chatUsers', uid);

export const END_REASON = { reset: 'reset', day: 'day' };
