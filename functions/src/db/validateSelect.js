/**
 * Gate for `query_database`: the model writes SQL, this decides whether it ever reaches the server.
 * This is a safety net, not the boundary — the real boundary is a SELECT-only database grant (see
 * the plan's recommendation to the customer). A determined bypass of regex-based validation is
 * always possible; what matters is that the obvious ones (stacked statements, file/system tables,
 * writes) are refused before a socket opens.
 */

export class InvalidQueryError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'InvalidQueryError';
  }
}

const FORBIDDEN_KEYWORDS =
  /\b(INSERT|UPDATE|DELETE|REPLACE|DROP|ALTER|CREATE|TRUNCATE|GRANT|REVOKE|CALL|EXEC|EXECUTE|SET|LOCK|UNLOCK|LOAD_FILE|SLEEP|BENCHMARK)\b/i;
const OUTFILE = /\b(INTO\s+(OUTFILE|DUMPFILE))\b/i;
const SYSTEM_SCHEMA = /\b(mysql|performance_schema|information_schema|sys)\s*\./i;
const STARTS_WITH_SELECT = /^\s*(SELECT|WITH)\b/i;

/** Strips SQL comments so keyword/shape checks cannot hide inside one. Never used for execution. */
function stripComments(sql) {
  return sql
    .replace(/\/\*[\s\S]*?\*\//g, ' ') // /* ... */ (also catches MySQL executable /*! ... */)
    .replace(/--[^\n]*/g, ' ')
    .replace(/#[^\n]*/g, ' ');
}

/** True if `sql` has a second statement after a `;` that is not just trailing whitespace/semicolons. */
function hasStackedStatement(sql) {
  const firstSemicolon = sql.indexOf(';');
  if (firstSemicolon === -1) return false;
  return (
    sql
      .slice(firstSemicolon + 1)
      .trim()
      .replace(/;+$/, '')
      .trim().length > 0
  );
}

/** Table names the query references, best-effort (`FROM`/`JOIN table` or `FROM db.table`). */
function referencedTables(strippedSql) {
  const names = new Set();
  const pattern = /\b(?:FROM|JOIN)\s+`?([A-Za-z0-9_$-]+)`?(?:\s*\.\s*`?([A-Za-z0-9_$-]+)`?)?/gi;
  let match;
  while ((match = pattern.exec(strippedSql))) {
    names.add((match[2] || match[1]).toLowerCase());
  }
  return names;
}

/**
 * Names a query defines rather than reads from the schema: WITH-clause CTEs (`name AS (...)`) and
 * named windows (`WINDOW name AS (...)`) both use exactly this shape, and neither is a real table —
 * `referencedTables` still picks up a later `FROM name`/`JOIN name` that uses one, so those need
 * excluding from the enabled-tables check below, or a query with a CTE is rejected for using a
 * "table" that was never a table at all.
 */
function definedNames(strippedSql) {
  const names = new Set();
  const pattern = /\b([A-Za-z_][A-Za-z0-9_$]*)\s+AS\s*\(/gi;
  let match;
  while ((match = pattern.exec(strippedSql))) {
    names.add(match[1].toLowerCase());
  }
  return names;
}

/**
 * @param {string} sql the model's query
 * @param {{enabledTables: Set<string>, maxRows: number, timeoutSeconds: number}} options
 * @returns {string} the SQL to execute — original text, LIMIT appended if missing, time-boxed
 */
export function validateSelect(sql, { enabledTables, maxRows, timeoutSeconds }) {
  if (typeof sql !== 'string' || !sql.trim()) throw new InvalidQueryError('empty query');
  if (sql.includes('/*!')) throw new InvalidQueryError('MySQL executable comments are not allowed');

  const stripped = stripComments(sql).trim();
  if (!STARTS_WITH_SELECT.test(stripped)) {
    throw new InvalidQueryError('only SELECT (or WITH ... SELECT) statements are allowed');
  }
  if (hasStackedStatement(stripped)) throw new InvalidQueryError('only one statement per call');
  if (FORBIDDEN_KEYWORDS.test(stripped))
    throw new InvalidQueryError('statement contains a disallowed keyword');
  if (OUTFILE.test(stripped)) throw new InvalidQueryError('writing to a file is not allowed');
  if (SYSTEM_SCHEMA.test(stripped)) throw new InvalidQueryError('system tables are not allowed');

  const tables = referencedTables(stripped);
  const defined = definedNames(stripped);
  for (const table of tables) {
    if (defined.has(table)) continue; // a CTE or named window this same query defines, not a table
    if (!enabledTables.has(table)) {
      throw new InvalidQueryError(`table "${table}" is not enabled for this connection`);
    }
  }

  const withoutTrailingSemicolon = stripped.replace(/;+\s*$/, '');
  const hasLimit = /\bLIMIT\s+\d+/i.test(withoutTrailingSemicolon);
  const bounded = hasLimit ? withoutTrailingSemicolon : `${withoutTrailingSemicolon} LIMIT ${maxRows}`;

  // MariaDB-specific: caps how long the server spends on this one statement, independent of the
  // function's own HTTP timeout — see edge case 18.
  return `SET STATEMENT max_statement_time=${Math.max(1, Math.round(timeoutSeconds))} FOR ${bounded}`;
}
