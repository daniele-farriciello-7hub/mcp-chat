/**
 * One small boxed line (as wide as its text, not the whole panel) while the assistant works, never a card per step. It says what is happening only
 * while it really is: a tool's phase shows for as long as that tool runs, and between tools (or
 * when none ran) it is "Sto pensando…". Once the reply streams, the reply itself is the signal.
 */
import { Database, FileSearch, FileSpreadsheet, Sparkles } from 'lucide-react';

const THINKING = { Icon: Sparkles, label: 'Sto pensando…' };
const TOOL_PHASES = {
  documents: { Icon: FileSearch, label: 'Cerco nei documenti…' },
  data: { Icon: Database, label: 'Faccio i conti sui dati…' },
  export: { Icon: FileSpreadsheet, label: 'Preparo il file…' }
};

/** @param {{runningKind?: string}} props `kind` of the tool running right now, if any. */
export default function WorkingIndicator({ runningKind }) {
  const { Icon, label } = TOOL_PHASES[runningKind] || THINKING;
  return (
    <div
      key={label}
      className="flex w-fit max-w-full items-center gap-2.5 rounded-card border border-line bg-white py-2 pl-2 pr-4 shadow-soft"
      style={{ animation: 'var(--animate-fade-in)' }}
      role="status"
    >
      <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-brand-50 text-brand-500">
        <Icon size={16} />
      </span>
      <span className="shimmer-text text-[13px] font-medium">{label}</span>
    </div>
  );
}
