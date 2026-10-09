/**
 * A chart in the chat, drawn by the app from exact numbers (`show_chart`): never an image the model
 * made up. Bars, line or donut; hover for the exact value; a legend from two series up; "Mostra i
 * dati" for the table behind it; PNG and Excel downloads.
 *
 * Laid out in real pixels from the measured width (not a stretched viewBox), so labels stay sharp
 * in the narrow 7hub panel. Colours: fixed categorical order from `chartData.js`, validated for
 * colour-blind separation; values and labels are always in text colours, never the series colour.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, Download, Image as ImageIcon, Table2 } from 'lucide-react';
import { downloadXlsx, slugify } from '@/shared/xlsx';
import { OTHER_COLOR, SERIES_COLORS, foldSlices, formatValue, niceTicks } from './chartData';

const HEIGHT = 240;
const INK = '#16233f';
const MUTED = '#51607a';
const GRID = '#e3e8f0';
const FONT = 'Inter, system-ui, sans-serif';

function useWidth() {
  const ref = useRef(null);
  const [width, setWidth] = useState(0);
  useEffect(() => {
    const element = ref.current;
    if (!element) return undefined;
    const observer = new ResizeObserver(([entry]) => setWidth(Math.floor(entry.contentRect.width)));
    observer.observe(element);
    return () => observer.disconnect();
  }, []);
  return [ref, width];
}

/** Tooltip box placed next to the pointer, kept inside the chart. */
function Tooltip({ x, y, width, lines }) {
  const boxWidth = Math.min(220, Math.max(...lines.map(l => l.text.length)) * 6.6 + 24);
  const left = Math.min(Math.max(x - boxWidth / 2, 0), width - boxWidth);
  const top = Math.max(y - 12 - lines.length * 18 - 10, 0);
  return (
    <g pointerEvents="none">
      <rect
        x={left}
        y={top}
        width={boxWidth}
        height={lines.length * 18 + 10}
        rx={8}
        fill={INK}
        opacity={0.94}
      />
      {lines.map((line, i) => (
        <g key={i}>
          {line.color && (
            <rect x={left + 10} y={top + 9 + i * 18} width={8} height={8} rx={2} fill={line.color} />
          )}
          <text
            x={left + (line.color ? 24 : 10)}
            y={top + 17 + i * 18}
            fill="#fff"
            fontSize={11}
            fontWeight={line.bold ? 600 : 400}
          >
            {line.text}
          </text>
        </g>
      ))}
    </g>
  );
}

/** Truncates a category label to fit `max` characters. */
const short = (label, max) => (label.length > max ? `${label.slice(0, max - 1)}…` : label);

