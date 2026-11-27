/**
 * What a shortcut can run without the model: a command without AI (`settings.noAiCommands`, features/chat/commands)
 * or a list of documents without AI (`settings.noAiDocumentLists`, features/chat/documentLists). The shortcut keeps
 * the id of one of them in its `command` field, whichever it is: the ids never collide (commands are 'cmd-…' or the
 * old 'erogato', lists 'list-…'), the server only checks that the id is well formed, and the chat looks the id up
 * in both (useConversation.js). The pickers and the places that name the target work on one list of "targets": each
 * command or list with a `kind` added. Pure.
 */
import { isCommandOn } from '@/features/chat/commands/matchCommand';
import { isDocumentListOn } from '@/features/chat/documentLists/matchDocumentList';

export const TARGET_KIND = { command: 'command', documents: 'documents' };

/** The commands and the lists of documents of a settings object as one list, commands first, each with its `kind`. */
export const noAiTargets = settings => [
  ...(settings?.noAiCommands ?? []).map(command => ({ ...command, kind: TARGET_KIND.command })),
  ...(settings?.noAiDocumentLists ?? []).map(list => ({ ...list, kind: TARGET_KIND.documents }))
];

/** Whether the chat would run the target now (switched on, and complete). */
export const isTargetOn = target =>
  target?.kind === TARGET_KIND.documents ? isDocumentListOn(target) : isCommandOn(target);

/** What the pickers call it: "Comando: Erogato", "Elenco: Comunicazioni". */
export const targetLabel = target =>
  `${target?.kind === TARGET_KIND.documents ? 'Elenco' : 'Comando'}: ${target?.name ?? ''}`;
