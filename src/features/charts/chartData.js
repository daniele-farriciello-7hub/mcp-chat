/**
 * Pure helpers for the charts drawn in the chat (`show_chart`): turning query rows or the model's
 * own values into one chart shape, checking it, and the scale maths. No React, no DOM, so they can
 * be checked in plain node.
 *
 * Chart shape: { type: 'bar' | 'line' | 'donut', title, unit, labels: string[],
 *                series: [{ name, values: number[] }] }
 */

export const CHART_TYPES = ['bar', 'line', 'donut'];

/**
 * Readability limits, set by the admin (settings.chartLimits) within these bounds. They keep a
 * chart legible; they are not a cost control — the app draws the chart, the model only gets a short
 * summary back (`summarize`). Donut slices stop at 8: seven colours plus a grey "Altro".
 */
export const CHART_LIMIT_BOUNDS = {
  bar: { min: 10, max: 200, fallback: 60 },
  line: { min: 50, max: 2000, fallback: 400 },
  donut: { min: 3, max: 8, fallback: 8 },
  series: { min: 1, max: 6, fallback: 4 }
};
export const DEFAULT_CHART_LIMITS = Object.fromEntries(
  Object.entries(CHART_LIMIT_BOUNDS).map(([k, b]) => [k, b.fallback])
);

/** The admin's limits, each kept inside its bounds; anything missing or invalid → default. */
export function chartLimits(stored = {}) {
  return Object.fromEntries(
    Object.entries(CHART_LIMIT_BOUNDS).map(([key, { min, max, fallback }]) => {
      const n = Math.round(Number(stored?.[key]));
      return [key, Number.isFinite(n) && n > 0 ? Math.min(max, Math.max(min, n)) : fallback];
    })
  );
}

/**
 * Categorical colours, fixed order (validated for colour-blind separation against white). Slot 1 is
 * the brand blue, so a single series always looks like the rest of the app.
 */
// seven: a donut has at most seven slices plus a grey "Altro", so no colour is ever reused
export const SERIES_COLORS = ['#2a78d6', '#eb6834', '#1baf7a', '#eda100', '#e87ba4', '#008300', '#4a3aa7'];
export const OTHER_COLOR = '#b4b2a9';

const toNumber = value => {
  if (typeof value === 'number') return Number.isFinite(value) ? value : null;
  if (typeof value !== 'string' || !value.trim()) return null;
  const n = Number(value.trim().replace(/\s/g, ''));
  return Number.isFinite(n) ? n : null;
};

/**
 * Rows of an aggregating query → chart. First column = labels (month, bank…); every other column
 * whose values are numbers = one series, named after the column.
 */
export function chartFromRows({ columns, rows }) {
  if (!columns?.length || !rows?.length) return { error: 'La query non ha restituito righe.' };
  const [labelColumn, ...rest] = columns;
  const numeric = rest.filter(c => rows.every(r => r[c] === null || toNumber(r[c]) !== null));
  if (!numeric.length) {
    return {
      error: `Nessuna colonna numerica: la prima colonna (${labelColumn}) sono le etichette, le altre devono essere numeri.`
    };
  }
  return {
    labels: rows.map(r => String(r[labelColumn] ?? '—')),
    series: numeric.map(c => ({ name: c, values: rows.map(r => toNumber(r[c]) ?? 0) }))
  };
}

/** The model's own values (e.g. read from documents) → chart, with the same checks. */
export function chartFromValues({ labels, series }) {
  if (!Array.isArray(labels) || !labels.length) return { error: 'Servono le etichette (labels).' };
  if (!Array.isArray(series) || !series.length) return { error: 'Serve almeno una serie di valori.' };
  const clean = series.map((s, i) => ({
    name: String(s?.name || `Serie ${i + 1}`),
    values: labels.map((_, j) => toNumber(s?.values?.[j]) ?? 0)
  }));
  return { labels: labels.map(String), series: clean };
}