function CartesianChart({ chart, width }) {
  const [hover, setHover] = useState(null);
  const { type, labels, series, unit } = chart;
  const all = series.flatMap(s => s.values);
  const ticks = niceTicks(Math.min(...all), Math.max(...all));
  const lo = ticks[0];
  const hi = ticks.at(-1);
  const left = Math.max(...ticks.map(t => formatValue(t, '', { compact: true }).length)) * 6.5 + 14;
  const right = 12;
  const top = 12;
  const bottom = 34;
  const plotWidth = width - left - right;
  const plotHeight = HEIGHT - top - bottom;
  const y = v => top + plotHeight - ((v - lo) / (hi - lo)) * plotHeight;
  const band = plotWidth / labels.length;
  // every label whose text fits; otherwise every 2nd, 3rd… so they never overlap
  const longest = Math.min(Math.max(...labels.map(l => l.length)), 12);
  const labelEvery = Math.max(1, Math.ceil((longest * 6.2 + 10) / band));
  const maxLabelChars = Math.max(4, Math.floor((band * labelEvery - 6) / 6.2));

  const tooltip = hover !== null && {
    x: left + band * (hover + 0.5),
    y:
      type === 'line'
        ? Math.min(...series.map(s => y(s.values[hover])))
        : y(Math.max(...series.map(s => s.values[hover]))),
    lines: [
      { text: labels[hover], bold: true },
      ...series.map((s, i) => ({
        text: `${series.length > 1 ? `${s.name}: ` : ''}${formatValue(s.values[hover], unit)}`,
        color: series.length > 1 ? SERIES_COLORS[i] : undefined
      }))
    ]
  };

  return (
    <svg width={width} height={HEIGHT} role="img" aria-label={chart.title} style={{ fontFamily: FONT }}>
      {ticks.map(t => (
        <g key={t}>
          <line
            x1={left}
            x2={width - right}
            y1={y(t)}
            y2={y(t)}
            stroke={t === 0 ? '#c9d2df' : GRID}
            strokeWidth={1}
          />
          <text x={left - 8} y={y(t) + 4} textAnchor="end" fontSize={10} fill={MUTED}>
            {formatValue(t, '', { compact: true })}
          </text>
        </g>
      ))}

      {labels.map((label, i) =>
        i % labelEvery === 0 ? (
          <text
            key={i}
            x={left + band * (i + 0.5)}
            y={HEIGHT - 12}
            textAnchor="middle"
            fontSize={10}
            fill={MUTED}
          >
            {short(label, maxLabelChars)}
          </text>
        ) : null
      )}

      {type === 'bar' &&
        labels.map((_, i) => {
          const groupWidth = Math.min(band * 0.72, 56);
          const barWidth = Math.max(2, (groupWidth - 2 * (series.length - 1)) / series.length);
          const start = left + band * i + (band - groupWidth) / 2;
          return series.map((s, k) => {
            const v = s.values[i];
            const x = start + k * (barWidth + 2);
            const y0 = y(0);
            const y1 = y(v);
            const h = Math.abs(y0 - y1);
            const r = Math.min(4, barWidth / 2, h);
            const up = v >= 0;
            // rounded on the data end only, square on the baseline
            const d = up
              ? `M${x},${y0} V${y1 + r} Q${x},${y1} ${x + r},${y1} H${x + barWidth - r} Q${x + barWidth},${y1} ${x + barWidth},${y1 + r} V${y0} Z`
              : `M${x},${y0} V${y1 - r} Q${x},${y1} ${x + r},${y1} H${x + barWidth - r} Q${x + barWidth},${y1} ${x + barWidth},${y1 - r} V${y0} Z`;
            return (
              <path
                key={`${i}-${k}`}
                d={h < 0.5 ? '' : d}
                fill={SERIES_COLORS[k]}
                opacity={hover === null || hover === i ? 1 : 0.45}
              />
            );
          });
        })}

      {type === 'line' &&
        series.map((s, k) => {
          const points = s.values.map((v, i) => `${left + band * (i + 0.5)},${y(v)}`).join(' ');
          return (
            <g key={k}>
              <polyline
                points={points}
                fill="none"
                stroke={SERIES_COLORS[k]}
                strokeWidth={2}
                strokeLinejoin="round"
              />
              {hover !== null && (
                <circle
                  cx={left + band * (hover + 0.5)}
                  cy={y(s.values[hover])}
                  r={4.5}
                  fill={SERIES_COLORS[k]}
                  stroke="#fff"
                  strokeWidth={2}
                />
              )}
            </g>
          );
        })}

      {type === 'line' && hover !== null && (
        <line
          x1={left + band * (hover + 0.5)}
          x2={left + band * (hover + 0.5)}
          y1={top}
          y2={top + plotHeight}
          stroke="#c9d2df"
          strokeDasharray="3 3"
        />
      )}

      {/* hit areas wider than the marks: one full band per label */}
      {labels.map((_, i) => (
        <rect
          key={i}
          x={left + band * i}
          y={top}
          width={band}
          height={plotHeight}
          fill="transparent"
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        />
      ))}

      {tooltip && <Tooltip {...tooltip} width={width} />}
    </svg>
  );
}

