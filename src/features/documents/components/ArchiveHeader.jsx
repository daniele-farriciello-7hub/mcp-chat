import { useRef } from 'react';
import { Upload } from 'lucide-react';
import Button from '@/shared/ui/Button';
import HowIndexingWorks from './HowIndexingWorks';

const ACCEPTED_FILES = '.pdf,.txt,.csv,.md,application/pdf,text/plain,text/csv,text/markdown';

const STAT_TONES = { neutral: 'text-ink', ok: 'text-ok', danger: 'text-danger' };

/** A counter that also opens the matching list. */
function Stat({ value, label, tone = 'neutral', active, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={`flex-1 rounded-lg px-2.5 py-2 text-left transition ${
        active ? 'bg-brand-50 ring-1 ring-brand-200' : 'bg-surface hover:bg-line/60'
      }`}
    >
      <div className={`text-[16px] font-bold leading-none ${STAT_TONES[tone]}`}>{value}</div>
      <div className="mt-1 text-[10px] text-slate-soft">{label}</div>
    </button>
  );
}

/** What the archive holds at a glance, the one action that always works (uploading) and how it all works. */
export default function ArchiveHeader({ totals, activeView, onSelectView, onUpload, uploading }) {
  const fileInputRef = useRef(null);

  return (
    <div className="rounded-xl border border-line p-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold text-ink">Archivio documenti</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-soft">
            Quello che l’assistente può consultare quando risponde.
          </p>
        </div>
        <Button
          primary
          onClick={() => fileInputRef.current?.click()}
          disabled={uploading}
          tooltip={
            uploading ? 'Attendi la fine del caricamento in corso' : 'PDF, TXT, CSV o Markdown, fino a 20 MB'
          }
          tooltipAlign="right"
        >
          <Upload size={14} /> Carica file
        </Button>
        <input
          ref={fileInputRef}
          type="file"
          multiple
          accept={ACCEPTED_FILES}
          className="hidden"
          onChange={e => {
            if (e.target.files?.length) onUpload(e.target.files);
            e.target.value = '';
          }}
        />
      </div>

      <div className="mt-3 flex gap-2">
        <Stat
          value={totals.pending}
          label="da indicizzare"
          active={activeView === 'pending'}
          onClick={() => onSelectView('pending')}
        />
        <Stat
          value={totals.failed}
          label="con errore"
          tone={totals.failed ? 'danger' : 'neutral'}
          active={activeView === 'failed'}
          onClick={() => onSelectView('failed')}
        />
        <Stat
          value={totals.indexed}
          label="pronti per la chat"
          tone="ok"
          active={activeView === 'indexed'}
          onClick={() => onSelectView('indexed')}
        />
      </div>

      <HowIndexingWorks defaultOpen={totals.indexed === 0} />
    </div>
  );
}
