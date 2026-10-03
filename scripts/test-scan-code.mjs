import assert from 'node:assert/strict';
import { classifyScan, isValidManualCode, normalizeScanFormat, nativeFormatsUsable } from '../lib/scan-code.js';

let n = 0;
const t = (name, fn) => { fn(); n++; };

t('UPC-A', () => {
  const c = classifyScan('012345678905');
  assert.equal(c.kind, 'gtin'); assert.equal(c.gtin, '012345678905');
  assert.deepEqual(c.lookupCodes, ['012345678905', '0012345678905']);
});
t('EAN-13 with leading 0 also tries UPC-A', () => {
  assert.deepEqual(classifyScan('0012345678905').lookupCodes, ['0012345678905', '012345678905']);
});
t('EAN-8', () => assert.equal(classifyScan('96385074').kind, 'gtin'));
t('spaced digits', () => assert.equal(classifyScan(' 0 12345 67890 5 ').code, '012345678905'));
t('short digits are text', () => assert.equal(classifyScan('12345').kind, 'text'));
t('Code128 alphanumeric SKU', () => {
  const c = classifyScan('MG-G17216');
  assert.equal(c.kind, 'text'); assert.deepEqual(c.lookupCodes, ['MG-G17216']);
});
t('QR product URL', () => {
  const c = classifyScan('https://www.meguiars.com/products/m105');
  assert.equal(c.kind, 'url'); assert.equal(c.url, 'https://www.meguiars.com/products/m105');
  assert.equal(c.code, 'https://www.meguiars.com/products/m105');
});
t('GS1 digital link -> GTIN', () => {
  const c = classifyScan('https://id.gs1.org/01/00012345678905/10/ABC');
  assert.equal(c.kind, 'gtin'); assert.equal(c.gtin, '00012345678905');
  assert.ok(c.lookupCodes.includes('012345678905'));
  assert.equal(c.lookupCodes[0], 'https://id.gs1.org/01/00012345678905/10/ABC');
});
t('javascript: is text, never url', () => assert.equal(classifyScan('javascript:alert(1)').kind, 'text'));
t('credentials url is text', () => assert.equal(classifyScan('https://a:b@x.com/').kind, 'text'));
t('plain QR text', () => assert.equal(classifyScan('Ceramic Pro 9H lot 42').kind, 'text'));
t('control chars stripped', () => assert.equal(classifyScan('\u001d012345678905\n').code, '012345678905'));
t('empty', () => { assert.equal(classifyScan(''), null); assert.equal(classifyScan(null), null); });
t('manual validation', () => {
  assert.ok(isValidManualCode('012345678905'));
  assert.ok(isValidManualCode('ABC123'));
  assert.ok(isValidManualCode('https://x.com/p'));
  assert.ok(!isValidManualCode('ab'));
  assert.ok(!isValidManualCode('   '));
});
t('format names', () => {
  assert.equal(normalizeScanFormat('qr_code'), 'QR_CODE');
  assert.equal(normalizeScanFormat('ean_13'), 'EAN_13');
  assert.equal(normalizeScanFormat(''), '');
});
t('native formats need QR + a retail format', () => {
  assert.deepEqual(nativeFormatsUsable(['qr_code', 'ean_13', 'aztec']), ['qr_code', 'ean_13']);
  assert.equal(nativeFormatsUsable(['qr_code']), null);
  assert.equal(nativeFormatsUsable(['ean_13', 'upc_a']), null);
  assert.equal(nativeFormatsUsable(undefined), null);
});

console.log(`scan-code: ${n} checks passed`);
