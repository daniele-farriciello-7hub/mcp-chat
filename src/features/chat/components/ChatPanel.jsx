/**
 * The whole chat panel: header, conversation and composer. The only visible part inside 7hub.
 *
 * `sidebar` wraps it in the sidebar frame: the entries that the header used to hold (appearance, configuration, new
 * conversation, logout) move into the sidebar, and so does its status line where the standalone page docks it (the header then
 * renders nothing, ChatHeader.jsx: the page starts at its top; below 768px it stays, with the status). What the page shows is
 * the `place` — `section` null for the chat, otherwise a tab of the configuration (`SETTINGS_TABS`; 'shortcuts' for an operator
 * who is not an admin, whose only panel is their own shortcuts) and, where the tab has them, its `sub`section. Leaving the
 * configuration for another tab or the chat with edits not saved asks first (UnsavedChangesDialog); the subsections of one tab
 * share the panel's state and never ask.
 *
 * Two pages use it, told by `embedded` (/embed, the panel inside 7hub):
 *  · the standalone page: the sidebar is docked from 768px; the place is also in the URL hash (features/navigation/placeUrl.js),
 *    so a refresh keeps it and the back button walks through the places;
 *  · /embed: the sidebar is a drawer behind a hamburger, docked only when the iframe is 1024px wide or more. The place lives in
 *    the state and never in the URL (the iframe's address is the host's business). The host drives the chat through the handle
 *    (`ask`, `reset`, `openSettings`): they go through the same `navigate`, so they too ask before dropping unsaved edits. The
 *    host draws the header there (`hideHeader`), so while the sidebar is a drawer its hamburger is in the host's header when the
 *    host has one (`hostSidebarButton`: it sends the `toggleSidebar` command of the handle) and otherwise in a slim bar of this page
 *    (EmbedMenuBar). `onSidebarChange({ docked, open, place })` tells the host how the sidebar stands and where the page is.
 * Without the sidebar nothing changes: the header keeps its buttons, there is no hash and `openSettings` opens the same panel.
 */
'use client';

import { useCallback, useEffect, useImperativeHandle, useLayoutEffect, useRef, useState } from 'react';
import AppShell from '@/features/navigation/AppShell';
import EmbedMenuBar from '@/features/navigation/EmbedMenuBar';
import Sidebar from '@/features/navigation/Sidebar';
import SidebarReporter from '@/features/navigation/SidebarReporter';
import {
  CHAT_PLACE,
  normalizePlace,
  placeFromLocation,
  placeLabel,
  samePlace,
  writePlace
} from '@/features/navigation/placeUrl';
import SettingsPanel from '@/features/settings/components/SettingsPanel';
import UnsavedChangesDialog from '@/features/settings/components/UnsavedChangesDialog';
import UserSettingsPanel from '@/features/settings/components/UserSettingsPanel';
import { useConversation } from '@/features/chat/useConversation';
import ChatHeader from './ChatHeader';
import ChatInput from './ChatInput';
import MessageList from './MessageList';

