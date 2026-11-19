/**
 * Which command without AI, if any, a message runs. A command is an answer the server computes without the
 * model (`settings.noAiCommands`, see commandSettings.js). Pure and dependency-free, so it can be checked in
 * plain node (functions/scripts/chat-commands.test.mjs).
 */
import { COMMAND_FORMATS, isKnownFormat } from './formats.js';

/** What history stores as `model` for a command's reply, with the command's name in a field of its own: no model answered. */
export const COMMAND_MODEL = 'comando';

/** The first version stored `comando-<id>` as the model: still read back, never written. */
export const LEGACY_COMMAND_MODEL_PREFIX = 'comando-';

// punctuation a person adds without meaning anything: "erogato?", "Erogato.", "erogato!!"
const TRAILING_PUNCTUATION = /[\s.,;:!?…]+$/u;

/** A message or a trigger word reduced to what is compared: trimmed, lowercase, one space between words, no trailing punctuation. */
export const normalizeTrigger = text =>
  String(text ?? '')
    .trim()
    .toLowerCase()
    .replace(/\s+/g, ' ')
    .replace(TRAILING_PUNCTUATION, '');

/** True when the whole message is one of the trigger words ("erogato agos" is not: it goes to the model). */
export function matchesTrigger(text, triggers) {
  const message = normalizeTrigger(text);
  if (!message || !Array.isArray(triggers)) return false;
  return triggers.some(trigger => normalizeTrigger(trigger) === message);
}

/**
 * True when a command has what it takes to run: a connection, and a query (its own, or its format's default
 * one) in a format this app knows. Without them the server could only refuse, so the message goes to the
 * model as it always did. The panel uses the same rule to allow switching a command on.
 */
export const isRunnable = command =>
  Boolean(
    command?.connectionId &&
    isKnownFormat(command.format) &&
    (String(command.sql ?? '').trim() || COMMAND_FORMATS[command.format].hasDefaultSql)
  );

/** A command is on for the chat when the admin switched it on and it can run. */
export const isCommandOn = command => Boolean(command?.enabled) && isRunnable(command);

/**
 * The command a message runs, or null for the model. `requestedId` is the command a shortcut names: it
 * runs whatever the text says, as long as that command exists and is on (otherwise the text goes to the
 * model, as for any question). A typed message runs the first command, in the list's order, with the
 * message as one of its triggers: the panel keeps two commands from sharing a word, this only makes a
 * list that has them behave the same every time.
 */
export function commandFor(text, commands, requestedId = null) {
  const on = (Array.isArray(commands) ? commands : []).filter(isCommandOn);
  if (requestedId) return on.find(command => command.id === requestedId) ?? null;
  return on.find(command => matchesTrigger(text, command.triggers)) ?? null;
}

/**
 * What a shortcut that runs this command shows in the chat as the question: the command's first trigger word
 * (the word that would run it if typed), or its name when it has none. It is also what the model gets when
 * the command is off.
 */
export const commandText = command =>
  (Array.isArray(command?.triggers) ? command.triggers : []).find(trigger => normalizeTrigger(trigger)) ||
  command?.name ||
  '';

/**
 * Triggers used by more than one command: `[{ trigger, commandIds }]`, the trigger as the first command
 * wrote it. Compared as `normalizeTrigger` does, over every command (a switched-off one still counts:
 * switching it on must not create the clash). A command repeating its own trigger is not a collision.
 */
export function triggerCollisions(commands) {
  const owners = new Map(); // normalized trigger -> { trigger, commandIds }
  for (const command of commands ?? []) {
    for (const trigger of command.triggers ?? []) {
      const key = normalizeTrigger(trigger);
      if (!key) continue;
      const entry = owners.get(key) ?? { trigger: String(trigger).trim(), commandIds: [] };
      if (!entry.commandIds.includes(command.id)) entry.commandIds.push(command.id);
      owners.set(key, entry);
    }
  }
  return [...owners.values()].filter(entry => entry.commandIds.length > 1);
}

/**
 * How a stored reply tells the admin that a command answered, or null when a model did: "comando «Erogato»,
 * senza AI". Reads `model: 'comando'` with the name in `command`, and the first version's `comando-<id>`.
 */
export function commandReplyLabel(message) {
  const model = message?.model;
  if (typeof model !== 'string') return null;
  const legacy = model.startsWith(LEGACY_COMMAND_MODEL_PREFIX);
  if (model !== COMMAND_MODEL && !legacy) return null;
  const name = message.command || (legacy ? model.slice(LEGACY_COMMAND_MODEL_PREFIX.length) : '');
  return name ? `comando «${name}», senza AI` : 'comando, senza AI';
}
