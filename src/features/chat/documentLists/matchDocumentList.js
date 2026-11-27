/**
 * Which list of documents without AI, if any, a message shows. Same rules as the commands
 * (../commands/matchCommand.js, whose `normalizeTrigger` and `matchesTrigger` are used as they are): the whole
 * message must be one of the list's words, a shortcut that names the list shows it whatever the text says. Pure and
 * dependency-free (apart from the command matcher), so it can be checked in plain node
 * (functions/scripts/document-lists.test.mjs).
 *
 * Words and commands: the admin's panels refuse a word that another list or a command already has (`claimTriggers`
 * over both, in Database → Comandi senza AI and in Documenti → Documenti senza AI), so no word can reach both. A
 * list of settings written some other way could still have such a word; then the command runs: it is checked first
 * (useConversation.js), because it is the older and the more expensive of the two to get wrong (a query on the
 * database), and among lists the first of the list wins, as among commands.
 */
import { commandText, matchesTrigger } from '../commands/matchCommand.js';
import { LIST_SELECTION } from './documentListSettings.js';

/**
 * What history stores as `model` for the reply of a list of documents, with the list's name in `command` (the
 * field a command's name uses too): no model answered. Not `comando`, so the Storico can say "elenco di documenti"
 * and not "comando".
 */
export const DOCUMENT_LIST_MODEL = 'elenco';

/**
 * True when a list has what it takes to show something: a rule always can (it may match nothing, and then says so),
 * a fixed list needs at least one file chosen. The panel uses the same rule to allow switching a list on.
 */
export const isDocumentListRunnable = list =>
  Boolean(list) && (list.selection !== LIST_SELECTION.fixed || list.documentIds?.length > 0);

/** A list is on for the chat when the admin switched it on and it can run. */
export const isDocumentListOn = list => Boolean(list?.enabled) && isDocumentListRunnable(list);

/**
 * The list a message shows, or null for the model (or a command). `requestedId` is what a shortcut names: it shows
 * that list whatever the text says, as long as it exists and is on (otherwise the text goes on, to the model). A
 * typed message shows the first list, in the list's order, with the message as one of its words.
 */
export function documentListFor(text, lists, requestedId = null) {
  const on = (Array.isArray(lists) ? lists : []).filter(isDocumentListOn);
  if (requestedId) return on.find(list => list.id === requestedId) ?? null;
  return on.find(list => matchesTrigger(text, list.triggers)) ?? null;
}

/**
 * What a shortcut that shows this list writes in the chat as the question: the list's first word (the one that would
 * show it if typed), or its name when it has none. It is also what the model gets when the list is off. The same
 * rule as for a command.
 */
export const documentListText = commandText;

/**
 * How a stored reply tells the admin that a list of documents answered, or null when something else did:
 * "elenco di documenti «Comunicazioni», senza AI". Reads `model: 'elenco'` with the name in `command`.
 */
export function documentListReplyLabel(message) {
  if (message?.model !== DOCUMENT_LIST_MODEL) return null;
  return message.command
    ? `elenco di documenti «${message.command}», senza AI`
    : 'elenco di documenti, senza AI';
}