function DonutChart({ chart, width }) {
  const [hover, setHover] = useState(null);
  const slices = foldSlices(chart.labels, chart.series[0].values, chart.maxSlices);
  const total = slices.reduce((sum, s) => sum + s.value, 0);
  const size = Math.min(HEIGHT - 20, width * 0.5);
  const radius = size / 2;
  const inner = radius * 0.6;
  const cx = radius + 4;
  const cy = HEIGHT / 2;
  // start angle of each slice, from 12 o'clock, clockwise
  const starts = slices.map((_, i) =>
    slices.slice(0, i).reduce((sum, s) => sum + (s.value / total) * Math.PI * 2, -Math.PI / 2)
  );
  const point = (r, a) => `${cx + r * Math.cos(a)},${cy + r * Math.sin(a)}`;
  const arcs = slices.map((slice, i) => {
    const sweep = (slice.value / total) * Math.PI * 2;
    const a0 = starts[i] + 0.012; // a thin gap between slices
    const a1 = starts[i] + sweep - 0.012;
    const large = a1 - a0 > Math.PI ? 1 : 0;
    const d =
      `M${point(radius, a0)} A${radius},${radius} 0 ${large} 1 ${point(radius, a1)} ` +
      `L${point(inner, a1)} A${inner},${inner} 0 ${large} 0 ${point(inner, a0)} Z`;
    return { ...slice, d, color: slice.other ? OTHER_COLOR : SERIES_COLORS[i] };
  });
  const legendX = cx + radius + 20;
  const focus = hover !== null ? arcs[hover] : null;

  return (
    <svg width={width} height={HEIGHT} role="img" aria-label={chart.title} style={{ fontFamily: FONT }}>
      {arcs.map((arc, i) => (
        <path
          key={i}
          d={arc.d}
          fill={arc.color}
          opacity={hover === null || hover === i ? 1 : 0.45}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        />
      ))}
      <text x={cx} y={cy - 2} textAnchor="middle" fontSize={15} fontWeight={700} fill={INK}>
        {formatValue(focus ? focus.value : total, chart.unit, { compact: true })}
      </text>
      <text x={cx} y={cy + 15} textAnchor="middle" fontSize={10} fill={MUTED}>
        {focus ? `${Math.round((focus.value / total) * 100)}%` : 'totale'}
      </text>
      {arcs.map((arc, i) => (
        <g
          key={i}
          transform={`translate(${legendX}, ${cy - (arcs.length * 22) / 2 + i * 22})`}
          onMouseEnter={() => setHover(i)}
          onMouseLeave={() => setHover(null)}
        >
          <rect y={2} width={10} height={10} rx={2} fill={arc.color} />
          <text x={16} y={11} fontSize={11} fill={INK} fontWeight={hover === i ? 600 : 400}>
            {short(arc.label, Math.max(6, Math.floor((width - legendX - 70) / 6.5)))}
          </text>
          <text x={width - legendX - 4} y={11} textAnchor="end" fontSize={11} fill={MUTED}>
            {Math.round((arc.value / total) * 100)}%
          </text>
        </g>
      ))}
    </svg>
  );
}

