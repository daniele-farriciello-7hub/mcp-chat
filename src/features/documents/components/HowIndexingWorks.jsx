import { useState } from 'react';
import { ChevronDown, MessageSquareText, Sparkles, Upload } from 'lucide-react';

const STEPS = [
  {
    icon: Upload,
    title: 'Carica',
    text: 'PDF, TXT, CSV, Markdown o immagini (PNG, JPG, WebP, GIF, SVG) fino a 20 MB. Prima scegli come li usa Vale: “Studia” (legge il file e risponde sul contenuto) o “Solo archivio” (lo riconosce e lo consegna, ma non risponde sul contenuto: moduli, contratti, loghi). Si cambia poi riga per riga. Il file entra nell’archivio, ma l’assistente non lo vede ancora. Ogni immagine vuole una breve descrizione, obbligatoria: dice cosa mostra e serve a ritrovarla. In alternativa collega una cartella o un PDF di Google Drive (scheda Drive): i PDF si scaricano da soli, anche quando cambiano.'
  },
  {
    icon: Sparkles,
    title: 'Indicizza',
    text: 'Gemini legge tutto il documento e scrive una scheda: sintesi, argomenti e parole chiave; per un file di solo archivio una scheda breve. In entrambi i casi sceglie fino a 3 categorie dall’elenco (scheda Categorie). Un’immagine senza descrizione non si indicizza: la scheda parte da quello che hai scritto. I file di Drive li indicizza il server subito dopo averli scaricati, senza che tu faccia nulla.'
  },
  {
    icon: MessageSquareText,
    title: 'Usa in chat',
    text: 'L’assistente vede le schede dei documenti studiati e apre quello giusto quando serve per rispondere. I file di solo archivio non pesano su ogni domanda: li cerca solo quando glieli chiedi (“mandami il modulo privacy”, “che moduli ci sono per il mutuo?”) e te li mostra con il pulsante per scaricarli. Se chiedi un file o un logo, te lo mostra allo stesso modo.'
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
