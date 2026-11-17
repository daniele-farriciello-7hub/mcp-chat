/**
 * The folders and files of one Drive source, as the file browser shows them. Pure: it only reads the
 * archive's own documents, so there is no Drive call and no extra state.
 *
 * A Drive document carries `drivePath`, the folder it sits in relative to the source's root ('' = the
 * root itself, segments joined by '/': joinPath in functions/src/drive/listing.js). Folders are
 * therefore derived from the paths of the PDFs: a folder without PDFs has no document to come from and
 * does not appear. A path is a list of folder names, `[]` being the root.
 */
import { INDEXING_STATUS } from '@/features/documents/schema';

const collator = new Intl.Collator('it', { numeric: true, sensitivity: 'base' });

/** A copy of `items` ordered by name, the way a file manager lists them ("2" before "10"). */
export const sortByName = items => [...items].sort((a, b) => collator.compare(a.name || '', b.name || ''));

/** 'done' | 'failed' | 'pending': whatever the server has not finished with counts as pending. */
export function indexingStateOf(document) {
  if (document.indexingStatus === INDEXING_STATUS.done) return INDEXING_STATUS.done;
  if (document.indexingStatus === INDEXING_STATUS.failed) return INDEXING_STATUS.failed;
  return INDEXING_STATUS.pending;
}

const emptyCounts = () => ({ total: 0, done: 0, pending: 0, failed: 0 });

function addToCounts(counts, document) {
  counts.total++;
  counts[indexingStateOf(document)]++;
}

/** `{ total, done, pending, failed }` for the documents. */
export function countByState(documents) {
  const counts = emptyCounts();
  for (const document of documents) addToCounts(counts, document);
  return counts;
}

/** The folder names a document sits under. */
const pathOf = document =>
  String(document.drivePath || '')
    .split('/')
    .filter(Boolean);

/** `[{ document, segments }]`: the paths are split once, then browsed as often as needed. */
export const indexDocuments = documents =>
  documents.map(document => ({ document, segments: pathOf(document) }));

const isInside = (segments, path) => path.every((name, depth) => segments[depth] === name);

/**
 * The deepest part of `path` that still holds documents. After a sync removes a folder's last file,
 * a browser sitting in it falls back to the nearest folder that is still there.
 */
export function existingPath(entries, path) {
  for (let depth = path.length; depth > 0; depth--) {
    const candidate = path.slice(0, depth);
    if (entries.some(entry => entry.segments.length >= depth && isInside(entry.segments, candidate))) {
      return candidate;
    }
  }
  return [];
}

/**
 * What the folder at `path` shows: its sub-folders (each with the counts of every PDF inside it,
 * nested ones included) and the PDFs sitting directly in it, both ordered by name.
 * @returns {{ folders: Array<{ name: string, total: number, done: number, pending: number, failed: number }>, files: object[] }}
 */
export function listFolder(entries, path) {
  const folders = new Map();
  const files = [];
  for (const { document, segments } of entries) {
    if (segments.length < path.length || !isInside(segments, path)) continue;
    if (segments.length === path.length) {
      files.push(document);
      continue;
    }
    const name = segments[path.length];
    if (!folders.has(name)) folders.set(name, { name, ...emptyCounts() });
    addToCounts(folders.get(name), document);
  }
  return { folders: sortByName(folders.values()), files: sortByName(files) };
}