/** Problems that make the chart wrong or unreadable, as a sentence the model can act on; or null. */
export function chartProblem({ type, labels, series }, limits = DEFAULT_CHART_LIMITS) {
  if (!CHART_TYPES.includes(type)) return `Tipo di grafico non valido: usa ${CHART_TYPES.join(', ')}.`;
  // a donut over the limit is folded into "Altro" when drawn, not refused
  if (type !== 'donut' && labels.length > limits[type]) {
    return `Troppi punti (${labels.length}) per un grafico "${type}": il massimo è ${limits[type]}. Raggruppa i dati (per mese, per banca…) o limita la richiesta.`;
  }
  if (series.length > limits.series) return `Troppe serie (${series.length}): al massimo ${limits.series}.`;
  // one axis only: a series 50 times smaller than another would be a flat line next to it
  if (series.length > 1) {
    const peaks = series.map(s => Math.max(...s.values.map(Math.abs), 0)).filter(p => p > 0);
    if (peaks.length > 1 && Math.max(...peaks) / Math.min(...peaks) > 50) {
      return 'Le serie hanno ordini di grandezza troppo diversi per un solo asse (es. numero di pratiche e importi): fai un grafico per ciascuna.';
    }
  }
  if (type === 'donut') {
    if (series.length > 1) return 'Un grafico a torta ha una sola serie.';
    if (series[0].values.some(v => v < 0))
      return 'Una torta non può avere valori negativi: usa un grafico a barre.';
    if (series[0].values.every(v => v === 0)) return 'Tutti i valori sono zero: non c’è niente da disegnare.';
  }
  return null;
}

/** About five round steps covering [min, max], always including zero. */
export function niceTicks(min, max, count = 5) {
  const lo = Math.min(0, min);
  const hi = Math.max(0, max);
  if (hi === lo) return [0, 1];
  const raw = (hi - lo) / count;
  const magnitude = 10 ** Math.floor(Math.log10(raw));
  const step = [1, 2, 2.5, 5, 10].map(m => m * magnitude).find(s => s >= raw);
  const ticks = [];
  for (let v = Math.floor(lo / step) * step; v <= hi + step * 0.001; v += step)
    ticks.push(Number(v.toFixed(10)));
  if (ticks.at(-1) < hi) ticks.push(ticks.at(-1) + step);
  return ticks;
}

/** Italian number with the chart's unit: 1.234.567 €, 12,5%, 3.200 pratiche. */
export function formatValue(value, unit = '', { compact = false } = {}) {
  const number = new Intl.NumberFormat('it-IT', {
    // decimals only where they carry information: 12,5% yes, 1.500.000,50 € no
    maximumFractionDigits: Number.isInteger(value)
      ? 0
      : Math.abs(value) < 10
        ? 2
        : Math.abs(value) < 100
          ? 1
          : 0,
    ...(compact ? { notation: 'compact', maximumFractionDigits: 1 } : {})
  }).format(value);
  if (!unit) return number;
  return unit === '%' ? `${number}%` : `${number} ${unit}`;
}

/** A donut with more than `max` slices folds the smallest into "Altro". */
export function foldSlices(labels, values, max = DEFAULT_CHART_LIMITS.donut) {
  const items = labels.map((label, i) => ({ label, value: values[i] })).sort((a, b) => b.value - a.value);
  if (items.length <= max) return items;
  const kept = items.slice(0, max - 1);
  const other = items.slice(max - 1).reduce((sum, item) => sum + item.value, 0);
  return [...kept, { label: 'Altro', value: other, other: true }];
}

/**
 * What the model gets back after drawing: every value for a small chart, a fixed-size summary for a
 * large one — so a bigger chart never means a bigger request to the model.
 */
export function summarize({ labels, series }, fullUpTo = 30) {
  if (labels.length <= fullUpTo) return { labels, series };
  return {
    points: labels.length,
    from: labels[0],
    to: labels.at(-1),
    series: series.map(s => {
      const ranked = s.values
        .map((v, i) => ({ label: labels[i], value: v }))
        .sort((a, b) => b.value - a.value);
      return {
        name: s.name,
        total: s.values.reduce((sum, v) => sum + v, 0),
        min: ranked.at(-1),
        max: ranked[0],
        first: s.values[0],
        last: s.values.at(-1),
        top5: ranked.slice(0, 5)
      };
    })
  };
}
