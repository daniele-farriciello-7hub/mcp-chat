/** Firebase Auth errors as sentences the operator can act on. null means "say nothing". */
export function describeAuthError(error) {
  const code = error?.code || '';
  if (
    code.includes('invalid-credential') ||
    code.includes('wrong-password') ||
    code.includes('user-not-found')
  ) {
    return 'Email o password non corretti.';
  }
  if (code.includes('too-many-requests')) return 'Troppi tentativi. Riprova tra qualche minuto.';
  if (code.includes('invalid-email')) return "L'indirizzo email non è valido.";
  if (code.includes('user-disabled')) return 'Questo utente è disabilitato.';
  if (code.includes('popup-closed') || code.includes('cancelled-popup')) return null; // the user closed it
  if (code.includes('popup-blocked'))
    return 'Il browser ha bloccato la finestra di Google. Consentila e riprova.';
  if (code.includes('operation-not-allowed')) return "L'accesso con Google non è attivo su questo progetto.";
  if (code.includes('network')) return 'Non riesco a raggiungere il servizio. Controlla la connessione.';
  return 'Accesso non riuscito. Riprova.';
}
