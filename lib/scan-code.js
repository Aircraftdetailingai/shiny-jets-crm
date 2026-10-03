// Helpers for the product scanner (components/BarcodeScanner.jsx).
//
// The scanner reads regular 1D barcodes (UPC-A/E, EAN-8/13, Code 128,
// Code 39, ITF) and 2D codes (QR, Data Matrix). A scan can carry three
// kinds of payload, and the lookup uses a different strategy for each:
//   - 'gtin': a numeric UPC/EAN/GTIN (8-14 digits). Looked up in inventory,
//     then enriched through /api/products/barcode.
//   - 'url':  an http(s) link, usually a QR code pointing at the product page.
//     Looked up in inventory, then the page is scraped like a pasted
//     product link. GS1 Digital Link URLs (…/01/<GTIN>…) are treated as a
//     GTIN, because that is what they encode.
//   - 'text': anything else (alphanumeric Code 128 / Code 39 SKUs, plain-text
//     QR codes). Looked up in inventory by exact value.

// Formats requested from the native BarcodeDetector (Chrome/Android, Edge,
// macOS Safari). Unsupported ones are filtered out at runtime.
export const NATIVE_SCAN_FORMATS = [
  'qr_code', 'ean_13', 'ean_8', 'upc_a', 'upc_e',
  'code_128', 'code_39', 'itf', 'data_matrix',
];

// The zxing BarcodeFormat keys for the same set (fallback decoder).
export const ZXING_SCAN_FORMATS = [
  'QR_CODE', 'EAN_13', 'EAN_8', 'UPC_A', 'UPC_E',
  'CODE_128', 'CODE_39', 'ITF', 'DATA_MATRIX',
];

const ONE_D = new Set(['ean_13', 'ean_8', 'upc_a', 'upc_e', 'code_128', 'code_39', 'itf']);
const TWO_D = new Set(['qr_code', 'data_matrix']);

// Native detector needs at least QR plus one retail barcode format to be
// worth using; otherwise fall back to zxing which reads all of them.
export function nativeFormatsUsable(supported) {
  const list = Array.isArray(supported) ? supported : [];
  const formats = NATIVE_SCAN_FORMATS.filter((f) => list.includes(f));
  const hasQr = formats.some((f) => TWO_D.has(f));
  const hasRetail = formats.some((f) => ONE_D.has(f));
  return hasQr && hasRetail ? formats : null;
}

// 'qr_code' / 'QR_CODE' / 'qr code' -> 'QR_CODE' (the label stored as barcodeType).
export function normalizeScanFormat(format) {
  return String(format || '').trim().replace(/[\s-]+/g, '_').toUpperCase();
}

const GTIN_RE = /^\d{8}$|^\d{12,14}$/;

function gtinVariants(gtin) {
  // Inventory may hold the same item as UPC-A (12), EAN-13 (13) or GTIN-14.
  const out = [gtin];
  let g = gtin;
  while (g.length > 12 && g.startsWith('0')) {
    g = g.slice(1);
    out.push(g);
  }
  if (gtin.length === 12) out.push('0' + gtin);
  return [...new Set(out)];
}

function parseHttpUrl(text) {
  if (!/^https?:\/\//i.test(text)) return null;
  try {
    const u = new URL(text);
    if (u.protocol !== 'http:' && u.protocol !== 'https:') return null;
    if (u.username || u.password) return null;
    if (!u.hostname.includes('.')) return null;
    return u;
  } catch {
    return null;
  }
}

// GS1 Digital Link: https://<any host>/…/01/<GTIN-8/12/13/14>[/…]
function gs1DigitalLinkGtin(u) {
  const m = u.pathname.match(/(?:^|\/)01\/(\d{8,14})(?:\/|$)/);
  if (!m || !GTIN_RE.test(m[1])) return null;
  return m[1];
}

// Classify a raw scan / manual entry.
// Returns null for empty input, otherwise
//   { code, kind: 'gtin'|'url'|'text', gtin?, url?, lookupCodes: string[] }
// `code` is what gets stored on the product (the raw value, so the next scan
// of the same label matches exactly). `lookupCodes` are tried in order
// against the detailer's inventory.
export function classifyScan(raw) {
  const text = String(raw ?? '').replace(/[\u0000-\u001f\u007f]/g, '').trim();
  if (!text) return null;

  // Numeric codes typed with spaces/dashes ("0 12345 67890 5").
  const digitsOnly = text.replace(/[\s-]/g, '');
  if (/^\d+$/.test(digitsOnly) && GTIN_RE.test(digitsOnly)) {
    return { code: digitsOnly, kind: 'gtin', gtin: digitsOnly, lookupCodes: gtinVariants(digitsOnly) };
  }

  const u = parseHttpUrl(text);
  if (u) {
    const gtin = gs1DigitalLinkGtin(u);
    if (gtin) {
      return { code: text, kind: 'gtin', gtin, url: u.href, lookupCodes: [text, ...gtinVariants(gtin)] };
    }
    return { code: text, kind: 'url', url: u.href, lookupCodes: [...new Set([text, u.href])] };
  }

  return { code: text, kind: 'text', lookupCodes: [text] };
}

// Manual-entry validation: any GTIN, URL, or alphanumeric code of 3+ chars.
export function isValidManualCode(raw) {
  const c = classifyScan(raw);
  if (!c) return false;
  if (c.kind !== 'text') return true;
  return c.code.length >= 3;
}
