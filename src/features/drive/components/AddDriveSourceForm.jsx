import { useState } from 'react';
import { Link2, Loader2 } from 'lucide-react';
import Button from '@/shared/ui/Button';
import Field from '@/shared/ui/Field';
import { INPUT_CLASS } from '@/shared/ui/formStyles';
import { addDriveSource } from '../driveApi';
import { DEFAULT_DAILY_HOUR, DEFAULT_FREQUENCY } from '../driveFrequencies';
import FrequencyPicker from './FrequencyPicker';

/** Pastes a folder or PDF link and picks how often it is synchronised. `onAdded(source)` gets the new source. */
export default function AddDriveSourceForm({ onAdded }) {
  const [link, setLink] = useState('');
  const [schedule, setSchedule] = useState({ frequency: DEFAULT_FREQUENCY, dailyHour: DEFAULT_DAILY_HOUR });
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState(null);

  const submit = async event => {
    event.preventDefault();
    setAdding(true);
    setError(null);
    try {
      const source = await addDriveSource({ link, ...schedule });
      setLink('');
      onAdded(source);
    } catch (addError) {
      setError(addError.message || 'Non riesco a collegarlo.');
    } finally {
      setAdding(false);
    }
  };

  return (
    <form onSubmit={submit} className="flex flex-col gap-3 rounded-xl border border-line p-3">
      <Field
        label="Link della cartella o del PDF"
        help="Quello che copi da Drive con «Condividi» → «Copia link». I PDF nelle sottocartelle sono inclusi."
      >
        <input
          type="url"
          value={link}
          onChange={event => setLink(event.target.value)}
          placeholder="https://drive.google.com/drive/folders/…"
          className={INPUT_CLASS}
          required
        />
      </Field>
      <div>
        <span className="mb-1.5 block text-fs-12 font-semibold text-ink">Ogni quanto sincronizzare</span>
        <FrequencyPicker {...schedule} onChange={setSchedule} />
      </div>
      {error && <p className="rounded-lg bg-danger-soft px-2.5 py-2 text-fs-11 text-danger">{error}</p>}
      <div className="flex justify-end">
        <Button primary type="submit" disabled={adding || !link.trim()}>
          {adding ? <Loader2 size={14} className="animate-spin" /> : <Link2 size={14} />} Collega
        </Button>
      </div>
    </form>
  );
}
