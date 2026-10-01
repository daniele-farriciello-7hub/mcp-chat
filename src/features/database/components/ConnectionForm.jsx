/**
 * Create/edit form for a database connection. The password is never sent back from the server
 * (`connectionStore.saveConnection` — `password: null` means "keep the one already stored"), so an
 * edit that does not touch the password field cannot test the live connection either: there is
 * nothing here to test with until it is retyped.
 */
'use client';

import { useState } from 'react';
import { CheckCircle2, Loader2, XCircle } from 'lucide-react';
import Button from '@/shared/ui/Button';
import Field from '@/shared/ui/Field';
import Switch from '@/shared/ui/Switch';
import { INPUT_CLASS } from '@/shared/ui/formStyles';
import { saveConnection, testConnection } from '../connectionStore';

const emptyForm = {
  label: '',
  host: '',
  port: '3306',
  database: '',
  user: '',
  password: '',
  ssl: false,
  allowSampling: false,
  userScoped: false
};

export default function ConnectionForm({ connection, onSaved, onCancel }) {
  const [form, setForm] = useState(
    connection
      ? { ...emptyForm, ...connection, port: String(connection.port || 3306), password: '' }
      : emptyForm
  );
  const [testState, setTestState] = useState(null); // null | 'testing' | 'ok' | { error }
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const set = (key, value) => {
    setForm(current => ({ ...current, [key]: value }));
    setTestState(null);
  };

  const canTest = form.host && form.database && form.user && form.password;

  const runTest = async () => {
    setTestState('testing');
    try {
      await testConnection({
        host: form.host,
        port: Number(form.port),
        database: form.database,
        user: form.user,
        password: form.password,
        ssl: form.ssl
      });
      setTestState('ok');
    } catch (error) {
      setTestState({ error: error.message || 'Connessione non riuscita.' });
    }
  };

  const save = async () => {
    setSaving(true);
    setSaveError(null);
    try {
      const id = await saveConnection({
        id: connection?.id,
        label: form.label,
        host: form.host,
        port: Number(form.port),
        database: form.database,
        user: form.user,
        password: form.password || null,
        ssl: form.ssl,
        allowSampling: form.allowSampling,
        userScoped: form.userScoped,
        enabled: connection ? connection.enabled : false
      });
      onSaved(id);
    } catch (error) {
      console.error('[database] save connection failed:', error);
      setSaveError(error.message || 'Salvataggio non riuscito.');
    } finally {
      setSaving(false);
    }
  };

  const canSave = form.label && form.host && form.database && form.user && (connection || form.password);

  return (
    <div className="flex flex-col gap-3 rounded-xl border border-line p-3">
      <Field label="Etichetta">
        <input
          className={INPUT_CLASS}
          value={form.label}
          onChange={e => set('label', e.target.value)}
          placeholder="Es. Analitica revolution"
        />
      </Field>

      <div className="grid grid-cols-[1fr_auto] gap-2">
        <Field label="Host">
          <input className={INPUT_CLASS} value={form.host} onChange={e => set('host', e.target.value)} />
        </Field>
        <Field label="Porta">
          <input
            className={`${INPUT_CLASS} w-20`}
            value={form.port}
            onChange={e => set('port', e.target.value.replace(/\D/g, ''))}
            inputMode="numeric"
          />
        </Field>
      </div>

      <Field label="Database" help="MariaDB 11.8 (compatibile MySQL).">
        <input
          className={INPUT_CLASS}
          value={form.database}
          onChange={e => set('database', e.target.value)}
        />
      </Field>

      <div className="grid grid-cols-2 gap-2">
        <Field label="Utente">
          <input className={INPUT_CLASS} value={form.user} onChange={e => set('user', e.target.value)} />
        </Field>
        <Field label="Password" help={connection ? 'Lascia vuoto per non cambiarla.' : undefined}>
          <input
            type="password"
            className={INPUT_CLASS}
            value={form.password}
            onChange={e => set('password', e.target.value)}
            placeholder={connection ? '••••••• (salvata)' : ''}
            autoComplete="new-password"
          />
        </Field>
      </div>

      <Switch
        checked={form.ssl}
        onChange={v => set('ssl', v)}
        label="Connessione cifrata"
        description="Attiva se il server accetta TLS. Se non ha un certificato affidabile, la connessione lo accetta comunque."
      />
      <Switch
        checked={form.allowSampling}
        onChange={v => set('allowSampling', v)}
        label="Leggi righe di esempio per le schede"
        description="Alcune righe reali vengono mandate a Gemini solo per aiutarlo a scrivere la scheda di ogni tabella."
      />
      <Switch
        checked={form.userScoped}
        onChange={v => set('userScoped', v)}
        label="Filtra i dati per utente"
        description="Ognuno vede solo i dati che gli competono. Da attivare quando la connessione usa viste filtrate: prima di ogni domanda il database riceve l’email di chi chiede (@assistente_utente_email) e le viste mostrano solo ciò che quella persona può vedere. Senza viste, non filtra nulla."
      />

      <div className="flex items-center gap-2 pt-1">
        <Button onClick={runTest} disabled={!canTest || testState === 'testing'}>
          {testState === 'testing' ? <Loader2 size={14} className="animate-spin" /> : null}
          Prova connessione
        </Button>
        {testState === 'ok' && (
          <span className="flex items-center gap-1 text-[12px] font-medium text-ok">
            <CheckCircle2 size={14} /> Connesso
          </span>
        )}
        {testState?.error && (
          <span className="flex items-center gap-1 text-[12px] font-medium text-danger">
            <XCircle size={14} /> {testState.error}
          </span>
        )}
      </div>

      <div className="flex items-center gap-2 border-t border-line pt-3">
        <Button primary onClick={save} disabled={!canSave || saving}>
          {saving ? 'Salvo…' : 'Salva'}
        </Button>
        <Button onClick={onCancel} disabled={saving}>
          Annulla
        </Button>
        {saveError && <span className="text-[12px] text-danger">{saveError}</span>}
      </div>
    </div>
  );
}
