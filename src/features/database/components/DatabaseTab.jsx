/**
 * "Database" tab of the settings panel: register a MariaDB/MySQL connection, read its schema,
 * choose which tables the assistant may see, and tune how the model behaves with them. Connections
 * and tables save as they go — like the Documents tab, no save bar for those. The instructions and
 * query limits below are part of the shared settings object instead (same as the Modello IA tab),
 * so they need the panel's own "Salva" bar — SettingsPanel.jsx shows it on this tab for that reason.
 *
 * `subsection` (settingsSections.js) says which group the sidebar chose: connessioni · istruzioni (instructions, when to
 * query, the database model) · limiti (queries and Excel exports) · comandi (commands without AI). None = all of them.
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
import { inSubsection } from '@/features/settings/settingsSections';
import { useConnections } from '../useConnections';
import { EXPORT_TIMEOUT_STOPS, TIMEOUT_STOPS, formatSeconds } from '../timeoutStops';
import ConnectionForm from './ConnectionForm';
import ConnectionRow from './ConnectionRow';
import HowDatabaseWorks from './HowDatabaseWorks';
import NoAiCommandsSection from './NoAiCommandsSection';

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      {[0, 1].map(i => (
        <div key={i} className="h-16 animate-pulse rounded-xl bg-line" />
      ))}
    </div>
  );
}

export default function DatabaseTab({ settings, onChange, hasUnsavedChanges = false, subsection }) {
  const { connections, loadError } = useConnections();
  const [creating, setCreating] = useState(false);
  const shows = id => inSubsection(subsection, id);
  const showsSettings = ['istruzioni', 'limiti', 'comandi'].some(shows);

  return (
    <div className="flex flex-col gap-3">
      {shows('connessioni') && (
        <>
          <div className={`flex items-start gap-3 ${subsection ? 'justify-end' : 'justify-between'}`}>
            {/* in the sidebar the page title and line say it */}
            {!subsection && (
              <div className="min-w-0">
                <h3 className="text-fs-13 font-bold text-ink">Connessioni al database</h3>
                <p className="mt-0.5 text-fs-11 leading-snug text-slate-soft">
                  Dati veri per rispondere con i numeri, non solo con i documenti.
                </p>
              </div>
            )}
            {!creating && (
              <Button primary onClick={() => setCreating(true)}>
                <Plus size={14} /> Nuova connessione
              </Button>
            )}
          </div>

          {loadError && (
            <div className="rounded-xl bg-danger-soft p-3 text-fs-12 text-danger">{loadError}</div>
          )}

          {creating && (
            <ConnectionForm onSaved={() => setCreating(false)} onCancel={() => setCreating(false)} />
          )}

          {!connections && !loadError && <LoadingSkeleton />}

          {connections?.length === 0 && !creating && (
            <p className="rounded-xl bg-surface px-3 py-4 text-center text-fs-12 text-slate-soft">
              Nessuna connessione ancora. Aggiungine una per far leggere i dati all’assistente.
            </p>
          )}

          <div className="flex flex-col gap-2">
            {connections?.map(connection => (
              <ConnectionRow key={connection.id} connection={connection} />
            ))}
          </div>

          <HowDatabaseWorks defaultOpen={!connections?.length} />
        </>
      )}

      {showsSettings && (
        <div className={`flex flex-col gap-6 ${subsection ? '' : 'mt-2 border-t border-line pt-4'}`}>
          {shows('istruzioni') && (
            <>
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
                  Il nome dello strumento è <code>query_database</code>: risponde solo con SELECT sulle
                  tabelle attivate, mai in scrittura.
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
                  domanda viene riposta al modello scelto qui, che da lì in poi scrive le query e la risposta.
                  Costa una chiamata in più per quella domanda; le domande senza database restano sul modello
                  normale.
                </p>
              </Section>
            </>
          )}

          {shows('limiti') && (
            <>
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
                  reading={formatSeconds(settings.queryTimeoutSeconds)}
                  stops={TIMEOUT_STOPS}
                  value={settings.queryTimeoutSeconds}
                  rangeLabels={['Fallisce prima', 'Aspetta di più']}
                  onChange={value => onChange('queryTimeoutSeconds', value)}
                />
                <p className={HELP_TEXT_CLASS}>
                  Massimo 10 minuti: oltre questo tempo è il database stesso a fermare la query e il modello
                  riceve un errore. Per tutto il tempo l’operatore resta in attesa della risposta, e una query
                  lunga pesa anche sul database del gestionale: oltre il minuto alzalo solo se le domande
                  normali non ci stanno. Più righe significa risposte più pesanti da rimandare al modello, non
                  necessariamente più utili.
                </p>
              </Section>

              <Section
                title="Limiti degli export Excel"
                description="Per i file Excel che il server genera dal database: le righe non passano dal modello, quindi possono essere molte di più delle query normali."
              >
                <Slider
                  label="Righe massime per file"
                  reading={`${settings.exportMaxRows.toLocaleString('it-IT')} righe`}
                  min={1000}
                  max={200000}
                  step={1000}
                  value={settings.exportMaxRows}
                  rangeLabels={['Più prudente', 'File più grandi']}
                  onChange={value => onChange('exportMaxRows', value)}
                />
                <p className={HELP_TEXT_CLASS}>
                  Se la richiesta trova più righe, il file contiene solo le prime e l’assistente lo dice. Ogni
                  export porta fuori dati di clienti: tienilo al minimo che serve.
                </p>
                <Slider
                  label="Tempo massimo della query sul database"
                  reading={formatSeconds(settings.exportTimeoutSeconds)}
                  stops={EXPORT_TIMEOUT_STOPS}
                  value={settings.exportTimeoutSeconds}
                  rangeLabels={['Si ferma prima', 'Aspetta di più']}
                  onChange={value => onChange('exportTimeoutSeconds', value)}
                />
                <p className={HELP_TEXT_CLASS}>
                  Quanto può lavorare il database per estrarre le righe di un export, per tutte le
                  connessioni: oltre questo tempo è il database stesso a fermare la query, e l’operatore vede
                  «Non riuscito, riprova». Non riguarda il modello AI. Massimo 10 minuti, perché l’intero
                  export (query, creazione del file e invio) deve chiudersi entro i 12 minuti concessi al
                  server. Mentre il database lavora l’operatore aspetta e il database del gestionale è sotto
                  carico: oltre il minuto alzalo solo se serve. Con molte colonne, un file vicino alle 200.000
                  righe può comunque non riuscire.
                </p>
              </Section>
            </>
          )}

          {shows('comandi') && (
            <NoAiCommandsSection
              commands={settings.noAiCommands}
              connections={connections}
              hasUnsavedChanges={hasUnsavedChanges}
              onChange={value => onChange('noAiCommands', value)}
            />
          )}
        </div>
      )}
    </div>
  );
}
