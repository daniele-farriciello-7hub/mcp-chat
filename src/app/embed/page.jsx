/**
 * /embed — the chat as embedded in 7hub-revolution. Sign-in is required inside the iframe too:
 * the privacy assessment asks for identity verification before using the chatbot. The host sends
 * context (current page) and performs what the iframe cannot: navigating and closing the panel.
 */
'use client';

import { useEffect, useState } from 'react';
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
  // null until known: the first render is static and has no `window`
  const embedded = useClientValue(isEmbedded, null);
  const session = useSession();

  useEffect(() => {
    const unsubscribe = listenToHost((context, origin) => {
      setHostContext(context);
      setHostOrigin(origin);
    });
    // the host answers with the context
    announceReady();
    return unsubscribe;
  }, []);

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
      />
    </div>
  );
}
