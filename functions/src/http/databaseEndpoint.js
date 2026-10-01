/**
 * HTTP handler for the admin database feature, one path per action (POST /database/<action>).
 * Every call carries the caller's Firebase ID token (`firebaseUser.js`) — unlike the Java tools,
 * a database connection has no per-operator ACL of its own, so this token is the only gate.
 *
 * `test`, `save`, `delete`, `scan`, `sample` are admin-only (they touch credentials or schema
 * configuration). `query` runs for any operator who may use the app: it is what the chat calls, the
 * same way `tools` runs on behalf of the signed-in operator rather than only an admin.
 */
import { FieldValue, getFirestore } from 'firebase-admin/firestore';
import { InvalidTokenError, verifyAppUser } from '../auth/firebaseUser.js';
import { applyCors } from './cors.js';
import { encrypt } from '../db/credentials.js';
import {
  DatabaseConnectionError,
  describeConnectionError,
  forgetPool,
  queryAsUser,
  testConnectionConfig,
  withConnection
} from '../db/mysqlClient.js';
import { scanSchema } from '../db/introspect.js';
import { sampleTableRows } from '../db/sampleRows.js';
import { InvalidQueryError, validateSelect } from '../db/validateSelect.js';
import { serializeRows } from '../db/serializeRows.js';

const ROOT = 'apps/assistente-7hub';
const connectionsCollection = () => getFirestore().collection(`${ROOT}/dbConnections`);
const connectionDocRef = id => getFirestore().doc(`${ROOT}/dbConnections/${id}`);
const secretDocRef = id => getFirestore().doc(`${ROOT}/dbSecrets/${id}`);
const tablesCollection = id => connectionDocRef(id).collection('tables');

/** Table document id: the real name when it is a safe Firestore id, a hash of it otherwise (see
 * plan edge case 9 — table names are not guaranteed valid Firestore ids). */
function tableDocId(name) {
  if (/^[A-Za-z0-9_$-]{1,120}$/.test(name)) return name;
  let hash = 0;
  for (let i = 0; i < name.length; i++) hash = (hash * 31 + name.charCodeAt(i)) >>> 0;
  return `t-${hash.toString(36)}`;
}

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

function requireString(body, field) {
  const value = body?.[field];
  if (typeof value !== 'string' || !value.trim()) throw new HttpError(400, `missing "${field}"`);
  return value.trim();
}

// ── actions ──────────────────────────────────────────────────────────────────

async function actionTest(_user, body) {
  const config = {
    host: requireString(body, 'host'),
    port: Number(body.port) || 3306,
    database: requireString(body, 'database'),
    user: requireString(body, 'user'),
    password: requireString(body, 'password'),
    ssl: Boolean(body.ssl)
  };
  try {
    await testConnectionConfig(config);
    return { ok: true };
  } catch (error) {
    throw new HttpError(400, describeConnectionError(error));
  }
}

async function actionSave(user, body) {
  const id = typeof body.id === 'string' && body.id ? body.id : connectionsCollection().doc().id;
  const fields = {
    label: requireString(body, 'label'),
    engine: 'mariadb',
    host: requireString(body, 'host'),
    port: Number(body.port) || 3306,
    database: requireString(body, 'database'),
    user: requireString(body, 'user'),
    ssl: Boolean(body.ssl),
    allowSampling: Boolean(body.allowSampling),
    userScoped: Boolean(body.userScoped),
    enabled: Boolean(body.enabled),
    updatedAt: FieldValue.serverTimestamp()
  };

  const existing = await connectionDocRef(id).get();
  if (!existing.exists) {
    fields.createdAt = FieldValue.serverTimestamp();
    fields.createdBy = user.email || user.uid;
  }

  // password === null/undefined means "unchanged": the browser never receives it back to resend
  if (typeof body.password === 'string' && body.password) {
    await secretDocRef(id).set({ ...encrypt(body.password), updatedAt: FieldValue.serverTimestamp() });
  } else if (!existing.exists) {
    throw new HttpError(400, 'password is required for a new connection');
  }

  await connectionDocRef(id).set(fields, { merge: true });
  await forgetPool(id); // updatedAt changed: next use rebuilds the pool with fresh config
  return { id };
}

async function actionDelete(_user, body) {
  const id = requireString(body, 'id');
  const tables = await tablesCollection(id).listDocuments();
  const batch = getFirestore().batch();
  for (const doc of tables) batch.delete(doc);
  batch.delete(connectionDocRef(id));
  batch.delete(secretDocRef(id));
  await batch.commit();
  await forgetPool(id);
  return { ok: true };
}

