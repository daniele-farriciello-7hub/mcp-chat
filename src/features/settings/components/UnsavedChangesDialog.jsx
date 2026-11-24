/**
 * "Hai modifiche non salvate": the small dialog in front of anything that would leave the configuration with edits that are not
 * saved yet (another tab, the chat, a new chat; see ChatPanel). "Annulla" (the default, and Escape or a click outside) stays where
 * you were; "Esci senza salvare" goes on and the edits are dropped. A modal alert: the focus starts on "Annulla", Tab stays
 * between the two buttons and goes back to where it was when it closes.
 */
'use client';

import { useEffect, useRef } from 'react';
import { createPortal } from 'react-dom';

export default function UnsavedChangesDialog({ open, onCancel, onLeave }) {
  const cancelRef = useRef(null);
  const leaveRef = useRef(null);

  useEffect(() => {
    if (!open) return undefined;
    const before = document.activeElement;
    cancelRef.current?.focus();
    return () => {
      if (before?.isConnected) before.focus();
    };
  }, [open]);

  if (!open) return null;

  const onKeyDown = event => {
    if (event.key === 'Escape') {
      event.preventDefault();
      onCancel();
    } else if (event.key === 'Tab') {
      // only two buttons: Tab goes from one to the other and never out of the dialog
      event.preventDefault();
      (document.activeElement === cancelRef.current ? leaveRef : cancelRef).current?.focus();
    }
  };

  return createPortal(
    <div
      className="fixed inset-0 z-[100] grid place-items-center bg-black/40 p-4 motion-safe:animate-[fade-in_0.15s_ease-out_both]"
      onClick={onCancel}
    >
      <div
        role="alertdialog"
        aria-modal="true"
        aria-labelledby="unsaved-title"
        aria-describedby="unsaved-text"
        onClick={event => event.stopPropagation()}
        onKeyDown={onKeyDown}
        className="w-full max-w-sm rounded-2xl border border-line bg-panel p-5 shadow-lift"
      >
        <h2 id="unsaved-title" className="text-fs-15 font-bold text-ink">
          Hai modifiche non salvate
        </h2>
        <p id="unsaved-text" className="mt-1.5 text-fs-13 leading-snug text-slate-soft">
          Se esci adesso, quello che hai cambiato nella configurazione andrà perso.
        </p>
        <div className="mt-4 flex flex-wrap justify-end gap-2">
          <button
            ref={cancelRef}
            type="button"
            onClick={onCancel}
            className="rounded-xl border border-line px-3 py-2 text-fs-13 font-semibold text-ink transition hover:bg-surface"
          >
            Annulla
          </button>
          <button
            ref={leaveRef}
            type="button"
            onClick={onLeave}
            className="rounded-xl bg-danger-soft px-3 py-2 text-fs-13 font-semibold text-danger transition hover:bg-danger hover:text-white"
          >
            Esci senza salvare
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
