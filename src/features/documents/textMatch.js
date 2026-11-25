/**
 * Text comparison shared by the archive search and the categories: capitals, accents and punctuation
 * never matter ("Cessione del Quinto", "cessione del quinto" and "Cessióne-del-quinto" are one thing).
 * Pure.
 */

/** Lower case, no accents, every run of anything that is not a letter or a digit becomes one space. */
export const foldText = value =>
  String(value ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '')
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// Italian function words and the verbs of a request ("mandami", "cerco"): they say nothing about which
// file is wanted, and would match half of the archive.
const STOP_WORDS = new Set(
  (
    'il lo la i gli le un uno una di a da in con su per tra fra e ed o ma che ' +
    'del dello della dei degli delle al allo alla ai agli alle dal dallo dalla dai dagli dalle ' +
    'nel nello nella nei negli nelle sul sullo sulla sui sugli sulle ' +
    'mi ti ci vi si come dove quale quali sono ho hai ha ' +
    'mandami mandare inviami invia dammi dai cerco cerca trova trovami vorrei voglio puoi file'
  ).split(' ')
);

/** The words of a text that tell files apart, folded; if there are only filler words, all of them. */
export function searchTokens(value) {
  const all = foldText(value).split(' ').filter(Boolean);
  const meaningful = all.filter(token => !STOP_WORDS.has(token));
  return meaningful.length ? meaningful : all;
}

/** "mutuo" and "mutui", "modulo" and "moduli", "cessione" and "cessioni" share a stem: the last vowel goes. */
export const stem = token => (token.length > 4 && /[aeio]$/.test(token) ? token.slice(0, -1) : token);

/**
 * How well a word of the query matches a word of the text, from 0 to 1: the same stem, or one beginning
 * the other (a partial or longer form: "banc" in "banche") when both are long enough not to be noise.
 */
export function tokenMatch(queryToken, textToken) {
  const a = stem(queryToken);
  const b = stem(textToken);
  if (a === b) return 1;
  if (Math.min(a.length, b.length) >= 4 && (a.startsWith(b) || b.startsWith(a))) return 0.6;
  return 0;
}