export default function ChatPanel({
  context,
  uid,
  email,
  isAdmin = false,
  onNavigate,
  onClose,
  onSignOut,
  hideHeader = false,
  sidebar = false,
  embedded = false,
  hostSidebarButton = false,
  onSidebarChange,
  onStatus,
  onUserMessage,
  ref
}) {
  const { messages, status, send, reset, selectOption, pickFile } = useConversation({
    uid,
    context,
    isAdmin
  });
  const inputRef = useRef(null);
  // the sidebar frame's handle: the host's hamburger opens and closes its drawer through it
  const shellRef = useRef(null);
  // the place is in the URL on the standalone page only (see above)
  const placeInUrl = sidebar && !embedded;
  // what the page shows: the chat, or a settings tab and its subsection (see above); on the standalone page it starts where the URL says
  const [place, setPlace] = useState(() => (placeInUrl ? placeFromLocation(isAdmin) : CHAT_PLACE));
  const { section, sub: subsection } = place;
  const settingsOpen = section !== null;
  const settingsHome = isAdmin ? 'model' : 'shortcuts';
  // the settings panel says whether it holds edits not saved yet; `leaving` is the place waiting for the operator's answer, and
  // `settingsKey` gives the panel a fresh start (the edits dropped) when the answer is to leave
  const unsaved = useRef(false);
  const markUnsaved = useCallback(value => {
    unsaved.current = value;
  }, []);
  const [leaving, setLeaving] = useState(null);
  const [settingsKey, setSettingsKey] = useState(0);

  // Goes to a place (a section, and a subsection of it). With the sidebar: normalized, written to the URL (standalone only, and
  // not when it came from there, `fromHistory`) and, if it leaves the open tab while it has edits not saved, put to the operator
  // first. Returns whether it went; `then` runs after it went, whether at once or once the operator has said to leave.
  const navigate = (nextSection, nextSub = null, { fromHistory = false, then } = {}) => {
    const next = normalizePlace({ section: nextSection, sub: nextSub }, isAdmin);
    if (!sidebar) {
      setPlace(next);
      then?.();
      return true;
    }
    if (samePlace(next, place)) {
      then?.();
      return true;
    }
    if (unsaved.current && settingsOpen && next.section !== section) {
      // the back button has already moved the URL: put it back where the page still is
      if (placeInUrl && fromHistory) writePlace(place, isAdmin);
      setLeaving({ next, then });
      return false;
    }
    setPlace(next);
    if (placeInUrl && !fromHistory) writePlace(next, isAdmin);
    then?.();
    return true;
  };
  const leave = () => {
    const { next, then } = leaving;
    setLeaving(null);
    unsaved.current = false;
    // the panel may stay up (another tab): a new key drops what was typed
    setSettingsKey(key => key + 1);
    setPlace(next);
    if (placeInUrl) writePlace(next, isAdmin);
    then?.();
  };

  // the latest of what the host's commands (the handle below) and the browser's history need: they outlive the render they
  // were made in, and must act on the place and the conversation as they are when they run. A layout effect, declared before
  // the handle: a command that was waiting for the chat runs the moment the handle is given out, and finds this ready.
  const live = useRef(null);
  useLayoutEffect(() => {
    live.current = { navigate, status, send, reset, settingsHome };
  });

  // standalone: the URL is the place from the first render: a hash that is a typo or not for this operator, or a tab without its
  // subsection, is rewritten as what it landed on; the back and forward buttons (and an edited hash) go to the place they name
  useEffect(() => {
    if (!placeInUrl) return undefined;
    writePlace(placeFromLocation(isAdmin), isAdmin, { replace: true });
    const onPopState = () => {
      const target = placeFromLocation(isAdmin);
      live.current.navigate(target.section, target.sub, { fromHistory: true });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [placeInUrl, isAdmin]);

  // What the operator types (or picks from the suggestions) is told to the host, which can offer something
  // on top of the reply (7Hub: the "Segnala un problema" button). Questions the host itself sends through the
  // handle below are not repeated back to it.
  const sendFromUser = (text, options) => {
    onUserMessage?.(text);
    return send(text, options);
  };

  // Embedded in 7Hub, the host's header and entry points (home box, search bar) drive the chat through
  // this handle. A question asked while a reply is still being written waits for it instead of being lost. Every command goes
  // through `navigate`, so with unsaved configuration edits it is the operator who decides first (a cancel drops the command).
  const queued = useRef([]);
  useImperativeHandle(
    ref,
    () => ({
      ask: text => {
        const question = text?.trim();
        if (!question) return;
        live.current.navigate(null, null, {
          then: () => {
            if (live.current.status === 'idle') live.current.send(question);
            else queued.current.push(question);
          }
        });
      },
      reset: () => live.current.navigate(null, null, { then: () => live.current.reset() }),
      openSettings: () => live.current.navigate(live.current.settingsHome),
      // the host's hamburger (not a place change: no question about unsaved edits)
      toggleSidebar: () => shellRef.current?.toggleDrawer()
    }),
    []
  );
  useEffect(() => {
    if (status === 'idle' && queued.current.length) send(queued.current.shift());
  }, [status, send]);

  const busy = status !== 'idle';
  useEffect(() => {
    onStatus?.(busy);
  }, [busy, onStatus]);

  // "Nuova chat" of the sidebar: back to the chat, with a fresh conversation unless it is already empty (then the cursor goes
  // to the composer). Not mid-reply, as the header's reset arrow: the sidebar disables it
  const startNewChat = () =>
    navigate(null, null, {
      then: () => {
        if (status !== 'idle') return;
        if (messages.length > 0) reset();
        else if (!settingsOpen) inputRef.current?.focus();
      }
    });

  // The host draws the header of the chat (7AI panel): while the sidebar is a drawer its hamburger is the host's own when it has
  // one, and otherwise a slim bar of this page (EmbedMenuBar, which renders nothing when the host has it)
  const header = hideHeader ? (
    sidebar && <EmbedMenuBar />
  ) : (
    <ChatHeader
      status={status}
      email={email}
      // with the sidebar these live there (Impostazioni, Configurazione, Esci)
      onOpenSettings={uid && !sidebar ? () => setPlace({ section: settingsHome, sub: null }) : undefined}
      settingsLabel={isAdmin ? 'Configurazione' : 'Le mie scorciatoie'}
      // hidden mid-reply: closing the conversation while its last turn is still being written
      // would leave that turn's history write pointing at a conversation already ended
      onReset={messages.length > 0 && status === 'idle' ? reset : undefined}
      onSignOut={sidebar ? undefined : onSignOut}
      onClose={onClose}
    />
  );

  const page = settingsOpen ? (
    <div className="panel-root">
      {/* admins get the whole configuration; everyone else only their own shortcuts */}
      {isAdmin ? (
        <SettingsPanel
          key={settingsKey}
          tab={section}
          subsection={subsection}
          onTabChange={navigate}
          onClose={() => navigate(null)}
          onDirtyChange={markUnsaved}
        />
      ) : (
        <UserSettingsPanel uid={uid} onClose={() => navigate(null)} />
      )}
    </div>
  ) : (
    <div className="panel-root">
      {header}
      <MessageList
        uid={uid}
        isAdmin={isAdmin}
        messages={messages}
        status={status}
        userName={context?.user?.name?.trim()}
        onAsk={sendFromUser}
        onSelect={selectOption}
        onPickFile={pickFile}
        onFocusInput={() => inputRef.current?.focus()}
        onNavigate={onNavigate}
      />
      <ChatInput ref={inputRef} busy={status !== 'idle'} onSend={sendFromUser} />
    </div>
  );

  if (!sidebar) return page;

  return (
    <AppShell
      ref={shellRef}
      embedded={embedded}
      hostButton={hostSidebarButton}
      sidebar={
        <Sidebar
          section={section}
          subsection={subsection}
          onSelect={navigate}
          isAdmin={isAdmin}
          status={status}
          busy={busy}
          onNewChat={startNewChat}
          user={{ name: context?.user?.name?.trim(), email }}
          onSignOut={onSignOut}
          embedded={embedded}
        />
      }
    >
      {page}
      <UnsavedChangesDialog open={leaving !== null} onCancel={() => setLeaving(null)} onLeave={leave} />
      {onSidebarChange && (
        <SidebarReporter label={placeLabel(place, isAdmin)} chat={!settingsOpen} onChange={onSidebarChange} />
      )}
    </AppShell>
  );
}
