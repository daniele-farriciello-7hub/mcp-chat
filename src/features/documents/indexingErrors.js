/**
 * Raw indexing errors (stored as they are on the document, for debugging) turned into one short
 * sentence for the panel.
 */
export function describeIndexingError(rawError) {
  const text = String(rawError || '');
  if (/\b503\b|UNAVAILABLE|overloaded/i.test(text)) {
    return 'Gemini era sovraccarico e non ha risposto. Riprova.';
  }
  if (/\b429\b|RESOURCE_EXHAUSTED|quota/i.test(text)) {
    return 'Troppe richieste a Gemini in poco tempo. Riprova tra qualche minuto.';
  }
  if (/MAX_TOKENS|troncata/i.test(text)) {
    return 'Documento troppo lungo per la scheda: riprova, eventualmente con il modello Pro.';
  }
  if (/non indicizzabile|Formato/i.test(text)) return 'Formato non supportato: convertilo in PDF.';
  if (/\b403\b|PERMISSION_DENIED/i.test(text)) return 'Gemini non ha il permesso di leggere il file.';
  if (/JSON/i.test(text)) return 'Gemini ha risposto in modo non valido. Riprova.';
  return 'Indicizzazione non riuscita. Riprova.';
}