/** Serialises the drawn SVG into a 2× PNG, on a white background, with the title on top. */
async function savePng(svg, title) {
  const ratio = 2;
  const { width, height } = svg.getBoundingClientRect();
  const titleHeight = 36;
  const markup = new XMLSerializer().serializeToString(svg);
  const image = new Image();
  image.src = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(markup)}`;
  await image.decode();
  const canvas = document.createElement('canvas');
  canvas.width = (width + 32) * ratio;
  canvas.height = (height + titleHeight + 24) * ratio;
  const ctx = canvas.getContext('2d');
  ctx.scale(ratio, ratio);
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width + 32, height + titleHeight + 24);
  ctx.fillStyle = INK;
  ctx.font = `600 14px ${FONT}`;
  ctx.fillText(title, 16, 26);
  ctx.drawImage(image, 16, titleHeight, width, height);
  const blob = await new Promise(resolve => canvas.toBlob(resolve, 'image/png'));
  const url = URL.createObjectURL(blob);
  const link = Object.assign(document.createElement('a'), {
    href: url,
    download: `${slugify(title) || 'grafico'}.png`
  });
  link.click();
  URL.revokeObjectURL(url);
}

const ACTION_CLASS =
  'flex items-center gap-1 rounded-lg px-2 py-1 text-[11px] font-medium text-slate-soft transition hover:bg-surface hover:text-brand-600';

export default function ChatChart({ chart }) {
  const [wrapperRef, width] = useWidth();
  const [showTable, setShowTable] = useState(false);
  const [saved, setSaved] = useState(null);
  const svgHost = useRef(null);
  const { title, labels, series, unit, type } = chart;
  const multi = series.length > 1;

  const flash = what => {
    setSaved(what);
    setTimeout(() => setSaved(null), 1800);
  };
  const png = async () => {
    const svg = svgHost.current?.querySelector('svg');
    if (!svg) return;
    try {
      await savePng(svg, title);
      flash('png');
    } catch (error) {
      console.error('[chart] png export failed:', error);
    }
  };
  const excel = async () => {
    const columns = ['', ...series.map(s => s.name)];
    const rows = labels.map((label, i) =>
      Object.fromEntries([['', label], ...series.map(s => [s.name, s.values[i]])])
    );
    try {
      await downloadXlsx(slugify(title) || 'grafico', columns, rows);
      flash('xlsx');
    } catch (error) {
      console.error('[chart] excel export failed:', error);
    }
  };

  return (
    <figure
      className="rounded-card border border-line bg-white px-3.5 py-3 shadow-soft"
      style={{ animation: 'var(--animate-fade-up)' }}
    >
      <figcaption className="text-[13px] font-semibold text-ink">{title}</figcaption>
      {multi && type !== 'donut' && (
        <div className="mt-1.5 flex flex-wrap gap-x-3 gap-y-1">
          {series.map((s, i) => (
            <span key={s.name} className="flex items-center gap-1.5 text-[11px] text-slate-soft">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ background: SERIES_COLORS[i] }} />
              {s.name}
            </span>
          ))}
        </div>
      )}

      <div ref={wrapperRef} className="mt-2 w-full">
        <div ref={svgHost}>
          {width > 0 &&
            (type === 'donut' ? (
              <DonutChart chart={chart} width={width} />
            ) : (
              <CartesianChart chart={chart} width={width} />
            ))}
        </div>
      </div>

      {showTable && (
        <div className="mt-2 max-h-56 overflow-auto rounded-lg border border-line">
          <table className="w-full text-left text-[11px]">
            <thead className="sticky top-0 bg-surface text-slate-soft">
              <tr>
                <th className="px-2.5 py-1.5 font-semibold" />
                {series.map(s => (
                  <th key={s.name} className="px-2.5 py-1.5 text-right font-semibold">
                    {s.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {labels.map((label, i) => (
                <tr key={i} className="border-t border-line">
                  <td className="px-2.5 py-1 text-ink">{label}</td>
                  {series.map(s => (
                    <td key={s.name} className="px-2.5 py-1 text-right tabular-nums text-ink">
                      {formatValue(s.values[i], unit)}
                    </td>
                  ))}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <div className="mt-2 flex flex-wrap gap-1 border-t border-line pt-2">
        <button
          type="button"
          onClick={() => setShowTable(v => !v)}
          className={ACTION_CLASS}
          aria-expanded={showTable}
        >
          <Table2 size={13} /> {showTable ? 'Nascondi i dati' : 'Mostra i dati'}
        </button>
        <button type="button" onClick={png} className={ACTION_CLASS}>
          {saved === 'png' ? <Check size={13} className="text-ok" /> : <ImageIcon size={13} />} Scarica PNG
        </button>
        <button type="button" onClick={excel} className={ACTION_CLASS}>
          {saved === 'xlsx' ? <Check size={13} className="text-ok" /> : <Download size={13} />} Scarica Excel
        </button>
      </div>
    </figure>
  );
}
