'use client';

import { useCallback, useState } from 'react';
import { updateDocumentDescription } from './documentStore';

/**
 * The text sitting in the description fields right now, saved or not. A field saves a moment after
 * typing stops, but what the admin sees must not wait for that: the "Indicizza" buttons react to the
 * text itself, and pressing one first writes whatever is still unsaved, so indexing reads it back from
 * Firestore.
 *
 * `report(id, text)` is for the fields; `withTyped(document)` is the document as the admin sees it,
 * with the text of its field; `saveTyped(documents)` writes the typed text that differs from the saved
 * one (pass the documents as they come from the catalog, not through `withTyped`).
 */
export function useTypedDescriptions() {
  const [texts, setTexts] = useState({});

  const report = useCallback(
    (id, text) => setTexts(current => (current[id] === text ? current : { ...current, [id]: text })),
    []
  );

  const withTyped = document =>
    document.id in texts ? { ...document, description: texts[document.id] } : document;

  const saveTyped = documents =>
    Promise.all(
      documents
        .filter(d => d.id in texts && texts[d.id].trim() !== (d.description || '').trim())
        .map(d => updateDocumentDescription(d.id, texts[d.id]))
    );

  return { report, withTyped, saveTyped };
}
