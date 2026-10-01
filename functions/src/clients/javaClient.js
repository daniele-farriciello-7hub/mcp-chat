/**
 * Client for 7hub's Java services. The operator's token is forwarded as is, so Java sees the
 * operator — ACLs and the sales hierarchy keep applying without reimplementing them (same model as
 * 7hub-cqs javaservice.service.ts). Base URLs mirror
 * 7hub-revolution/packages/frontend/app/scripts/services/url_config.js.
 */

const SERVICE_BASE_URLS = {
  jsoggetto: {
    test: 'https://jsoggetto-testing.np.7hub.it',
    staging: 'https://jsoggetto-staging.np.7hub.it',
    production: 'https://jsoggetto.7hub.it'
  },
  jutility: {
    test: 'https://jutility-testing.np.7hub.it',
    staging: 'https://jutility-staging.np.7hub.it',
    production: 'https://jutility.7hub.it'
  },
  intranet: {
    test: 'https://intranet-testing.np.7hub.it',
    staging: 'https://intranet-staging.np.7hub.it',
    production: 'https://intranet.7hub.it'
  }
};

// A wrong write in staging wastes time; in production it edits a real person's record.
const PRODUCTION_WRITES_ALLOWED = process.env.ALLOW_PRODUCTION_WRITES === 'true';

const TIMEOUT_MS = 20000;

export class JavaServiceError extends Error {
  constructor(message, status) {
    super(message);
    this.name = 'JavaServiceError';
    this.status = status;
  }
}

/**
 * Calls a Java service on behalf of the operator.
 *
 * @param {object} options
 * @param {object} options.operator result of verifyOperatorToken()
 * @param {string} options.service a key of SERVICE_BASE_URLS
 * @param {string} options.path e.g. '/j/api/v1/anagrafica/clienti/search'
 * @param {'GET'|'POST'|'PUT'|'DELETE'} [options.method]
 * @param {object} [options.body]
 */
export async function callJavaService({ operator, service, path, method = 'GET', body }) {
  const baseUrl = SERVICE_BASE_URLS[service]?.[operator.environment];
  if (!baseUrl) {
    throw new JavaServiceError(
      `service ${service} is not configured for environment ${operator.environment}`,
      500
    );
  }

  if (method !== 'GET' && operator.environment === 'production' && !PRODUCTION_WRITES_ALLOWED) {
    throw new JavaServiceError('writes to production are disabled on this service', 403);
  }

  const url = `${baseUrl}${path.startsWith('/') ? '' : '/'}${path}`;
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), TIMEOUT_MS);

  let response;
  try {
    response = await fetch(url, {
      method,
      headers: {
        Authorization: `Bearer ${operator.token}`,
        Accept: 'application/json',
        ...(body ? { 'Content-Type': 'application/json' } : {})
      },
      body: body ? JSON.stringify(body) : undefined,
      signal: controller.signal
    });
  } catch (error) {
    if (error.name === 'AbortError') {
      throw new JavaServiceError(`${service} did not answer within ${TIMEOUT_MS / 1000} seconds`, 504);
    }
    throw new JavaServiceError(`${service} is unreachable`, 502);
  } finally {
    clearTimeout(timeout);
  }

  const text = await response.text();

  if (!response.ok) {
    // 401/403 from Java almost always mean wrong environment or missing scopes; Java's own
    // "error in authorizing the url" does not say so
    if (response.status === 401 || response.status === 403) {
      throw new JavaServiceError(
        `${service} rejected the operator token (environment ${operator.environment}). ` +
          'Usually a token issued by another environment’s Keycloak, or without the required scopes.',
        response.status
      );
    }
    throw new JavaServiceError(`${service} answered ${response.status}`, response.status);
  }

  let data;
  try {
    data = JSON.parse(text);
  } catch {
    throw new JavaServiceError(`${service} answered something that is not JSON`, 502);
  }

  // Java services wrap everything in { results: { success, data, message } }; `success` is the string "true"
  if (data?.results) {
    const { success, data: payload, message } = data.results;
    if (success === 'true' || success === true) return payload;
    throw new JavaServiceError(message || `${service} reported an error`, 400);
  }

  return data;
}
