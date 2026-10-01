/**
 * Emulator-only tool describing the shape of jsoggetto responses: field names and types, never
 * values, so mappings can be written without real people's data reaching logs or terminals.
 */
import { callJavaService } from '../clients/javaClient.js';

const MAX_DEPTH = 3;

/** Describes a value's shape. Values never leave this function — only "string(16)", "number", "empty". */
function describeShape(value, depth = 0) {
  if (value === null || value === undefined) return 'empty';
  if (Array.isArray(value)) {
    if (value.length === 0) return 'empty list';
    return [`list of ${value.length}`, depth < MAX_DEPTH ? describeShape(value[0], depth + 1) : '…'];
  }
  if (typeof value === 'object') {
    if (depth >= MAX_DEPTH) return '{…}';
    return Object.fromEntries(Object.keys(value).map(key => [key, describeShape(value[key], depth + 1)]));
  }
  // the length alone tells a tax code (16) from a date (10) without reading it
  if (typeof value === 'string') return value.length ? `string(${value.length})` : 'empty string';
  return typeof value;
}

export async function describePersonResponseShape(operator, { query, id }) {
  if (id) {
    const record = await callJavaService({
      operator,
      service: 'jsoggetto',
      path: `/j/api/v1/anagrafica/pfisica/${encodeURIComponent(id)}`
    });
    return { source: 'pfisica', shape: describeShape(record) };
  }

  const result = await callJavaService({
    operator,
    service: 'jsoggetto',
    path: '/j/api/v1/anagrafica/clienti/search',
    method: 'POST',
    body: {
      pageCount: 1,
      pageSize: 1,
      searchString: String(query || 'rossi').trim(),
      sort: { columnName: 'id', order: 'DESC' }
    }
  });
  return { source: 'clienti/search', shape: describeShape(result) };
}
