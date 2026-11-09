/**
 * `ask_options` tool: for a question that can be read in ways leading to really different answers
 * ("quanti lead questo mese?": created, worked or closed?), the model shows clickable options instead
 * of guessing or writing a wall of text (`components/ChoiceCard.jsx`). A click sends that option's text
 * as the operator's next message, so the model carries on with the answer. Files have their own
 * picker, `offer_files`.
 *
 * The model's turn ends here: it is told to stop and wait, and the card is drawn by the app from the
 * activity alone, so it also comes back after a reload.
 */
export const ASK_OPTIONS_TOOL_NAME = 'ask_options';

const MIN_OPTIONS = 2;
const MAX_OPTIONS = 5;
const MAX_OPTION_CHARS = 200;
const MAX_QUESTION_CHARS = 200;

export const ASK_OPTIONS_TOOL = {
  functionDeclarations: [
    {
      name: ASK_OPTIONS_TOOL_NAME,
      description:
        "Mostra all'operatore delle scelte cliccabili quando la domanda può voler dire cose diverse che portano " +
        'a risposte davvero diverse (ad esempio "quanti lead questo mese?": creati, lavorati o chiusi?). ' +
        "Ogni opzione è scritta come la risposta completa che l'operatore scriverebbe: cliccandola, viene " +
        "inviata così com'è come suo prossimo messaggio. Non usarlo per scegliere un file (usa offer_files), " +
        "né se la risposta sarebbe la stessa in ogni interpretazione, né per qualcosa che l'operatore ha già " +
        'detto. Dopo averlo chiamato non rispondere alla domanda: chiudi il turno con al massimo una frase ' +
        "breve e aspetta la risposta dell'operatore.",
      parameters: {
        type: 'object',
        properties: {
          question: {
            type: 'string',
            description: 'La domanda di chiarimento, breve: ad esempio "Quali lead intendi?".'
          },
          options: {
            type: 'array',
            items: { type: 'string' },
            description:
              'Da 2 a 5 opzioni concrete e brevi, ognuna una risposta completa, ad esempio "Lead creati questo mese".'
          },
          allow_other: {
            type: 'boolean',
            description:
              'Se true (default) c\'è anche "Altro…", che porta l\'operatore a scrivere la sua risposta. Mettilo ' +
              'a false solo se le opzioni coprono tutti i casi possibili.'
          }
        },
        required: ['question', 'options']
      }
    }
  ]
};

/** One call to `ask_options`. Returns the `{response}` half of a functionResponse. */
export async function runAskOptionsCall(call, { round, index, onActivityStart, onActivityEnd }) {
  const { question, options, allow_other: allowOther } = call.args || {};
  const activityId = `choice-${round}-${index}`;
  onActivityStart(activityId, { kind: 'choice', label: 'Preparo le opzioni' });

  // distinct, trimmed and bounded: each one becomes a button and, once clicked, a message
  const choices = [
    ...new Set(
      (Array.isArray(options) ? options : [])
        .filter(option => typeof option === 'string' && option.trim())
        .map(option => option.trim().slice(0, MAX_OPTION_CHARS))
    )
  ].slice(0, MAX_OPTIONS);
  const text = typeof question === 'string' ? question.trim().slice(0, MAX_QUESTION_CHARS) : '';

  if (!text || choices.length < MIN_OPTIONS) {
    onActivityEnd(activityId, { outcome: 'failed', label: 'Nessuna opzione' });
    return {
      response: {
        error: `a question and ${MIN_OPTIONS} to ${MAX_OPTIONS} distinct options are required: ask in one short sentence instead`
      }
    };
  }

  onActivityEnd(activityId, {
    outcome: 'done',
    label: text,
    choices,
    allowOther: allowOther !== false
  });
  return {
    response: {
      ok: true,
      shown:
        "options are on screen; end your turn now with at most one short sentence, and wait for the operator's answer"
    }
  };
}
