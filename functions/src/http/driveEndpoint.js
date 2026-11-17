/**
 * HTTP handler for the Google Drive sources, one path per action (POST /drive/<action>), admin only.
 * Same shape as `historyEndpoint.js`: the caller's Firebase ID token is verified and `users/{uid}` read on
 * every call. The Drive sources and their state live in collections only the functions touch
 * (drive/sourceStore.js), so the browser reaches them only through here.
 *
 *   list     the service account's email and every source, with its status — what the panel polls
 *   add      { link, frequency, dailyHour } links a folder or a PDF
 *   update   { id, frequency, dailyHour } changes how often it is synchronised
 *   remove   { id } unlinks it and takes its documents out of the archive
 *   syncNow  { id, force? } runs it now and answers when it is done (up to ~7 minutes); `force` also
 *            rewrites the index card of every file
 *
 * `syncNow` works inside the request on purpose: the admin gets the outcome, and the panel shows progress
 * by polling `list` meanwhile. If the run does not finish in time it stops cleanly and the source stays
 * due, so the scheduler continues it.
 */
import { Timestamp } from 'firebase-admin/firestore';
import { InvalidTokenError, verifyAppUser } from '../auth/firebaseUser.js';
import { applyCors } from './cors.js';
import { FOLDER_MIME_TYPE, PDF_MIME_TYPE, getFileMeta, serviceAccountEmail } from '../drive/driveClient.js';
import { parseDriveLink } from '../drive/driveLink.js';
import { statusOf } from '../drive/retry.js';
import { nextRunAfter, normalizeSchedule } from '../drive/schedule.js';
import { stopAllChannels } from '../drive/channels.js';
import { createSource, getSource, listSources, serializeSource, updateSource } from '../drive/sourceStore.js';
import { makeBudget, removeSource, runSource } from '../drive/syncSource.js';

class HttpError extends Error {
  constructor(status, message) {
    super(message);
    this.status = status;
  }
}

const requireSource = async body => {
  const id = typeof body.id === 'string' ? body.id : '';
  const source = id ? await getSource(id) : null;
  if (!source) throw new HttpError(404, 'Elemento Drive non trovato.');
  return source;
};

function scheduleFrom(fields) {
  try {
    return normalizeSchedule(fields);
  } catch (error) {
    throw new HttpError(400, error.message);
  }
}

// ── actions ──────────────────────────────────────────────────────────────────

async function actionList() {
  const [email, sources] = await Promise.all([serviceAccountEmail(), listSources()]);
  const now = Date.now();
  return {
    serviceAccountEmail: email,
    sources: sources
      .map(source => serializeSource(source, now))
      .sort((a, b) => a.name.localeCompare(b.name, 'it'))
  };
}

async function actionAdd(user, body) {
  const driveId = parseDriveLink(body.link);
  if (!driveId) {
    throw new HttpError(
      400,
      'Non riconosco questo link: incolla il link di una cartella o di un PDF di Google Drive.'
    );
  }
  const schedule = scheduleFrom(body);

  let meta;
  try {
    meta = await getFileMeta(driveId);
  } catch (error) {
    if (![403, 404].includes(statusOf(error))) throw error;
    const email = await serviceAccountEmail();
    throw new HttpError(
      400,
      `Non riesco ad aprirlo. Condividilo${email ? ` con ${email}` : ' con l’account di servizio'} (basta la sola lettura) e riprova.`
    );
  }
  if (meta.trashed) throw new HttpError(400, 'Questo elemento è nel cestino di Drive.');
  const kind =
    meta.mimeType === FOLDER_MIME_TYPE ? 'folder' : meta.mimeType === PDF_MIME_TYPE ? 'file' : null;
  if (!kind) {
    throw new HttpError(
      400,
      'Si possono collegare solo cartelle e file PDF: questo è un altro tipo di file.'
    );
  }

  try {
    await createSource(driveId, {
      driveId,
      kind,
      name: meta.name,
      url: meta.webViewLink || String(body.link).trim(),
      ...schedule,
      createdBy: user.email || user.uid
    });
  } catch (error) {
    if (error?.code === 6) throw new HttpError(409, 'Questo elemento è già collegato.');
    throw error;
  }
  return { source: serializeSource(await getSource(driveId)) };
}

async function actionUpdate(_user, body) {
  const source = await requireSource(body);
  const schedule = scheduleFrom({
    frequency: body.frequency ?? source.frequency,
    dailyHour: body.dailyHour ?? source.dailyHour
  });

  // an interval counts from the last run (so it may be due at once); a time of day, from now
  const lastRunMs = source.lastRunAt?.toMillis?.() ?? null;
  const wallClock = schedule.frequency === 'daily' || schedule.frequency === 'weekly';
  const nextMs =
    wallClock || lastRunMs == null ? nextRunAfter(schedule, Date.now()) : nextRunAfter(schedule, lastRunMs);
  await updateSource(source.id, {
    ...schedule,
    nextRunAt: schedule.frequency === 'manual' ? null : Timestamp.fromMillis(nextMs ?? Date.now())
  });
  // a manual-only source is not watched: its channels end now (the others are kept by the next tick)
  if (schedule.frequency === 'manual') await stopAllChannels(source.id);
  return { source: serializeSource(await getSource(source.id)) };
}

async function actionRemove(_user, body) {
  const source = await requireSource(body);
  const removed = await removeSource(source);
  if (removed === null) {
    throw new HttpError(409, 'È in corso una sincronizzazione di questo elemento: riprova tra poco.');
  }
  return { removed };
}

async function actionSyncNow(_user, body) {
  const source = await requireSource(body);
  const force = body.force === true;
  if (force) await updateSource(source.id, { forceSince: Timestamp.now() });

  const result = await runSource(source.id, { trigger: 'manual', budget: makeBudget() });
  if (!result) {
    throw new HttpError(
      409,
      force
        ? 'È già in corso una sincronizzazione: la reindicizzazione partirà al prossimo giro.'
        : 'È già in corso una sincronizzazione di questo elemento.'
    );
  }
  return { source: serializeSource(await getSource(source.id)) };
}

const ACTIONS = {
  list: actionList,
  add: actionAdd,
  update: actionUpdate,
  remove: actionRemove,
  syncNow: actionSyncNow
};

export async function handleDriveRequest(req, res) {
  if (!applyCors(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return res.status(405).json({ error: 'Use POST.' });

  const action = String(req.path || '').replace(/^\/+|\/+$/g, '');
  const handler = ACTIONS[action];
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
  if (!user.isAdmin) return res.status(403).json({ error: 'Admin access required.' });

  try {
    return res.status(200).json(await handler(user, req.body || {}));
  } catch (error) {
    if (error instanceof HttpError) return res.status(error.status).json({ error: error.message });
    console.error(`drive ${action} failed`, error);
    return res.status(500).json({ error: 'Errore del server: riprova.' });
  }
}
