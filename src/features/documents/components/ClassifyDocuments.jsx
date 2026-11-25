'use client';

import { useRef, useState } from 'react';
import { Loader2, Sparkles, Square } from 'lucide-react';
import Button from '@/shared/ui/Button';
import { classifyDocuments, documentsToClassify } from '@/features/documents/classifyCategories';
import ProgressBar from './ProgressBar';

/**
 * "Classifica": gives categories, with Gemini, to the indexed documents of `documents` that have none left in
 * the list and were not set by hand (classifyCategories.js). Cheap (the card is read, not the file) and it
 * shows how far it is. `scope` finishes the sentence about what it works on ("dell'archivio", "di quelli in elenco").
 */
export default function ClassifyDocuments({ documents, categories, scope, compact = false }) {
  const [progress, setProgress] = useState(null);
  const [error, setError] = useState(null);
  const stopRef = useRef(false);
  const running = progress && !progress.finished;
  const todo = documentsToClassify(documents, categories).length;

  const run = async () => {
    stopRef.current = false;
    setError(null);
    setProgress({ done: 0, total: todo, failed: 0, classified: 0, finished: false });
    try {
      const result = await classifyDocuments(documents, {
        onProgress: p => setProgress({ ...p, finished: false }),
        shouldStop: () => stopRef.current
      });
      setProgress({ ...result, finished: true });
    } catch (e) {
      console.error('[categories] classifying failed:', e);
      setError(e?.message || 'Non riesco a classificare: riprova.');
      setProgress(null);
    }
  };

  const summary = progress?.finished
    ? `${progress.classified} classificati${progress.failed ? `, ${progress.failed} non riusciti` : ''}.`
    : null;

  return (
    <div className={compact ? '' : 'rounded-xl border border-line p-3'}>
      <div className="flex items-center gap-3">
        <p className="min-w-0 flex-1 text-fs-12 leading-snug text-slate-soft">
          {todo === 0
            ? `Nessun documento ${scope} da classificare.`
            : `${todo} ${todo === 1 ? 'documento' : 'documenti'} ${scope} senza categoria.`}
        </p>
        {running ? (
          <Button onClick={() => (stopRef.current = true)} tooltip="Quelli già fatti restano classificati">
            <Square size={12} /> Ferma
          </Button>
        ) : (
          <Button
            primary
            onClick={run}
            disabled={todo === 0 || categories.length === 0}
            tooltip={
              categories.length === 0
                ? 'Aggiungi prima almeno una categoria'
                : 'Gemini legge la scheda di ciascuno (non il file) e sceglie fino a 3 categorie dell’elenco'
            }
            tooltipAlign="right"
          >
            <Sparkles size={14} /> Classifica {todo > 0 ? todo : ''}
          </Button>
        )}
      </div>
      {running && (
        <div className="mt-2.5">
          <ProgressBar value={progress.done} total={progress.total} />
          <p className="mt-1 flex items-center gap-1.5 text-fs-11 text-slate-soft">
            <Loader2 size={11} className="animate-spin" /> {progress.done} di {progress.total}
            {progress.failed > 0 && ` · ${progress.failed} non riusciti`}
          </p>
        </div>
      )}
      {summary && <p className="mt-2 text-fs-11 font-medium text-ok">{summary}</p>}
      {error && <p className="mt-2 text-fs-11 text-danger">{error}</p>}
    </div>
  );
}
