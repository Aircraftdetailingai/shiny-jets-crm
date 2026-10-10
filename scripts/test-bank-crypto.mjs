/**
 * ACH values encrypt at rest and mask in the UI.
 * Run: node --import ./scripts/test-support/register.mjs scripts/test-bank-crypto.mjs
 */
import {
  bankEncryptionConfigured,
  decryptAchFields,
  decryptBankValue,
  encryptBankValue,
  isEncryptedBankValue,
  maskBankValue,
} from '../lib/bank-crypto.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

const previous = process.env.BANK_DATA_ENCRYPTION_KEY;
delete process.env.BANK_DATA_ENCRYPTION_KEY;
check('missing key is detected', bankEncryptionConfigured() === false);
check('legacy plaintext still decrypts without a key', decryptBankValue('021000021') === '021000021');
let threw = false;
try { encryptBankValue('021000021'); } catch (err) { threw = err.code === 'BANK_KEY_MISSING'; }
check('encrypt refuses to write plaintext when the key is missing', threw);

process.env.BANK_DATA_ENCRYPTION_KEY = 'unit-test-bank-key';
const cipher = encryptBankValue('021000021');
check('ciphertext uses the enc1 prefix', isEncryptedBankValue(cipher));
check('round trip restores the routing number', decryptBankValue(cipher) === '021000021');
check('a second encrypt is not deterministic', encryptBankValue('021000021') !== cipher);
const row = decryptAchFields({ ach_routing_number: cipher, ach_account_number: '123456789', name: 'Shop' });
check('decrypt leaves a plaintext account readable', row.ach_account_number === '123456789' && row.name === 'Shop');
check('mask keeps the last four digits', maskBankValue('021000021') === '••••0021');
check('mask of empty is empty', maskBankValue('') === '');

if (previous == null) delete process.env.BANK_DATA_ENCRYPTION_KEY;
else process.env.BANK_DATA_ENCRYPTION_KEY = previous;

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
