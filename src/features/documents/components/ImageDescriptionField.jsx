import { useEffect, useRef, useState } from 'react';
import { Check, Loader2 } from 'lucide-react';
import { updateDocumentDescription } from '@/features/documents/documentStore';
import { MISSING_DESCRIPTION } from '@/features/documents/indexability';
import { INDEXING_STATUS } from '@/features/documents/schema';

const SAVE_DELAY_MS = 800;
const SAVED_VISIBLE_MS = 2000;
const REQUIRED_VISIBLE_MS = 4000;

/**
 * The line under the field: what is happening to the text, or why it is needed. `cleared` is an
 * indexed image whose saved description the admin just emptied.
 */
function FieldStatus({ status, empty, cleared, indexed, blind }) {
  if (status === 'saving') {
    return (
      <span className="flex items-center gap-1 text-slate-soft">
        <Loader2 size={10} className="animate-spin" /> Salvataggio…
      </span>
    );
  }
  if (status === 'saved') {
    return (
      <span className="flex items-center gap-1 font-medium text-ok">
        <Check size={10} strokeWidth={3} /> Salvato
      </span>
    );
  }
  if (status === 'failed') return <span className="text-danger">Non salvato: riprova.</span>;
  if (cleared || status === 'required') {
    return <span className="font-medium text-danger">La descrizione è obbligatoria</span>;
  }
  if (!empty) return null;
  // empty and untouched: a hint in amber, not an error
  return (
    <span className="text-warn">
      {indexed
        ? 'Scrivi cosa mostra: serve per rigenerare la scheda e farla ritrovare in chat.'
        : blind
          ? 'Gemini non può guardare le GIF: serve la tua descrizione per indicizzarla.'
          : MISSING_DESCRIPTION.reason}
    </span>
  );
}

/**
 * What the admin says an image is ("Logo WeUnit, versione bianca su sfondo trasparente"), required
 * before the image can be indexed. No save button: the text is saved a moment after typing stops,
 * when the field loses focus, and when the field goes away mid-typing (switching list, indexing). Used wherever an image is shown, always on the same `document.description`: an edit made
 * in one place shows up in the others, unless the field is being typed in. Key it by document id.
 *
 * Once an image is indexed its description can no longer be emptied: the empty text is not saved, the
 * field says so and goes back to what was saved. Before that, emptying it is fine (the image is simply
 * not ready to be indexed again).
 *
 * `onSaved(text)` runs after each successful save; `onTextChange(id, text)` follows what is in the
 * field, saved or not (see useTypedDescriptions); `showLabel={false}` where a heading already says
 * what the field is. The textarea carries `data-description-field` and `data-document-id` so a caller can
 * find and focus the one of a given document.
 */
export default function ImageDescriptionField({
  document,
  rows = 2,
  showLabel = true,
  onSaved,
  onTextChange
}) {
  const remote = document.description || '';
  const indexed = document.indexingStatus === INDEXING_STATUS.done;
  const keepSaved = indexed && Boolean(remote.trim()); // an empty text must not replace it
  const [value, setValue] = useState(remote);
  const [seenRemote, setSeenRemote] = useState(remote);
  const [focused, setFocused] = useState(false);
  // 'idle' | 'saving' | 'saved' | 'failed' | 'required' (an emptied field was put back)
  const [status, setStatus] = useState('idle');
  const saveTimer = useRef(null);
  const statusTimer = useRef(null);
  const unsaved = useRef(null); // typed text still waiting for its save, if any

  // someone else changed it (another copy of this field, another tab): follow, unless mid-typing.
  // Done while rendering, as in UploadProgressPanel, rather than in an effect that would render twice.
  if (remote !== seenRemote) {
    setSeenRemote(remote);
    if (!focused) setValue(remote);
  }

  const empty = !value.trim();
  const cleared = keepSaved && empty;

  // whoever lists the documents reacts to the text itself, not to the save that follows it
  useEffect(() => {
    onTextChange?.(document.id, value);
  }, [onTextChange, document.id, value]);

  const flash = (next, ms) => {
    setStatus(next);
    clearTimeout(statusTimer.current);
    statusTimer.current = setTimeout(() => setStatus(s => (s === next ? 'idle' : s)), ms);
  };

  const save = async text => {
    clearTimeout(saveTimer.current);
    unsaved.current = null;
    const clean = text.trim();
    if (clean === remote.trim()) return;
    if (!clean && keepSaved) {
      flash('required', REQUIRED_VISIBLE_MS);
      return;
    }
    setStatus('saving');
    try {
      await updateDocumentDescription(document.id, clean);
      flash('saved', SAVED_VISIBLE_MS);
      onSaved?.(clean);
    } catch (error) {
      console.error('[documents] saving the description failed:', error);
      setStatus('failed');
    }
  };

  const change = text => {
    setValue(text);
    setStatus(s => (s === 'saving' ? s : 'idle'));
    // an emptied indexed description is never written, not even on the way out
    unsaved.current = keepSaved && !text.trim() ? null : text;
    clearTimeout(saveTimer.current);
    saveTimer.current = setTimeout(() => save(text), SAVE_DELAY_MS);
  };

  // leaving with an unsaved edit (the summary is closed, indexing starts): save it now
  useEffect(() => {
    const id = document.id;
    return () => {
      clearTimeout(saveTimer.current);
      clearTimeout(statusTimer.current);
      if (unsaved.current !== null) {
        updateDocumentDescription(id, unsaved.current).catch(error =>
          console.error('[documents] saving the description failed:', error)
        );
      }
    };
  }, [document.id]);

  return (
    <div className="min-w-0 flex-1">
      {showLabel && (
        <span className="mb-1 block text-[11px] font-semibold text-ink">
          Descrivi l’immagine{' '}
          <span className={`font-normal ${empty ? 'text-warn' : 'text-slate-soft'}`}>· obbligatoria</span>
        </span>
      )}
      <textarea
        value={value}
        rows={rows}
        maxLength={500}
        data-description-field
        data-document-id={document.id}
        aria-required="true"
        onChange={e => change(e.target.value)}
        onFocus={() => setFocused(true)}
        onBlur={() => {
          setFocused(false);
          // an indexed image keeps what was saved: the emptied field goes back to it
          setValue(cleared ? remote : value.trim());
          save(value);
        }}
        placeholder="Es. Logo WeUnit, versione bianca su sfondo trasparente"
        aria-label={`Descrizione di ${document.name}`}
        className={`w-full resize-none rounded-lg border px-2.5 py-1.5 text-[12px] leading-snug text-ink outline-none transition placeholder:text-slate-soft/70 focus:border-brand-300 focus:bg-white focus:ring-2 focus:ring-brand-100 ${
          empty ? 'border-accent/70 bg-accent-soft/60' : 'border-line bg-white'
        }`}
      />
      <div className="mt-1 min-h-3.5 text-[10px] leading-snug">
        <FieldStatus
          status={status}
          empty={empty}
          cleared={cleared}
          indexed={indexed}
          blind={document.mimeType === 'image/gif'}
        />
      </div>
    </div>
  );
}
