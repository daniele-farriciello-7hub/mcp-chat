/**
 * The small box shown while the assistant works. A quick answer, with no tool involved, stays as
 * simple as it gets: one icon and "Sto pensando…". Only once a tool has actually finished does a
 * trail start to grow — one circle per finished step, the current one pulsing — so the box never
 * promises work that is not happening and a fast reply never flashes a busy-looking widget.
 * Which document, table or query is never shown, and neither are failed steps.
 */
'use client';

import { useEffect, useState } from 'react';
import {
  BarChart3,
  BookOpen,
  Brain,
  Calculator,
  Check,
  Database,
  Download,
  FileSearch,
  FileSpreadsheet,
  Highlighter,
  Lightbulb,
  LineChart,
  MessageCircleMore,
  PieChart,
  Sigma,
  Sparkles,
  Table2
} from 'lucide-react';

const THINKING = { Icon: Sparkles, label: 'Sto pensando…' };
// the icon changes every second, while thinking and during each phase: alive, never static
const THINKING_ICONS = [Sparkles, Lightbulb, Brain, MessageCircleMore];
const ICON_EVERY_MS = 1000;

/** Index of the icon to show for the current phase, advancing every second; frozen with reduced motion. */
function useCyclingIndex(phaseKey, count) {
  const [state, setState] = useState({ phaseKey, index: 0 });
  // a new phase starts from its first icon (adjusted while rendering, not in an effect)
  if (state.phaseKey !== phaseKey) setState({ phaseKey, index: 0 });
  useEffect(() => {
    if (count < 2 || window.matchMedia('(prefers-reduced-motion: reduce)').matches) return undefined;
    const timer = setInterval(() => setState(s => ({ ...s, index: (s.index + 1) % count })), ICON_EVERY_MS);
    return () => clearInterval(timer);
  }, [phaseKey, count]);
  return state.phaseKey === phaseKey ? state.index : 0;
}
// `Icon` is the phase's own (the trail of finished steps); `cycle` the icons shown in turn while it
// runs — all about that same activity, so the motion never suggests different work
const TOOL_PHASES = {
  documents: { Icon: FileSearch, cycle: [FileSearch, BookOpen, Highlighter], label: 'Cerco nei documenti…' },
  data: { Icon: Database, cycle: [Database, Table2, Calculator, Sigma], label: 'Faccio i conti sui dati…' },
  export: { Icon: FileSpreadsheet, cycle: [FileSpreadsheet, Table2, Download], label: 'Preparo il file…' },
  chart: { Icon: BarChart3, cycle: [BarChart3, LineChart, PieChart], label: 'Preparo il grafico…' }
};

/**
 * @param {{runningKind?: string, doneKinds?: string[]}} props `runningKind`: the tool running right
 *   now, if any. `doneKinds`: the tools finished successfully in this turn, oldest first.
 */
export default function WorkingIndicator({ runningKind, doneKinds = [] }) {
  const phase = TOOL_PHASES[runningKind];
  const thinking = !phase;
  const icons = thinking ? THINKING_ICONS : phase.cycle;
  // restarts from the first icon whenever the phase changes
  const iconIndex = useCyclingIndex(runningKind || 'thinking', icons.length);
  const Icon = icons[iconIndex % icons.length];
  const { label } = phase || THINKING;
  const hasTrail = doneKinds.length > 0;

  return (
    <div
      className="flex w-fit max-w-full flex-col gap-2 rounded-card border border-line bg-white py-2 pl-2 pr-4 shadow-soft"
      style={{ animation: 'var(--animate-fade-in)' }}
      role="status"
    >
      <div className="flex flex-wrap items-center gap-y-1.5">
        {doneKinds.map((kind, i) => {
          const { Icon: StepIcon } = TOOL_PHASES[kind] || THINKING;
          return (
            <span key={i} className="flex items-center">
              <span className="step-pop flex h-7 w-7 shrink-0 items-center justify-center rounded-full bg-ok-soft text-ok">
                <StepIcon size={14} />
              </span>
              <span className="h-0.5 w-4 shrink-0 bg-line" />
            </span>
          );
        })}
        <span
          className={`relative flex h-7 w-7 shrink-0 items-center justify-center bg-brand-50 text-brand-500 ${
            hasTrail ? 'step-ring rounded-full' : 'rounded-[9px]'
          }`}
        >
          {/* a new key per icon replays the pop: each change is seen, not just swapped */}
          <span key={`${runningKind || 'thinking'}-${iconIndex}`} className="step-pop flex">
            <Icon size={16} />
          </span>
        </span>
        {!hasTrail && <span className="shimmer-text ml-2.5 text-[13px] font-medium">{label}</span>}
      </div>
      {hasTrail && (
        <div className="flex items-center gap-1.5 pl-1 text-[12px]">
          <Check size={12} className="text-ok" aria-hidden="true" />
          <span className="text-slate-soft">
            {doneKinds.length} {doneKinds.length === 1 ? 'passo completato' : 'passi completati'}
          </span>
          <span className="text-slate-soft">·</span>
          <span
            key={label}
            className="shimmer-text font-medium"
            style={{ animation: 'var(--animate-fade-in)' }}
          >
            {label}
          </span>
        </div>
      )}
    </div>
  );
}
