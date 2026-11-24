import { LogOut, RotateCcw, SlidersHorizontal, X } from 'lucide-react';
import MenuButton from '@/features/navigation/MenuButton';
import { useSidebar } from '@/features/navigation/SidebarContext';
import AppearanceSettings from '@/shared/appearance/AppearanceSettings';
import Tooltip from '@/shared/ui/Tooltip';
import { STATUS_LABELS } from '../statusLabels';
import AgentMark from './AgentMark';

/**
 * A round 40px header button, as in 7hub (.hdr-btn in globals.css): hover and keyboard focus give a soft tint of the primary
 * colour, the icon in that colour and a slight growth. Tooltips align right: the buttons sit at the panel's right edge.
 */
function HeaderButton({ onClick, label, className = '', children }) {
  return (
    <Tooltip label={label} align="right" className={className}>
      <button type="button" onClick={onClick} aria-label={label} className="hdr-btn">
        {children}
      </button>
    </Tooltip>
  );
}

/**
 * The mark keeps morphing until the assistant is idle again: alive without writing "please wait".
 *
 * Beside the docked sidebar on the standalone page (from 768px) there is no header at all: the status line is in the sidebar's
 * head (`statusInSidebar` of the sidebar context), and the name, the mark, the email and the appearance, configuration, logout
 * and new-conversation entries are there too, so the page starts at its top. In /embed, docked (from 1024px) the header is only
 * the status line and the host's close button: the name, the mark and the email are in the sidebar, and so are the appearance,
 * configuration and logout buttons (the page does not pass them). Where the sidebar is a drawer (a phone, the 400px panel) the
 * header has the hamburger, the mark and the name, and keeps the new-conversation arrow.
 */
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
  const sidebar = useSidebar();
  // the sidebar's head says it: nothing left for a strip here (the buttons are the sidebar's too, see above)
  if (sidebar?.statusInSidebar) return null;
  const hasSidebar = sidebar !== null;
  // what the docked sidebar already shows
  const docked = Boolean(sidebar?.desktop);
  return (
    // z-20, above the z-10 of the welcome cards and the composer: the button tooltips hang below the header over the
    // conversation and must not be painted under them
    <div
      className={`relative z-20 flex items-center gap-3 border-b border-line bg-panel/90 py-2.5 pl-4 pr-2.5 backdrop-blur ${
        // level with the sidebar's own top (the edge button of the sidebar sits on the line between the two)
        docked ? 'min-h-14' : ''
      }`}
    >
      <MenuButton />
      {!docked && <AgentMark size={26} working={busy} filled />}
      <div className="min-w-0 flex-1">
        {!docked && (
          <div className="truncate text-fs-15 font-bold leading-tight text-ink">Assistente 7hub</div>
        )}
        <div className="flex items-center gap-1.5">
          <span
            className={`h-2 w-2 rounded-full transition-colors ${busy ? 'animate-pulse bg-brand-500' : 'bg-ok'}`}
          />
          <span className="text-xs text-slate-soft">{STATUS_LABELS[status]}</span>
        </div>
        {email && !hasSidebar && (
          <div className="truncate text-fs-11 text-slate-soft" title={email}>
            {email}
          </div>
        )}
      </div>

      <div className="flex shrink-0 items-center gap-1">
        {/* standalone only: embedded, 7hub's own appearance settings apply. The gear is the appearance drawer of 7hub, so the
            chat's own configuration (this panel's models and shortcuts) uses another icon: two gears side by side would confuse */}
        {!hasSidebar && <AppearanceSettings />}
        {onOpenSettings && (
          <HeaderButton onClick={onOpenSettings} label={settingsLabel}>
            <SlidersHorizontal size={20} />
          </HeaderButton>
        )}
        {onReset && !docked && (
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
