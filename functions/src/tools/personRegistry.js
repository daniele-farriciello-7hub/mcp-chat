/**
 * First real assistant tool: search a person in the registry and read their record. jsoggetto is
 * called with the operator's token, so only people that operator may see come back.
 *
 * Responses are trimmed before leaving: the model pays for every field, and jsoggetto's full
 * record (documents, incomes, commitments, household) is huge. Details are asked for explicitly.
 * Input fields read from jsoggetto (`nome`, `codiceFiscale`, `recapiti`…) are that service's schema.
 */
import { callJavaService } from '../clients/javaClient.js';

const MAX_RESULTS = 10;

const countOf = value => (Array.isArray(value) ? value.length : 0);

/** Email and phone are not flat fields: they live in `recapiti`, each with a type. */
function contactDetails(person) {
  const contacts = Array.isArray(person.recapiti) ? person.recapiti : [];
  const firstOfType = type =>
    contacts.find(c =>
      String(c?.tipo || c?.tipoRecapito || '')
        .toLowerCase()
        .includes(type)
    )?.valore;

  return {
    email: firstOfType('mail') || person.email || undefined,
    phone: firstOfType('tel') || firstOfType('cell') || person.telefono || undefined
  };
}

/** The fields that identify a person, and nothing else. */
function compactPerson(person) {
  if (!person || typeof person !== 'object') return null;
  return {
    id: person.did || person.personDid || person.id,
    firstName: person.nome,
    lastName: person.cognome,
    taxCode: person.codiceFiscale || person.codice_fiscale,
    ...contactDetails(person)
  };
}

function firstAddress(person) {
  const address = Array.isArray(person.indirizzi) ? person.indirizzi[0] : null;
  if (!address) return undefined;
  return {
    street: address.via || address.indirizzo,
    municipality: address.comune,
    province: address.provincia,
    postalCode: address.cap
  };
}

/**
 * Searches people by first name, last name, tax code or free text.
 * @param {object} operator result of verifyOperatorToken()
 * @param {{query: string}} args
 */
export async function searchPerson(operator, { query }) {
  if (!query || String(query).trim().length < 3) {
    return { error: 'Serve almeno una parola di tre lettere per cercare.' };
  }

  const data = await callJavaService({
    operator,
    service: 'jsoggetto',
    path: '/j/api/v1/anagrafica/clienti/search',
    method: 'POST',
    body: {
      pageCount: 1,
      // jsoggetto accepts huge page sizes, but only the first results are worth the model's time
      pageSize: MAX_RESULTS,
      searchString: String(query).trim(),
      sort: { columnName: 'id', order: 'DESC' }
    }
  });

  const rows = Array.isArray(data) ? data : data?.content || data?.results || [];
  return { found: rows.length, people: rows.slice(0, MAX_RESULTS).map(compactPerson) };
}

/**
 * The record of a natural person.
 * @param {object} operator
 * @param {{id: string}} args the id returned by searchPerson
 */
export async function getPersonDetails(operator, { id }) {
  if (!id) return { error: 'Manca l’identificativo della persona.' };

  const data = await callJavaService({
    operator,
    service: 'jsoggetto',
    path: `/j/api/v1/anagrafica/pfisica/${encodeURIComponent(id)}`
  });
  if (!data) return { error: 'Nessuna persona con questo identificativo.' };

  return {
    ...compactPerson(data),
    birth: data.nascita
      ? { date: data.nascita.data, municipality: data.nascita.comune, province: data.nascita.provincia }
      : undefined,
    residence: firstAddress(data),
    // counts instead of contents: they tell the model what it can ask for
    has: {
      documents: countOf(data.documenti),
      incomes: countOf(data.redditi),
      commitments: countOf(data.impegni),
      household: countOf(data.abitazioni || data.nucleoFamiliare)
    }
  };
}
