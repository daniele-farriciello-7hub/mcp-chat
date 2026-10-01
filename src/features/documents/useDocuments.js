'use client';

import { useEffect, useMemo, useState } from 'react';
import { listenToDocuments } from './documentStore';
import { INDEXING_STATUS } from './schema';
import { fileTypeOf } from './fileTypes';
import { canIndexNow, nameKey } from './indexability';

const byName = list => list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it'));

/** Among documents sharing a name, the one worth showing: the one that can be indexed now. */
const preferredCopy = (a, b) => (canIndexNow(b) && !canIndexNow(a) ? b : a);

/**
 * Live catalog split into the panel's lists. Names are unique: a name that is already indexed never
 * shows up as "to index" again, and same-name copies are collapsed into one row.
 */
export function useDocuments({ nameFilter, typeFilter }) {
  const [documents, setDocuments] = useState(null);
  const [loadError, setLoadError] = useState(null);

  useEffect(
    () =>
      listenToDocuments(setDocuments, error => {
        console.error('[documents] read failed:', error);
        setLoadError(
          error?.code === 'permission-denied'
            ? 'Il tuo account non può leggere i documenti.'
            : 'Non riesco a leggere i documenti.'
        );
      }),
    []
  );

  return useMemo(() => {
    const all = documents || [];
    const needle = nameFilter.trim().toLowerCase();
    const matchesName = d => !needle || d.name?.toLowerCase().includes(needle);
    const matchesType = d => typeFilter === 'all' || fileTypeOf(d.mimeType) === typeFilter;

    const indexed = all.filter(d => d.indexingStatus === INDEXING_STATUS.done);
    const indexedNames = new Set(indexed.map(nameKey));

    const notIndexedByName = new Map();
    for (const d of all) {
      if (d.indexingStatus === INDEXING_STATUS.done || indexedNames.has(nameKey(d))) continue;
      const current = notIndexedByName.get(nameKey(d));
      notIndexedByName.set(nameKey(d), current ? preferredCopy(current, d) : d);
    }
    const notIndexed = [...notIndexedByName.values()];
    const pending = notIndexed.filter(d => d.indexingStatus !== INDEXING_STATUS.failed);
    const failed = notIndexed.filter(d => d.indexingStatus === INDEXING_STATUS.failed);

    const countByType = notIndexed.reduce((counts, d) => {
      const type = fileTypeOf(d.mimeType);
      return { ...counts, [type]: (counts[type] || 0) + 1 };
    }, {});

    return {
      documents,
      loadError,
      totals: { pending: pending.length, failed: failed.length, indexed: indexed.length },
      pending: byName(pending.filter(d => matchesName(d) && matchesType(d))),
      failed: byName(failed.filter(d => matchesName(d) && matchesType(d))),
      indexed: byName(indexed.filter(matchesName)),
      countByType
    };
  }, [documents, loadError, nameFilter, typeFilter]);
}
