/** The whole chat panel: header, conversation and composer. The only visible part inside 7hub. */
'use client';

import { useState } from 'react';
import SettingsPanel from '@/features/settings/components/SettingsPanel';
import UserSettingsPanel from '@/features/settings/components/UserSettingsPanel';
import { useConversation } from '@/features/chat/useConversation';
import ChatHeader from './ChatHeader';
import ChatInput from './ChatInput';
import MessageList from './MessageList';

export default function ChatPanel({ context, uid, email, isAdmin = false, onNavigate, onClose, onSignOut }) {
  const { messages, status, send, reset } = useConversation({ uid, context, isAdmin });
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (settingsOpen) {
    return (
      <div className="panel-root">
        {/* admins get the whole configuration; everyone else only their own shortcuts */}
        {isAdmin ? (
          <SettingsPanel onClose={() => setSettingsOpen(false)} />
        ) : (
          <UserSettingsPanel onClose={() => setSettingsOpen(false)} />
        )}
      </div>
    );
  }

  return (
    <div className="panel-root">
      <ChatHeader
        status={status}
        email={email}
        onOpenSettings={uid ? () => setSettingsOpen(true) : undefined}
        settingsLabel={isAdmin ? 'Configurazione' : 'Le mie scorciatoie'}
        // hidden mid-reply: closing the conversation while its last turn is still being written
        // would leave that turn's history write pointing at a conversation already ended
        onReset={messages.length > 0 && status === 'idle' ? reset : undefined}
        onSignOut={onSignOut}
        onClose={onClose}
      />
      <MessageList
        uid={uid}
        messages={messages}
        status={status}
        userName={context?.user?.name?.trim()}
        onAsk={send}
        onNavigate={onNavigate}
      />
      <ChatInput busy={status !== 'idle'} onSend={send} />
    </div>
  );
}
