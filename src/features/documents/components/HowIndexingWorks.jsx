import { useState } from 'react';
import { ChevronDown, MessageSquareText, Sparkles, Upload } from 'lucide-react';

const STEPS = [
  {
    icon: Upload,
    title: 'Carica',
    text: 'PDF, TXT, CSV o Markdown fino a 20 MB. Il file entra nell’archivio, ma l’assistente non lo vede ancora.'
  },
  {
    icon: Sparkles,
    title: 'Indicizza',
    text: 'Gemini legge tutto il documento e scrive una scheda: sintesi, argomenti e parole chiave.'
  },
  {
    icon: MessageSquareText,
    title: 'Usa in chat',
    text: 'L’assistente vede le schede di tutti i documenti e apre quello giusto quando serve per rispondere.'
  }
];

/** The three-step process, open by default until the first document is indexed. */
export default function HowIndexingWorks({ defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="mt-3 border-t border-line pt-2.5">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-[11px] font-semibold text-brand-600 transition hover:text-brand-700"
      >
        Come funziona
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="mt-2.5 flex flex-col gap-2.5">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="flex items-start gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-brand-50 text-brand-500">
                <Icon size={13} strokeWidth={2.25} />
              </span>
              <span className="min-w-0">
                <span className="block text-[12px] font-semibold text-ink">
                  {index + 1}. {title}
                </span>
                <span className="block text-[11px] leading-snug text-slate-soft">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
