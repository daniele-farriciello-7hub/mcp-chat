/**
 * "Documenti senza AI", in the Documents tab: lists of documents that appear in a moment, without the model. Each is a
 * fixed answer to an exact message (or to a shortcut that names it): a card of files, picked by a rule or by hand,
 * with the usual download buttons (features/chat/documentLists). Like the commands without AI of the Database tab
 * (NoAiCommandsSection.jsx) the list is part of the shared settings object (`settings.noAiDocumentLists`), so the
 * panel's "Salva" bar applies — unlike the rest of this tab, which saves as it goes. The admin adds, edits, switches off
 * and deletes them.
 *
 * `commands` are the commands without AI: a word may not belong to a list and to a command, nor to two lists
 * (the Database panel checks the same against the lists). `documents` are the live documents of the archive
 * (Firestore), `categories` the admins' list.
 */
'use client';

import { useMemo, useState } from 'react';
import { Plus } from 'lucide-react';
import Button from '@/shared/ui/Button';
import Section from '@/shared/ui/Section';
import { triggerCollisions } from '@/features/chat/commands/matchCommand';
import { createDocumentList } from '@/features/chat/documentLists/documentListSettings';
import { catalogEntryOf } from '@/features/chat/documentLists/selectDocuments';
import { byName } from '@/features/documents/documentDate';
import { INDEXING_STATUS } from '@/features/documents/schema';
import NoAiDocumentListRow from './NoAiDocumentListRow';

export default function NoAiDocumentListsSection({
  lists = [],
  commands = [],
  documents = [],
  categories = [],
  onChange
}) {
  const [expandedId, setExpandedId] = useState(null);

  // the indexed documents as the chat will see them, by name: what a rule picks from and a hand-made list chooses from
  const entries = useMemo(
    () =>
      documents
        .filter(document => document.indexingStatus === INDEXING_STATUS.done)
        .map(document => catalogEntryOf(document, categories))
        .sort(byName),
    [documents, categories]
  );

  // everything that answers an exact message without the model: the words must not repeat across all of it
  const owners = [...commands, ...lists];
  const collisions = triggerCollisions(owners);

  const add = () => {
    const list = createDocumentList(owners);
    onChange([...lists, list]);
    setExpandedId(list.id);
  };
  const replace = next => onChange(lists.map(list => (list.id === next.id ? next : list)));
  const remove = id => {
    onChange(lists.filter(list => list.id !== id));
    setExpandedId(null);
  };

  return (
    <Section
      title="Documenti senza AI"
      description="Elenchi di file che compaiono subito, senza passare dal modello e senza consumare token. Ogni elenco ha una o più parole («comunicazioni», «moduli mutuo») e, in alternativa o in più, una scorciatoia nella schermata iniziale: scrivere esattamente quella parola, o toccare il riquadro, mostra l’elenco con i pulsanti per scaricare i file. Una frase più lunga va al modello come una domanda qualsiasi. I documenti si scelgono con una regola (categorie, una parola nel nome, i più recenti o per nome, quanti) oppure a mano."
    >
      {lists.length === 0 && (
        <p className="rounded-xl bg-surface px-3 py-3 text-center text-fs-12 text-slate-soft">
          Nessun elenco: ogni messaggio va al modello.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {lists.map(list => (
          <NoAiDocumentListRow
            key={list.id}
            list={list}
            others={owners.filter(other => other.id !== list.id)}
            collisions={collisions}
            entries={entries}
            categories={categories}
            expanded={expandedId === list.id}
            onToggle={() => setExpandedId(expandedId === list.id ? null : list.id)}
            onChange={replace}
            onDelete={() => remove(list.id)}
          />
        ))}
      </div>

      <div>
        <Button onClick={add}>
          <Plus size={14} /> Aggiungi elenco
        </Button>
      </div>
    </Section>
  );
}
