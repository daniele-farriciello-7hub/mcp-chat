/**
 * A textarea for the long instruction fields in the admin panel, with a markdown preview toggle.
 * The model reads `**grassetto**`/`_corsivo_`/elenchi fine as plain text without any rendering, but
 * an admin writing 10+ lines of instructions wants to see the formatting before saving — reuses the
 * same renderer the chat itself uses for replies (`renderMarkdownLite.jsx`), so the preview is
 * exactly what the operator would see if this text ever reached a reply verbatim.
 *
 * Opens in preview by default, not edit: the field is read far more often than it's changed, and
 * seeing rendered markdown on open is the whole point of writing it. Clicking the pencil switches
 * to the plain textarea — meant for pasting markdown in (a README, a drafted guide) as much as for
 * typing — and switching back to preview shows it rendered.
 *
 * `mentionables` (optional) turns on "@" autocomplete for referencing attached files by name — see
 * `PromptAttachments.jsx`. Typing "@" opens a dropdown of matching names, anchored under the caret
 * (`caretCoordinates.js`); picking one inserts "@name " at the cursor. The "@" is kept in the saved
 * text only as a visual cue for whoever reads the field again later — the model has no special
 * handling for it, it just sees the filename in prose, same as if it had been typed by hand (see
 * `attachmentsBlock` in `shared/promptAttachments.js`). Omitted entirely wherever the caller passes
 * no `mentionables`, which keeps that field's behavior exactly as before.
 */
'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Eye, FileText, Pencil } from 'lucide-react';
import { renderMarkdownLite } from '@/features/chat/renderMarkdownLite';
import { getCaretCoordinates } from './caretCoordinates';
import { INPUT_CLASS } from './formStyles';

const DROPDOWN_WIDTH = 224; // matches the w-56 below

// the "@" must not have a space between it and the cursor, so "email@work then @test" only
// triggers on the second one
const MENTION_TRIGGER = /@([^\s@]*)$/;

export default function MarkdownTextarea({ value, onChange, rows = 6, ariaLabel, mentionables }) {
  const [previewing, setPreviewing] = useState(true);
  const [mentionQuery, setMentionQuery] = useState(null); // string while the dropdown is open, else null
  const [activeIndex, setActiveIndex] = useState(0);
  const [caretPos, setCaretPos] = useState(null); // { top, left, height }, relative to the textarea box
  const textareaRef = useRef(null);

  // switching to edit is almost always to paste something in — focus right away instead of
  // making that an extra click. Does not fire on mount, since previewing starts true.
  useEffect(() => {
    if (!previewing) textareaRef.current?.focus();
  }, [previewing]);

  const matches = useMemo(() => {
    if (mentionQuery === null || !mentionables?.length) return [];
    const q = mentionQuery.toLowerCase();
    return mentionables.filter(name => name.toLowerCase().includes(q));
  }, [mentionQuery, mentionables]);

  const closeMention = () => {
    setMentionQuery(null);
    setActiveIndex(0);
  };

  const handleChange = e => {
    onChange(e);
    if (!mentionables?.length) return;
    const cursor = e.target.selectionStart;
    const upToCursor = e.target.value.slice(0, cursor);
    const match = MENTION_TRIGGER.exec(upToCursor);
    if (match) {
      setMentionQuery(match[1]);
      setActiveIndex(0);
      const coords = getCaretCoordinates(e.target, cursor);
      const maxLeft = e.target.clientWidth - DROPDOWN_WIDTH;
      setCaretPos({ ...coords, left: Math.max(0, Math.min(coords.left, maxLeft)) });
    } else {
      closeMention();
    }
  };

  const insertMention = name => {
    const el = textareaRef.current;
    if (!el) return;
    const cursor = el.selectionStart;
    const before = el.value.slice(0, cursor);
    const after = el.value.slice(cursor);
    const match = MENTION_TRIGGER.exec(before);
    if (!match) return;
    const insertPoint = before.slice(0, match.index);
    const next = `${insertPoint}@${name} ${after}`;
    onChange({ target: { value: next } });
    closeMention();
    // the textarea re-renders with the new value on the next tick; set the caret after that
    requestAnimationFrame(() => {
      const pos = insertPoint.length + name.length + 2; // '@' + name + trailing space
      el.focus();
      el.setSelectionRange(pos, pos);
    });
  };

  const handleKeyDown = e => {
    if (mentionQuery === null || matches.length === 0) return;
    if (e.key === 'ArrowDown') {
      e.preventDefault();
      setActiveIndex(i => (i + 1) % matches.length);
    } else if (e.key === 'ArrowUp') {
      e.preventDefault();
      setActiveIndex(i => (i - 1 + matches.length) % matches.length);
    } else if (e.key === 'Enter' || e.key === 'Tab') {
      e.preventDefault();
      insertMention(matches[activeIndex]);
    } else if (e.key === 'Escape') {
      closeMention();
    }
  };

  return (
    <div className="relative">
      <div className="mb-1 flex items-center justify-between">
        <button
          type="button"
          onClick={() => setPreviewing(v => !v)}
          className="flex items-center gap-1 text-[11px] font-medium text-brand-600 transition hover:text-brand-700"
        >
          {previewing ? (
            <>
              <Pencil size={11} /> Modifica
            </>
          ) : (
            <>
              <Eye size={11} /> Anteprima
            </>
          )}
        </button>
        <span className="text-[10px] text-slate-soft">{value.length} caratteri</span>
      </div>

      {previewing ? (
        // never smaller than edit mode's own height (`rows`, sized for typing comfort, not for how
        // much a short field's rendered output wants to show), but capped so a long field (a pasted
        // README, the production instructions) scrolls inside the box instead of stretching the
        // whole settings panel
        <div
          className={`${INPUT_CLASS} overflow-y-auto text-[12px] leading-relaxed`}
          style={{ minHeight: `${rows * 1.6}em`, maxHeight: 320 }}
        >
          {value.trim() ? (
            renderMarkdownLite(value)
          ) : (
            <span className="text-slate-soft">Niente da mostrare: il campo è vuoto.</span>
          )}
        </div>
      ) : (
        <div className="relative">
          <textarea
            ref={textareaRef}
            rows={rows}
            value={value}
            onChange={handleChange}
            onKeyDown={handleKeyDown}
            onBlur={closeMention}
            aria-label={ariaLabel}
            className={`${INPUT_CLASS} resize-y font-mono text-[12px] leading-relaxed`}
          />

          {mentionQuery !== null && matches.length > 0 && caretPos && (
            <div
              className="absolute z-20 max-h-40 w-56 overflow-y-auto rounded-xl border border-line bg-white py-1 shadow-lift"
              style={{ top: caretPos.top + caretPos.height + 2, left: caretPos.left }}
            >
              {matches.map((name, i) => (
                <button
                  key={name}
                  type="button"
                  // keeps the textarea focused (no blur) so the caret position survives the click
                  onMouseDown={e => e.preventDefault()}
                  onClick={() => insertMention(name)}
                  className={`flex w-full items-center gap-1.5 px-2.5 py-1.5 text-left text-[12px] ${
                    i === activeIndex ? 'bg-brand-50 text-brand-700' : 'text-ink hover:bg-surface'
                  }`}
                >
                  <FileText size={12} className="shrink-0 text-brand-500" />
                  <span className="truncate">{name}</span>
                </button>
              ))}
            </div>
          )}
        </div>
      )}
    </div>
  );
}
