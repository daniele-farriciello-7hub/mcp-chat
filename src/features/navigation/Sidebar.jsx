/**
 * What is inside the sidebar (the frame, the rail and the drawer are AppShell.jsx's):
 *
 *   · top      the assistant's mark (it keeps morphing while a reply is being written) and its name, with its status under it (docked
 *              on the standalone page only, `statusInSidebar`: Online, Sto scrivendo…; the rail has a dot on the mark instead,
 *              and the words in its tooltip), "Nuova chat" below
 *   · Assistente   Chat, and for an admin Storico; for everyone else "Le mie scorciatoie"
 *   · Configurazione (admin)   the tabs of the configuration panel: Modello IA, Scorciatoie, Documenti, Database, 7Hub
 *   · bottom   the operator (avatar, name, email) with "Impostazioni" (the appearance drawer) and "Esci"; inside 7hub (`embedded`)
 *              only "Esci": the host decides the look, so there is no appearance drawer
 *
 * A tab that has subsections (settingsSections.js: Modello IA, Documenti, Storico…) is a group (NavGroup.jsx): its subsections
 * open under it, or in a flyout from its icon in the rail. Its group opens by itself when the page goes inside it.
 *
 * `section` and `subsection` say what the page shows: null = the chat, otherwise the id of a settings tab (`SETTINGS_TABS`;
 * 'shortcuts' is also the operators' own panel) and of its subsection. `onSelect(section, subsection)` goes somewhere (the page
 * may ask first: unsaved edits). Everything that used to be a button (or the status line) in the chat's header lives here now, so
 * nothing is lost: the gear (Impostazioni), the sliders (Configurazione / Le mie scorciatoie), the reset arrow (Nuova chat),
 * Logout and the status.
 *
 * Past conversations are not listed: the history function only gives an operator today's open conversation back (`restore`);
 * listing and reading others (`list`, `transcript`) is admin-only and covers everyone's, so there is nothing of the operator's
 * own to list without a new endpoint.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import {
  Blocks,
  Database,
  FileText,
  History,
  MessageSquare,
  SquarePen,
  Sparkles,
  X,
  Zap
} from 'lucide-react';
import AgentMark from '@/features/chat/components/AgentMark';
import { STATUS_LABELS } from '@/features/chat/statusLabels';
import { SETTINGS_TABS } from '@/features/settings/settingsSections';
import AppearanceSettings from '@/shared/appearance/AppearanceSettings';
import AccountMenu from './AccountMenu';
import NavGroup from './NavGroup';
import NavItem from './NavItem';
import RailTip from './RailTip';
import { useSidebar } from './SidebarContext';
import { followPage } from './sidebarStore';

// className `sb-duo`: the soft fill behind the strokes (globals.css), the duotone of 7hub's own icons
const TAB_ICONS = {
  model: Sparkles,
  shortcuts: Zap,
  documents: FileText,
  database: Database,
  history: History,
  hub: Blocks
};

function Group({ title, children }) {
  return (
    <div className="sb-group">
      <div className="sb-group-title">{title}</div>
      <ul className="sb-list">{children}</ul>
    </div>
  );
}

export default function Sidebar({
  section,
  subsection,
  onSelect,
  isAdmin,
  status = 'idle',
  busy,
  onNewChat,
  user,
  onSignOut,
  embedded = false
}) {
  const sidebar = useSidebar();
  const [appearanceOpen, setAppearanceOpen] = useState(false);
  const accountRef = useRef(null);
  const restoreFocus = useRef(false);

  // the settings drawer closed from the keyboard: the focus goes back to the account button, once the drawer has let it go
  useEffect(() => {
    if (!appearanceOpen && restoreFocus.current) {
      restoreFocus.current = false;
      accountRef.current?.focus();
    }
  }, [appearanceOpen]);

  // the page went inside a group (a link, the back button, a first click on it): it is open, even if it was closed by hand before
  useEffect(() => {
    if (section) followPage(section, sidebar?.scope);
  }, [section, sidebar?.scope]);

  // choosing anything closes the drawer; opening a group (`keepDrawer`) does not, its subsections are what to choose
  const pick =
    (id, sub = null) =>
    ({ keepDrawer = false } = {}) => {
      onSelect(id, sub);
      if (!keepDrawer) sidebar?.closeMobile();
    };
  const icon = Icon => <Icon size={22} strokeWidth={1.75} className="sb-duo" />;
  const entry = (id, label, Icon) => (
    <li key={id ?? 'chat'}>
      <NavItem label={label} active={section === id} onClick={() => pick(id)()} icon={icon(Icon)} />
    </li>
  );
  // a tab with subsections is a group; without, a plain entry
  const tabEntry = tab =>
    tab.subsections?.length ? (
      <NavGroup
        key={tab.id}
        id={tab.id}
        label={tab.name}
        icon={icon(TAB_ICONS[tab.id])}
        items={tab.subsections}
        current={section === tab.id ? (subsection ?? tab.subsections[0].id) : null}
        onSelect={(sub, options) => pick(tab.id, sub)(options)}
      />
    ) : (
      entry(tab.id, tab.name, TAB_ICONS[tab.id])
    );

  const history = SETTINGS_TABS.find(tab => tab.id === 'history');
  const assistant = [
    entry(null, 'Chat', MessageSquare),
    isAdmin ? tabEntry(history) : entry('shortcuts', 'Le mie scorciatoie', Zap)
  ];
  const configuration = isAdmin ? SETTINGS_TABS.filter(tab => tab.group === 'config').map(tabEntry) : [];
  // the status line of the chat's header, which has no strip beside the docked sidebar of the standalone page
  const statusLabel = sidebar?.statusInSidebar ? STATUS_LABELS[status] : null;
  const markTip = statusLabel && sidebar.rail ? `Assistente 7hub · ${statusLabel}` : null;

  return (
    <div className="sb-body">
      <div className="sb-head">
        {/* the rail: the status is a dot on the mark, and its words (kept for screen readers in the text beside it) a tooltip */}
        <RailTip label={markTip} gap={30}>
          <span className="sb-mark">
            <AgentMark size={26} filled working={busy} />
            {statusLabel && <span aria-hidden className="sb-mark-dot" data-busy={busy || undefined} />}
          </span>
        </RailTip>
        <span className="sb-label sb-head-text">
          <span className="sb-title">Assistente 7hub</span>
          {statusLabel && (
            <span className="sb-status">
              <span
                aria-hidden
                className="sb-status-dot motion-safe:data-[busy]:animate-pulse"
                data-busy={busy || undefined}
              />
              <span className="truncate">{statusLabel}</span>
            </span>
          )}
        </span>
        {/* as a drawer: its own close button (the edge button of the docked sidebar is not there). Not when the host has the
            hamburger: that toggles it (and Escape, the backdrop and choosing an entry close it too), a second button is noise */}
        {!sidebar?.hostButton && (
          <button
            type="button"
            onClick={sidebar?.closeMobile}
            aria-label="Chiudi il menu"
            data-autofocus
            className="sb-close"
          >
            <X size={20} />
          </button>
        )}
      </div>

      <div className="sb-new">
        <RailTip label={sidebar?.rail ? 'Nuova chat' : null}>
          <button
            type="button"
            onClick={() => {
              onNewChat();
              sidebar?.closeMobile();
            }}
            disabled={busy}
            title={busy ? 'Attendi la fine della risposta' : undefined}
            className="sb-cta"
          >
            <SquarePen aria-hidden size={18} strokeWidth={2} className="shrink-0" />
            <span className="sb-label">Nuova chat</span>
          </button>
        </RailTip>
      </div>

      <nav aria-label="Navigazione principale" className="sb-scroll">
        <Group title="Assistente">{assistant}</Group>
        {configuration.length > 0 && <Group title="Configurazione">{configuration}</Group>}
      </nav>

      <AccountMenu
        name={user?.name}
        email={user?.email}
        buttonRef={accountRef}
        onSignOut={onSignOut}
        onOpenSettings={
          embedded
            ? undefined
            : () => {
                sidebar?.closeMobile();
                setAppearanceOpen(true);
              }
        }
      />

      {/* the drawer of the account menu's "Impostazioni": no gear of its own here */}
      {!embedded && (
        <AppearanceSettings
          hideButton
          open={appearanceOpen}
          onOpenChange={(open, viaKeyboard) => {
            restoreFocus.current = !open && viaKeyboard;
            setAppearanceOpen(open);
          }}
        />
      )}
    </div>
  );
}
