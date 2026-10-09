/**
 * Assistant replies from Gemini (Firebase AI Logic), streamed through callbacks:
 *
 *   onActivityStart(id, { label, detail })   started doing something visible (e.g. opening a document)
 *   onActivityEnd(id, { outcome, message })  that thing finished: 'done' | 'failed'
 *   onReplyStart()                           text is about to arrive
 *   onChunk(text)                            a piece of text
 *   onDone({ usage, model, durationMs,       end of the reply, with what history records
 *           firstTokenMs, error })
 *
 * Besides talking, the assistant can open indexed documents (tools/readDocument.js), query an
 * enabled database connection (tools/queryDatabase.js), and offer a CSV download of a table it put
 * together from any of the above (tools/exportExcel.js). It cannot yet read or write customers and
 * applications: the instructions make it say so instead of promising.
 */
import { ThinkingLevel } from 'firebase/ai';
import { getModel } from '@/shared/firebase/ai';
import { isTransientError, withRetry } from '@/shared/retry';
import { getChatCatalog } from '@/features/documents/chatCatalog';
import { getChatSchema } from '@/features/database/chatSchema';
import { DEFAULT_SETTINGS } from '@/features/settings/defaultSettings';
import { getSettings, trimHistory } from '@/features/settings/settingsStore';
import { describeModelError } from './errors';
import { buildSystemInstruction, toModelHistory } from './systemPrompt';
import { READ_DOCUMENT_TOOL } from './tools/readDocument';
import { QUERY_DATABASE_TOOL, QUERY_DATABASE_TOOL_NAME } from './tools/queryDatabase';
import { DESCRIBE_TABLE_TOOL, DESCRIBE_TABLE_TOOL_NAME } from './tools/describeTable';
import { EXPORT_EXCEL_TOOL } from './tools/exportExcel';
import { EXPORT_DATABASE_TOOL, EXPORT_DATABASE_TOOL_NAME } from './tools/exportDatabase';
import { showChartTool } from './tools/showChart';
import { chartLimits } from '@/features/charts/chartData';
import { runToolCalls } from './tools/runToolCalls';

/**
 * Gemini 3 spends part of `maxOutputTokens` on internal reasoning before writing, and the setting
 * the admin sets is meant to cap the *reply*. Without this headroom the thinking eats the budget
 * and the answer stops mid-sentence (finishReason MAX_TOKENS) — seen in production with the Pro
 * model: 1152 tokens of thinking left 44 for the text. Only added when a ceiling is set at all.
 */
const THINKING_HEADROOM_TOKENS = 2000;

const DATABASE_TOOL_NAMES = new Set([
  QUERY_DATABASE_TOOL_NAME,
  DESCRIBE_TABLE_TOOL_NAME,
  EXPORT_DATABASE_TOOL_NAME
]);

