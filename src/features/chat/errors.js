/** Model errors as a sentence saying what happened and what the operator can do. */
export function describeModelError(error) {
  const text = String(error?.message || error);

  // A 429 here is Google's Dynamic Shared Quota: the shared capacity for the model was momentarily
  // full for everyone, not a per-user or per-project limit. The app has already retried and tried a
  // fallback model by now, so the text must not suggest that "requests were used up".
  if (/quota|RESOURCE_EXHAUSTED|429/i.test(text)) {
    return 'Il servizio di Google è momentaneamente sovraccarico. Riprova tra qualche minuto.';
  }
  if (/API key|PERMISSION_DENIED|403|not enabled|SERVICE_DISABLED/i.test(text)) {
    return 'Il servizio del modello non risulta abilitato su questo progetto. Serve una verifica di configurazione.';
  }
  if (/network|fetch|Failed to fetch|ENOTFOUND|offline/i.test(text)) {
    return 'Non riesco a raggiungere il servizio. Controlla la connessione e riprova.';
  }
  return 'Qualcosa non ha funzionato nel rispondere. Riprova, e se continua serve un controllo.';
}

const MAX_DETAIL_CHARS = 500;

/**
 * A short technical line for the history (admins only): HTTP status and error code when the message
 * does not already say them, then the message itself, without URLs. Trimmed so one failure cannot
 * bloat a stored conversation.
 */
export function describeErrorDetail(error) {
  const message = String(error?.message || error)
    .replace(/https?:\/\/\S+/g, '[url]')
    .replace(/\s+/g, ' ')
    .trim();
  const status = error?.customErrorData?.status ?? error?.status;
  const extras = [status ? `HTTP ${status}` : null, typeof error?.code === 'string' ? error.code : null]
    .filter(Boolean)
    .filter(extra => !message.includes(extra.replace('HTTP ', '')));
  const detail = extras.length ? `${extras.join(' ')}: ${message}` : message;
  return detail.length > MAX_DETAIL_CHARS ? `${detail.slice(0, MAX_DETAIL_CHARS - 1)}…` : detail;
}
