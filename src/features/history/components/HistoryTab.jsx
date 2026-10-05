/**
 * "Storico", admin only: how the assistant is used, by whom and at what cost, down to each
 * conversation. The settings block at the top belongs to the shared settings object (same "Salva"
 * bar as the other tabs); everything below reads `chatConversations` directly.
 */
'use client';

import { useEffect, useMemo, useState } from 'react';
import { Download, Loader2, MessagesSquare } from 'lucide-react';
import Section from '@/shared/ui/Section';
import Switch from '@/shared/ui/Switch';
import { HELP_TEXT_CLASS, INPUT_CLASS } from '@/shared/ui/formStyles';
import { downloadXlsx } from '@/shared/xlsx';
import { useHistoryData } from '../useHistoryData';
import { DEFAULT_HISTORY_NOTICE, historyNotice } from '../historyNotice';
import { romeDay } from '../romeDay';
import {
  conversationState,
  kpis,
  questionsPerDay,
  toolTotals,
  topDocuments,
  topUsers,
  usersIn
} from '../aggregate';
import { BarList, DayBars } from './HistoryCharts';
import ConversationDetail from './ConversationDetail';
import UserMultiSelect from './UserMultiSelect';
import { loadAppUsers } from '../appUsers';

const RETENTION_OPTIONS = [7, 30, 90, 180, 365];
const RANGES = [
  { days: 1, label: 'Oggi' },
  { days: 7, label: 'Ultimi 7 giorni' },
  { days: 30, label: 'Ultimi 30 giorni' },
  { days: 90, label: 'Ultimi 90 giorni' }
];
const STATE_LABEL = { open: 'In corso', reset: 'Chiusa', day: 'Fine giornata' };
const STATE_CLASS = {
  open: 'bg-ok-soft text-ok',
  reset: 'bg-surface text-slate-soft',
  day: 'bg-surface text-slate-soft'
};

const formatNumber = n => Math.round(n).toLocaleString('it-IT');
const formatDate = ts =>
  ts
    ?.toDate?.()
    .toLocaleString('it-IT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' }) || '—';
const minutesBetween = (a, b) => {
  const ms = (b?.toMillis?.() || 0) - (a?.toMillis?.() || 0);
  return ms > 0 ? Math.max(1, Math.round(ms / 60000)) : null;
};

function HistorySettings({ settings, onChange }) {
  return (
    <Section
      title="Salvataggio delle conversazioni"
      description="Le conversazioni restano salvate per utente e riprendono dopo un ricaricamento. Ne inizia una nuova con «Nuova conversazione» o quando cambia il giorno."
    >
      <Switch
        checked={Boolean(settings.historyEnabled)}
        onChange={value => onChange('historyEnabled', value)}
        label="Salva le conversazioni"
        description="Prima di attivarlo servono le regole di sicurezza di Firestore per lo storico (ognuno legge solo le sue, gli amministratori tutte) e l’ok di chi segue la privacy: senza regole, un operatore potrebbe leggere le conversazioni degli altri."
      />
      <label className="flex flex-col gap-1.5">
        <span className="text-[12px] font-semibold text-ink">Per quanto tempo conservarle</span>
        <select
          value={settings.historyRetentionDays}
          onChange={e => onChange('historyRetentionDays', Number(e.target.value))}
          className={INPUT_CLASS}
        >
          {RETENTION_OPTIONS.map(days => (
            <option key={days} value={days}>
              {days} giorni{days === 30 ? ' (consigliato)' : ''}
            </option>
          ))}
        </select>
        <span className={HELP_TEXT_CLASS}>
          Vale per le conversazioni nuove. La cancellazione automatica può arrivare fino a un giorno dopo la
          scadenza.
        </span>
      </label>
      <Switch
        checked={settings.showHistoryNotice !== false}
        onChange={value => onChange('showHistoryNotice', value)}
        label="Avvisa gli operatori"
        description="Mostra un avviso nella schermata iniziale della chat, sotto quello sull’AI. Toglierlo è una scelta da concordare con chi segue la privacy."
      />
      {settings.showHistoryNotice !== false && (
        <label className="flex flex-col gap-1.5">
          <span className="text-[12px] font-semibold text-ink">Testo dell’avviso</span>
          <textarea
            rows={3}
            value={settings.historyNoticeText || ''}
            onChange={e => onChange('historyNoticeText', e.target.value)}
            placeholder={DEFAULT_HISTORY_NOTICE}
            className={`${INPUT_CLASS} resize-y`}
          />
          <span className={HELP_TEXT_CLASS}>
            Scrivi {'{giorni}'} dove vuoi il numero di giorni di conservazione. Lasciato vuoto, vale il testo
            suggerito.
          </span>
          <span className="rounded-xl bg-surface px-3 py-2 text-[11px] leading-snug text-slate-soft">
            <span className="font-semibold text-ink">Gli operatori vedranno: </span>
            {historyNotice(settings.historyNoticeText, settings.historyRetentionDays)}
          </span>
        </label>
      )}
    </Section>
  );
}

