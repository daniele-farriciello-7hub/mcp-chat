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
import { InvalidQueryError, checkSelect, timeBoxed, validateSelect } from '../db/validateSelect.js';
import { buildXlsx } from '../db/xlsx.js';
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
    // false only on purpose, for tests with unverified email/password accounts; missing = true
    requireVerifiedEmail: body.requireVerifiedEmail !== false,
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

/**
 * What every query action needs before running SQL: the enabled connection, its enabled tables (the
 * allowlist), and a runner that applies the per-user filter when the connection is user-scoped.
 */
async function queryContext(user, body) {
  const connectionId = requireString(body, 'connectionId');
  const sql = requireString(body, 'sql');

  const connection = await connectionDocRef(connectionId).get();
  if (!connection.exists || !connection.data().enabled) {
    throw new HttpError(404, 'unknown or disabled database connection');
  }

  const tableSnap = await tablesCollection(connectionId).where('enabled', '==', true).get();
  const enabledTables = new Set(tableSnap.docs.map(d => d.data().name.toLowerCase()));

  // user-scoped: the connection points at the customer's star views, which filter on who is asking
  // (`queryAsUser`). The email comes from the verified Firebase token, never from the request body.
  const { userScoped, requireVerifiedEmail } = connection.data();
  const mustBeVerified = requireVerifiedEmail !== false; // missing field = verified email required
  if (userScoped && (!user.email || (mustBeVerified && user.emailVerified !== true))) {
    throw new HttpError(403, 'this account has no verified email to filter the data by');
  }
  if (userScoped && !mustBeVerified && user.emailVerified !== true) {
    console.warn('database query with UNVERIFIED email (test mode)', { uid: user.uid, connectionId });
  }

  const run = async statement => {
    try {
      const rows = userScoped
        ? await queryAsUser(connectionId, user.email, statement)
        : await withConnection(connectionId, async pool => (await pool.query(statement))[0]);
      return Array.isArray(rows) ? rows : [];
    } catch (error) {
      throw new HttpError(400, error?.sqlMessage || error?.message || 'query failed');
    }
  };

  // the raw reason goes back to the model as-is: it needs the real cause to self-correct, not a
  // sentence written for a human admin (plan edge case 16)
  const validate = fn => {
    try {
      return fn();
    } catch (error) {
      if (error instanceof InvalidQueryError) throw new HttpError(400, error.message);
      throw error;
    }
  };

  return { connectionId, sql, enabledTables, run, validate };
}

async function actionQuery(user, body) {
  const { sql, enabledTables, run, validate } = await queryContext(user, body);

  // both configurable from the admin panel (settings.maxQueryRows / settings.queryTimeoutSeconds);
  // the ceiling on timeoutSeconds is enforced here regardless of what the client sends — it must
  // stay well under the function's own HTTP timeout (functions/index.js), with headroom for
  // connection setup and row serialization, or the operator gets a raw 504 instead of a clean error
  const maxRows = Number(body.maxRows) > 0 ? Number(body.maxRows) : 500;
  const requestedTimeout = Number(body.timeoutSeconds) > 0 ? Number(body.timeoutSeconds) : 15;
  const timeoutSeconds = Math.min(requestedTimeout, 25);

  const statement = validate(() => validateSelect(sql, { enabledTables, maxRows, timeoutSeconds }));
  const started = Date.now();
  const rows = await run(statement);
  return { ...serializeRows(rows, { maxRows }), tookMs: Date.now() - started };
}

// ── large exports: the rows go straight from the database into a file, never through the model ──

/**
 * Bounds of the admin's export settings (`exportMaxRows`, `exportTimeoutSeconds`). The values come
 * from the settings document, read here on the server — never from the request, so nobody can raise
 * them by calling this endpoint by hand — and are clamped: 50s keeps the query inside the function's
 * 60s timeout, 200k rows inside its memory and the 32 MB response limit.
 */
const EXPORT_LIMITS = {
  rows: { min: 1_000, max: 200_000, fallback: 50_000 },
  seconds: { min: 10, max: 50, fallback: 45 }
};
const PREVIEW_ROWS = 3;
const SETTINGS_TTL_MS = 30_000;

const clamp = (value, { min, max, fallback }) =>
  Number.isFinite(Number(value)) && Number(value) > 0
    ? Math.min(max, Math.max(min, Number(value)))
    : fallback;

let exportSettingsCache = null; // { at, value }
async function exportLimits() {
  if (exportSettingsCache && Date.now() - exportSettingsCache.at < SETTINGS_TTL_MS) {
    return exportSettingsCache.value;
  }
  const snapshot = await getFirestore().doc(`${ROOT}/config/settings`).get();
  const data = snapshot.exists ? snapshot.data() : {};
  const value = {
    maxRows: clamp(data.exportMaxRows, EXPORT_LIMITS.rows),
    timeoutSeconds: clamp(data.exportTimeoutSeconds, EXPORT_LIMITS.seconds)
  };
  exportSettingsCache = { at: Date.now(), value };
  return value;
}

