/**
 * /embed — the chat as embedded in 7hub-revolution. Sign-in is required inside the iframe too:
 * the privacy assessment asks for identity verification before using the chatbot. The host sends
 * context (current page) and performs what the iframe cannot: navigating and closing the panel.
 *
 * The chat has the same sidebar as the standalone page (features/navigation), adapted to being a guest: a drawer behind a hamburger
 * (the host draws the header: its own hamburger when it declares the `sidebarButton` capability and sends `toggle_sidebar`, a slim
 * bar of this page otherwise), docked beside the conversation only when the iframe is 1024px wide or more, its place kept in the
 * state and never in the URL, and no appearance settings (the host decides the look). Signing out is the iframe's own (its
 * sign-in is its own), so "Esci" is in the sidebar's account menu. The host is told how the sidebar stands (docked, drawer open,
 * where the page is: `sidebar` message), which also tells it that this build has one.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AccessDenied from '@/features/auth/components/AccessDenied';
import LoginScreen from '@/features/auth/components/LoginScreen';
import { useSession } from '@/features/auth/useSession';
import AgentMark from '@/features/chat/components/AgentMark';
import ChatPanel from '@/features/chat/components/ChatPanel';
import { receiveHostAppearance } from '@/shared/appearance/appearanceStore';
import {
  announceReady,
  isEmbedded,
  listenToHost,
  postToHost,
  readHostCapabilities
} from '@/shared/embed/hostBridge';
import { useClientValue } from '@/shared/useClientValue';

export default function EmbedPage() {
  const [hostContext, setHostContext] = useState(null);
  const [hostOrigin, setHostOrigin] = useState(null);
  // the chat's handle (ask / reset / openSettings / toggleSidebar); commands that arrive before it exists (operator
  // not signed in yet) wait here and run as soon as the chat mounts (all but toggleSidebar, see the listener)
  const panel = useRef(null);
  const waiting = useRef([]);
  const runCommand = useCallback(data => {
    if (data.type === 'ask') panel.current.ask(data.text);
    else if (data.type === 'reset') panel.current.reset();
    else if (data.type === 'open_settings') panel.current.openSettings();
  }, []);
  const panelRef = useCallback(
    handle => {
      panel.current = handle;
      if (handle) waiting.current.splice(0).forEach(runCommand);
    },
    [runCommand]
  );
  // null until known: the first render is static and has no `window`
  const embedded = useClientValue(isEmbedded, null);
  const session = useSession();
  const hostSidebarButton = !!hostContext?.hostChrome && readHostCapabilities(hostContext).sidebarButton;

  // the listener below is registered once: it reads the current sign-out through this ref
  const signOutRef = useRef(session.signOut);
  useEffect(() => {
    signOutRef.current = session.signOut;
  }, [session.signOut]);

  const reportStatus = useCallback(busy => postToHost({ type: 'status', busy }, hostOrigin), [hostOrigin]);
  // `state` null: the sidebar is gone (signed out), the host must stop offering its hamburger
  const reportSidebar = useCallback(
    state =>
      postToHost(state ? { type: 'sidebar', ...state } : { type: 'sidebar', available: false }, hostOrigin),
    [hostOrigin]
  );

  useEffect(() => {
    const unsubscribe = listenToHost(
      (context, origin) => {
        // the host's look (mode, colours, font size) goes to the appearance store; the rest is the chat's context
        const { appearance, ...rest } = context;
        receiveHostAppearance(appearance, context.theme);
        setHostContext(rest);
        setHostOrigin(origin);
      },
      data => {
        if (data.type === 'sign_out') return signOutRef.current?.();
        // a click on the host's hamburger is about the state of the moment: with no chat on screen (the sign-in) it is dropped,
        // not kept to open the drawer by surprise after signing in
        if (data.type === 'toggle_sidebar') return panel.current?.toggleSidebar();
        if (panel.current) runCommand(data);
        else waiting.current.push(data);
      },
      // live changes of the host's settings
      appearance => receiveHostAppearance(appearance)
    );
    // the host answers with the context
    announceReady();
    return unsubscribe;
  }, [runCommand]);

  if (embedded === null || session.loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-surface">
        <AgentMark size={34} filled working />
      </div>
    );
  }

  if (!session.user) {
    return (
      <LoginScreen
        onSignIn={session.signIn}
        onSignInWithGoogle={session.signInWithGoogle}
        onResetPassword={session.resetPassword}
      />
    );
  }

  if (!session.canUse) return <AccessDenied onSignOut={session.signOut} />;

  // the panel fills the iframe height: this is the only place that decides it
  return (
    <div className="h-dvh">
      <ChatPanel
        context={{ ...hostContext, user: { name: session.displayName, email: session.user.email } }}
        uid={session.user.uid}
        email={session.user.email}
        isAdmin={session.isAdmin}
        onNavigate={url => postToHost({ type: 'navigate', url }, hostOrigin)}
        onClose={embedded ? () => postToHost({ type: 'close' }, hostOrigin) : undefined}
        onSignOut={session.signOut}
        ref={panelRef}
        // the host draws the header (7Hub's 7AI panel): commands and busy state go through the bridge
        hideHeader={!!hostContext?.hostChrome}
        sidebar
        embedded
        // the host's own hamburger for the drawer (only meaningful when it draws the header): the chat leaves out its own
        hostSidebarButton={hostSidebarButton}
        onSidebarChange={reportSidebar}
        onStatus={reportStatus}
        onUserMessage={text => postToHost({ type: 'user_message', text }, hostOrigin)}
      />
    </div>
  );
}
