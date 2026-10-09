import MarkdownTextarea from '@/shared/ui/MarkdownTextarea';
import PromptAttachments from '@/shared/ui/PromptAttachments';
import Section from '@/shared/ui/Section';
import Slider from '@/shared/ui/Slider';
import Switch from '@/shared/ui/Switch';
import { HELP_TEXT_CLASS, INPUT_CLASS } from '@/shared/ui/formStyles';
import ModelPicker from './ModelPicker';
import { CHART_LIMIT_BOUNDS, chartLimits } from '@/features/charts/chartData';

const creativityLabel = t => (t <= 0.3 ? 'Prevedibile' : t <= 0.6 ? 'Equilibrata' : 'Creativa');

/** Instructions come first: they are the only field people iterate on. */
export default function ModelSettingsTab({ settings, onChange }) {
  const { historyLimit } = settings;
  const limits = chartLimits(settings.chartLimits);
  const setLimit = (key, value) => onChange('chartLimits', { ...limits, [key]: value });
  return (
    <div className="flex flex-col gap-6">
      <Section
        title="Istruzioni al modello"
        description="Definiscono cosa sa fare e cosa deve rifiutare. È il punto in cui si tiene fuori la valutazione dell’affidabilità creditizia."
      >
        <MarkdownTextarea
          rows={12}
          value={settings.instructions}
          onChange={e => onChange('instructions', e.target.value)}
          ariaLabel="Istruzioni al modello"
          mentionables={settings.instructionsAttachments?.map(a => a.name)}
        />
        <PromptAttachments
          value={settings.instructionsAttachments}
          onChange={value => onChange('instructionsAttachments', value)}
        />
        <p className={HELP_TEXT_CLASS}>
          Il testo dei file va per intero nel prompt, non un riassunto: usali per una guida che il modello
          deve seguire da subito, non per materiale da consultare solo a volte — per quello c’è l’archivio
          documenti. Per far seguire un file solo in certi casi, nominalo nel testo qui sopra — scrivi “@” per
          farti suggerire i file allegati — così il modello vede entrambi nello stesso prompt e li collega da
          solo.
        </p>
      </Section>

      <Section title="Chi risponde" description="Il modello che risponde agli operatori in chat.">
        <ModelPicker value={settings.chatModel} onChange={value => onChange('chatModel', value)} />
      </Section>

      <Section
        title="Chi indicizza i documenti"
        description="Il modello che legge ogni documento e ne scrive la scheda-indice. Lavora una volta per documento, senza limite di lunghezza"
      >
        <ModelPicker value={settings.indexingModel} onChange={value => onChange('indexingModel', value)} />
      </Section>

      <Section
        title="Istruzioni per l’indicizzazione"
        description="Come deve leggere un documento e cosa metterci nella scheda. È la scheda che decide se l’assistente apre quel documento o lo ignora."
      >
        <MarkdownTextarea
          rows={8}
          value={settings.indexingInstructions}
          onChange={e => onChange('indexingInstructions', e.target.value)}
          ariaLabel="Istruzioni per l’indicizzazione"
          mentionables={settings.indexingAttachments?.map(a => a.name)}
        />
        <PromptAttachments
          value={settings.indexingAttachments}
          onChange={value => onChange('indexingAttachments', value)}
        />
      </Section>

      <Section
        title="Come sceglie i documenti"
        description="Va in fondo all’elenco delle schede, dove il modello decide quale aprire. Quando sceglie non ha ancora letto nessun documento: vede solo i riassunti."
      >
        <MarkdownTextarea
          rows={6}
          value={settings.documentSelectionInstructions}
          onChange={e => onChange('documentSelectionInstructions', e.target.value)}
          ariaLabel="Come sceglie i documenti"
          mentionables={settings.documentSelectionAttachments?.map(a => a.name)}
        />
        <PromptAttachments
          value={settings.documentSelectionAttachments}
          onChange={value => onChange('documentSelectionAttachments', value)}
        />
        <p className={HELP_TEXT_CLASS}>
          Il nome dello strumento è <code>read_document</code>: se lo togli dal testo, il modello può ancora
          aprirli, ma glielo stai ricordando in meno.
        </p>
      </Section>

      <Section title="Come risponde">
        <Slider
          label="Creatività"
          reading={`${creativityLabel(settings.temperature)} · ${settings.temperature.toFixed(1)}`}
          min={0}
          max={1}
          step={0.1}
          value={settings.temperature}
          rangeLabels={['Sempre uguale', 'Inventa di più']}
          onChange={value => onChange('temperature', value)}
        />
        <Switch
          checked={settings.maxOutputTokens === 0}
          onChange={value => onChange('maxOutputTokens', value ? 0 : 1200)}
          label="Nessun tetto alla lunghezza"
          description="Si ferma quando ha finito di rispondere, o al limite del modello che è molto più alto del nostro."
        />
        {settings.maxOutputTokens > 0 && (
          <Slider
            label="Lunghezza massima"
            reading={`≈ ${Math.round((settings.maxOutputTokens * 0.7) / 10) * 10} parole`}
            min={300}
            max={8000}
            step={100}
            value={settings.maxOutputTokens}
            rangeLabels={['Risposte corte', 'Risposte lunghe']}
            onChange={value => onChange('maxOutputTokens', value)}
          />
        )}
        <p className={HELP_TEXT_CLASS}>
          È un tetto, non un obiettivo: se la risposta finisce prima, finisce prima. A limitare la lunghezza
          sono soprattutto le istruzioni, che chiedono risposte brevi.
        </p>
        <Slider
          label="Quante volte può aprire documenti o interrogare il database"
          reading={`${settings.maxToolRounds} ${settings.maxToolRounds === 1 ? 'giro' : 'giri'}`}
          min={1}
          max={12}
          step={1}
          value={settings.maxToolRounds}
          rangeLabels={['Risponde subito', 'Cerca più a lungo']}
          onChange={value => onChange('maxToolRounds', value)}
        />
        <p className={HELP_TEXT_CLASS}>
          Per confrontare due istituti deve aprire almeno due documenti, e gli serve un giro in più per
          scrivere la risposta. Su una domanda al database ne servono almeno tre anche per una sola tabella:
          uno per controllarne le colonne (describe_table), uno per interrogarla, uno per scrivere la risposta
          — di più se tocca più tabelle o una query va corretta. Alzarlo rende le risposte più lente e più
          costose.
        </p>
      </Section>

      <Section
        title="Quanto ci pensa su"
        description="Prima di scrivere, il modello si ferma a ragionare. Per trovare un dato in un documento ne serve poco; per mettere a confronto due istituti, di più."
      >
        <select
          value={settings.thinkingLevel}
          onChange={e => onChange('thinkingLevel', e.target.value)}
          className={INPUT_CLASS}
          aria-label="Quanto ci pensa su"
        >
          <option value="MINIMAL">Minimo</option>
          <option value="LOW">Basso</option>
          <option value="MEDIUM">Medio</option>
          <option value="HIGH">Alto</option>
        </select>
        <p className={HELP_TEXT_CLASS}>
          Anche ragionare costa, come scrivere. E se hai messo un tetto basso alla lunghezza, il ragionamento
          si mangia lo spazio della risposta.
        </p>
      </Section>

      <Section
        title="Grafici nella chat"
        description="Quanto possono essere grandi i grafici che l’assistente mostra quando gli chiedi un andamento o un confronto."
      >
        <Slider
          label="Barre al massimo"
          reading={`${limits.bar} barre`}
          min={CHART_LIMIT_BOUNDS.bar.min}
          max={CHART_LIMIT_BOUNDS.bar.max}
          step={10}
          value={limits.bar}
          rangeLabels={['Più leggibile', 'Più dettaglio']}
          onChange={value => setLimit('bar', value)}
        />
        <Slider
          label="Punti al massimo in un andamento (grafico a linea)"
          reading={`${limits.line.toLocaleString('it-IT')} punti`}
          min={CHART_LIMIT_BOUNDS.line.min}
          max={CHART_LIMIT_BOUNDS.line.max}
          step={50}
          value={limits.line}
          rangeLabels={['Più leggibile', 'Più dettaglio']}
          onChange={value => setLimit('line', value)}
        />
        <Slider
          label="Fette al massimo in una torta"
          reading={`${limits.donut} fette`}
          min={CHART_LIMIT_BOUNDS.donut.min}
          max={CHART_LIMIT_BOUNDS.donut.max}
          step={1}
          value={limits.donut}
          rangeLabels={['Più leggibile', 'Più dettaglio']}
          onChange={value => setLimit('donut', value)}
        />
        <Slider
          label="Serie a confronto in uno stesso grafico"
          reading={`${limits.series} serie`}
          min={CHART_LIMIT_BOUNDS.series.min}
          max={CHART_LIMIT_BOUNDS.series.max}
          step={1}
          value={limits.series}
          rangeLabels={['Una alla volta', 'Più confronti']}
          onChange={value => setLimit('series', value)}
        />
        <p className="rounded-xl bg-surface px-3 py-2.5 text-[11px] leading-snug text-slate-soft">
          <span className="font-semibold text-ink">Sono limiti di leggibilità, non di costo.</span> I grafici
          li disegna l’app con i numeri esatti, non l’intelligenza artificiale: un grafico più grande non
          aumenta il consumo AI, perché al modello torna sempre solo un breve riepilogo. Alzarli permette
          grafici più dettagliati, ma oltre una certa soglia diventano difficili da leggere: in quel caso
          l’assistente raggruppa i dati (per mese, per banca…), e nelle torte le voci in più finiscono in
          «Altro». Un andamento con molti punti chiede solo un po’ più di tempo al database.
        </p>
      </Section>

      <Section
        title="Memoria della conversazione"
        description="Più contesto significa risposte più pertinenti, ma più dati inviati fuori. L’analisi privacy chiede di tenerlo al minimo utile."
      >
        <div className="flex gap-2">
          <select
            value={historyLimit.unit}
            onChange={e => onChange('historyLimit', { ...historyLimit, unit: e.target.value })}
            className={INPUT_CLASS}
            aria-label="Unità del limite"
          >
            <option value="messages">Ultimi messaggi</option>
            <option value="tokens">Token stimati</option>
          </select>
          <input
            type="number"
            min="1"
            value={historyLimit.value}
            onChange={e => onChange('historyLimit', { ...historyLimit, value: Number(e.target.value) })}
            className={`${INPUT_CLASS} w-24`}
            aria-label="Quanti"
          />
        </div>
        <p className="rounded-xl bg-surface px-3 py-2 text-[11px] leading-snug text-slate-soft">
          {historyLimit.unit === 'messages'
            ? `Il modello vedrà gli ultimi ${historyLimit.value} messaggi. Il resto è dimenticato.`
            : `Il modello vedrà al massimo ${historyLimit.value} token di conversazione, partendo dai più recenti.`}
        </p>
      </Section>

      <Section title="Trasparenza">
        <Switch
          checked={settings.showAiNotice !== false}
          onChange={value => onChange('showAiNotice', value)}
          label="Avviso che è un’AI"
          description="Richiesto dall’AI Act. Eliminarlo è una scelta da concordare con chi segue la conformità."
        />
      </Section>
    </div>
  );
}
