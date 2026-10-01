/**
 * Encrypts and decrypts the database passwords stored in `dbSecrets/{id}`. The Firestore config
 * document (`dbConnections/{id}`) is readable by every signed-in operator, so the password never
 * goes there — it lives in its own collection, ciphertext only, denied to clients by security rules
 * (managed outside this repo — see README "Release order").
 *
 * AES-256-GCM: the key comes from the function's own environment (`DB_CRED_KEY`, 32 raw bytes,
 * base64), never from Firestore. Losing or rotating that key makes every stored password
 * unreadable — `decrypt` fails loudly rather than falling back to anything.
 */
import { randomBytes, createCipheriv, createDecipheriv } from 'node:crypto';

const ALGORITHM = 'aes-256-gcm';
const KEY_BYTES = 32;

export class CredentialKeyError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'CredentialKeyError';
  }
}

function loadKey() {
  const raw = process.env.DB_CRED_KEY;
  if (!raw) {
    throw new CredentialKeyError('DB_CRED_KEY is not set: cannot encrypt or decrypt database credentials.');
  }
  const key = Buffer.from(raw, 'base64');
  if (key.length !== KEY_BYTES) {
    throw new CredentialKeyError(`DB_CRED_KEY must decode to ${KEY_BYTES} bytes, got ${key.length}.`);
  }
  return key;
}

/** @returns {{ciphertext: string, iv: string, authTag: string}} base64 fields, ready to store. */
export function encrypt(plainText) {
  const key = loadKey();
  const iv = randomBytes(12);
  const cipher = createCipheriv(ALGORITHM, key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plainText), 'utf8'), cipher.final()]);
  return {
    ciphertext: ciphertext.toString('base64'),
    iv: iv.toString('base64'),
    authTag: cipher.getAuthTag().toString('base64')
  };
}

/** Thrown when the stored ciphertext cannot be read back — a lost/rotated key, or tampering. */
export class DecryptionError extends Error {
  constructor(reason) {
    super(reason);
    this.name = 'DecryptionError';
  }
}

/** @param {{ciphertext: string, iv: string, authTag: string}} record */
export function decrypt(record) {
  if (!record?.ciphertext || !record?.iv || !record?.authTag) {
    throw new DecryptionError('no stored credentials for this connection.');
  }
  const key = loadKey();
  try {
    const decipher = createDecipheriv(ALGORITHM, key, Buffer.from(record.iv, 'base64'));
    decipher.setAuthTag(Buffer.from(record.authTag, 'base64'));
    const plain = Buffer.concat([
      decipher.update(Buffer.from(record.ciphertext, 'base64')),
      decipher.final()
    ]);
    return plain.toString('utf8');
  } catch {
    throw new DecryptionError('stored credentials could not be decrypted: the key may have changed.');
  }
}