/** A chart in its own bordered card, title inside, so each one reads as a unit on the page. */
function ChartCard({ title, description, action, children }) {
  return (
    <section className="rounded-xl border border-line bg-white p-3.5 shadow-soft">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h3 className="text-[11px] font-bold uppercase tracking-[0.12em] text-brand-600">{title}</h3>
          {description && <p className="mt-0.5 text-[11px] text-slate-soft">{description}</p>}
        </div>
        {action}
      </div>
      <div className="mt-3">{children}</div>
    </section>
  );
}

function Kpi({ value, label }) {
  return (
    <div className="rounded-xl bg-surface px-3 py-2.5">
      <div className="text-[11px] text-slate-soft">{label}</div>
      <div className="text-[18px] font-bold tabular-nums text-ink">{value}</div>
    </div>
  );
}

function ConversationTable({ conversations, today, onOpen }) {
  if (!conversations.length) {
    return (
      <div className="flex flex-col items-center gap-1.5 rounded-xl bg-surface px-4 py-8 text-center">
        <MessagesSquare size={22} className="text-slate-soft" />
        <p className="text-[13px] font-semibold text-ink">Nessuna conversazione nel periodo</p>
        <p className="max-w-xs text-[11px] text-slate-soft">
          Prova un periodo più lungo o un altro utente. Le conversazioni compaiono qui solo con il salvataggio
          attivo.
        </p>
      </div>
    );
  }
  return (
    <div className="overflow-x-auto rounded-xl border border-line">
      <table className="w-full text-left text-[12px]">
        <thead className="bg-surface text-[11px] text-slate-soft">
          <tr>
            <th className="px-3 py-2 font-semibold">Inizio</th>
            <th className="px-3 py-2 font-semibold">Utente</th>
            <th className="px-3 py-2 font-semibold">Prima domanda</th>
            <th className="px-3 py-2 text-right font-semibold">Domande</th>
            <th className="px-3 py-2 text-right font-semibold">Strumenti</th>
            <th className="px-3 py-2 text-right font-semibold">Durata</th>
            <th className="px-3 py-2 font-semibold">Stato</th>
          </tr>
        </thead>
        <tbody>
          {conversations.map(c => {
            const state = conversationState(c, today);
            const tools = (c.tools?.documents || 0) + (c.tools?.data || 0) + (c.tools?.export || 0);
            const minutes = minutesBetween(c.startedAt, c.lastMessageAt);
            return (
              <tr
                key={c.id}
                onClick={() => onOpen(c)}
                className="cursor-pointer border-t border-line transition hover:bg-brand-50/50"
              >
                <td className="whitespace-nowrap px-3 py-2 tabular-nums">{formatDate(c.startedAt)}</td>
                <td className="max-w-[140px] truncate px-3 py-2">{c.userName || c.email}</td>
                <td className="max-w-[220px] truncate px-3 py-2 text-slate-soft">{c.firstQuestion || '—'}</td>
                <td className="px-3 py-2 text-right tabular-nums">
                  {c.userMessages || 0}
                  {c.errors ? <span className="text-danger"> · {c.errors} err.</span> : null}
                </td>
                <td className="px-3 py-2 text-right tabular-nums">{tools}</td>
                <td className="whitespace-nowrap px-3 py-2 text-right tabular-nums">
                  {minutes ? `${minutes} min` : '—'}
                </td>
                <td className="px-3 py-2">
                  <span
                    className={`rounded-full px-2 py-0.5 text-[10px] font-semibold ${STATE_CLASS[state]}`}
                  >
                    {STATE_LABEL[state]}
                  </span>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
    </div>
  );
}

export default function HistoryTab({ settings, onChange }) {
  const [rangeDays, setRangeDays] = useState(30);
  const [selectedUsers, setSelectedUsers] = useState(() => new Set());
  const [appUsers, setAppUsers] = useState([]);
  const [open, setOpen] = useState(null);
  // the chart's first day, fixed when the tab opens like the data it shows
  const [openedAt] = useState(() => Date.now());
  const { conversations: loaded, loading, error, cursor, loadMore } = useHistoryData(rangeDays);

  const today = romeDay();
  const fromDay = romeDay(new Date(openedAt - (rangeDays - 1) * 24 * 60 * 60 * 1000));
  useEffect(() => {
    loadAppUsers()
      .then(setAppUsers)
      .catch(error => console.warn('[history] reading the users failed:', error?.message || error));
  }, []);

  // everyone allowed to use the app, plus anyone seen in the loaded conversations who no longer is
  // (removed later): their history must stay reachable
  const users = useMemo(() => {
    const byUid = new Map(appUsers.map(u => [u.uid, u]));
    for (const u of usersIn(loaded)) {
      if (!byUid.has(u.uid)) byUid.set(u.uid, { uid: u.uid, email: u.email || u.label, name: u.name || '' });
    }
    return [...byUid.values()].sort((a, b) => a.email.localeCompare(b.email));
  }, [appUsers, loaded]);
  // none ticked and all ticked both mean everyone (UserMultiSelect)
  const filtering = selectedUsers.size > 0 && selectedUsers.size < users.length;
  const conversations = useMemo(
    () => (filtering ? loaded.filter(c => selectedUsers.has(c.uid)) : loaded),
    [loaded, selectedUsers, filtering]
  );
  const numbers = useMemo(() => kpis(conversations), [conversations]);

  if (open) return <ConversationDetail conversation={open} onBack={() => setOpen(null)} />;

  const exportList = () =>
    downloadXlsx(
      `storico-assistente-${today}`,
      [
        'Inizio',
        'Utente',
        'Email',
        'Prima domanda',
        'Domande',
        'Risposte',
        'Errori',
        'Documenti',
        'Query',
        'Excel',
        'Token',
        'Stato'
      ],
      conversations.map(c => ({
        Inizio: formatDate(c.startedAt),
        Utente: c.userName || '',
        Email: c.email || '',
        'Prima domanda': c.firstQuestion || '',
        Domande: c.userMessages || 0,
        Risposte: c.assistantMessages || 0,
        Errori: c.errors || 0,
        Documenti: c.tools?.documents || 0,
        Query: c.tools?.data || 0,
        Excel: c.tools?.export || 0,
        Token: (c.tokens?.input || 0) + (c.tokens?.output || 0) + (c.tokens?.thinking || 0),
        Stato: STATE_LABEL[conversationState(c, today)]
      }))
    ).catch(e => console.error('[history] excel export failed:', e));

  return (
    <div className="flex flex-col gap-6">
      <HistorySettings settings={settings} onChange={onChange} />

      <div className="flex flex-col gap-4 border-t border-line pt-4">
        <div className="flex flex-wrap gap-2">
          <select
            value={rangeDays}
            onChange={e => setRangeDays(Number(e.target.value))}
            className={`${INPUT_CLASS} w-auto`}
            aria-label="Periodo"
          >
            {RANGES.map(r => (
              <option key={r.days} value={r.days}>
                {r.label}
              </option>
            ))}
          </select>
          <UserMultiSelect users={users} selected={selectedUsers} onChange={setSelectedUsers} />
        </div>

        {error && (
          <p className="rounded-xl bg-danger-soft px-3 py-2 text-[12px] text-danger">
            Non riesco a leggere lo storico. Se le regole di sicurezza per lo storico non sono ancora attive,
            è normale.
          </p>
        )}
        {loading && !loaded.length && <Loader2 size={16} className="animate-spin text-brand-500" />}

        {!error && (
          <>
            <div className="grid grid-cols-2 gap-2 sm:grid-cols-3">
              <Kpi label="Conversazioni" value={formatNumber(numbers.conversations)} />
              <Kpi label="Domande" value={formatNumber(numbers.questions)} />
              <Kpi label="Utenti attivi" value={formatNumber(numbers.users)} />
              <Kpi label="Domande per conversazione" value={numbers.questionsPerConversation.toFixed(1)} />
              <Kpi label="Risposte con errore" value={`${(numbers.errorRate * 100).toFixed(1)}%`} />
              <Kpi
                label="Token (ingresso · uscita · ragion.)"
                value={
                  <span className="text-[13px]">
                    {[numbers.tokens.input, numbers.tokens.output, numbers.tokens.thinking]
                      .map(formatNumber)
                      .join(' · ')}
                  </span>
                }
              />
            </div>

            <ChartCard title="Domande per giorno">
              <DayBars series={questionsPerDay(conversations, fromDay, today)} />
            </ChartCard>
            <ChartCard title="Strumenti usati">
              <BarList items={toolTotals(conversations)} />
            </ChartCard>
            {!(filtering && selectedUsers.size === 1) && (
              <ChartCard title="Utenti più attivi" description="Per numero di domande.">
                <BarList items={topUsers(conversations)} />
              </ChartCard>
            )}
            <ChartCard title="Documenti più consultati" description="In quante conversazioni è stato aperto.">
              <BarList items={topDocuments(conversations)} emptyText="Nessun documento aperto nel periodo." />
            </ChartCard>

            <ChartCard
              title="Conversazioni"
              description={
                conversations.length
                  ? `${conversations.length} nel periodo · clicca una riga per leggerla`
                  : undefined
              }
              action={
                conversations.length > 0 && (
                  <button
                    type="button"
                    onClick={exportList}
                    className="flex shrink-0 items-center gap-1.5 rounded-lg border border-line px-2.5 py-1 text-[12px] font-semibold text-brand-600 transition hover:border-brand-300 hover:bg-brand-50"
                  >
                    <Download size={13} /> Scarica Excel
                  </button>
                )
              }
            >
              <ConversationTable conversations={conversations} today={today} onOpen={setOpen} />
              {cursor && (
                <button
                  type="button"
                  onClick={loadMore}
                  disabled={loading}
                  className="mx-auto mt-3 block text-[12px] font-semibold text-brand-600 hover:underline disabled:opacity-40"
                >
                  {loading ? 'Carico…' : 'Carica altre conversazioni'}
                </button>
              )}
            </ChartCard>
          </>
        )}
      </div>
    </div>
  );
}
