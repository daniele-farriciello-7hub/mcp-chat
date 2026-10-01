/** Model errors as a sentence saying what happened and what the operator can do. */
export function describeModelError(error) {
  const text = String(error?.message || error);

  if (/quota|RESOURCE_EXHAUSTED|429/i.test(text)) {
    return 'Ho esaurito le richieste disponibili per ora. Riprova tra qualche minuto.';
  }
  if (/API key|PERMISSION_DENIED|403|not enabled|SERVICE_DISABLED/i.test(text)) {
    return 'Il servizio del modello non risulta abilitato su questo progetto. Serve una verifica di configurazione.';
  }
  if (/network|fetch|Failed to fetch|ENOTFOUND|offline/i.test(text)) {
    return 'Non riesco a raggiungere il servizio. Controlla la connessione e riprova.';
  }
  return 'Qualcosa non ha funzionato nel rispondere. Riprova, e se continua serve un controllo.';
}
