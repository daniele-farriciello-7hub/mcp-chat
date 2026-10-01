/**
 * Prints the shape of jsoggetto responses — field names and types, never values — to write the
 * mappings in src/tools/personRegistry.js without exposing real people's data.
 *
 * Needs the emulator running and TOKEN_7HUB set:
 *   node scripts/inspect-response-keys.mjs              the search response
 *   node scripts/inspect-response-keys.mjs <person-id>  a person's record
 */

const PROJECT_ID = 'mappa-contatti-217007';
const BASE_URL = process.env.TOOLS_BASE_URL || `http://127.0.0.1:5001/${PROJECT_ID}/europe-west1/tools`;

const token = (process.env.TOKEN_7HUB || '')
  .trim()
  .replace(/^["']|["']$/g, '')
  .replace(/^Bearer\s+/i, '');

if (!token) {
  console.error("TOKEN_7HUB is required. Example:  export TOKEN_7HUB='...'");
  process.exit(1);
}

const arg = process.argv[2];
const body = arg && arg.includes('-') ? { id: arg } : { query: arg || 'rossi' };

const response = await fetch(`${BASE_URL}/person-response-shape`, {
  method: 'POST',
  headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token}` },
  body: JSON.stringify(body)
});

const data = await response.json().catch(() => null);

if (!response.ok) {
  console.error(`${response.status}:`, data?.error || data);
  process.exit(1);
}

console.log(`\n${data.source} response — field names only, no values:\n`);
console.log(JSON.stringify(data.shape, null, 2));
console.log('');
