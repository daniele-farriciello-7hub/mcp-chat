/**
 * The whole chat panel: header, conversation and composer. The only visible part inside 7hub.
 *
 * `sidebar` (the standalone page only) wraps it in the sidebar frame: the entries that the header used to hold (appearance,
 * configuration, new conversation, logout) move into the sidebar, and what the page shows is the `place` — `section` null for
 * the chat, otherwise a tab of the configuration (`SETTINGS_TABS`; 'shortcuts' for an operator who is not an admin, whose only
 * panel is their own shortcuts) and, where the tab has them, its `sub`section. With the sidebar the place is also in the URL
 * hash (features/navigation/placeUrl.js): a refresh keeps it, the back button walks through the places. And leaving the
 * configuration for another tab or the chat with edits not saved asks first (UnsavedChangesDialog); the subsections of one tab
 * share the panel's state and never ask. Without the sidebar (/embed) nothing changes: the header keeps its buttons, there is no
 * hash and the host's `openSettings` opens the same panel.
 */
'use client';

import { useCallback, useEffect, useImperativeHandle, useRef, useState } from 'react';
import AppShell from '@/features/navigation/AppShell';
import Sidebar from '@/features/navigation/Sidebar';
import {
  CHAT_PLACE,
  normalizePlace,
  placeFromLocation,
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
  // what the page shows: the chat, or a settings tab and its subsection (see above); with the sidebar it starts where the URL says
  const [place, setPlace] = useState(() => (sidebar ? placeFromLocation(isAdmin) : CHAT_PLACE));
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

  // Goes to a place (a section, and a subsection of it). With the sidebar: normalized, written to the URL (unless it came from
  // there, `fromHistory`) and, if it leaves the open tab while it has edits not saved, put to the operator first. Returns whether
  // it went; `then` runs after it went, whether at once or once the operator has said to leave.
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
      if (fromHistory) writePlace(place, isAdmin);
      setLeaving({ next, then });
      return false;
    }
    setPlace(next);
    if (!fromHistory) writePlace(next, isAdmin);
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
    writePlace(next, isAdmin);
    then?.();
  };

  // the URL is the place from the first render: a hash that is a typo or not for this operator, or a tab without its subsection,
  // is rewritten as what it landed on; the back and forward buttons (and an edited hash) go to the place they name
  const navigateRef = useRef(navigate);
  useEffect(() => {
    navigateRef.current = navigate;
  });
  useEffect(() => {
    if (!sidebar) return undefined;
    writePlace(placeFromLocation(isAdmin), isAdmin, { replace: true });
    const onPopState = () => {
      const target = placeFromLocation(isAdmin);
      navigateRef.current(target.section, target.sub, { fromHistory: true });
    };
    window.addEventListener('popstate', onPopState);
    return () => window.removeEventListener('popstate', onPopState);
  }, [sidebar, isAdmin]);

  // What the operator types (or picks from the suggestions) is told to the host, which can offer something
  // on top of the reply (7Hub: the "Segnala un problema" button). Questions the host itself sends through the
  // handle below are not repeated back to it.
  const sendFromUser = (text, options) => {
    onUserMessage?.(text);
    return send(text, options);
  };

  // Embedded in 7Hub, the host's header and entry points (home box, search bar) drive the chat through
  // this handle. A question asked while a reply is still being written waits for it instead of being lost.
  const queued = useRef([]);
  useImperativeHandle(
    ref,
    () => ({
      ask: text => {
        if (!text?.trim()) return;
        setPlace(CHAT_PLACE);
        if (status === 'idle') send(text.trim());
        else queued.current.push(text.trim());
      },
      reset: () => {
        setPlace(CHAT_PLACE);
        reset();
      },
      openSettings: () => setPlace({ section: settingsHome, sub: null })
    }),
    [status, send, reset, settingsHome]
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
      {!hideHeader && (
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
      )}
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
      sidebar={
        <Sidebar
          section={section}
          subsection={subsection}
          onSelect={navigate}
          isAdmin={isAdmin}
          busy={busy}
          onNewChat={startNewChat}
          user={{ name: context?.user?.name?.trim(), email }}
          onSignOut={onSignOut}
        />
      }
    >
      {page}
      <UnsavedChangesDialog open={leaving !== null} onCancel={() => setLeaving(null)} onLeave={leave} />
    </AppShell>
  );
}
