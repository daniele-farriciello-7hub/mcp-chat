import { useState } from 'react';
import { ChevronDown, Database, ListChecks, MessageSquareText } from 'lucide-react';

const STEPS = [
  {
    icon: Database,
    title: 'Connetti',
    text: 'Host, porta, nome del database, utente e password. «Prova connessione» verifica che risponda prima di salvare.'
  },
  {
    icon: ListChecks,
    title: 'Scegli le tabelle',
    text: 'Dopo aver letto lo schema, scegli quali tabelle l’assistente può vedere e rivedi la scheda che Gemini scrive per ciascuna.'
  },
  {
    icon: MessageSquareText,
    title: 'Usa in chat',
    text: 'L’assistente vede solo le tabelle attivate e può interrogarle con query di sola lettura per rispondere con i dati veri.'
  }
];

/** The three-step process, open by default until at least one connection exists. */
export default function HowDatabaseWorks({ defaultOpen }) {
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
