/**
 * What a shortcut does when tapped: ask the model a question, or run one of the commands without AI
 * (features/chat/commands), which answers without it. Shared by the admin's editor and the operator's own
 * form. `value` is the command's id, or empty for "ask the model"; `onChange` gets the same. `commands` is
 * `settings.noAiCommands` (null while it is being read). With no commands there is nothing to choose, and
 * the control is left out.
 */
import { INPUT_CLASS } from '@/shared/ui/formStyles';
import { isCommandOn } from '@/features/chat/commands/matchCommand';

export default function CommandChoice({ value, commands, onChange }) {
  const known = commands?.some(command => command.id === value);
  if (!commands?.length && !value) return null;
  return (
    <select
      value={value || ''}
      onChange={e => onChange(e.target.value)}
      aria-label="Cosa fa il riquadro"
      className={INPUT_CLASS}
    >
      <option value="">Testo per l’assistente</option>
      {value && !known && (
        <option value={value}>{commands ? 'Comando eliminato' : 'Comando senza AI'}</option>
      )}
      {commands?.map(command => (
        <option key={command.id} value={command.id}>
          Comando: {command.name}
          {isCommandOn(command) ? '' : ' (spento)'}
        </option>
      ))}
    </select>
  );
}
