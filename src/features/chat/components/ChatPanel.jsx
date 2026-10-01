/** The whole chat panel: header, conversation and composer. The only visible part inside 7hub. */
'use client';

import { useState } from 'react';
import SettingsPanel from '@/features/settings/components/SettingsPanel';
import { useConversation } from '@/features/chat/useConversation';
import ChatHeader from './ChatHeader';
import ChatInput from './ChatInput';
import MessageList from './MessageList';

export default function ChatPanel({ context, email, isAdmin = false, onNavigate, onClose, onSignOut }) {
  const { messages, status, send, reset } = useConversation({ context, isAdmin });
  const [settingsOpen, setSettingsOpen] = useState(false);

  if (settingsOpen) {
    return (
      <div className="panel-root">
        <SettingsPanel onClose={() => setSettingsOpen(false)} />
      </div>
    );
  }

  return (
    <div className="panel-root">
      <ChatHeader
        status={status}
        email={email}
        onOpenSettings={isAdmin ? () => setSettingsOpen(true) : undefined}
        onReset={messages.length > 0 ? reset : undefined}
        onSignOut={onSignOut}
        onClose={onClose}
      />
      <MessageList
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
