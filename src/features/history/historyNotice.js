/** The line operators read on the welcome screen when conversations are kept (see Welcome.jsx). */
export const DEFAULT_HISTORY_NOTICE =
  'Le conversazioni sono conservate {giorni} giorni e sono visibili agli amministratori.';

/** The admin's text, or the default, with {giorni} replaced by the retention in days. */
export const historyNotice = (text, days) =>
  (text?.trim() || DEFAULT_HISTORY_NOTICE).replaceAll('{giorni}', String(days));
