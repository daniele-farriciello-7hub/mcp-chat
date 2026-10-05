import { LogOut, RotateCcw, Settings, X } from 'lucide-react';
import Tooltip from '@/shared/ui/Tooltip';
import AgentMark from './AgentMark';

const STATUS_LABELS = {
  idle: 'Online',
  restoring: 'Riprendo la conversazione…',
  working: 'Sto lavorando…',
  thinking: 'Sto pensando…',
  writing: 'Sto scrivendo…'
};

/** Tooltips align right: the header buttons sit at the panel's right edge. */
function HeaderButton({ onClick, label, children }) {
  return (
    <Tooltip label={label} align="right">
      <button
        type="button"
        onClick={onClick}
        aria-label={label}
        className="rounded-lg p-2 text-slate-soft transition hover:bg-surface hover:text-ink"
      >
        {children}
      </button>
    </Tooltip>
  );
}

/** The mark keeps morphing until the assistant is idle again: alive without writing "please wait". */
export default function ChatHeader({ status, email, onOpenSettings, onReset, onSignOut, onClose }) {
  const busy = status !== 'idle';
  return (
    <div className="relative z-10 flex items-center gap-3 border-b border-line bg-white/90 px-4 py-3 backdrop-blur">
      <AgentMark size={26} working={busy} filled />
      <div className="min-w-0 flex-1">
        <div className="truncate text-[15px] font-bold leading-tight text-ink">Assistente 7hub</div>
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full transition-colors ${busy ? 'animate-pulse bg-brand-500' : 'bg-ok'}`}
          />
          <span className="text-xs text-slate-soft">{STATUS_LABELS[status]}</span>
        </div>
        {email && (
          <div className="truncate text-[11px] text-slate-soft" title={email}>
            {email}
          </div>
        )}
      </div>

      {onOpenSettings && (
        <HeaderButton onClick={onOpenSettings} label="Configurazione">
          <Settings size={18} />
        </HeaderButton>
      )}
      {onReset && (
        <HeaderButton onClick={onReset} label="Nuova conversazione">
          <RotateCcw size={18} />
        </HeaderButton>
      )}
      {onSignOut && (
        <HeaderButton onClick={onSignOut} label="Logout">
          <LogOut size={18} />
        </HeaderButton>
      )}
      {/* outside the iframe there is nothing to close */}
      {onClose && (
        <HeaderButton onClick={onClose} label="Chiudi">
          <X size={18} />
        </HeaderButton>
      )}
    </div>
  );
}
