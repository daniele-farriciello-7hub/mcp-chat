/**
 * Fills the development app (`apps/assistente-7hub-development`) with what it needs to work, copied
 * from production (`apps/assistente-7hub`). Run again whenever development should catch up.
 *
 *   cd functions && node scripts/seed-development.mjs            # shows what it would copy
 *   cd functions && node scripts/seed-development.mjs --write    # copies
 *
 * Copied: the settings, the database connections with their tables and encrypted passwords (same
 * DB_CRED_KEY). NOT copied: documents (their files live in production's Storage folder, so deleting
 * one in development would delete the real file) and conversation history (personal data). Never
 * writes under production's path.
 *
 * Who may use the development app is decided in userconf, like for any app of the suite: give
 * testers the permission `assistente-7hub-development` (with isAdmin for who configures it).
 *
 * Uses Application Default Credentials (gcloud auth application-default login).
 */
import { initializeApp, applicationDefault } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

const FROM = 'apps/assistente-7hub';
const TO = 'apps/assistente-7hub-development';
const write = process.argv.includes('--write');

initializeApp({ credential: applicationDefault(), projectId: 'mappa-contatti-217007' });
const db = getFirestore();

let count = 0;
let batch = db.batch();
let pending = 0;

async function put(path, data) {
  count++;
  if (!write) return;
  batch.set(db.doc(path), data);
  if (++pending === 400) {
    await batch.commit();
    batch = db.batch();
    pending = 0;
  }
}

/** Every document under a collection, subcollections included, re-rooted from FROM to TO. */
async function copyTree(collectionPath) {
  const snapshot = await db.collection(collectionPath).get();
  for (const doc of snapshot.docs) {
    await put(TO + doc.ref.path.slice(FROM.length), doc.data());
    for (const sub of await doc.ref.listCollections()) await copyTree(sub.path);
  }
  console.log(`${collectionPath}: ${snapshot.size}`);
}

for (const collection of ['config', 'dbConnections', 'dbSecrets']) await copyTree(`${FROM}/${collection}`);

if (write && pending) await batch.commit();
console.log(
  write
    ? `Copied ${count} documents into ${TO}.`
    : `${count} documents would be copied into ${TO}. Run with --write.`
);
process.exit(0);
