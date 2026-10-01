/**
 * Smoke-tests the tools endpoint against the emulator (npm run serve), with a real token passed
 * through an environment variable, never a file:
 *
 *   export TOKEN_7HUB='...'        # from the auth_data.token cookie on 7hub
 *   node scripts/smoke-test.mjs
 *   node scripts/smoke-test.mjs rossi
 *
 * Without TOKEN_7HUB only the rejection cases run (disallowed origin, missing or malformed token).
 */

const PROJECT_ID = 'mappa-contatti-217007';
const BASE_URL = process.env.TOOLS_BASE_URL || `http://127.0.0.1:5001/${PROJECT_ID}/europe-west1/tools`;

/** Tolerant of how it was pasted: with or without "Bearer ", quotes, or the whole auth_data cookie JSON. */
function normaliseToken(raw) {
  if (!raw) return undefined;
  let token = raw.trim().replace(/^["']|["']$/g, '');
  if (token.startsWith('{')) {
    try {
      const cookie = JSON.parse(token);
      token = cookie.token || cookie.access_token || cookie.idToken || '';
    } catch {
      // not JSON: use as is
    }
  }
  token = token.replace(/^Bearer\s+/i, '').trim();
  if (token && !token.startsWith('eyJ'))
    console.warn("warning: the token does not start with 'eyJ', probably not a JWT\n");
  return token || undefined;
}

const token = normaliseToken(process.env.TOKEN_7HUB);
const query = process.argv[2] || 'rossi';

async function callTool(tool, body, headers = {}) {
  const startedAt = Date.now();
  try {
    const response = await fetch(`${BASE_URL}/${tool}`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', ...headers },
      body: JSON.stringify(body)
    });
    const data = await response.json().catch(() => null);
    return { status: response.status, data, ms: Date.now() - startedAt };
  } catch (error) {
    return { status: 0, data: { error: error.message }, ms: Date.now() - startedAt };
  }
}

function report(label, result, expectedStatus) {
  const ok = expectedStatus === undefined || result.status === expectedStatus;
  const expected = expectedStatus !== undefined && !ok ? ` (expected ${expectedStatus})` : '';
  console.log(`${ok ? '  ok  ' : ' DIFF '} ${label.padEnd(42)} ${result.status}${expected}  ${result.ms}ms`);
  if (!ok || process.env.VERBOSE) console.log('        ', JSON.stringify(result.data)?.slice(0, 300));
  return ok;
}

// unsigned hand-built tokens: check that the environment is recognised from the issuer
const fakeToken = iss =>
  [
    Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url'),
    Buffer.from(JSON.stringify({ iss, organization: 'weunit', sub: 'test', exp: 9999999999 })).toString(
      'base64url'
    ),
    'invalid-signature'
  ].join('.');

console.log(`\nendpoint: ${BASE_URL}\n`);
const results = [];

// ── must be rejected ─────────────────────────────────────────────────────────
results.push(report('no token', await callTool('search-person', { query }), 401));
results.push(
  report(
    'made-up token',
    await callTool('search-person', { query }, { Authorization: 'Bearer not-a-jwt' }),
    401
  )
);
results.push(
  report(
    'disallowed origin',
    await callTool('search-person', { query }, { Origin: 'https://any-site.example' }),
    403
  )
);
results.push(report('unknown tool', await callTool('made-up', {}), 404));

const unknownIssuer = await callTool(
  'search-person',
  { query },
  { Authorization: `Bearer ${fakeToken('https://keycloak.other-domain.example/realms/weunit')}` }
);
results.push(report('unknown issuer', unknownIssuer, 401));
results.push(
  report(
    '  -> rejected for the issuer, not the signature',
    { status: unknownIssuer.data?.error?.includes('issuer') ? 401 : 0, data: unknownIssuer.data, ms: 0 },
    401
  )
);

const knownIssuer = await callTool(
  'search-person',
  { query },
  { Authorization: `Bearer ${fakeToken('https://keycloak-staging.np.7hub.it/auth/realms/weunit')}` }
);
results.push(report('staging issuer recognised', knownIssuer, 401));
results.push(
  report(
    '  -> reaches signature verification',
    { status: knownIssuer.data?.error?.includes('signature') ? 401 : 0, data: knownIssuer.data, ms: 0 },
    401
  )
);

// ── must work ────────────────────────────────────────────────────────────────
if (!token) {
  console.log('\nTOKEN_7HUB not set: skipping real jsoggetto calls.');
  console.log("To run them:  export TOKEN_7HUB='...'  (from the auth_data.token cookie on 7hub)\n");
} else {
  console.log('');
  const authorization = { Authorization: `Bearer ${token}` };
  const search = await callTool('search-person', { query }, authorization);
  results.push(report(`search-person "${query}"`, search, 200));

  if (search.status === 200 && search.data?.people?.length) {
    console.log(`\n         ${search.data.found} results, first ones:`);
    for (const person of search.data.people.slice(0, 5)) {
      console.log(
        `         · ${[person.lastName, person.firstName].filter(Boolean).join(' ')}  ${person.taxCode || ''}  ${person.email || ''}`
      );
    }
    console.log('');

    const firstPerson = search.data.people[0];
    if (firstPerson?.id) {
      const details = await callTool('person-details', { id: firstPerson.id }, authorization);
      results.push(report(`person-details ${firstPerson.id}`, details, 200));
      if (details.status === 200) console.log('         ', JSON.stringify(details.data));
    }
  } else if (search.status === 200) {
    console.log(`\n         no results for "${query}" — try another last name\n`);
  }
}

const failed = results.filter(ok => !ok).length;
console.log(`\n${results.length - failed}/${results.length} as expected${failed ? `, ${failed} not` : ''}\n`);
process.exit(failed ? 1 : 0);
