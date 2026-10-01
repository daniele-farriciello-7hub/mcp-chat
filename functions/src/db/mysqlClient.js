/**
 * MariaDB/MySQL connection pools, one per configured `dbConnections/{id}`, cached for the lifetime
 * of the function instance. `maxInstances: 10` (functions/index.js) times `connectionLimit` here is
 * the real ceiling on concurrent sockets to the database server — keep it low.
 */
import mysql from 'mysql2/promise';
import { getFirestore } from 'firebase-admin/firestore';
import { decrypt } from './credentials.js';

const CONNECTION_LIMIT = 2;
const CONNECT_TIMEOUT_MS = 8000;

export class DatabaseConnectionError extends Error {
  constructor(message, { code, cause } = {}) {
    super(message);
    this.name = 'DatabaseConnectionError';
    this.code = code;
    this.cause = cause;
  }
}

/** Driver error code/message → the sentence an admin sees. Never shown to the model (see queries.js). */
export function describeConnectionError(error) {
  switch (error?.code) {
    case 'ENOTFOUND':
    case 'EAI_AGAIN':
      return "Host non trovato: controlla l'indirizzo.";
    case 'ECONNREFUSED':
      return 'Il server rifiuta la connessione sulla porta indicata.';
    case 'ETIMEDOUT':
    case 'CONNECT_TIMEOUT':
      return 'Nessuna risposta: il firewall del database non accetta le nostre chiamate.';
    case 'ER_ACCESS_DENIED_ERROR':
      return 'Utente o password non validi.';
    case 'ER_BAD_DB_ERROR':
      return 'Il database indicato non esiste.';
    case 'ER_DBACCESS_DENIED_ERROR':
      return "L'utente non ha accesso a questo database.";
    case 'PROTOCOL_CONNECTION_LOST':
    case 'ECONNRESET':
      return 'Connessione interrotta dal server.';
    default:
      return error?.message || 'Errore di connessione al database.';
  }
}

function poolConfig({ host, port, database, user, password, ssl }) {
  return {
    host,
    port: Number(port) || 3306,
    database,
    user,
    password,
    ssl: ssl ? { rejectUnauthorized: false } : undefined,
    waitForConnections: true,
    connectionLimit: CONNECTION_LIMIT,
    connectTimeout: CONNECT_TIMEOUT_MS,
    // never allow a second statement to ride in on one query string — the validator assumes this
    multipleStatements: false,
    dateStrings: true,
    supportBigNumbers: true,
    bigNumberStrings: true
  };
}

/** One-off connection, used by "Prova connessione" before the form is saved. Never cached. */
export async function testConnectionConfig(config) {
  let connection;
  try {
    connection = await mysql.createConnection(poolConfig(config));
    await connection.query('SELECT 1');
  } finally {
    if (connection) await connection.end().catch(() => {});
  }
}

// connectionId -> { pool, updatedAtMs }
const pools = new Map();

async function connectionDoc(connectionId) {
  const db = getFirestore();
  const [connSnap, secretSnap] = await Promise.all([
    db.doc(`apps/assistente-7hub/dbConnections/${connectionId}`).get(),
    db.doc(`apps/assistente-7hub/dbSecrets/${connectionId}`).get()
  ]);
  if (!connSnap.exists) throw new DatabaseConnectionError('connection not found', { code: 'NOT_FOUND' });
  const conn = connSnap.data();
  const password = decrypt(secretSnap.exists ? secretSnap.data() : null);
  return { conn, password };
}

/** Pool for a stored connection, rebuilt whenever the connection document changes. */
async function getPool(connectionId) {
  const { conn, password } = await connectionDoc(connectionId);
  const updatedAtMs = conn.updatedAt?.toMillis?.() ?? 0;

  const cached = pools.get(connectionId);
  if (cached && cached.updatedAtMs === updatedAtMs) return { pool: cached.pool, database: conn.database };

  if (cached) await cached.pool.end().catch(() => {});
  const pool = mysql.createPool(poolConfig({ ...conn, password }));
  pools.set(connectionId, { pool, updatedAtMs });
  return { pool, database: conn.database };
}

/** Drops a connection's pool, e.g. after it is deleted. */
export async function forgetPool(connectionId) {
  const cached = pools.get(connectionId);
  if (!cached) return;
  pools.delete(connectionId);
  await cached.pool.end().catch(() => {});
}

/**
 * Runs `fn(pool, database)` against a stored connection. A pooled socket killed by the server's own
 * `wait_timeout` surfaces on first use as PROTOCOL_CONNECTION_LOST/ECONNRESET — retried once with a
 * fresh pool instead of failing the caller for something that is not really an error.
 */
export async function withConnection(connectionId, fn) {
  const { pool, database } = await getPool(connectionId);
  try {
    return await fn(pool, database);
  } catch (error) {
    if (error?.code === 'PROTOCOL_CONNECTION_LOST' || error?.code === 'ECONNRESET') {
      await forgetPool(connectionId);
      const retry = await getPool(connectionId);
      return fn(retry.pool, retry.database);
    }
    throw error;
  }
}

/** Session variable read by the customer's star views ("le mie pratiche" and the views around it). */
const USER_VARIABLE = '@assistente_utente_email';

/**
 * Runs one statement as `email`: sets the session variable on a dedicated pooled socket, runs the
 * statement on that same socket, then clears it before the socket goes back to the pool — a pooled
 * connection keeps its variables, so without the reset the next caller would inherit this identity.
 * If the reset itself fails the socket is destroyed instead of released. The views return nothing
 * when the variable is NULL, so any path that skips the SET fails closed.
 */
export async function queryAsUser(connectionId, email, statement) {
  if (!email) throw new DatabaseConnectionError('no user email for a user-scoped connection');
  return withConnection(connectionId, async pool => {
    const connection = await pool.getConnection();
    try {
      await connection.query(`SET ${USER_VARIABLE} = ?`, [email]);
      const [rows] = await connection.query(statement);
      return rows;
    } finally {
      const clean = await connection
        .query(`SET ${USER_VARIABLE} = NULL`)
        .then(() => true)
        .catch(() => false);
      if (clean) connection.release();
      else connection.destroy();
    }
  });
}
