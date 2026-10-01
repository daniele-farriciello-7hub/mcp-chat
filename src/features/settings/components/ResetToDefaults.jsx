import { useState } from 'react';
import { RotateCcw } from 'lucide-react';

export default function ResetToDefaults({ onReset }) {
  const [confirming, setConfirming] = useState(false);

  if (!confirming) {
    return (
      <button
        type="button"
        onClick={() => setConfirming(true)}
        className="flex items-center gap-1.5 text-[12px] text-slate-soft transition hover:text-ink"
      >
        <RotateCcw size={13} /> Riporta tutto com’era di serie
      </button>
    );
  }

  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-[12px] text-ink">Perdi tutte le modifiche. Sicuro?</span>
      <button
        type="button"
        onClick={() => {
          onReset();
          setConfirming(false);
        }}
        className="rounded-lg bg-danger-soft px-2.5 py-1 text-[12px] font-semibold text-danger transition hover:bg-danger hover:text-white"
      >
        Ripristina
      </button>
      <button
        type="button"
        onClick={() => setConfirming(false)}
        className="text-[12px] text-slate-soft transition hover:text-ink"
      >
        Annulla
      </button>
    </div>
  );
}
