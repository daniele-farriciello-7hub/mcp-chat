'use client';

import { useState } from 'react';
import { Loader2 } from 'lucide-react';
import Tooltip from '@/shared/ui/Tooltip';
import { DOCUMENT_MODES, DOCUMENT_MODE, modeOf } from '@/features/documents/archiveMode';
import { changeDocumentMode } from '@/features/documents/documentMode';

/**
 * Two buttons that say how the assistant uses this document, and change it (documentMode.js). Works for
 * Drive documents too. Turning an archive document into a studied one asks Gemini to read the file again,
 * and the tooltip says so; the rest is immediate.
 */
export default function DocumentModeSwitch({ document, disabled = false }) {
  const [busy, setBusy] = useState(false);
  const [failed, setFailed] = useState(false);
  const current = modeOf(document);

  const change = async mode => {
    if (mode === current || busy) return;
    setBusy(true);
    setFailed(false);
    try {
      await changeDocumentMode(document, mode);
    } catch (error) {
      console.error('[documents] changing the mode failed:', error);
      setFailed(true);
    } finally {
      setBusy(false);
    }
  };

  const hint = mode =>
    mode.id === DOCUMENT_MODE.studied && document.indexCard?.light
      ? `${mode.description} La scheda va riscritta: Gemini rilegge il file.`
      : mode.description;

  return (
    <div className="flex flex-wrap items-center gap-2">
      <div
        role="radiogroup"
        aria-label={`Come Vale usa ${document.name}`}
        className="flex gap-0.5 rounded-lg border border-line bg-surface p-0.5"
      >
        {DOCUMENT_MODES.map(mode => {
          const selected = mode.id === current;
          return (
            <Tooltip key={mode.id} label={hint(mode)} align="left">
              <button
                type="button"
                role="radio"
                aria-checked={selected}
                disabled={disabled || busy}
                onClick={() => change(mode.id)}
                className={`rounded-md px-2 py-0.5 text-fs-10 font-semibold transition disabled:cursor-not-allowed ${
                  selected ? 'bg-panel text-brand-600 shadow-soft' : 'text-slate-soft hover:text-ink'
                }`}
              >
                {mode.pill}
              </button>
            </Tooltip>
          );
        })}
      </div>
      {busy && <Loader2 size={12} className="animate-spin text-slate-soft" />}
      {failed && <span className="text-fs-10 text-danger">Non riesco a salvarlo: riprova.</span>}
    </div>
  );
}
