// Decode HTML entities that leak into product / equipment titles scraped
// from retailer pages (Amazon og:title is full of &amp; &#39; &quot; …).
// Safe to run on already-decoded text and on the server or the client.

const NAMED = {
  amp: '&', lt: '<', gt: '>', quot: '"', apos: "'", nbsp: ' ',
  ndash: '–', mdash: '—', hellip: '…', trade: '™', reg: '®', copy: '©',
  lsquo: '‘', rsquo: '’', ldquo: '“', rdquo: '”', deg: '°', times: '×',
  frac12: '½', frac14: '¼', frac34: '¾', middot: '·', bull: '•', prime: '′', Prime: '″',
};

export function decodeHtmlEntities(input) {
  if (input == null) return input;
  let s = String(input);
  if (!s.includes('&')) return s;
  // Up to 3 passes handles double-encoded text like "&amp;amp;".
  for (let i = 0; i < 3 && /&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/i.test(s); i += 1) {
    s = s.replace(/&(#\d+|#x[0-9a-f]+|[a-z][a-z0-9]*);/gi, (m, code) => {
      if (code[0] === '#') {
        const n = code[1].toLowerCase() === 'x' ? parseInt(code.slice(2), 16) : parseInt(code.slice(1), 10);
        if (!Number.isFinite(n) || n <= 0 || n > 0x10ffff) return m;
        try { return String.fromCodePoint(n); } catch { return m; }
      }
      return Object.prototype.hasOwnProperty.call(NAMED, code) ? NAMED[code] : (NAMED[code.toLowerCase()] ?? m);
    });
  }
  return s.replace(/\u00a0/g, ' ');
}

/**
 * Short, readable product name for list views. Long retailer titles
 * ("Brand Model 20V Cordless Polisher, 5 Inch, Variable Speed, with …")
 * are cut at the first natural separator after a reasonable length, then
 * hard-truncated on a word boundary. The full title should be shown on
 * hover (title attribute) and in the detail / edit view.
 */
export function shortProductName(input, max = 60) {
  const full = (decodeHtmlEntities(input) || '').replace(/\s+/g, ' ').trim();
  if (full.length <= max) return full;
  // Cut at the first separator (comma, pipe, " - ", "(", "–") that leaves
  // at least ~18 characters of name.
  const sepRe = /\s*(?:,|\||\s[-–—]\s|\(|;)\s*/g;
  let m;
  while ((m = sepRe.exec(full)) !== null) {
    if (m.index >= 18 && m.index <= max) return full.slice(0, m.index).trim();
    if (m.index > max) break;
  }
  const cut = full.slice(0, max);
  const lastSpace = cut.lastIndexOf(' ');
  return `${(lastSpace > max * 0.6 ? cut.slice(0, lastSpace) : cut).replace(/[\s,;:|–—-]+$/, '')}…`;
}
