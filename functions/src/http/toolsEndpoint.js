/**
 * HTTP handler exposing assistant tools, one path per tool (POST /tools/<tool-name>). Every call
 * carries the operator's Keycloak token, which is verified here and forwarded to the Java services
 * so they apply that person's permissions.
 *
 * HTTP rather than callable functions: callables carry the Firebase identity and do not let custom
 * headers through, and we need to forward a token Firebase does not know.
 *
 * TODO before release: also verify the caller's Firebase ID token (firebase-admin), which says
 * whether the person may use this app — something the Keycloak token does not.
 */
import { InvalidTokenError, operatorLogFields, verifyOperatorToken } from '../auth/keycloak.js';
import { JavaServiceError } from '../clients/javaClient.js';
import { getPersonDetails, searchPerson } from '../tools/personRegistry.js';
import { describePersonResponseShape } from '../tools/diagnostics.js';
import { applyCors } from './cors.js';

const TOOLS = {
  'search-person': searchPerson,
  'person-details': getPersonDetails,
  // emulator only: describes jsoggetto response shapes to write mappings; never deployed
  ...(process.env.FUNCTIONS_EMULATOR === 'true'
    ? { 'person-response-shape': describePersonResponseShape }
    : {})
};

const sendError = (res, status, message) => res.status(status).json({ error: message });

export async function handleToolRequest(req, res) {
  if (!applyCors(req, res)) return;
  if (req.method === 'OPTIONS') return res.status(204).send('');
  if (req.method !== 'POST') return sendError(res, 405, 'Use POST.');

  // /tools/search-person → search-person
  const toolName = String(req.path || '').replace(/^\/+|\/+$/g, '');
  const tool = TOOLS[toolName];
  if (!tool) {
    return sendError(res, 404, `Unknown tool "${toolName}". Available: ${Object.keys(TOOLS).join(', ')}.`);
  }

  const authorization = req.get('Authorization') || '';
  if (!authorization.startsWith('Bearer ')) {
    return sendError(res, 401, 'Missing operator token in the Authorization header.');
  }

  let operator;
  try {
    operator = await verifyOperatorToken(authorization.slice(7).trim());
  } catch (error) {
    if (error instanceof InvalidTokenError) return sendError(res, 401, `Token rejected: ${error.message}.`);
    throw error;
  }

  console.log(`tool ${toolName}`, operatorLogFields(operator));

  try {
    return res.status(200).json(await tool(operator, req.body || {}));
  } catch (error) {
    if (error instanceof JavaServiceError) return sendError(res, error.status ?? 502, error.message);
    console.error(`tool ${toolName} failed`, error);
    return sendError(res, 500, 'Internal service error.');
  }
}
