/**
 * "Comandi senza AI", in the Database tab: commands that answer in a few seconds without the model. Each runs
 * one fixed query on the server, on the connection chosen here, and the chat writes the answer from its rows
 * (features/chat/commands). The list is part of the shared settings object (`settings.noAiCommands`), so the
 * panel's "Salva" bar applies. The admin adds, edits, switches off and deletes them; "Erogato" is only one
 * of them, started from a preset (the server's `commandPresets`).
 */
'use client';

import { useState } from 'react';
import { ChevronDown, Loader2, Plus } from 'lucide-react';
import Button from '@/shared/ui/Button';
import Section from '@/shared/ui/Section';
import { HELP_TEXT_CLASS } from '@/shared/ui/formStyles';
import { createCommand } from '@/features/chat/commands/commandSettings';
import { loadCommandPresets } from '@/features/chat/commands/commandsAdminApi';
import { triggerCollisions } from '@/features/chat/commands/matchCommand';
import NoAiCommandRow from './NoAiCommandRow';

const MENU_ITEM_CLASS =
  'rounded-lg px-3 py-2 text-left text-fs-12 font-semibold text-ink transition hover:bg-surface disabled:opacity-40';

export default function NoAiCommandsSection({ commands, connections, hasUnsavedChanges, onChange }) {
  const [expandedId, setExpandedId] = useState(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [presets, setPresets] = useState(null); // null = not asked yet
  const [presetsError, setPresetsError] = useState(null);
  const [loadingPresets, setLoadingPresets] = useState(false);
  const [notice, setNotice] = useState(null);

  const collisions = triggerCollisions(commands);

  const openMenu = async () => {
    setMenuOpen(open => !open);
    setNotice(null);
    if (presets || loadingPresets) return;
    setLoadingPresets(true);
    setPresetsError(null);
    try {
      setPresets(await loadCommandPresets());
    } catch (error) {
      setPresetsError(error?.message || 'Non riesco a leggere i modelli.');
    } finally {
      setLoadingPresets(false);
    }
  };

  const add = preset => {
    const { command, rejected } = createCommand(commands, preset);
    onChange([...commands, command]);
    setExpandedId(command.id);
    setMenuOpen(false);
    setNotice(
      rejected.length
        ? `${rejected.map(entry => `«${entry.trigger}» è già una parola di «${entry.owner}»`).join('; ')}: non l’ho messa nel nuovo comando.`
        : null
    );
  };

  const replace = next => onChange(commands.map(command => (command.id === next.id ? next : command)));
  const remove = id => {
    onChange(commands.filter(command => command.id !== id));
    setExpandedId(null);
  };

  return (
    <Section
      title="Comandi senza AI"
      description="Messaggi a cui l’assistente risponde in pochi secondi senza passare dal modello: ogni comando esegue una query fissa sul database e la chat scrive la risposta con i numeri. Parte solo se il messaggio è esattamente una delle parole del comando («erogato», «Erogato?»); qualsiasi altra frase («erogato luglio 2026», «erogato Gheri») va al modello come una domanda qualsiasi."
    >
      {commands.length === 0 && (
        <p className="rounded-xl bg-surface px-3 py-3 text-center text-fs-12 text-slate-soft">
          Nessun comando: ogni messaggio va al modello.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {commands.map(command => (
          <NoAiCommandRow
            key={command.id}
            command={command}
            others={commands.filter(other => other.id !== command.id)}
            connections={connections}
            collisions={collisions}
            expanded={expandedId === command.id}
            hasUnsavedChanges={hasUnsavedChanges}
            onToggle={() => setExpandedId(expandedId === command.id ? null : command.id)}
            onChange={replace}
            onDelete={() => remove(command.id)}
          />
        ))}
      </div>

      {notice && <p className="rounded-xl bg-danger-soft px-3 py-2 text-fs-12 text-danger">{notice}</p>}

      <div className="flex flex-col gap-1.5">
        <div>
          <Button onClick={openMenu}>
            <Plus size={14} /> Aggiungi comando
            <ChevronDown size={13} className={`transition-transform ${menuOpen ? 'rotate-180' : ''}`} />
          </Button>
        </div>
        {menuOpen && (
          <div className="flex flex-col rounded-xl border border-line bg-panel p-1 shadow-soft">
            {loadingPresets && (
              <span className="flex items-center gap-1.5 px-3 py-2 text-fs-12 text-slate-soft">
                <Loader2 size={13} className="animate-spin" /> Carico i modelli…
              </span>
            )}
            {presets?.map(preset => (
              <button
                key={preset.format}
                type="button"
                onClick={() => add(preset)}
                className={MENU_ITEM_CLASS}
              >
                Da modello: {preset.name}
              </button>
            ))}
            <button type="button" onClick={() => add(null)} className={MENU_ITEM_CLASS}>
              Vuoto
            </button>
            {presetsError && <p className="px-3 py-1.5 text-fs-11 text-danger">{presetsError}</p>}
          </div>
        )}
        <p className={HELP_TEXT_CLASS}>
          Un modello compila nome, parole, formato e query: poi scegli la connessione e attivalo. «Vuoto»
          parte da una tabella delle righe della query, che scrivi tu.
        </p>
      </div>
    </Section>
  );
}
