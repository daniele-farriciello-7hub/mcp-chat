/**
 * The chat opened directly, outside 7hub: sign in with suite accounts and the app permission.
 * 7hub loads /embed instead — same full-height layout as that route (no card, no border) so the
 * two don't visually diverge; /embed is still what the real iframe loads.
 * Both have the sidebar (features/navigation): here it is docked from 768px up, there it is a drawer and docks only in a wide iframe.
 */
'use client';

import AccessDenied from '@/features/auth/components/AccessDenied';
import LoginScreen from '@/features/auth/components/LoginScreen';
import { useSession } from '@/features/auth/useSession';
import AgentMark from '@/features/chat/components/AgentMark';
import ChatPanel from '@/features/chat/components/ChatPanel';

export default function StandalonePage() {
  const session = useSession();

  if (session.loading) {
    return (
      <div className="flex h-dvh items-center justify-center bg-surface">
        <AgentMark size={38} filled working />
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

  return (
    <div className="h-dvh">
      <ChatPanel
        context={{ user: { name: session.displayName, email: session.user.email } }}
        uid={session.user.uid}
        email={session.user.email}
        isAdmin={session.isAdmin}
        onSignOut={session.signOut}
        sidebar
      />
    </div>
  );
}
