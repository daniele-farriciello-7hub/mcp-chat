'use client';

import { useState } from 'react';
import { uploadDocument } from './documentStore';

let batchCounter = 0;

const describeUploadError = error =>
  error?.code === 'storage/unauthorized'
    ? 'Non hai il permesso di caricare.'
    : String(error?.message || error);

/**
 * Uploads files one at a time. Each entry is { name, status, error?, documentId? } with status
 * 'queued' | 'uploading' | 'done' | 'failed' | 'duplicate'. The batch stays visible until dismissed,
 * so the admin can go straight on to indexing what was just uploaded — or replace a duplicate, for
 * which the File itself is kept in the entry until the batch is cleared.
 */
export function useUploads() {
  const [uploads, setUploads] = useState([]);
  const [batchId, setBatchId] = useState(0);

  const updateEntry = (index, patch) =>
    setUploads(current => current.map((entry, i) => (i === index ? { ...entry, ...patch } : entry)));

  const uploadOne = async (file, index, options) => {
    updateEntry(index, { status: 'uploading' });
    try {
      updateEntry(index, { status: 'done', documentId: await uploadDocument(file, options) });
    } catch (error) {
      if (error?.code === 'duplicate-name') updateEntry(index, { status: 'duplicate', file });
      else updateEntry(index, { status: 'failed', error: describeUploadError(error) });
    }
  };

  const upload = async fileList => {
    const files = [...fileList];
    setBatchId(++batchCounter);
    setUploads(files.map(file => ({ name: file.name, status: 'queued' })));
    for (const [index, file] of files.entries()) await uploadOne(file, index, {});
  };

  /** Re-runs one upload, overwriting the document that has the same name. */
  const replaceExisting = async index => {
    const entry = uploads[index];
    if (entry?.file) await uploadOne(entry.file, index, { replace: true });
  };

  /** Replaces every duplicate in the batch, one at a time. */
  const replaceAllExisting = async () => {
    const indexes = uploads.reduce((acc, u, i) => (u.status === 'duplicate' ? [...acc, i] : acc), []);
    if (indexes.length === 0) return;
    // queue them all before starting: the replacements run one after the other, and a duplicate still
    // waiting its turn would otherwise keep offering its own button — pressing it uploads the same
    // file a second time, and until then the batch looks like the click did nothing
    const queued = new Set(indexes);
    setUploads(current =>
      current.map((entry, i) => (queued.has(i) ? { ...entry, status: 'queued' } : entry))
    );
    // `uploads` here is the list as it was at the click: still the right place to read each File from
    for (const index of indexes) await replaceExisting(index);
  };

  const summary = {
    batchId,
    total: uploads.length,
    done: uploads.filter(u => u.status === 'done').length,
    failed: uploads.filter(u => u.status === 'failed').length,
    duplicates: uploads.filter(u => u.status === 'duplicate').length,
    running: uploads.some(u => u.status === 'queued' || u.status === 'uploading'),
    current: uploads.find(u => u.status === 'uploading') || null
  };

  return {
    uploads,
    summary,
    uploadedIds: uploads.filter(u => u.documentId).map(u => u.documentId),
    upload,
    replaceExisting,
    replaceAllExisting,
    dismiss: () => setUploads([])
  };
}
