/**
 * `.md` files attached to one specific prompt field (Istruzioni al modello, Istruzioni per
 * l'indicizzazione, Come sceglie i documenti, Istruzioni per il database, Quando interrogare il
 * database — each field gets its own list, independent of the others). Each file's full text goes
 * straight into that field's prompt, under its own filename header (`shared/promptAttachments.js`
 * → attachmentsBlock) — never summarized and never fetched on demand: unlike the document archive,
 * a file that guides *how* the model answers or drafts a card has to apply before it produces
 * anything, so waiting for a read_document-style round trip would be too late.
 *
 * The filename header is also what makes a file "referenceable": mention its name in the
 * instructions text above ("per gli esempi numerici segui esempi.md") and the model can connect
 * the two, because both land in the same prompt. No separate reference syntax needed — the "@"
 * autocomplete in `MarkdownTextarea.jsx` is only a faster way to type that name correctly.
 */
'use client';

import { useRef, useState } from 'react';
import { FileText, Upload, X } from 'lucide-react';
import Button from './Button';

const MAX_CHARS_PER_FILE = 60_000;
// every attached file rides on every single message, so the combined budget is tighter than any
// one file's own cap
const MAX_TOTAL_CHARS = 120_000;

const fmt = n => n.toLocaleString('it-IT');

export default function PromptAttachments({ value, onChange }) {
  const inputRef = useRef(null);
  const [error, setError] = useState('');
  const files = value || [];
  const totalChars = files.reduce((sum, f) => sum + f.content.length, 0);

  const addFiles = async fileList => {
    setError('');
    const picked = Array.from(fileList || []);
    if (!picked.length) return;

    const texts = await Promise.all(picked.map(f => f.text().then(content => ({ name: f.name, content }))));
    const tooBig = texts.find(f => f.content.length > MAX_CHARS_PER_FILE);
    if (tooBig) {
      setError(
        `"${tooBig.name}" ha ${fmt(tooBig.content.length)} caratteri: il limite per file è ${fmt(MAX_CHARS_PER_FILE)}.`
      );
      return;
    }

    // re-uploading the same filename replaces it instead of duplicating
    const byName = new Map(files.map(f => [f.name, f]));
    for (const f of texts) byName.set(f.name, f);
    const next = Array.from(byName.values());

    const nextTotal = next.reduce((sum, f) => sum + f.content.length, 0);
    if (nextTotal > MAX_TOTAL_CHARS) {
      setError(
        `Con questo file si arriva a ${fmt(nextTotal)} caratteri in totale: il limite è ${fmt(MAX_TOTAL_CHARS)}. Rimuovi qualcosa prima di aggiungerne altri.`
      );
      return;
    }
    onChange(next);
  };

  const remove = name => onChange(files.filter(f => f.name !== name));

  return (
    <div className="flex flex-col gap-2">
      {files.map(f => (
        <div
          key={f.name}
          className="flex items-center justify-between gap-2 rounded-xl border border-line bg-surface px-3 py-2"
        >
          <div className="flex min-w-0 items-center gap-2 text-[12px] text-ink">
            <FileText size={14} className="shrink-0 text-brand-500" />
            <span className="truncate font-medium">{f.name}</span>
            <span className="shrink-0 text-[10px] text-slate-soft">{fmt(f.content.length)} caratteri</span>
          </div>
          <button
            type="button"
            onClick={() => remove(f.name)}
            aria-label={`Rimuovi ${f.name}`}
            className="shrink-0 rounded-lg p-1 text-slate-soft transition hover:bg-line/60 hover:text-danger"
          >
            <X size={14} />
          </button>
        </div>
      ))}

      <div>
        <Button
          onClick={() => inputRef.current?.click()}
          tooltip={`File .md, fino a ${fmt(MAX_CHARS_PER_FILE)} caratteri l’uno, ${fmt(MAX_TOTAL_CHARS)} in totale`}
          tooltipAlign="left"
        >
          <Upload size={13} /> {files.length ? 'Allega un altro file .md' : 'Allega un file .md'}
        </Button>
        <input
          ref={inputRef}
          type="file"
          accept=".md,text/markdown"
          multiple
          className="hidden"
          onChange={e => {
            addFiles(e.target.files);
            e.target.value = '';
          }}
        />
        {files.length > 0 && (
          <span className="ml-2 text-[10px] text-slate-soft">
            {fmt(totalChars)} / {fmt(MAX_TOTAL_CHARS)} caratteri totali · scrivi “@” nel testo qui sopra per
            richiamarli
          </span>
        )}
        {error && <p className="mt-1 text-[11px] text-danger">{error}</p>}
      </div>
    </div>
  );
}
