/**
 * Reads and writes database connections: Firestore for live lists, the `database` Cloud Function
 * for anything that needs the server (credentials, the schema scan, sample rows).
 */
'use client';

import { deleteField, onSnapshot, orderBy, query, setDoc, updateDoc } from 'firebase/firestore';
import { callFunction } from '@/shared/firebase/functions';
import { connectionsCollection, connectionRef, tableRef, tablesCollection } from './schema';
import { invalidateChatSchema } from './chatSchema';

export function listenToConnections(onData, onError) {
  return onSnapshot(
    connectionsCollection(),
    snapshot => onData(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
    onError
  );
}

export function listenToTables(connectionId, onData, onError) {
  return onSnapshot(
    query(tablesCollection(connectionId), orderBy('name')),
    snapshot => onData(snapshot.docs.map(d => ({ id: d.id, ...d.data() }))),
    onError
  );
}

/** Throws with an Italian message (see `describeConnectionError` on the server) if the test fails. */
export async function testConnection(config) {
  await callFunction('database', 'test', config);
}

/**
 * Creates or updates a connection. `password: null` keeps the one already stored — the form never
 * gets the real password back, so "didn't touch this field" is the only way to mean "leave it".
 */
export async function saveConnection(connection) {
  const { id } = await callFunction('database', 'save', connection);
  invalidateChatSchema();
  return id;
}

export async function deleteConnection(id) {
  await callFunction('database', 'delete', { id });
  invalidateChatSchema();
}

/** Re-reads the schema from the server and merges it into `tables/*`, keeping cards already written. */
export async function scanConnection(id) {
  const result = await callFunction('database', 'scan', { id });
  invalidateChatSchema();
  return result;
}

export async function sampleTable(connectionId, table) {
  return callFunction('database', 'sample', { id: connectionId, table });
}

export async function setTableEnabled(connectionId, tableId, enabled) {
  await updateDoc(tableRef(connectionId, tableId), { enabled });
  invalidateChatSchema();
}

export async function saveTableCard(connectionId, tableId, card) {
  await updateDoc(tableRef(connectionId, tableId), { card, cardError: deleteField() });
  invalidateChatSchema();
}

export async function setConnectionEnabled(connectionId, enabled) {
  await setDoc(connectionRef(connectionId), { enabled }, { merge: true });
  invalidateChatSchema();
}
