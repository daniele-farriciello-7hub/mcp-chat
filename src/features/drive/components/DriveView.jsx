/**
 * "Drive" view of the Documents tab: what to share with, the form that links a folder or a PDF, and
 * every linked source with its schedule, last result and actions. The sources are read by polling the
 * `drive` function (useDriveSources); the documents they create are the archive's own, listed in the
 * other views. Everything here saves as it goes, like the rest of the tab.
 */
'use client';

import { useMemo, useState } from 'react';
import { removeDriveSource, syncDriveSource, updateDriveSource } from '../driveApi';
import { useDriveSources } from '../useDriveSources';
import AddDriveSourceForm from './AddDriveSourceForm';
import DriveSourceRow from './DriveSourceRow';
import HowDriveWorks from './HowDriveWorks';
import ServiceAccountShare from './ServiceAccountShare';

function describeError(error) {
  if (error?.status === 403) return 'Solo gli amministratori possono gestire Google Drive.';
  // the connection to a long request (a manual sync) can drop while the server carries on
  if (error?.status === 0) {
    return 'Non ricevo più la risposta del server. Se la sincronizzazione era partita continua da sola: guarda lo stato qui sopra.';
  }
  return error?.message || 'Non riuscito. Riprova.';
}

function LoadingSkeleton() {
  return (
    <div className="flex flex-col gap-2.5" aria-hidden>
      {[0, 1].map(i => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-line" />
      ))}
    </div>
  );
}

// one stable array for a source without documents, so its row does not see a "new" list at every update
const NO_DOCUMENTS = [];

/** `documents`: the whole archive, live, to list the files each source holds. */
export default function DriveView({ documents }) {
  const { data, error, refresh, replace, drop } = useDriveSources();
  const [busy, setBusy] = useState({}); // source id -> 'sync' | 'reindex' | 'remove' | 'save'
  const [messages, setMessages] = useState({}); // source id -> what went wrong

  // the archive's documents grouped by the source they belong to (one can belong to several)
  const documentsBySource = useMemo(() => {
    const groups = {};
    for (const document of documents) {
      for (const id of document.driveSourceIds || []) {
        if (!groups[id]) groups[id] = [];
        groups[id].push(document);
      }
    }
    return groups;
  }, [documents]);

  const track = async (id, kind, action) => {
    setBusy(current => ({ ...current, [id]: kind }));
    setMessages(current => ({ ...current, [id]: null }));
    try {
      await action();
    } catch (actionError) {
      console.error(`[drive] ${kind} failed:`, actionError);
      setMessages(current => ({ ...current, [id]: describeError(actionError) }));
      refresh();
    } finally {
      setBusy(current => {
        const next = { ...current };
        delete next[id];
        return next;
      });
    }
  };

  // the request lasts as long as the run; the polling shows its progress meanwhile, so it starts early
  const sync = (source, { force }) => {
    setTimeout(refresh, 1200);
    return track(source.id, force ? 'reindex' : 'sync', async () =>
      replace(await syncDriveSource(source.id, { force }))
    );
  };
  const changeSchedule = (source, schedule) =>
    track(source.id, 'save', async () => replace(await updateDriveSource(source.id, schedule)));
  const remove = source =>
    track(source.id, 'remove', async () => {
      await removeDriveSource(source.id);
      drop(source.id);
    });
  // a new source has never been read: its first sync starts at once
  const added = source => {
    replace(source);
    sync(source, { force: false });
  };

  return (
    <div className="flex flex-col gap-3">
      <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
        <div>
          <h3 className="text-fs-13 font-bold text-ink">Google Drive</h3>
          <p className="mt-0.5 text-fs-11 leading-snug text-slate-soft">
            Collega una cartella o un PDF: l’archivio si aggiorna da solo. Un file tolto da Drive, o che non
            sta più in nessuna cartella collegata, esce anche dall’archivio.
          </p>
        </div>
        <ServiceAccountShare email={data?.serviceAccountEmail} />
        {data && <HowDriveWorks defaultOpen={data.sources.length === 0} />}
      </div>

      <AddDriveSourceForm onAdded={added} />

      {error && !data && (
        <div className="rounded-xl bg-danger-soft p-3 text-fs-12 text-danger">{describeError(error)}</div>
      )}
      {!data && !error && <LoadingSkeleton />}

      {data?.sources.length === 0 && (
        <p className="rounded-xl bg-surface px-3 py-4 text-center text-fs-12 text-slate-soft">
          Nessuna cartella collegata ancora.
        </p>
      )}

      <div className="flex flex-col gap-2">
        {data?.sources.map(source => (
          <DriveSourceRow
            key={source.id}
            source={source}
            documents={documentsBySource[source.id] || NO_DOCUMENTS}
            busy={busy[source.id]}
            message={messages[source.id]}
            onSchedule={changeSchedule}
            onSync={sync}
            onRemove={remove}
          />
        ))}
      </div>

      {error && data && (
        <p className="text-fs-11 text-warn">Non riesco ad aggiornare lo stato: riprovo tra poco.</p>
      )}
    </div>
  );
}
