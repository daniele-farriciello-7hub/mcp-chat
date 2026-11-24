import { ArrowLeft } from 'lucide-react';
import MenuButton from '@/features/navigation/MenuButton';
import { useSidebar } from '@/features/navigation/SidebarContext';
import Tooltip from '@/shared/ui/Tooltip';

/** `eyebrow`: the tab's name above the title, when the title is a subsection of it (the pages with a sidebar). */
export default function SettingsHeader({
  onClose,
  hasUnsavedChanges,
  eyebrow,
  title = 'Configurazione',
  subtitle = 'Vale per tutti, dalla conversazione successiva'
}) {
  // beside the docked sidebar "Chat" is the way back, and the hamburger opens the drawer where it is not docked
  const docked = Boolean(useSidebar()?.desktop);
  return (
    <div className="flex items-center gap-2 px-3 pb-2.5 pt-3">
      <MenuButton />
      {!docked && (
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
      )}
      <div className="min-w-0 flex-1">
        {eyebrow && (
          <div className="truncate text-fs-10 font-bold uppercase tracking-[0.12em] text-brand-600">
            {eyebrow}
          </div>
        )}
        <div className="text-fs-15 font-bold leading-tight text-ink">{title}</div>
        <div className="text-fs-11 text-slate-soft">{subtitle}</div>
      </div>
      {hasUnsavedChanges && (
        <span className="flex shrink-0 items-center gap-1.5 rounded-pill bg-accent-soft px-2 py-1 text-fs-10 font-semibold text-warn">
          <span className="h-1.5 w-1.5 rounded-pill bg-accent" />
          Non salvato
        </span>
      )}
    </div>
  );
}
