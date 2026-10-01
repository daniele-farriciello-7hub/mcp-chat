/**
 * One message. The user's is a filled pill on the right; the assistant's is plain text on the page,
 * so a reply reads like text and leaves room for a result card underneath.
 */
import { renderMarkdownLite } from '../renderMarkdownLite';
import { AgentFace } from './AgentMark';
import ResultCard from './ResultCard';

export default function MessageBubble({ message, streaming, onNavigate }) {
  if (message.role === 'user') {
    return (
      <div className="flex justify-end" style={{ animation: 'var(--animate-fade-up)' }}>
        <div className="max-w-[85%] rounded-bubble rounded-tr-sm bg-brand-500 px-3.5 py-2 text-[13px] font-medium leading-relaxed text-white">
          <span className="whitespace-pre-wrap break-words">{message.text}</span>
        </div>
      </div>
    );
  }

  return (
    <div className="flex items-start gap-2" style={{ animation: 'var(--animate-fade-up)' }}>
      <span className="mt-0.5 flex h-7 w-7 shrink-0 items-center justify-center rounded-[9px] bg-surface">
        <AgentFace size={17} />
      </span>

      <div className="min-w-0 flex-1 pt-0.5">
        <div className="text-[13px] leading-relaxed text-ink">
          <div className="break-words">
            {renderMarkdownLite(
              message.text,
              streaming && (
                <span className="cursor-blink ml-0.5 inline-block h-3.5 w-[7px] translate-y-[2px] rounded-[2px] bg-brand-500" />
              )
            )}
          </div>
        </div>

        {message.card && !streaming && <ResultCard card={message.card} onNavigate={onNavigate} />}
      </div>
    </div>
  );
}
