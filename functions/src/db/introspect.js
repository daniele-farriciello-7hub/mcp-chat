/**
 * Reads a database's schema from `INFORMATION_SCHEMA`, never from user data. `COLUMN_TYPE` (not
 * `DATA_TYPE`) carries the ENUM value list for free — e.g. `enum('mutuo','prestito')` — the single
 * most useful thing for the model when a column name alone does not say what it means.
 *
 * Row counts from `INFORMATION_SCHEMA.TABLES` are InnoDB estimates, sometimes off by 50%: callers
 * must label them "circa" and never let the model quote one as an exact count.
 */
import { withConnection } from './mysqlClient.js';

/**
 * @returns {Promise<Array<{name, type: 'table'|'view', comment, approxRows, columns, primaryKey, foreignKeys}>>}
 */
export async function scanSchema(connectionId) {
  return withConnection(connectionId, async (pool, database) => {
    const [[tableRows], [columnRows], [fkRows]] = await Promise.all([
      pool.query(
        `SELECT TABLE_NAME, TABLE_TYPE, TABLE_COMMENT, TABLE_ROWS
         FROM INFORMATION_SCHEMA.TABLES
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME`,
        [database]
      ),
      pool.query(
        `SELECT TABLE_NAME, COLUMN_NAME, DATA_TYPE, COLUMN_TYPE, IS_NULLABLE, COLUMN_KEY,
                COLUMN_DEFAULT, COLUMN_COMMENT, ORDINAL_POSITION
         FROM INFORMATION_SCHEMA.COLUMNS
         WHERE TABLE_SCHEMA = ?
         ORDER BY TABLE_NAME, ORDINAL_POSITION`,
        [database]
      ),
      pool.query(
        `SELECT TABLE_NAME, COLUMN_NAME, REFERENCED_TABLE_NAME, REFERENCED_COLUMN_NAME
         FROM INFORMATION_SCHEMA.KEY_COLUMN_USAGE
         WHERE TABLE_SCHEMA = ? AND REFERENCED_TABLE_NAME IS NOT NULL`,
        [database]
      )
    ]);

    const columnsByTable = new Map();
    for (const row of columnRows) {
      const list = columnsByTable.get(row.TABLE_NAME) || [];
      list.push({
        name: row.COLUMN_NAME,
        dataType: row.DATA_TYPE,
        // full declared type, enum values included, e.g. "enum('mutuo','prestito')"
        columnType: row.COLUMN_TYPE,
        nullable: row.IS_NULLABLE === 'YES',
        key: row.COLUMN_KEY || null, // 'PRI' | 'UNI' | 'MUL' | null
        default: row.COLUMN_DEFAULT,
        comment: row.COLUMN_COMMENT || ''
      });
      columnsByTable.set(row.TABLE_NAME, list);
    }

    const fksByTable = new Map();
    for (const row of fkRows) {
      const list = fksByTable.get(row.TABLE_NAME) || [];
      list.push({
        column: row.COLUMN_NAME,
        referencedTable: row.REFERENCED_TABLE_NAME,
        referencedColumn: row.REFERENCED_COLUMN_NAME
      });
      fksByTable.set(row.TABLE_NAME, list);
    }

    return tableRows.map(row => {
      const columns = columnsByTable.get(row.TABLE_NAME) || [];
      return {
        name: row.TABLE_NAME,
        type: row.TABLE_TYPE === 'VIEW' ? 'view' : 'table',
        comment: row.TABLE_COMMENT || '',
        // null for views, and an estimate for InnoDB tables — never an exact count
        approxRows: row.TABLE_TYPE === 'VIEW' ? null : Number(row.TABLE_ROWS) || 0,
        columns,
        primaryKey: columns.filter(c => c.key === 'PRI').map(c => c.name),
        foreignKeys: fksByTable.get(row.TABLE_NAME) || []
      };
    });
  });
}
