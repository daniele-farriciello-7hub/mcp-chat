/** The line operators read on the welcome screen when conversations are kept (see Welcome.jsx). */
export const DEFAULT_HISTORY_NOTICE =
  'Le conversazioni sono conservate {giorni} giorni e sono visibili agli amministratori.';

/**
 * The admin's text, or the default, with {giorni} replaced by the retention in days. Retention 0
 * ("Mai") reads "conservate senza scadenza" instead of "conservate 0 giorni".
 */
export const historyNotice = (text, days) => {
  const notice = text?.trim() || DEFAULT_HISTORY_NOTICE;
  if (days === 0)
    return notice.replaceAll('{giorni} giorni', 'senza scadenza').replaceAll('{giorni}', 'senza scadenza');
  return notice.replaceAll('{giorni}', String(days));
};
