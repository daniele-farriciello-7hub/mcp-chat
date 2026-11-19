/**
 * Tests what the server keeps of an operator's personal shortcut (`saveShortcuts` in
 * src/shortcuts/personalShortcuts.js): the optional `command`, the id of a command without AI that runs
 * instead of asking the model. The server cannot know which commands exist (they live in the settings and
 * the admin changes them), so it checks the shape of the id only, since the field arrives from the browser.
 * Firestore is faked. Run: npm test (module mocks, see the script).
 */
import assert from 'node:assert/strict';
import { beforeEach, mock, test } from 'node:test';

const src = file => new URL(`../src/${file}`, import.meta.url).href;
const real = await import('firebase-admin/firestore');

const world = {};
const reset = () => Object.assign(world, { stored: null });
reset();

const docRef = path => ({
  get: async () => ({
    exists: path.endsWith('/private/shortcuts') && Boolean(world.stored),
    data: () => ({ items: world.stored || [], personalShortcutsLimit: 0 })
  }),
  set: async data => {
    world.stored = data.items;
  }
});
mock.module('firebase-admin/firestore', {
  namedExports: {
    FieldValue: real.FieldValue,
    Timestamp: real.Timestamp,
    getFirestore: () => ({ doc: docRef })
  }
});

const { ShortcutsError, saveShortcuts } = await import(src('shortcuts/personalShortcuts.js'));

const USER = { uid: 'u1' };
const save = shortcuts => saveShortcuts(USER, { shortcuts });

beforeEach(reset);

test('a shortcut keeps its command id, and its question stays as the text for the model', async () => {
  const { shortcuts } = await save([
    {
      icon: 'calculator',
      title: 'Erogato',
      description: 'Il mese e l’anno',
      prompt: 'erogato',
      command: 'cmd-3fa9c1b2'
    }
  ]);

  assert.deepEqual(shortcuts, [
    {
      icon: 'calculator',
      title: 'Erogato',
      description: 'Il mese e l’anno',
      prompt: 'erogato',
      command: 'cmd-3fa9c1b2'
    }
  ]);
  assert.deepEqual(world.stored, shortcuts);
});

test('the fixed id of the migrated erogato command is an id like any other', async () => {
  const { shortcuts } = await save([{ title: 'Erogato', prompt: 'erogato', command: 'erogato' }]);
  assert.equal(shortcuts[0].command, 'erogato');
});

test('a command shortcut needs no question of its own', async () => {
  const { shortcuts } = await save([{ title: 'Erogato', prompt: '', command: 'erogato' }]);
  assert.equal(shortcuts[0].prompt, 'erogato');
  assert.equal(shortcuts[0].command, 'erogato');
});

test('any id of the safe charset is kept, whether or not such a command exists', async () => {
  const ids = ['x', 'A_b-9', 'cmd-deleted1', 'a'.repeat(64)];
  const { shortcuts } = await save(ids.map(command => ({ title: 'T', prompt: 'una domanda', command })));
  assert.deepEqual(
    shortcuts.map(shortcut => shortcut.command),
    ids
  );
});

test('a command that is not a safe id is dropped, and a plain shortcut has no command field', async () => {
  const { shortcuts } = await save([
    { title: 'A', prompt: 'una domanda', command: 'rm -rf' },
    { title: 'B', prompt: 'un’altra', command: '' },
    { title: 'C', prompt: 'ancora' },
    { title: 'D', prompt: 'path', command: '../dbSecrets/c1' },
    { title: 'E', prompt: 'lungo', command: 'a'.repeat(65) },
    { title: 'F', prompt: 'non stringa', command: { $ne: '' } },
    { title: 'G', prompt: 'numero', command: 5 },
    { title: 'H', prompt: 'accento', command: 'comàndo' }
  ]);

  for (const shortcut of shortcuts) assert.equal('command' in shortcut, false);
  // a command that is not valid does not stand in for the question either
  await assert.rejects(save([{ title: 'I', prompt: '', command: 'rm -rf' }]), ShortcutsError);
  await assert.rejects(save([{ title: 'J', prompt: '' }]), ShortcutsError);
});
