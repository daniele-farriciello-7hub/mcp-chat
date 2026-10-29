/**
 * /embed — the chat as embedded in 7hub-revolution. Sign-in is required inside the iframe too:
 * the privacy assessment asks for identity verification before using the chatbot. The host sends
 * context (current page) and performs what the iframe cannot: navigating and closing the panel.
 */
'use client';

import { useCallback, useEffect, useRef, useState } from 'react';
import AccessDenied from '@/features/auth/components/AccessDenied';
import LoginScreen from '@/features/auth/components/LoginScreen';
import { useSession } from '@/features/auth/useSession';
import AgentMark from '@/features/chat/components/AgentMark';
import ChatPanel from '@/features/chat/components/ChatPanel';
import { announceReady, isEmbedded, listenToHost, postToHost } from '@/shared/embed/hostBridge';
import { useClientValue } from '@/shared/useClientValue';

export default function EmbedPage() {
  const [hostContext, setHostContext] = useState(null);
  const [hostOrigin, setHostOrigin] = useState(null);
  // the chat's handle (ask / reset / openSettings); commands that arrive before it exists (operator
  // not signed in yet) wait here and run as soon as the chat mounts
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

  // the listener below is registered once: it reads the current sign-out through this ref
  const signOutRef = useRef(session.signOut);
  useEffect(() => {
    signOutRef.current = session.signOut;
  }, [session.signOut]);

  const reportStatus = useCallback(busy => postToHost({ type: 'status', busy }, hostOrigin), [hostOrigin]);

  useEffect(() => {
    const unsubscribe = listenToHost(
      (context, origin) => {
        setHostContext(context);
        setHostOrigin(origin);
      },
      data => {
        if (data.type === 'sign_out') return signOutRef.current?.();
        if (panel.current) runCommand(data);
        else waiting.current.push(data);
      }
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
        onStatus={reportStatus}
      />
    </div>
  );
}
