/**
 * `show_chart` tool: a chart drawn by the app in the chat (`features/charts/ChatChart.jsx`) from
 * exact numbers — never an image the model paints. The numbers come either from an aggregating
 * query run by the server (same rules as `query_database`) or from values the model already has
 * (e.g. read in documents). The model gets the numbers back too, small by construction, so its text
 * can comment on them.
 */
import { callFunction } from '@/shared/firebase/functions';
import {
  CHART_TYPES,
  MAX_POINTS,
  MAX_SERIES,
  chartFromRows,
  chartFromValues,
  chartProblem
} from '@/features/charts/chartData';

export const SHOW_CHART_TOOL_NAME = 'show_chart';

export const SHOW_CHART_TOOL = {
  functionDeclarations: [
    {
      name: SHOW_CHART_TOOL_NAME,
      description:
        "Mostra un grafico nella chat, disegnato dall'app con i numeri esatti. Usalo quando l'operatore " +
        'chiede un grafico, o per un andamento nel tempo dove un grafico si legge meglio di una tabella. ' +
        'Due modi: (1) dati dal database — passa connectionId e una query SELECT che AGGREGA: prima ' +
        'colonna le etichette (mese, banca…), poi una colonna numerica per serie, già ordinate; (2) ' +
        'valori che hai già (es. da documenti) — passa labels e series. Tipi: "bar" per confronti fra ' +
        `categorie (max ${MAX_POINTS.bar} barre), "line" per andamenti nel tempo (max ${MAX_POINTS.line} ` +
        `punti), "donut" per le parti di un totale (una sola serie, max ${MAX_POINTS.donut} fette). ` +
        `Al massimo ${MAX_SERIES} serie, tutte con la stessa unità: numeri e importi vanno in due grafici. ` +
        'Il grafico compare da solo sopra la tua risposta: nel testo commenta il dato principale, ' +
        'senza ripetere tutti i numeri.',
      parameters: {
        type: 'object',
        properties: {
          type: { type: 'string', enum: CHART_TYPES, description: 'bar, line o donut.' },
          title: { type: 'string', description: 'Titolo breve, es. "Erogato per mese, 2026".' },
          unit: {
            type: 'string',
            description: 'Unità dei valori, es. "€", "%", "pratiche". Vuota se sono semplici conteggi.'
          },
          connectionId: {
            type: 'string',
            description: 'Per i dati dal database: id della connessione, preso dallo schema ricevuto.'
          },
          sql: {
            type: 'string',
            description: 'Per i dati dal database: una SELECT aggregata (prima colonna = etichette).'
          },
          labels: {
            type: 'array',
            items: { type: 'string' },
            description: 'Per i valori che hai già: le etichette, in ordine.'
          },
          series: {
            type: 'array',
            items: {
              type: 'object',
              properties: {
                name: { type: 'string' },
                values: { type: 'array', items: { type: 'number' } }
              },
              required: ['name', 'values']
            },
            description: 'Per i valori che hai già: una serie per gruppo, un valore per etichetta.'
          }
        },
        required: ['type', 'title']
      }
    }
  ]
};

/** One call to `show_chart`. Returns the `{response}` half of a functionResponse. */
export async function runShowChartCall(
  call,
  { schema, round, index, onActivityStart, onActivityEnd, queryTimeoutSeconds }
) {
  const { type, title, unit, connectionId, sql, labels, series } = call.args || {};
  const activityId = `chart-${round}-${index}`;
  const fromDatabase = Boolean(sql);
  onActivityStart(activityId, {
    kind: 'chart',
    label: 'Preparo il grafico',
    ...(fromDatabase ? { databaseLabel: schema.find(e => e.connectionId === connectionId)?.label } : {})
  });

  const fail = error => {
    onActivityEnd(activityId, { outcome: 'failed', label: 'Grafico non disegnato' });
    // the raw reason goes back to the model, so it can fix the query or regroup the data
    return { response: { error } };
  };

  let data;
  if (fromDatabase) {
    if (!connectionId) return fail('connectionId is required with sql');
    try {
      const result = await callFunction('database', 'chartData', {
        connectionId,
        sql,
        timeoutSeconds: queryTimeoutSeconds
      });
      if (result.tooMany) {
        return fail(
          `La query restituisce più di ${result.maxPoints} righe: aggregale (GROUP BY per mese, per banca…).`
        );
      }
      data = chartFromRows(result);
    } catch (error) {
      return fail(error.message || 'query failed');
    }
  } else {
    data = chartFromValues({ labels, series });
  }
  if (data.error) return fail(data.error);

  const chart = {
    type,
    title: title || 'Grafico',
    unit: unit || '',
    labels: data.labels,
    series: data.series
  };
  const problem = chartProblem(chart);
  if (problem) return fail(problem);

  onActivityEnd(activityId, { outcome: 'done', label: 'Grafico pronto', chart });
  return {
    response: {
      shown: true,
      labels: chart.labels,
      series: chart.series,
      note: 'Il grafico è già visibile sopra la risposta: commenta il dato principale, non ripetere tutti i valori.'
    }
  };
}
