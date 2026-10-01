/**
 * The one line shown while the assistant works: what it is doing in plain words, and a bar that
 * says how far along it is — never which document, table or query. Always starts at "Sto pensando…"
 * and ends at "Scrivo la risposta…"; in between it follows the kind of tool being used.
 */
import { Database, FileSearch, FileSpreadsheet, Pencil, Sparkles } from 'lucide-react';

const THINKING = { Icon: Sparkles, label: 'Sto pensando…' };
const WRITING = { Icon: Pencil, label: 'Scrivo la risposta…' };
const TOOL_PHASES = {
  documents: { Icon: FileSearch, label: 'Cerco nei documenti…' },
  data: { Icon: Database, label: 'Faccio i conti sui dati…' },
  export: { Icon: FileSpreadsheet, label: 'Preparo il file…' }
};

const SEGMENTS = 4;

/**
 * @param {{status: string, kinds: string[]}} props `kinds`: the `kind` of every tool started in the
 *   current turn, oldest first. The bar moves one notch for the first tool, one for the second and
 *   stays there for the rest, so a long chain of calls never looks like it went backwards.
 */
export default function WorkingIndicator({ status, kinds }) {
  const writing = status === 'writing';
  const step = writing ? SEGMENTS - 1 : Math.min(kinds.length, SEGMENTS - 2);
  const phase = writing ? WRITING : kinds.length ? TOOL_PHASES[kinds.at(-1)] || THINKING : THINKING;
  const { Icon, label } = phase;

  return (
    <div
      className="rounded-card border border-line bg-white px-3 py-2.5 shadow-soft"
      style={{ animation: 'var(--animate-fade-in)' }}
      role="status"
    >
      <div key={label} className="flex items-center gap-2.5" style={{ animation: 'var(--animate-fade-in)' }}>
        <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-brand-50 text-brand-500">
          <Icon size={16} />
        </span>
        <span className="shimmer-text text-[13px] font-medium">{label}</span>
      </div>
      <div className="mt-2.5 flex gap-1.5" aria-hidden="true">
        {Array.from({ length: SEGMENTS }, (_, i) => (
          <span
            key={i}
            className={`h-1 flex-1 rounded-full transition-colors duration-300 ${
              i < step ? 'bg-brand-500' : i === step ? 'animate-pulse bg-brand-500' : 'bg-line'
            }`}
          />
        ))}
      </div>
    </div>
  );
}
