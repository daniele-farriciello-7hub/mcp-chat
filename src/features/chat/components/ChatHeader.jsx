import { LogOut, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import AppearanceSettings from '@/shared/appearance/AppearanceSettings';
import Tooltip from '@/shared/ui/Tooltip';
import AgentMark from './AgentMark';

const STATUS_LABELS = {
  idle: 'Online',
  restoring: 'Riprendo la conversazione…',
  working: 'Sto lavorando…',
  thinking: 'Sto pensando…',
  writing: 'Sto scrivendo…'
};

/**
 * A round 40px header button, as in 7hub (.hdr-btn in globals.css): hover and keyboard focus give a soft tint of the primary
 * colour, the icon in that colour and a slight growth. Tooltips align right: the buttons sit at the panel's right edge.
 */
function HeaderButton({ onClick, label, children }) {
  return (
    <Tooltip label={label} align="right">
      <button type="button" onClick={onClick} aria-label={label} className="hdr-btn">
        {children}
      </button>
    </Tooltip>
  );
}

/** The mark keeps morphing until the assistant is idle again: alive without writing "please wait". */
export default function ChatHeader({
  status,
  email,
  onOpenSettings,
  settingsLabel = 'Configurazione',
  onReset,
  onSignOut,
  onClose
}) {
  const busy = status !== 'idle';
  return (
    // z-20, above the z-10 of the welcome cards and the composer: the button tooltips hang below the header over the
    // conversation and must not be painted under them
    <div className="relative z-20 flex items-center gap-3 border-b border-line bg-panel/90 py-2.5 pl-4 pr-2.5 backdrop-blur">
      <AgentMark size={26} working={busy} filled />
      <div className="min-w-0 flex-1">
        <div className="truncate text-fs-15 font-bold leading-tight text-ink">Assistente 7hub</div>
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full transition-colors ${busy ? 'animate-pulse bg-brand-500' : 'bg-ok'}`}
          />
          <span className="text-xs text-slate-soft">{STATUS_LABELS[status]}</span>
        </div>
        {email && (
          <div className="truncate text-fs-11 text-slate-soft" title={email}>
            {email}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* standalone only: embedded, 7hub's own appearance settings apply. The gear is the appearance drawer of 7hub, so the
            chat's own configuration (this panel's models and shortcuts) uses another icon: two gears side by side would confuse */}
        <AppearanceSettings />
        {onOpenSettings && (
          <HeaderButton onClick={onOpenSettings} label={settingsLabel}>
            <SlidersHorizontal size={20} />
          </HeaderButton>
        )}
        {onReset && (
          <HeaderButton onClick={onReset} label="Nuova conversazione">
            <RotateCcw size={20} />
          </HeaderButton>
        )}
        {onSignOut && (
          <HeaderButton onClick={onSignOut} label="Logout">
            <LogOut size={20} />
          </HeaderButton>
        )}
        {/* outside the iframe there is nothing to close */}
        {onClose && (
          <HeaderButton onClick={onClose} label="Chiudi">
            <X size={20} />
          </HeaderButton>
        )}
      </div>
    </div>
  );
}
