/**
 * What a shortcut does when tapped: ask the model a question, or run one of the commands without AI
 * (features/chat/commands) or show one of the lists of documents without AI (features/chat/documentLists), which
 * answer without it. Shared by the admin's editor and the operator's own form. `value` is the id of the command or
 * the list, or empty for "ask the model"; `onChange` gets the same. `targets` is both as one list (noAiTargets.js;
 * null while it is being read). With none there is nothing to choose, and the control is left out.
 */
import { INPUT_CLASS } from '@/shared/ui/formStyles';
import { isTargetOn, targetLabel } from './noAiTargets';

export default function CommandChoice({ value, targets, onChange }) {
  const known = targets?.some(target => target.id === value);
  if (!targets?.length && !value) return null;
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      aria-label="Cosa fa il riquadro"
      className={INPUT_CLASS}
    >
      <option value="">Testo per l’assistente</option>
      {value && !known && (
        <option value={value}>{targets ? 'Comando o elenco eliminato' : 'Senza AI'}</option>
      )}
      {targets?.map(target => (
        <option key={target.id} value={target.id}>
          {targetLabel(target)}
          {isTargetOn(target) ? '' : ' (spento)'}
        </option>
      ))}
    </select>
  );
}
