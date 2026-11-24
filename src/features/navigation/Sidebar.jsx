/**
 * What is inside the sidebar (the frame, the rail and the phone drawer are AppShell.jsx's):
 *
 *   · top      the assistant's mark (it keeps morphing while a reply is being written) and its name, "Nuova chat" below
 *   · Assistente   Chat, and for an admin Storico; for everyone else "Le mie scorciatoie"
 *   · Configurazione (admin)   the tabs of the configuration panel: Modello IA, Scorciatoie, Documenti, Database, 7Hub
 *   · bottom   the operator (avatar, name, email) with "Impostazioni" (the appearance drawer) and "Esci"
 *
 * A tab that has subsections (settingsSections.js: Modello IA, Documenti, Storico…) is a group (NavGroup.jsx): its subsections
 * open under it, or in a flyout from its icon in the rail. Its group opens by itself when the page goes inside it.
 *
 * `section` and `subsection` say what the page shows: null = the chat, otherwise the id of a settings tab (`SETTINGS_TABS`;
 * 'shortcuts' is also the operators' own panel) and of its subsection. `onSelect(section, subsection)` goes somewhere (the page
 * may ask first: unsaved edits). Everything that used to be a button in the chat's header lives here now, so nothing is lost:
 * the gear (Impostazioni), the sliders (Configurazione / Le mie scorciatoie), the reset arrow (Nuova chat) and Logout.
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
  busy,
  onNewChat,
  user,
  onSignOut
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
    if (section) followPage(section);
  }, [section]);

  // choosing anything closes the phone drawer; opening a group (`keepDrawer`) does not, its subsections are what to choose
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

  return (
    <div className="sb-body">
      <div className="sb-head">
        <AgentMark size={26} filled working={busy} />
        <span className="sb-label sb-title">Assistente 7hub</span>
        {/* phones: the drawer's own close button (the edge button of the desktop is not there) */}
        <button
          type="button"
          onClick={sidebar?.closeMobile}
          aria-label="Chiudi il menu"
          data-autofocus
          className="sb-close"
        >
          <X size={20} />
        </button>
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
        onOpenSettings={() => {
          sidebar?.closeMobile();
          setAppearanceOpen(true);
        }}
      />

      {/* the drawer of the account menu's "Impostazioni": no gear of its own here */}
      <AppearanceSettings
        hideButton
        open={appearanceOpen}
        onOpenChange={(open, viaKeyboard) => {
          restoreFocus.current = !open && viaKeyboard;
          setAppearanceOpen(open);
        }}
      />
    </div>
  );
}
