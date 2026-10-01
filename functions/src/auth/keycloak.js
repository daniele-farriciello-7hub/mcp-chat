/**
 * Verifies the operator's Keycloak token and derives what the Java services need: realm (company)
 * and environment. Verification is offline, as in 7hub-cqs: the signature is checked against the
 * realm's public keys, cached by the library.
 *
 * THE ENVIRONMENT COMES FROM THE TOKEN, not from configuration: Java services reject a caller whose
 * environment differs from the token issuer's, with a message that does not say why.
 */
import { createRemoteJWKSet, jwtVerify } from 'jose';

/** Known issuers, and the environment each one implies. */
const ENVIRONMENT_BY_ISSUER_HOST = {
  'keycloak-testing.np.7hub.it': 'test',
  'keycloak-staging.np.7hub.it': 'staging',
  'keycloak.7hub.it': 'production'
};

// one key set per issuer: creating it per request would defeat the cache
const keySets = new Map();

function keySetFor(issuerUrl) {
  if (!keySets.has(issuerUrl)) {
    keySets.set(issuerUrl, createRemoteJWKSet(new URL(`${issuerUrl}/protocol/openid-connect/certs`)));
  }
  return keySets.get(issuerUrl);
}

export class InvalidTokenError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'InvalidTokenError';
  }
}

/** Reads `iss` without verifying anything: only used to pick the keys. */
function readUnverifiedIssuer(token) {
  const parts = token.split('.');
  if (parts.length !== 3) throw new InvalidTokenError('not a JWT');
  try {
    const payload = JSON.parse(Buffer.from(parts[1], 'base64url').toString('utf8'));
    if (!payload.iss) throw new Error();
    return payload.iss.replace(/\/+$/, '');
  } catch {
    throw new InvalidTokenError('unreadable token');
  }
}

/**
 * Checks the token and returns the operator's identity. Throws InvalidTokenError when the token is
 * expired, malformed, or issued by an unknown Keycloak.
 *
 * @param {string} token the JWT, without "Bearer "
 * @returns {Promise<{token: string, realm: string, environment: string, id: string, email?: string, name?: string}>}
 */
export async function verifyOperatorToken(token) {
  if (!token || typeof token !== 'string') throw new InvalidTokenError('missing token');

  const issuer = readUnverifiedIssuer(token);
  const issuerHost = new URL(issuer).host;
  const environment = ENVIRONMENT_BY_ISSUER_HOST[issuerHost];
  if (!environment) throw new InvalidTokenError(`unknown issuer: ${issuerHost}`);

  let payload;
  try {
    ({ payload } = await jwtVerify(token, keySetFor(issuer), { issuer }));
  } catch (error) {
    throw new InvalidTokenError(error.code === 'ERR_JWT_EXPIRED' ? 'token expired' : 'invalid signature');
  }

  // the realm is the `organization` claim, as in 7hub-cqs (keycloak.service.ts, resolveRealm)
  const realm = payload.organization;
  if (!realm) throw new InvalidTokenError('token declares no organization');

  return {
    token,
    realm: String(realm).toLowerCase(),
    environment,
    id: payload.sub,
    email: payload.email,
    name: payload.name || payload.preferred_username
  };
}

/** For logs only: never the token, just who and where. */
export const operatorLogFields = operator => ({
  realm: operator.realm,
  environment: operator.environment,
  id: operator.id
});
