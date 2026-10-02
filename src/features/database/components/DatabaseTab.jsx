/**
 * "Database" tab of the settings panel: register a MariaDB/MySQL connection, read its schema,
 * choose which tables the assistant may see, and tune how the model behaves with them. Connections
 * and tables save as they go — like the Documents tab, no save bar for those. The instructions and
 * query limits below are part of the shared settings object instead (same as the Modello IA tab),
 * so they need the panel's own "Salva" bar — SettingsPanel.jsx shows it on this tab for that reason.
 */
'use client';

import { useState } from 'react';
import { Plus } from 'lucide-react';
import Button from '@/shared/ui/Button';
import MarkdownTextarea from '@/shared/ui/MarkdownTextarea';
import PromptAttachments from '@/shared/ui/PromptAttachments';
import Section from '@/shared/ui/Section';
import ModelPicker from '@/features/settings/components/ModelPicker';
import Slider from '@/shared/ui/Slider';
import { HELP_TEXT_CLASS } from '@/shared/ui/formStyles';
import { useConnections } from '../useConnections';
import ConnectionForm from './ConnectionForm';
import ConnectionRow from './ConnectionRow';
import HowDatabaseWorks from './HowDatabaseWorks';

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      {[0, 1].map(i => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-line" />
      ))}
    </div>
  );
}

export default function DatabaseTab({ settings, onChange }) {
  const { connections, loadError } = useConnections();
  const [creating, setCreating] = useState(false);

  return (
    <div className="flex flex-col gap-3">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[13px] font-bold text-ink">Connessioni al database</h3>
          <p className="mt-0.5 text-[11px] leading-snug text-slate-soft">
            Dati veri per rispondere con i numeri, non solo con i documenti.
          </p>
        </div>
        {!creating && (
          <Button primary onClick={() => setCreating(true)}>
            <Plus size={14} /> Nuova connessione
          </Button>
        )}
      </div>

      {loadError && <div className="rounded-xl bg-danger-soft p-3 text-[12px] text-danger">{loadError}</div>}

      {creating && <ConnectionForm onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />}

      {!connections && !loadError && <LoadingSkeleton />}

      {connections?.length === 0 && !creating && (
        <p className="rounded-xl bg-surface px-3 py-4 text-center text-[12px] text-slate-soft">
          Nessuna connessione ancora. Aggiungine una per far leggere i dati all’assistente.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {connections?.map(connection => (
          <ConnectionRow key={connection.id} connection={connection} />
        ))}
      </div>

      <HowDatabaseWorks defaultOpen={!connections?.length} />

      <div className="mt-2 flex flex-col gap-6 border-t border-line pt-4">
        <Section
          title="Istruzioni per il database"
          description="Come deve comportarsi con le connessioni: dialetto SQL, LIMIT, cosa fare se una query fallisce."
        >
          <MarkdownTextarea
            rows={6}
            value={settings.databaseInstructions}
            onChange={e => onChange('databaseInstructions', e.target.value)}
            ariaLabel="Istruzioni per il database"
            mentionables={settings.databaseAttachments?.map(a => a.name)}
          />
          <PromptAttachments
            value={settings.databaseAttachments}
            onChange={value => onChange('databaseAttachments', value)}
          />
        </Section>

        <Section
          title="Quando interrogare il database"
          description="Va in fondo allo schema delle tabelle attive, dove il modello decide se e come scrivere una query."
        >
          <MarkdownTextarea
            rows={5}
            value={settings.databaseSelectionInstructions}
            onChange={e => onChange('databaseSelectionInstructions', e.target.value)}
            ariaLabel="Quando interrogare il database"
            mentionables={settings.databaseSelectionAttachments?.map(a => a.name)}
          />
          <PromptAttachments
            value={settings.databaseSelectionAttachments}
            onChange={value => onChange('databaseSelectionAttachments', value)}
          />
          <p className={HELP_TEXT_CLASS}>
            Il nome dello strumento è <code>query_database</code>: risponde solo con SELECT sulle tabelle
            attivate, mai in scrittura.
          </p>
        </Section>

        <Section
          title="Chi risponde sul database"
          description="Il modello che prende il posto di «Chi risponde» appena la conversazione tocca il database: scrive le query, le corregge e dà la risposta."
        >
          <ModelPicker
            value={settings.databaseModel}
            onChange={value => onChange('databaseModel', value)}
            inherit={{
              name: 'Lo stesso di «Chi risponde»',
              description: 'Un solo modello per tutto. Nessuna chiamata in più.'
            }}
          />
          <p className={HELP_TEXT_CLASS}>
            Il cambio avviene a metà domanda, quando il primo modello vuole interrogare il database: la
            domanda viene riposta al modello scelto qui, che da lì in poi scrive le query e la risposta. Costa
            una chiamata in più per quella domanda; le domande senza database restano sul modello normale.
          </p>
        </Section>

        <Section
          title="Limiti delle query"
          description="Si applicano a ogni query che il modello scrive, oltre al LIMIT che le istruzioni gli chiedono di mettere da solo."
        >
          <Slider
            label="Righe massime per query"
            reading={`${settings.maxQueryRows.toLocaleString('it-IT')} righe`}
            min={50}
            max={2000}
            step={50}
            value={settings.maxQueryRows}
            rangeLabels={['Risposte più leggere', 'Più dati per risposta']}
            onChange={value => onChange('maxQueryRows', value)}
          />
          <Slider
            label="Timeout per query"
            reading={`${settings.queryTimeoutSeconds} s`}
            min={3}
            max={25}
            step={1}
            value={settings.queryTimeoutSeconds}
            rangeLabels={['Fallisce prima', 'Aspetta di più']}
            onChange={value => onChange('queryTimeoutSeconds', value)}
          />
          <p className={HELP_TEXT_CLASS}>
            Il timeout non può comunque superare i 25 secondi: oltre, la funzione che esegue la query si
            interrompe comunque dopo 30 secondi e l’operatore vedrebbe un errore meno chiaro. Più righe
            significa risposte più pesanti da rimandare al modello, non necessariamente più utili.
          </p>
        </Section>
      </div>
    </div>
  );
}
