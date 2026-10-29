/**
 * "7Hub", admin only: how the assistant uses the 7Hub tools when it runs inside 7Hub (search, open, read
 * sections, logs, notes). The text goes last in the system prompt, so it wins over "Istruzioni al modello".
 * Same "Salva" bar as the other tabs. The tools themselves (names, what they do) stay in code: hostTools.js.
 */
import MarkdownTextarea from '@/shared/ui/MarkdownTextarea';
import PromptAttachments from '@/shared/ui/PromptAttachments';
import Section from '@/shared/ui/Section';
import { HELP_TEXT_CLASS, INPUT_CLASS } from '@/shared/ui/formStyles';
import { DEFAULT_SETTINGS } from '@/features/settings/defaultSettings';
import { HOST_TOOL_CATALOG } from '@/features/chat/tools/hostTools';

// the model's own wording, without the markdown backticks
const plain = text => text.replace(/`/g, '');

/** One tool: on/off, what it is in plain words, what 7Hub does and calls, and the text the model reads. */
function ToolRow({ tool, config, onChange }) {
  const enabled = config.enabled !== false;
  // an empty override means "the default": saved as '' (never deleted, Firestore merges nested fields)
  const custom = config.description || '';
  return (
    <li className={`rounded-xl border border-line p-3 transition ${enabled ? 'bg-white' : 'bg-surface opacity-70'}`}>
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <div className="text-[13px] font-semibold text-ink">{tool.label || tool.name}</div>
          <div className="mt-0.5 flex flex-wrap gap-x-2 text-[10.5px] text-slate-soft">
            <code>{tool.name}</code>
            <span aria-hidden="true">→</span>
            <span>
              7Hub: <code>{tool.hostFunction}</code>
            </span>
          </div>
        </div>
        <button
          type="button"
          role="switch"
          aria-checked={enabled}
          aria-label={`${enabled ? 'Disattiva' : 'Attiva'} ${tool.label || tool.name}`}
          onClick={() => onChange({ enabled: !enabled })}
          className={`relative mt-0.5 h-5 w-9 shrink-0 rounded-pill transition ${enabled ? 'bg-brand-500' : 'bg-line'}`}
        >
          <span
            className={`absolute top-0.5 h-4 w-4 rounded-pill bg-white shadow-soft transition-all ${
              enabled ? 'left-[18px]' : 'left-0.5'
            }`}
          />
        </button>
      </div>

      {tool.how && <p className="mt-2 text-[12px] leading-snug text-ink">{tool.how}</p>}
      <div className="mt-1.5 text-[11px] leading-snug text-slate-soft">
        <span className="font-semibold">API: </span>
        {tool.apis?.length ? (
          tool.apis.map(api => (
            <span key={api} className="block">
              {api}
            </span>
          ))
        ) : (
          <span>nessuna, legge quello che c’è già in pagina</span>
        )}
      </div>

      <label className="mt-2.5 block">
        <span className="flex items-center justify-between text-[11px] font-semibold text-slate-soft">
          Testo per il modello
          {custom && (
            <button
              type="button"
              onClick={() => onChange({ description: '' })}
              className="rounded-md px-1.5 py-0.5 text-[11px] font-semibold text-brand-600 hover:bg-brand-50"
            >
              Ripristina
            </button>
          )}
        </span>
        <textarea
          rows={3}
          disabled={!enabled}
          value={custom || plain(tool.description)}
          onChange={e => onChange({ description: e.target.value === plain(tool.description) ? '' : e.target.value })}
          className={`${INPUT_CLASS} mt-1 resize-y text-[12px] leading-snug`}
        />
      </label>
    </li>
  );
}

export default function HubTab({ settings, onChange }) {
  const config = settings.hostToolsConfig || {};
  const isDefault = settings.hostToolsInstructions === DEFAULT_SETTINGS.hostToolsInstructions;
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Come usa gli strumenti 7Hub"
        description="Vale solo quando l’assistente è aperto dentro 7Hub. Va in fondo al prompt, quindi conta più delle istruzioni al modello."
      >
        <MarkdownTextarea
          rows={14}
          value={settings.hostToolsInstructions}
          onChange={e => onChange('hostToolsInstructions', e.target.value)}
          ariaLabel="Come usa gli strumenti 7Hub"
          mentionables={settings.hostToolsAttachments?.map(a => a.name)}
        />
        <PromptAttachments
          value={settings.hostToolsAttachments}
          onChange={value => onChange('hostToolsAttachments', value)}
        />
        <div className="flex items-start justify-between gap-3">
          <p className={HELP_TEXT_CLASS}>
            Lasciato vuoto vale il testo predefinito. Chiama gli strumenti con il loro nome esatto (elenco qui
            sotto): se lo scrivi diverso il modello non li collega.
          </p>
          <button
            type="button"
            disabled={isDefault}
            onClick={() => onChange('hostToolsInstructions', DEFAULT_SETTINGS.hostToolsInstructions)}
            className="shrink-0 rounded-lg px-2 py-1 text-[11px] font-semibold text-brand-600 transition hover:bg-brand-50 disabled:cursor-default disabled:text-slate-soft disabled:hover:bg-transparent"
          >
            Ripristina testo
          </button>
        </div>
      </Section>

      <Section
        title="Strumenti"
        description="Li esegue 7Hub con la sessione dell’operatore: solo lettura e navigazione. Puoi spegnerli o riscrivere il testo che il modello legge per sceglierli; nome e funzionamento cambiano solo con un rilascio."
      >
        <ul className="flex flex-col gap-2.5">
          {HOST_TOOL_CATALOG.map(tool => (
            <ToolRow
              key={tool.name}
              tool={tool}
              config={config[tool.name] || {}}
              onChange={next => onChange('hostToolsConfig', { ...config, [tool.name]: { ...config[tool.name], ...next } })}
            />
          ))}
        </ul>
      </Section>
    </div>
  );
}