/**
 * The model's query wrapped as a derived table, so a count, a preview or the export cap apply on
 * top of whatever LIMIT or GROUP BY it already has. MariaDB rejects some shapes inside a derived
 * table (a WITH clause, on older versions): callers fall back to the plain query.
 */
const wrapped = (checked, outer) => `SELECT ${outer} FROM (${checked}) AS export_rows`;

/** For the model: how many rows the file would hold, the columns, a few rows to describe it. */
async function actionExportPreview(user, body) {
  const { sql, enabledTables, run, validate } = await queryContext(user, body);
  const checked = validate(() => checkSelect(sql, { enabledTables }));
  const { maxRows, timeoutSeconds } = await exportLimits();

  let rowCount;
  let sample;
  try {
    const [{ n }] = await run(timeBoxed(wrapped(checked, 'COUNT(*) AS n'), timeoutSeconds));
    rowCount = Number(n);
    sample = await run(timeBoxed(`${wrapped(checked, '*')} LIMIT ${PREVIEW_ROWS}`, timeoutSeconds));
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    // the query cannot be wrapped: count by fetching, one row past the cap
    const rows = await run(
      validate(() =>
        validateSelect(sql, {
          enabledTables,
          maxRows: maxRows + 1,
          timeoutSeconds: timeoutSeconds
        })
      )
    );
    rowCount = rows.length;
    sample = rows.slice(0, PREVIEW_ROWS);
  }

  const { columns, rows } = serializeRows(sample, { maxRows: PREVIEW_ROWS });
  return {
    rowCount: Math.min(rowCount, maxRows),
    totalRows: rowCount,
    capped: rowCount > maxRows,
    maxRows: maxRows,
    columns,
    sample: rows
  };
}

/** The .xlsx itself, generated when the operator clicks: the data are those of that moment. */
async function actionExportFile(user, body) {
  const { sql, enabledTables, run, validate } = await queryContext(user, body);
  const checked = validate(() => checkSelect(sql, { enabledTables }));
  const { maxRows, timeoutSeconds } = await exportLimits();

  let rows;
  try {
    rows = await run(timeBoxed(`${wrapped(checked, '*')} LIMIT ${maxRows}`, timeoutSeconds));
  } catch (error) {
    if (!(error instanceof HttpError)) throw error;
    rows = (
      await run(
        validate(() =>
          validateSelect(sql, {
            enabledTables,
            maxRows: maxRows,
            timeoutSeconds: timeoutSeconds
          })
        )
      )
    ).slice(0, maxRows);
  }

  const title = typeof body.title === 'string' ? body.title : '';
  return { file: { buffer: buildXlsx(rows), filename: exportFilename(title) } };
}

/** yyyymmdd-hhmm in Rome, like the browser-side export, so files sort together in Downloads. */
function exportFilename(title) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Europe/Rome',
      year: 'numeric',
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
      hour12: false
    })
      .formatToParts(new Date())
      .map(p => [p.type, p.value])
  );
  const slug = title
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60);
  return (
    ['assistente', slug, `${parts.year}${parts.month}${parts.day}-${parts.hour}${parts.minute}`]
      .filter(Boolean)
      .join('-') + '.xlsx'
  );
}

const ADMIN_ACTIONS = {
  test: actionTest,
  save: actionSave,
  delete: actionDelete,
  scan: actionScan,
  sample: actionSample
};
// ── charts: the model writes an aggregating query, the chat draws the result ──

/** Most points a chart may have: beyond this it needs aggregating (by month, by bank…), not drawing. */
const CHART_MAX_POINTS = 400;

/**
 * Rows for a chart drawn in the chat (`show_chart`). Same checks as `query` (SELECT only, enabled
 * tables, per-user filter); the rows are few by construction, so they can go to the browser and,
 * summarised, to the model. One row more than the cap is fetched to tell "too many" apart.
 */
async function actionChartData(user, body) {
  const { sql, enabledTables, run, validate } = await queryContext(user, body);
  const requestedTimeout = Number(body.timeoutSeconds) > 0 ? Number(body.timeoutSeconds) : 15;
  const statement = validate(() =>
    validateSelect(sql, {
      enabledTables,
      maxRows: CHART_MAX_POINTS + 1,
      timeoutSeconds: Math.min(requestedTimeout, 25)
    })
  );
  const rows = await run(statement);
  const { columns, rows: serialized } = serializeRows(rows.slice(0, CHART_MAX_POINTS), {
    maxRows: CHART_MAX_POINTS
  });
  return { columns, rows: serialized, tooMany: rows.length > CHART_MAX_POINTS, maxPoints: CHART_MAX_POINTS };
}

const OPERATOR_ACTIONS = {
  query: actionQuery,
  chartData: actionChartData,
  exportPreview: actionExportPreview,
  exportFile: actionExportFile
};

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
    const result = await handler(user, req.body || {});
    if (result?.file) {
      res.set('Content-Type', 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet');
      res.set('Content-Disposition', `attachment; filename="${result.file.filename}"`);
      res.set('Access-Control-Expose-Headers', 'Content-Disposition');
      return res.status(200).send(result.file.buffer);
    }
    return res.status(200).json(result);
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
