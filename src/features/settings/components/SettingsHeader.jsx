import { ArrowLeft } from 'lucide-react';
import Tooltip from '@/shared/ui/Tooltip';

export default function SettingsHeader({
  onClose,
  hasUnsavedChanges,
  title = 'Configurazione',
  subtitle = 'Vale per tutti, dalla conversazione successiva'
}) {
  return (
    <div className="flex items-center gap-2 px-3 pb-2.5 pt-3">
      <Tooltip label="Torna alla chat" align="left">
        <button
          type="button"
          onClick={onClose}
          aria-label="Torna alla chat"
          className="rounded-lg p-2 text-slate-soft transition hover:bg-surface hover:text-ink"
        >
          <ArrowLeft size={18} />
        </button>
      </Tooltip>
      <div className="min-w-0 flex-1">
        <div className="text-[15px] font-bold leading-tight text-ink">{title}</div>
        <div className="text-[11px] text-slate-soft">{subtitle}</div>
      </div>
      {hasUnsavedChanges && (
        <span className="flex shrink-0 items-center gap-1.5 rounded-pill bg-accent-soft px-2 py-1 text-[10px] font-semibold text-warn">
          <span className="h-1.5 w-1.5 rounded-pill bg-accent" />
          Non salvato
        </span>
      )}
    </div>
  );
}
