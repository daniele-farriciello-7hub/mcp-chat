'use client';

import { useEffect, useMemo, useState } from 'react';
import { listenToDocuments } from './documentStore';
import { INDEXING_STATUS } from './schema';
import { fileTypeOf } from './fileTypes';
import { getFileBlocker, nameKey } from './indexability';
import { DOCUMENT_MODE, modeOf } from './archiveMode';
import { matchesCategoryFilter, visibleCategories } from './categories';

const byName = list => list.sort((a, b) => (a.name || '').localeCompare(b.name || '', 'it'));

/** Among documents sharing a name, the one worth showing: the one with a file that can be indexed. */
const preferredCopy = (a, b) => (!getFileBlocker(b) && getFileBlocker(a) ? b : a);

/**
 * Live catalog split into the panel's lists. Names are unique: a name that is already indexed never
 * shows up as "to index" again, and same-name copies are collapsed into one row.
 *
 * `modeFilter` ('all' | 'studied' | 'archive') and `categoryFilter` ('all', NO_CATEGORY or a name of
 * `categories`, the admins' list) narrow every list. `modeCounts`, `categoryCounts` and `withoutCategory`
 * are over the whole archive, whatever the other filters say, for the labels of those filters.
 */
export function useDocuments({
  nameFilter,
  typeFilter,
  modeFilter = 'all',
  categoryFilter = 'all',
  categories = []
}) {
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
    const matchesMode = d => modeFilter === 'all' || modeOf(d) === modeFilter;
    const matchesCategory = d => matchesCategoryFilter(d, categoryFilter, categories);
    const matchesAll = d => matchesName(d) && matchesMode(d) && matchesCategory(d);

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

    const modeCounts = { [DOCUMENT_MODE.studied]: 0, [DOCUMENT_MODE.archive]: 0 };
    const categoryCounts = {};
    let withoutCategory = 0;
    for (const d of all) {
      modeCounts[modeOf(d)]++;
      const own = visibleCategories(d.categories, categories);
      if (!own.length) withoutCategory++;
      for (const name of own) categoryCounts[name] = (categoryCounts[name] || 0) + 1;
    }

    return {
      documents,
      loadError,
      totals: { pending: pending.length, failed: failed.length, indexed: indexed.length },
      pending: byName(pending.filter(d => matchesAll(d) && matchesType(d))),
      failed: byName(failed.filter(d => matchesAll(d) && matchesType(d))),
      indexed: byName(indexed.filter(matchesAll)),
      countByType,
      modeCounts,
      categoryCounts,
      withoutCategory
    };
  }, [documents, loadError, nameFilter, typeFilter, modeFilter, categoryFilter, categories]);
}
