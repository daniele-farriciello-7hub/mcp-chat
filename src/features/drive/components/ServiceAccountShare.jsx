import { useState } from 'react';
import { Check, Copy } from 'lucide-react';
import Button from '@/shared/ui/Button';

/** The address Drive folders and files are shared with, with a button to copy it. */
export default function ServiceAccountShare({ email }) {
  const [copyState, setCopyState] = useState(null); // null | 'copied' | 'failed'

  const copy = async () => {
    try {
      await navigator.clipboard.writeText(email);
      setCopyState('copied');
      setTimeout(() => setCopyState(null), 2000);
    } catch {
      // clipboard access can be refused inside the host page's iframe: the text is selectable instead
      setCopyState('failed');
    }
  };

  return (
    <div className="rounded-xl bg-brand-50/60 px-3 py-2.5">
      <p className="text-fs-11 leading-snug text-slate-soft">
        Prima di collegare una cartella o un PDF, condividilo su Drive con questo indirizzo: basta il permesso
        di <span className="font-semibold text-ink">Lettore</span>.
      </p>
      {email ? (
        <div className="mt-2 flex items-center gap-2">
          <code
            title={email}
            className="min-w-0 flex-1 select-all truncate rounded-lg border border-line bg-panel px-2.5 py-1.5 text-fs-12 text-ink"
          >
            {email}
          </code>
          <Button onClick={copy} tooltip="Copia l’indirizzo" tooltipAlign="right">
            {copyState === 'copied' ? (
              <>
                <Check size={13} strokeWidth={3} className="text-ok" /> Copiato
              </>
            ) : (
              <>
                <Copy size={13} /> Copia
              </>
            )}
          </Button>
        </div>
      ) : (
        <p className="mt-2 text-fs-11 leading-snug text-warn">
          Il server non riesce a dire con quale indirizzo legge Drive. Controlla l’account di servizio delle
          function.
        </p>
      )}
      {copyState === 'failed' && (
        <p className="mt-1.5 text-fs-11 text-warn">Non riesco a copiare: selezionalo e copialo a mano.</p>
      )}
    </div>
  );
}
