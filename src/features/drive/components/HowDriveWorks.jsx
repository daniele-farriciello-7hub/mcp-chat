import { useState } from 'react';
import { ChevronDown, Link2, RefreshCw, Share2 } from 'lucide-react';

const STEPS = [
  {
    icon: Share2,
    title: 'Condividi',
    text: 'Su Drive, condividi la cartella o il PDF con l’indirizzo qui sopra, come Lettore. Senza, il server non può vederli.'
  },
  {
    icon: Link2,
    title: 'Collega',
    text: 'Incolla il link e scegli ogni quanto controllare. Si leggono solo i PDF (fino a 20 MB), anche nelle sottocartelle.'
  },
  {
    icon: RefreshCw,
    title: 'Si aggiorna da sola',
    text: 'A ogni controllo Drive viene confrontato con l’archivio: i PDF nuovi o modificati vengono scaricati e indicizzati dal server, quelli spariti escono dall’archivio. Se Drive può avvisare quando la cartella cambia, il controllo parte prima; il controllo periodico c’è comunque, e trova anche le modifiche dentro i file.'
  }
];

/** The three-step process of the Drive sync, open by default while nothing is linked yet. */
export default function HowDriveWorks({ defaultOpen }) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <div className="border-t border-line pt-2.5">
      <button
        type="button"
        onClick={() => setOpen(v => !v)}
        aria-expanded={open}
        className="flex w-full items-center justify-between text-fs-11 font-semibold text-brand-600 transition hover:text-brand-700"
      >
        Come funziona
        <ChevronDown size={14} className={`transition-transform ${open ? 'rotate-180' : ''}`} />
      </button>
      {open && (
        <ol className="mt-2.5 flex flex-col gap-2.5">
          {STEPS.map(({ icon: Icon, title, text }, index) => (
            <li key={title} className="flex items-start gap-2.5">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-pill bg-brand-50 text-brand-fg">
                <Icon size={13} strokeWidth={2.25} />
              </span>
              <span className="min-w-0">
                <span className="block text-fs-12 font-semibold text-ink">
                  {index + 1}. {title}
                </span>
                <span className="block text-fs-11 leading-snug text-slate-soft">{text}</span>
              </span>
            </li>
          ))}
        </ol>
      )}
    </div>
  );
}