async function actionScan(_user, body) {
  const id = requireString(body, 'id');
  let tables;
  try {
    tables = await scanSchema(id);
  } catch (error) {
    throw new HttpError(400, describeConnectionError(error));
  }

  const existingDocs = await tablesCollection(id).listDocuments();
  const existingIds = new Set(existingDocs.map(d => d.id));
  const seenIds = new Set();
  const batch = getFirestore().batch();

  for (const table of tables) {
    const docId = tableDocId(table.name);
    seenIds.add(docId);
    batch.set(
      tablesCollection(id).doc(docId),
      {
        name: table.name,
        kind: table.type,
        comment: table.comment,
        approxRows: table.approxRows,
        columns: table.columns,
        primaryKey: table.primaryKey,
        foreignKeys: table.foreignKeys,
        removed: false,
        scannedAt: FieldValue.serverTimestamp()
      },
      { merge: true } // merge: an existing table keeps `enabled` and `card` from before the rescan
    );
  }
  // tables that disappeared: flagged, not deleted, so a written card is not silently lost
  for (const docId of existingIds) {
    if (!seenIds.has(docId)) batch.set(tablesCollection(id).doc(docId), { removed: true }, { merge: true });
  }

  await batch.commit();
  await connectionDocRef(id).set({ status: 'ok', lastScanAt: FieldValue.serverTimestamp() }, { merge: true });
  return { tableCount: tables.length };
}

async function actionSample(_user, body) {
  const id = requireString(body, 'id');
  const table = requireString(body, 'table');
  const connection = await connectionDocRef(id).get();
  if (!connection.exists) throw new HttpError(404, 'connection not found');
  if (!connection.data().allowSampling) {
    throw new HttpError(403, 'row sampling is disabled for this connection');
  }
  try {
    return await sampleTableRows(id, table);
  } catch (error) {
    throw new HttpError(400, describeConnectionError(error));
  }
}

async function actionQuery(user, body) {
  const connectionId = requireString(body, 'connectionId');
  const sql = requireString(body, 'sql');

  const connection = await connectionDocRef(connectionId).get();
  if (!connection.exists || !connection.data().enabled) {
    throw new HttpError(404, 'unknown or disabled database connection');
  }

  const tableSnap = await tablesCollection(connectionId).where('enabled', '==', true).get();
  const enabledTables = new Set(tableSnap.docs.map(d => d.data().name.toLowerCase()));

  // both configurable from the admin panel (settings.maxQueryRows / settings.queryTimeoutSeconds);
  // the ceiling on timeoutSeconds is enforced here regardless of what the client sends — it must
  // stay well under the function's own 30s HTTP timeout (functions/index.js), with headroom for
  // connection setup and row serialization, or the operator gets a raw 504 instead of a clean error
  const maxRows = Number(body.maxRows) > 0 ? Number(body.maxRows) : 500;
  const requestedTimeout = Number(body.timeoutSeconds) > 0 ? Number(body.timeoutSeconds) : 15;
  const timeoutSeconds = Math.min(requestedTimeout, 25);

  let statement;
  try {
    statement = validateSelect(sql, { enabledTables, maxRows, timeoutSeconds });
  } catch (error) {
    if (error instanceof InvalidQueryError) {
      // the raw reason goes back to the model as-is: it needs the real cause to self-correct,
      // not a sentence written for a human admin (plan edge case 16)
      throw new HttpError(400, error.message);
    }
    throw error;
  }

  // user-scoped: the connection points at the customer's star views, which filter on who is asking
  // (`queryAsUser`). The email comes from the verified Firebase token, never from the request body.
  const { userScoped } = connection.data();
  if (userScoped && (!user.email || user.emailVerified !== true)) {
    throw new HttpError(403, 'this account has no verified email to filter the data by');
  }

  const started = Date.now();
  let rows;
  try {
    rows = userScoped
      ? await queryAsUser(connectionId, user.email, statement)
      : await withConnection(connectionId, async pool => (await pool.query(statement))[0]);
  } catch (error) {
    throw new HttpError(400, error?.sqlMessage || error?.message || 'query failed');
  }
  const tookMs = Date.now() - started;

  return { ...serializeRows(Array.isArray(rows) ? rows : [], { maxRows }), tookMs };
}

const ADMIN_ACTIONS = {
  test: actionTest,
  save: actionSave,
  delete: actionDelete,
  scan: actionScan,
  sample: actionSample
};
const OPERATOR_ACTIONS = { query: actionQuery };

export async function handleDatabaseRequest(req, res) {
  if (!applyCors(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const action = String(req.path || '').replace(/^\/+|\/+$/g, '');
  const isAdminAction = Boolean(ADMIN_ACTIONS[action]);
  const handler = ADMIN_ACTIONS[action] || OPERATOR_ACTIONS[action];
  if (!handler) return res.status(404).json({ error: `Unknown action "${action}".` });

  const authorization = req.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return res.status(401).json({ error: 'Missing Firebase ID token in the Authorization header.' });
  }

  let user;
  try {
    user = await verifyAppUser(authorization.slice(7).trim());
  } catch (error) {
    if (error instanceof InvalidTokenError)
      return res.status(401).json({ error: `Token rejected: ${error.message}.` });
    throw error;
  }

  if (!user.canUse) return res.status(403).json({ error: 'This account may not use the assistant.' });
  if (isAdminAction && !user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });

  try {
    return res.status(200).json(await handler(user, req.body || {}));
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    if (error?.name === 'DecryptionError' || error?.name === 'CredentialKeyError') {
      return res.status(500).json({ error: error.message });
    }
    if (error instanceof DatabaseConnectionError) {
      return res.status(400).json({ error: describeConnectionError(error) });
    }
    console.error(`database ${action} failed`, error);
    return res.status(500).json({ error: 'Internal service error.' });
  }
}
