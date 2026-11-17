/**
 * What a source holds right now: its PDFs, with the folder each one sits in, and its folders (the ones
 * a Drive notification channel can watch). Metadata only — nothing is downloaded here. Only
 * `application/pdf` counts; Google Docs, shortcuts and everything else are counted as `ignored`.
 */
import {
  FOLDER_MIME_TYPE,
  PDF_MIME_TYPE,
  describeDriveError,
  getFileMeta,
  listChildren
} from './driveClient.js';
import { runPool } from './retry.js';

const LISTING_CONCURRENCY = 5;
// a runaway tree must not eat the whole run in listing calls
const MAX_FOLDERS = 2000;

/** A problem with the source as a whole; the message is ready for the panel. */
export class ListingError extends Error {}

const joinPath = (parent, name) => (parent ? `${parent}/${name}` : name);

/**
 * @returns {Promise<{
 *   name: string,
 *   files: Array<object & { path: string }>,
 *   folders: Array<{ id: string, path: string }>,
 *   ignored: number,
 *   complete: boolean,
 *   problems: Array<{ name: string, reason: string }>
 * }>}
 *   `complete` is false when some folder could not be read: what is missing from the list is then
 *   not known to be gone, so the caller must not remove anything.
 */
export async function listSource(source, { deadline }) {
  let root;
  try {
    root = await getFileMeta(source.driveId);
  } catch (error) {
    throw new ListingError(describeDriveError(error));
  }

  const empty = { name: root.name, files: [], folders: [], ignored: 0, complete: true, problems: [] };
  // a trashed item is gone as far as the archive is concerned: its documents leave with it
  if (root.trashed) return { ...empty, problems: [{ name: root.name, reason: 'È nel cestino di Drive.' }] };

  if (source.kind === 'file') {
    if (root.mimeType !== PDF_MIME_TYPE) {
      return { ...empty, ignored: 1, problems: [{ name: root.name, reason: 'Non è più un PDF.' }] };
    }
    return { ...empty, files: [{ ...root, path: '' }], folders: [{ id: root.id, path: '' }] };
  }

  if (root.mimeType !== FOLDER_MIME_TYPE)
    throw new ListingError('L’elemento collegato non è più una cartella.');

  const listing = { ...empty, folders: [{ id: root.id, path: '' }] };
  const seen = new Set([root.id]);
  const seenFiles = new Set();
  let truncated = false;
  let level = [{ id: root.id, path: '' }];

  while (level.length) {
    if (Date.now() > deadline)
      throw new ListingError('Tempo esaurito leggendo la cartella: riprovo al prossimo giro.');
    const next = [];
    await runPool(level, LISTING_CONCURRENCY, async folder => {
      let children;
      try {
        children = await listChildren(folder.id);
      } catch (error) {
        // the root was readable a moment ago, so a failing sub-folder is a hole in the listing, not the end of the sync
        listing.complete = false;
        listing.problems.push({ name: folder.path || root.name, reason: describeDriveError(error) });
        return;
      }
      for (const child of children) {
        if (child.mimeType === FOLDER_MIME_TYPE) {
          if (seen.has(child.id)) continue;
          if (seen.size >= MAX_FOLDERS) {
            truncated = true;
            continue;
          }
          seen.add(child.id);
          const entry = { id: child.id, path: joinPath(folder.path, child.name) };
          next.push(entry);
          listing.folders.push(entry);
        } else if (child.mimeType === PDF_MIME_TYPE) {
          // a file kept in two folders of the tree is one document: the first place found is its path
          if (seenFiles.has(child.id)) continue;
          seenFiles.add(child.id);
          listing.files.push({ ...child, path: folder.path });
        } else {
          listing.ignored++;
        }
      }
    });
    level = next;
  }

  if (truncated) {
    listing.complete = false;
    listing.problems.push({
      name: root.name,
      reason: `Più di ${MAX_FOLDERS} cartelle: le altre non sono lette.`
    });
  }
  return listing;
}
