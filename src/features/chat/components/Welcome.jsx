/**
 * Opening screen: the assistant says who it is and what it can do. The greeting uses the operator's
 * name and the time of day. Shortcuts: the admin's (for everyone, or assigned to this user) and the
 * operator's own (`PersonalShortcuts`); tapping one asks the question.
 */
'use client';

import { useEffect, useState } from 'react';
import { ChevronRight } from 'lucide-react';
import { DEFAULT_SETTINGS } from '@/features/settings/defaultSettings';
import { getSettings } from '@/features/settings/settingsStore';
import ShortcutIcon from '@/features/settings/components/ShortcutIcon';
import AgentMark from './AgentMark';
import { historyNotice } from '@/features/history/historyNotice';
import PersonalShortcuts from '@/features/shortcuts/PersonalShortcuts';
import { shortcutsFor } from '@/features/shortcuts/personalShortcuts';

const greeting = () => {
  const hour = new Date().getHours();
  if (hour < 13) return 'Buongiorno';
  if (hour < 18) return 'Buon pomeriggio';
  return 'Buonasera';
};

export default function Welcome({ uid, isAdmin = false, userName, onAsk }) {
  const [shortcuts, setShortcuts] = useState(shortcutsFor(DEFAULT_SETTINGS.shortcuts, uid));
  const [showAiNotice, setShowAiNotice] = useState(DEFAULT_SETTINGS.showAiNotice);
  // the history notice, or null when operators are not told (or nothing is kept)
  const [historyText, setHistoryText] = useState(null);

  useEffect(() => {
    getSettings().then(settings => {
      setShortcuts(shortcutsFor(settings.shortcuts, uid));
      setShowAiNotice(settings.showAiNotice !== false);
      setHistoryText(
        settings.historyEnabled && settings.showHistoryNotice !== false
          ? historyNotice(settings.historyNoticeText, settings.historyRetentionDays)
          : null
      );
    });
  }, [uid]);

  return (
    <div className="wash-ai relative flex min-h-full flex-col">
      <div className="relative z-10 flex items-start gap-2.5 px-4 pb-5 pt-3 text-left">
        <AgentMark size={42} ring="strong" className="mt-0.5" />
        <h2 className="text-[1.4rem] font-bold leading-[1.25] tracking-tight text-ink">
          {greeting()}
          {userName ? `, ${userName}.` : '.'}{' '}
          <span className="font-semibold text-slate-soft">Cosa vuoi fare oggi?</span>
        </h2>
      </div>

      {shortcuts.length > 0 && (
        <div className="relative z-10 px-4">
          <div className="mb-2 text-[11px] font-semibold uppercase tracking-[0.12em] text-slate-soft">
            Cosa posso fare
          </div>
          <div className="flex flex-col gap-2">
            {shortcuts.map(({ icon, title, description, prompt }, i) => {
              return (
                <button
                  key={i}
                  type="button"
                  onClick={() => onAsk(prompt)}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-line bg-white px-3.5 py-3 text-left transition-all duration-200 hover:-translate-y-0.5 hover:border-brand-300 hover:bg-brand-50/60 hover:shadow-soft"
                  style={{ animation: 'var(--animate-fade-up)', animationDelay: `${i * 70}ms` }}
                >
                  <span className="flex min-w-0 items-center gap-3">
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-50 text-brand-500 transition-transform duration-300 group-hover:scale-110">
                      <ShortcutIcon id={icon} size={18} strokeWidth={2.25} />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-[14px] font-semibold text-ink">{title}</span>
                      <span className="block text-[12px] leading-snug text-slate-soft">{description}</span>
                    </span>
                  </span>
                  <ChevronRight
                    size={16}
                    className="shrink-0 text-slate-soft transition-transform group-hover:translate-x-0.5"
                  />
                </button>
              );
            })}
          </div>
        </div>
      )}

      {/* admins have no personal shortcuts: theirs are admin ones assigned to themselves */}
      {uid && !isAdmin && <PersonalShortcuts onAsk={onAsk} />}

      <div className="flex-1" />

      {/* the AI Act requires making clear what you are talking to */}
      {showAiNotice && (
        <p className="relative z-10 px-4 pb-3 pt-5 text-[11px] leading-snug text-slate-soft">
          Le risposte sono generate da un sistema di intelligenza artificiale e vanno verificate prima di
          usarle in una pratica.
        </p>
      )}
      {historyText && (
        <p
          className={`relative z-10 px-4 pb-3 text-[11px] leading-snug text-slate-soft ${showAiNotice ? '' : 'pt-5'}`}
        >
          {historyText}
        </p>
      )}
    </div>
  );
}
