// App-level encryption for ACH routing and account numbers.
//
// Ciphertext is stored in the existing detailers columns with an enc1: prefix
// so a row written before this change (plaintext digits) can still be read.
// The next authenticated read rewrites plaintext to ciphertext. That rewrite
// is the migration for existing rows; SQL cannot do it because the key never
// lives in the database.
//
// Required env: BANK_DATA_ENCRYPTION_KEY
//   32-byte key as 64 hex characters, or standard base64, or any other
//   secret string (hashed with SHA-256 to 32 bytes). Set it on the server
//   only. Never expose it as NEXT_PUBLIC_*.

import { createCipheriv, createDecipheriv, createHash, randomBytes } from 'crypto';

export const BANK_CIPHER_PREFIX = 'enc1:';

export function bankEncryptionKey() {
  const raw = String(process.env.BANK_DATA_ENCRYPTION_KEY || '').trim();
  if (!raw) return null;
  if (/^[0-9a-fA-F]{64}$/.test(raw)) return Buffer.from(raw, 'hex');
  try {
    const decoded = Buffer.from(raw, 'base64');
    if (decoded.length === 32) return decoded;
  } catch {
    // Fall through to the passphrase hash.
  }
  return createHash('sha256').update(raw).digest();
}

export function bankEncryptionConfigured() {
  return bankEncryptionKey() !== null;
}

export function isEncryptedBankValue(value) {
  return typeof value === 'string' && value.startsWith(BANK_CIPHER_PREFIX);
}

export function encryptBankValue(plain) {
  if (plain == null || plain === '') return null;
  const key = bankEncryptionKey();
  if (!key) {
    const err = new Error('BANK_DATA_ENCRYPTION_KEY is not set');
    err.code = 'BANK_KEY_MISSING';
    throw err;
  }
  const iv = randomBytes(12);
  const cipher = createCipheriv('aes-256-gcm', key, iv);
  const ciphertext = Buffer.concat([cipher.update(String(plain), 'utf8'), cipher.final()]);
  const tag = cipher.getAuthTag();
  return `${BANK_CIPHER_PREFIX}${iv.toString('base64url')}.${tag.toString('base64url')}.${ciphertext.toString('base64url')}`;
}

export function decryptBankValue(value) {
  if (value == null || value === '') return null;
  if (!isEncryptedBankValue(value)) return String(value);
  const key = bankEncryptionKey();
  if (!key) return null;
  const body = value.slice(BANK_CIPHER_PREFIX.length);
  const [ivPart, tagPart, dataPart] = body.split('.');
  if (!ivPart || !tagPart || !dataPart) return null;
  const decipher = createDecipheriv('aes-256-gcm', key, Buffer.from(ivPart, 'base64url'));
  decipher.setAuthTag(Buffer.from(tagPart, 'base64url'));
  const plain = Buffer.concat([
    decipher.update(Buffer.from(dataPart, 'base64url')),
    decipher.final(),
  ]);
  return plain.toString('utf8');
}

export function maskBankValue(value) {
  const digits = String(value || '').replace(/\D/g, '');
  if (!digits) return '';
  return `••••${digits.slice(-4)}`;
}

export function decryptAchFields(row) {
  if (!row) return row;
  return {
    ...row,
    ach_routing_number: decryptBankValue(row.ach_routing_number),
    ach_account_number: decryptBankValue(row.ach_account_number),
  };
}

// Rewrite leftover plaintext into ciphertext. No-op when the key is unset
// or the values are already encrypted, so a deploy never blanks a row.
export async function migratePlaintextAch(supabase, detailerId, row) {
  if (!supabase || !detailerId || !row || !bankEncryptionConfigured()) return row;
  const updates = {};
  for (const column of ['ach_routing_number', 'ach_account_number']) {
    const value = row[column];
    if (value && !isEncryptedBankValue(value)) updates[column] = encryptBankValue(value);
  }
  if (Object.keys(updates).length === 0) return decryptAchFields(row);
  const { error } = await supabase.from('detailers').update(updates).eq('id', detailerId);
  if (error) {
    console.error('[bank-crypto] plaintext migration failed:', error.message);
    return decryptAchFields(row);
  }
  return decryptAchFields({ ...row, ...updates });
}
