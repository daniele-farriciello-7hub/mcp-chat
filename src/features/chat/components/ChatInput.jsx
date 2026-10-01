/**
 * Message composer: auto-growing textarea, dictation and send. Enter sends, Shift+Enter adds a line.
 * While the assistant works you can keep typing; only sending is blocked.
 *
 * Attachments were removed on purpose: uploading third-party documents in chat is one of the risks
 * listed in the privacy assessment; documents come from the company archive instead.
 */
'use client';

import { useEffect, useRef, useState } from 'react';
import { ArrowUp, Mic, Square } from 'lucide-react';
import { useVoiceInput } from '@/features/chat/useVoiceInput';
import Tooltip from '@/shared/ui/Tooltip';

const MAX_TEXTAREA_HEIGHT_PX = 120;

export default function ChatInput({ busy, onSend }) {
  const [text, setText] = useState('');
  const textareaRef = useRef(null);
  const voice = useVoiceInput({ onTranscript: setText });

  useEffect(() => {
    const textarea = textareaRef.current;
    if (!textarea) return;
    textarea.style.height = 'auto';
    textarea.style.height = `${Math.min(textarea.scrollHeight, MAX_TEXTAREA_HEIGHT_PX)}px`;
  }, [text]);

  const canSend = !busy && Boolean(text.trim());

  const send = () => {
    if (!canSend) return;
    voice.stopForSend();
    onSend(text.trim());
    setText('');
  };

  const voiceLabel = voice.listening ? 'Ferma la dettatura' : 'Detta il messaggio';

  return (
    <div className="relative z-10 border-t border-line bg-white px-3 py-3">
      <div className="flex items-end gap-1 rounded-[22px] border border-line bg-surface px-2 py-1.5 transition focus-within:border-brand-500 focus-within:bg-white focus-within:ring-[3px] focus-within:ring-brand-500/15">
        {voice.supported && (
          <Tooltip label={voiceLabel} side="top" align="left">
            <button
              type="button"
              onClick={() => voice.toggle(text)}
              aria-label={voiceLabel}
              className={`rounded-lg p-2 transition ${
                voice.listening
                  ? 'animate-pulse bg-brand-50 text-brand-600'
                  : 'text-slate-soft hover:bg-white hover:text-ink'
              }`}
            >
              {voice.listening ? <Square size={16} strokeWidth={2.5} /> : <Mic size={18} />}
            </button>
          </Tooltip>
        )}

        <textarea
          ref={textareaRef}
          rows={1}
          value={text}
          placeholder={voice.listening ? 'Ti ascolto…' : busy ? 'Sto lavorando…' : 'Scrivi un messaggio…'}
          aria-label="Messaggio"
          onChange={e => {
            setText(e.target.value);
            voice.setConfirmedText(e.target.value);
          }}
          onKeyDown={e => {
            if (e.key === 'Enter' && !e.shiftKey) {
              e.preventDefault();
              send();
            }
          }}
          className="max-h-[120px] min-h-[26px] flex-1 resize-none self-center bg-transparent px-1 py-1 text-[13px] leading-relaxed text-ink outline-none placeholder:text-slate-soft/70"
        />

        <Tooltip label="Invia (Invio)" side="top" align="right">
          <button
            type="button"
            onClick={send}
            disabled={!canSend}
            aria-label="Invia messaggio"
            className={`mb-0.5 flex h-[34px] w-[34px] shrink-0 items-center justify-center rounded-full transition-all duration-200 ${
              canSend
                ? 'scale-100 bg-brand-500 text-white hover:bg-brand-600'
                : 'scale-95 bg-line text-slate-soft/60'
            }`}
          >
            <ArrowUp size={16} strokeWidth={2.5} />
          </button>
        </Tooltip>
      </div>
    </div>
  );
}
