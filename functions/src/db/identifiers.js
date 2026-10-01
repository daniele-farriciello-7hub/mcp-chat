/**
 * Backtick-quotes a MySQL/MariaDB identifier (database, table or column name). Never build a query
 * by interpolating a name without this: `7hub-revolution-analitica` starts with a digit and
 * contains hyphens, so an unquoted reference is a syntax error, and string concatenation of any
 * identifier is exactly how you'd build one that also breaks out of the quoting.
 */
export function quoteIdentifier(name) {
  if (typeof name !== 'string' || !name) throw new Error('empty identifier');
  return `\`${name.replace(/`/g, '``')}\``;
}

export function qualifiedTable(database, table) {
  return `${quoteIdentifier(database)}.${quoteIdentifier(table)}`;
}