export async function streamAgentReply({
  text,
  context,
  history = [],
  isAdmin = false,
  onActivityStart,
  onActivityEnd,
  onReplyStart,
  onChunk,
  onDone
}) {
  let replyStarted = false;
  const startedAt = Date.now();
  let firstTokenMs = null;
  const emit = chunk => {
    if (!replyStarted) {
      onReplyStart();
      replyStarted = true;
      firstTokenMs = Date.now() - startedAt;
    }
    onChunk(chunk);
  };
  // summed over every round, tool rounds and the out-of-rounds one included: each one is billed
  const usage = { input: 0, output: 0, thinking: 0 };
  const addUsage = metadata => {
    usage.input += metadata?.promptTokenCount || 0;
    usage.output += metadata?.candidatesTokenCount || 0;
    usage.thinking += metadata?.thoughtsTokenCount || 0;
  };
  let usedModel = null;
  let failed = false;

  try {
    const settings = await getSettings();
    // best effort: an unreachable archive or database must not break the chat, only disable that tool
    const [catalog, schema] = await Promise.all([
      getChatCatalog().catch(() => []),
      getChatSchema().catch(() => [])
    ]);

    // combined into one Tool: Gemini expects every functionDeclarations array under a single tool.
    // export_excel rides along whenever there's at least one other data source to export from —
    // pointless (and not offered) on its own, since it never fetches anything itself.
    const hasDataSource = catalog.length > 0 || schema.length > 0;
    const toolDeclarations = [
      ...(catalog.length ? READ_DOCUMENT_TOOL.functionDeclarations : []),
      ...(schema.length
        ? [
            ...QUERY_DATABASE_TOOL.functionDeclarations,
            ...DESCRIBE_TABLE_TOOL.functionDeclarations,
            ...EXPORT_DATABASE_TOOL.functionDeclarations
          ]
        : []),
      ...(hasDataSource
        ? [
            ...EXPORT_EXCEL_TOOL.functionDeclarations,
            ...showChartTool(chartLimits(settings.chartLimits)).functionDeclarations
          ]
        : [])
    ];

    const buildModel = modelId =>
      getModel({
        model: modelId,
        systemInstruction: buildSystemInstruction({
          instructions: settings.instructions,
          instructionsAttachments: settings.instructionsAttachments,
          context,
          catalog,
          documentSelection: settings.documentSelectionInstructions,
          documentSelectionAttachments: settings.documentSelectionAttachments,
          schema,
          databaseInstructions: settings.databaseInstructions,
          databaseSelection: settings.databaseSelectionInstructions,
          databaseAttachments: settings.databaseAttachments,
          databaseSelectionAttachments: settings.databaseSelectionAttachments
        }),
        generationConfig: {
          temperature: settings.temperature,
          // 0 means "no ceiling of ours": the field is left out and the model's own limit applies
          ...(settings.maxOutputTokens > 0
            ? { maxOutputTokens: settings.maxOutputTokens + THINKING_HEADROOM_TOKENS }
            : {}),
          // an unknown value would silently disable thinking, so fall back to the default
          thinkingConfig: {
            thinkingLevel:
              ThinkingLevel[settings.thinkingLevel] || ThinkingLevel[DEFAULT_SETTINGS.thinkingLevel]
          }
        },
        tools: toolDeclarations.length ? [{ functionDeclarations: toolDeclarations }] : undefined
      });
    // user/assistant only, before trimming: restored activity rows would otherwise eat the limit
    const modelHistory = toModelHistory(
      trimHistory(
        history.filter(m => m.role === 'user' || m.role === 'assistant'),
        settings.historyLimit
      )
    );
    let chat = buildModel(settings.chatModel).startChat({ history: modelHistory });
    usedModel = settings.chatModel;
    // set only when it differs from the chat model; see the switch inside the loop below
    const databaseModelId =
      schema.length && settings.databaseModel && settings.databaseModel !== settings.chatModel
        ? settings.databaseModel
        : null;
    let onDatabaseModel = false;

    // a 503/429 can surface either when opening the stream or while reading its chunks; retrying
    // the whole round is safe as long as no text has reached the user yet — once it has, a retry
    // would show a duplicated answer, so from there the failure just falls through to the catch
    const streamRound = message =>
      withRetry(
        async () => {
          const stream = await chat.sendMessageStream(message);
          // the usage arrives on the stream's last chunk; the aggregated response does not always
          // carry it over (seen as all zeros with Firebase AI Logic), so keep the last one seen
          let usageMetadata = null;
          for await (const chunk of stream.stream) {
            if (chunk.usageMetadata) usageMetadata = chunk.usageMetadata;
            const chunkText = chunk.text();
            if (chunkText) emit(chunkText);
          }
          const response = await stream.response;
          addUsage(response.usageMetadata || usageMetadata);
          return response;
        },
        { attempts: 3, shouldRetry: error => !replyStarted && isTransientError(error) }
      );

    const maxRounds = Math.max(1, settings.maxToolRounds || DEFAULT_SETTINGS.maxToolRounds);
    let outOfRounds = false;
    let message = text;
    for (let round = 0; round < maxRounds; round++) {
      let response = await streamRound(message);
      let calls = response.functionCalls();
      // The first model is about to touch the database: hand the turn to the database model instead.
      // Its call is dropped unrun and the same message goes to a fresh chat on the other model, so it
      // is that model — not this one — that writes the SQL, fixes it and answers. The original question
      // is what is replayed, even from a later round: a function response has no meaning in a chat
      // that never saw the call it answers. It only happens once per turn; every later round, the final answer included, stays on the database model.
      if (databaseModelId && !onDatabaseModel && calls?.some(call => DATABASE_TOOL_NAMES.has(call.name))) {
        onDatabaseModel = true;
        chat = buildModel(databaseModelId).startChat({ history: modelHistory });
        usedModel = databaseModelId;
        response = await streamRound(text);
        calls = response.functionCalls();
      }
      if (response.candidates?.[0]?.finishReason === 'MAX_TOKENS') {
        emit('\n\n[Risposta interrotta: ha superato la lunghezza massima impostata.]');
        break;
      }

      if (!calls?.length) break;
      message = await runToolCalls(calls, {
        catalog,
        schema,
        round,
        isAdmin,
        onActivityStart,
        onActivityEnd,
        maxQueryRows: settings.maxQueryRows || DEFAULT_SETTINGS.maxQueryRows,
        queryTimeoutSeconds: settings.queryTimeoutSeconds || DEFAULT_SETTINGS.queryTimeoutSeconds,
        chartLimits: chartLimits(settings.chartLimits)
      });

      // last round: the documents just read would go in the bin, so spend one more call asking for
      // the answer with what is on the table instead of throwing the work away
      if (round === maxRounds - 1) {
        outOfRounds = true;
        await streamRound(message);
      }
    }

    if (!replyStarted) {
      emit(
        outOfRounds
          ? 'Ho provato ad aprire documenti o interrogare il database ma non sono arrivato a una risposta. Prova a chiedermi una cosa per volta.'
          : 'Non riesco a rispondere a questo. Prova a riformularlo.'
      );
    }
  } catch (error) {
    // the operator sees a readable sentence; the real cause stays in the console
    console.error('[agent] model request failed:', error);
    failed = true;
    emit(describeModelError(error));
  }
  return onDone({ usage, model: usedModel, durationMs: Date.now() - startedAt, firstTokenMs, error: failed });
}
