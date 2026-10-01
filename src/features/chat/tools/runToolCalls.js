/**
 * Dispatches the model's tool calls (one or several, possibly a mix) to the right handler and
 * builds the reply to send back: one functionResponse per call, mandatory and errors included — the
 * model waits for it, so a handler that throws must still produce one instead of losing the round.
 */
import { READ_DOCUMENT_TOOL_NAME, runReadDocumentCall } from './readDocument';
import { QUERY_DATABASE_TOOL_NAME, runQueryDatabaseCall } from './queryDatabase';
import { DESCRIBE_TABLE_TOOL_NAME, runDescribeTableCall } from './describeTable';
import { EXPORT_EXCEL_TOOL_NAME, runExportExcelCall } from './exportExcel';

const HANDLERS = {
  [READ_DOCUMENT_TOOL_NAME]: runReadDocumentCall,
  [QUERY_DATABASE_TOOL_NAME]: runQueryDatabaseCall,
  [DESCRIBE_TABLE_TOOL_NAME]: runDescribeTableCall,
  [EXPORT_EXCEL_TOOL_NAME]: runExportExcelCall
};

export async function runToolCalls(calls, context) {
  const responses = [];
  for (const [index, call] of calls.entries()) {
    const handler = HANDLERS[call.name];
    let result;
    if (!handler) {
      result = { response: { error: 'unknown tool' } };
    } else {
      try {
        result = await handler(call, { ...context, index });
      } catch (error) {
        console.error(`[chat] tool "${call.name}" failed:`, error);
        result = { response: { error: error.message || 'tool failed' } };
      }
    }
    responses.push({ functionResponse: { id: call.id, name: call.name, ...result } });
  }
  return responses;
}
