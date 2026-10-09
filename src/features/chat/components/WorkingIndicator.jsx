/**
 * The small box shown while the assistant works. A quick answer, with no tool involved, stays as
 * simple as it gets: one icon and "Sto pensando…". Only once a tool has actually finished does a
 * trail start to grow — one circle per finished step, the current one pulsing — so the box never
 * promises work that is not happening and a fast reply never flashes a busy-looking widget.
 * Which document, table or query is never shown, and neither are failed steps.
 */
import { BarChart3, Check, Database, FileSearch, FileSpreadsheet, Sparkles } from 'lucide-react';

const THINKING = { Icon: Sparkles, label: 'Sto pensando…' };
const TOOL_PHASES = {
  documents: { Icon: FileSearch, label: 'Cerco nei documenti…' },
  data: { Icon: Database, label: 'Faccio i conti sui dati…' },
  export: { Icon: FileSpreadsheet, label: 'Preparo il file…' },
  chart: { Icon: BarChart3, label: 'Preparo il grafico…' }
};

/**
 * @param {{runningKind?: string, doneKinds?: string[]}} props `runningKind`: the tool running right
 *   now, if any. `doneKinds`: the tools finished successfully in this turn, oldest first.
 */
export default function WorkingIndicator({ runningKind, doneKinds = [] }) {
  const { Icon, label } = TOOL_PHASES[runningKind] || THINKING;
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
          <Icon size={16} />
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
