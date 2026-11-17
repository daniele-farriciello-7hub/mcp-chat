/**
 * Turns what the admin pastes into a Drive id. Accepts the links Drive hands out for a folder
 * (`/drive/folders/<id>`, `/drive/u/0/folders/<id>`), a file (`/file/d/<id>/view`, `/open?id=<id>`,
 * `/uc?id=<id>`), the same under docs.google.com, and a bare id. Whether the id is a folder or a PDF
 * is not decided here: it comes from Drive itself (`driveClient.getFileMeta`).
 */
const DRIVE_ID = /^[A-Za-z0-9_-]{10,}$/;
const DRIVE_HOSTS = new Set(['drive.google.com', 'docs.google.com']);

/** A Drive id, or null when the text is not one: ids go into Drive queries, so nothing else gets through. */
export const asDriveId = value => (typeof value === 'string' && DRIVE_ID.test(value) ? value : null);

export function parseDriveLink(text) {
  const input = typeof text === 'string' ? text.trim() : '';
  if (!input) return null;

  let url;
  try {
    url = new URL(input);
  } catch {
    return asDriveId(input);
  }
  if (!DRIVE_HOSTS.has(url.hostname)) return null;

  const fromPath = /\/(?:folders|d)\/([A-Za-z0-9_-]+)/.exec(url.pathname)?.[1];
  return asDriveId(fromPath || url.searchParams.get('id'));
}
