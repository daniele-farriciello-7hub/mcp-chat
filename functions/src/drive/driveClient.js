/**
 * Google Drive, read-only, as the functions' runtime service account (Application Default
 * Credentials: no key file, no OAuth consent). The admin shares a folder or file with that account's
 * email and the sync reads it from there. Every call retries transient failures.
 *
 * `auth` comes from `@googleapis/drive` itself (not from the top-level `google-auth-library`) so the
 * client and the credentials are guaranteed to be the same library version.
 */
import { auth as googleAuth, drive as createDrive } from '@googleapis/drive';
import { statusOf, withRetry } from './retry.js';

const SCOPES = ['https://www.googleapis.com/auth/drive.readonly'];
// what the sync compares to know whether a file changed, plus what it shows
const FILE_FIELDS = 'id,name,mimeType,size,version,md5Checksum,modifiedTime,webViewLink,trashed';

export const PDF_MIME_TYPE = 'application/pdf';
export const FOLDER_MIME_TYPE = 'application/vnd.google-apps.folder';

let authClient = null;
let driveApi = null;
let cachedEmail = null;

function drive() {
  authClient ??= new googleAuth.GoogleAuth({ scopes: SCOPES });
  driveApi ??= createDrive({ version: 'v3', auth: authClient });
  return driveApi;
}

/** The address the admin shares folders with; null where the credentials have none (a local emulator). */
export async function serviceAccountEmail() {
  if (cachedEmail) return cachedEmail;
  try {
    drive();
    cachedEmail = (await authClient.getCredentials()).client_email || null;
  } catch (error) {
    console.warn('drive: cannot read the service account email:', error?.message || error);
  }
  return cachedEmail;
}

const normalize = file => ({
  id: file.id,
  name: file.name,
  mimeType: file.mimeType,
  size: file.size == null ? null : Number(file.size),
  version: file.version == null ? null : String(file.version),
  md5: file.md5Checksum || null,
  modifiedTime: file.modifiedTime || null,
  webViewLink: file.webViewLink || null,
  trashed: Boolean(file.trashed)
});

/** Metadata of one file or folder; rejects with Drive's own error (404 = missing or not shared with us). */
export async function getFileMeta(fileId) {
  const response = await withRetry(() =>
    drive().files.get({ fileId, fields: FILE_FIELDS, supportsAllDrives: true })
  );
  return normalize(response.data);
}

/** Everything directly inside a folder, not trashed. Ids are validated before they get here. */
export async function listChildren(folderId) {
  const children = [];
  let pageToken;
  do {
    const response = await withRetry(() =>
      drive().files.list({
        q: `'${folderId}' in parents and trashed = false`,
        fields: `nextPageToken, files(${FILE_FIELDS})`,
        pageSize: 1000,
        pageToken,
        supportsAllDrives: true,
        includeItemsFromAllDrives: true,
        corpora: 'allDrives'
      })
    );
    children.push(...(response.data.files || []).map(normalize));
    pageToken = response.data.nextPageToken || undefined;
  } while (pageToken);
  return children;
}

/** The bytes of a binary file (a PDF). */
export async function downloadFile(fileId, signal) {
  const response = await withRetry(
    () =>
      drive().files.get(
        { fileId, alt: 'media', supportsAllDrives: true },
        { responseType: 'arraybuffer', signal }
      ),
    { signal }
  );
  return Buffer.from(response.data);
}

/** Subscribes to changes of a file or folder; resolves to Drive's channel (`id`, `resourceId`, `expiration`). */
export async function watchFile({ fileId, channelId, address, token, expirationMs }) {
  const response = await drive().files.watch({
    fileId,
    supportsAllDrives: true,
    requestBody: { id: channelId, type: 'web_hook', address, token, expiration: String(expirationMs) }
  });
  return {
    id: response.data.id,
    resourceId: response.data.resourceId,
    expirationMs: Number(response.data.expiration) || expirationMs
  };
}

/** Ends a notification channel; one that is already gone is not an error. */
export async function stopChannel({ id, resourceId }) {
  try {
    await drive().channels.stop({ requestBody: { id, resourceId } });
  } catch (error) {
    if (statusOf(error) !== 404) throw error;
  }
}

/** A Drive failure as one short sentence for the panel. */
export function describeDriveError(error) {
  const text = String(error?.message || error);
  if (/has not been used|accessNotConfigured|SERVICE_DISABLED/i.test(text)) {
    return 'L’API di Google Drive non è abilitata nel progetto.';
  }
  switch (statusOf(error)) {
    case 404:
      return 'Non trovo l’elemento su Drive: è stato eliminato o non è più condiviso con l’account di servizio.';
    case 403:
      return 'Drive nega l’accesso: controlla che l’elemento sia condiviso con l’account di servizio.';
    case 401:
      return 'Autenticazione con Google non riuscita: controlla i permessi dell’account di servizio.';
    case 429:
      return 'Drive ha limitato le richieste: riprova tra poco.';
    default:
      return `Errore di Drive: ${text.slice(0, 200)}`;
  }
}
