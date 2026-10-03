// Pull question/answer pairs out of one web page's HTML (server only).
// Order of preference:
//   1. schema.org FAQPage JSON-LD (the page's own structured FAQ data)
//   2. <details><summary>
//   3. accordions (aria-controls panels, common FAQ/accordion class names
//      from Elementor, Squarespace, Divi, Bootstrap, Wix, Shopify themes…)
//   4. headings / bold lines ending in "?" followed by paragraphs, <dl>
//   5. "Q: … A: …" plain text
// Nothing here writes or rewords answers; text is copied from the page.
import { parse } from 'node-html-parser';
import { finalizePairs, extractQaText, MAX_PAIRS_PER_PAGE } from './faq-import.js';

const MAX_TEXT_FOR_AI = 24000;

function textOf(node) {
  if (!node) return '';
  if (node.nodeType === 3) return node.text || '';
  return node.structuredText || node.text || '';
}
function htmlToText(s) {
  const str = String(s || '');
  if (!/[<&]/.test(str)) return str;
  return textOf(parse(`<div>${str}</div>`));
}
function looksLikeQuestion(s) {
  const t = String(s || '').replace(/\s+/g, ' ').trim();
  return t.length >= 6 && t.length <= 300 && /\?\s*[+−–-]?\s*$/.test(t);
}
const FAQ_CONTEXT = /faq|frequently|question|accordion|toggle|collaps/i;
function inFaqContext(el, depth = 8) {
  let n = el;
  for (let i = 0; n && i < depth; i++, n = n.parentNode) {
    const attrs = n.attributes ? `${n.getAttribute?.('class') || ''} ${n.getAttribute?.('id') || ''}` : '';
    if (/faq|frequently/i.test(attrs)) return true;
  }
  return false;
}

// ── 1. JSON-LD ────────────────────────────────────────────────────────────
function typesOf(o) { return [].concat(o?.['@type'] || []).map((t) => String(t).replace(/^.*[/#]/, '')); }
function answerText(a) {
  const one = Array.isArray(a) ? a[0] : a;
  if (!one) return '';
  if (typeof one === 'string') return one;
  return one.text || one.description || one.name || '';
}
export function extractJsonLd(root) {
  const out = [];
  const visit = (o, depth) => {
    if (!o || depth > 10 || out.length > MAX_PAIRS_PER_PAGE * 2) return;
    if (Array.isArray(o)) { o.forEach((x) => visit(x, depth + 1)); return; }
    if (typeof o !== 'object') return;
    const types = typesOf(o);
    if (types.includes('Question')) {
      const q = o.name || o.text;
      const a = answerText(o.acceptedAnswer) || answerText(o.suggestedAnswer);
      if (q && a) out.push({ question: htmlToText(q), answer: htmlToText(a) });
      return;
    }
    for (const [k, v] of Object.entries(o)) if (k !== '@context' && v && typeof v === 'object') visit(v, depth + 1);
  };
  for (const s of root.querySelectorAll('script')) {
    if (!/ld\+json/i.test(s.getAttribute('type') || '')) continue;
    const raw = (s.rawText || s.text || '').trim().replace(/^<!--|-->$/g, '');
    try { visit(JSON.parse(raw), 0); } catch {
      // Some sites put several objects or trailing commas in one block.
      try { visit(JSON.parse(raw.replace(/,\s*([}\]])/g, '$1')), 0); } catch {}
    }
  }
  return out;
}

// ── 2. <details><summary> ─────────────────────────────────────────────────
function extractDetails(root) {
  const out = [];
  for (const d of root.querySelectorAll('details')) {
    const sum = d.querySelector('summary');
    if (!sum) continue;
    const answer = d.childNodes.filter((c) => c !== sum).map(textOf).join('\n');
    out.push({ question: textOf(sum), answer });
  }
  return out;
}

// ── 3. Accordions ─────────────────────────────────────────────────────────
const Q_CLASS = /(^|[\s_-])(question|faq[-_]?(q|question|title|header|heading|toggle|trigger)|accordion[-_]*(title|header|heading|button|trigger|toggle|label)|toggle[-_]*title|tab[-_]title|collapsible[-_]*(trigger|title|heading)|panel[-_](heading|title)|et_pb_toggle_title|elementor-tab-title|e-n-accordion-item-title)([\s_-]|$)/i;
const A_CLASS = /(^|[\s_-])(answer|faq[-_]?(a|answer|body|content|text|panel)|accordion[-_]*(body|content|panel|description|collapse|inner)|toggle[-_]*content|tab[-_]content|collapsible[-_]*(content|panel|body)|et_pb_toggle_content|elementor-tab-content|panel|collapse)([\s_-]|$)/i;
const cls = (el) => (el?.getAttribute?.('class') || '');

function nextElement(el) {
  let n = el?.nextElementSibling;
  return n || null;
}
function extractAccordions(root) {
  const out = [];
  const byId = new Map();
  for (const el of root.querySelectorAll('[id]')) byId.set(el.getAttribute('id'), el);
  // aria-controls -> panel
  for (const trig of root.querySelectorAll('[aria-controls]')) {
    const ids = String(trig.getAttribute('aria-controls') || '').split(/\s+/);
    const panel = ids.map((id) => byId.get(id)).find(Boolean);
    if (!panel || panel === trig) continue;
    const q = textOf(trig);
    if (!(looksLikeQuestion(q) || (inFaqContext(trig) && q.length <= 200))) continue;
    out.push({ question: q, answer: textOf(panel) });
  }
  // class-name pairs
  for (const el of root.querySelectorAll('*')) {
    const c = cls(el);
    if (!c || !Q_CLASS.test(c) || A_CLASS.test(c) && !Q_CLASS.test(c)) continue;
    const q = textOf(el);
    if (!(looksLikeQuestion(q) || (inFaqContext(el) && q.length >= 6 && q.length <= 200))) continue;
    let ans = null;
    for (let n = nextElement(el), i = 0; n && i < 3; n = nextElement(n), i++) { if (A_CLASS.test(cls(n))) { ans = n; break; } }
    if (!ans) {
      const p = el.parentNode;
      for (let n = nextElement(p), i = 0; n && i < 2; n = nextElement(n), i++) { if (A_CLASS.test(cls(n))) { ans = n; break; } }
    }
    if (!ans) {
      const item = el.parentNode;
      const cand = item?.querySelectorAll ? item.querySelectorAll('*').find((x) => x !== el && A_CLASS.test(cls(x)) && !Q_CLASS.test(cls(x)) && !x.querySelectorAll('*').includes(el)) : null;
      if (cand) ans = cand;
    }
    if (ans) out.push({ question: q, answer: textOf(ans) });
  }
  return out;
}

// ── 4. Headings / bold questions followed by paragraphs, <dl> ────────────
const HEADING = /^h[1-6]$/i;
function isQuestionLine(el) {
  const tag = (el.rawTagName || '').toLowerCase();
  if (HEADING.test(tag) || tag === 'dt') return looksLikeQuestion(textOf(el));
  if (tag === 'p' || tag === 'div') {
    const kids = el.childNodes.filter((c) => !(c.nodeType === 3 && !c.text.trim()));
    if (kids.length === 1 && kids[0].nodeType === 1 && /^(strong|b|em)$/i.test(kids[0].rawTagName || '')) return looksLikeQuestion(textOf(el));
  }
  return false;
}
function startsWithBoldQuestion(el) {
  const first = el.childNodes?.find((c) => !(c.nodeType === 3 && !c.text.trim()));
  return !!first && first.nodeType === 1 && /^(strong|b)$/i.test(first.rawTagName || '') && looksLikeQuestion(textOf(first));
}
function extractHeadings(root) {
  const out = [];
  const candidates = root.querySelectorAll('h2, h3, h4, h5, h6, p, div, dt');
  for (const el of candidates) {
    const tag = (el.rawTagName || '').toLowerCase();
    if (tag === 'div' && el.querySelector('div, p, h2, h3, h4, h5, h6')) continue;
    // Inline: <p><strong>Question?</strong> Answer…</p>
    if (tag === 'p') {
      const first = el.childNodes.find((c) => !(c.nodeType === 3 && !c.text.trim()));
      if (first && first.nodeType === 1 && /^(strong|b)$/i.test(first.rawTagName || '') && looksLikeQuestion(textOf(first))) {
        const rest = el.childNodes.slice(el.childNodes.indexOf(first) + 1).map(textOf).join(' ').trim();
        if (rest.length > 1) { out.push({ question: textOf(first), answer: rest }); continue; }
      }
    }
    if (!isQuestionLine(el)) continue;
    if (tag === 'dt') {
      const dd = nextElement(el);
      if (dd && (dd.rawTagName || '').toLowerCase() === 'dd') out.push({ question: textOf(el), answer: textOf(dd) });
      continue;
    }
    let start = el;
    if (!nextElement(el) && el.parentNode && el.parentNode.childNodes.filter((c) => c.nodeType === 1).length === 1) start = el.parentNode;
    const parts = [];
    for (let n = nextElement(start), i = 0; n && i < 8; n = nextElement(n), i++) {
      const t = (n.rawTagName || '').toLowerCase();
      if (HEADING.test(t) || isQuestionLine(n) || startsWithBoldQuestion(n) || (n.querySelector && n.querySelector('h1, h2, h3, h4, h5, h6'))) break;
      if (/^(script|style|form|button|nav|img|svg)$/.test(t)) continue;
      const txt = textOf(n).trim();
      if (txt) parts.push(txt);
      if (parts.join('\n').length > 1500) break;
    }
    if (parts.length) out.push({ question: textOf(el), answer: parts.join('\n') });
  }
  return out;
}

function stripNoise(root) {
  for (const el of root.querySelectorAll('script, style, noscript, template, svg, iframe, nav, [role="navigation"]')) {
    if (el.rawTagName?.toLowerCase() === 'script') continue; // removed separately after JSON-LD
    el.remove();
  }
  for (const el of root.querySelectorAll('script')) el.remove();
}

// Main entry. Returns { pairs, method, text, title }.
export function extractFaqsFromHtml(html) {
  const root = parse(String(html || ''), { comment: false, blockTextElements: { script: true, style: true, noscript: true, pre: true } });
  const title = (root.querySelector('title')?.text || '').trim().slice(0, 200);
  const ld = finalizePairs(extractJsonLd(root));
  if (ld.length) return { pairs: ld, method: 'jsonld', text: '', title };
  stripNoise(root);
  const body = root.querySelector('main') || root.querySelector('body') || root;
  const steps = [['details', extractDetails], ['accordion', extractAccordions], ['headings', extractHeadings]];
  for (const [method, fn] of steps) {
    let pairs = [];
    try { pairs = finalizePairs(fn(body)); } catch (e) { pairs = []; }
    if (pairs.length >= 2 || (pairs.length === 1 && method !== 'headings')) {
      return { pairs, method, text: '', title };
    }
  }
  const text = textOf(body).replace(/[ \t]+/g, ' ').replace(/\n{3,}/g, '\n\n').trim();
  const qa = finalizePairs(extractQaText(text));
  if (qa.length) return { pairs: qa, method: 'text', text: '', title };
  const head = finalizePairs(extractHeadings(body));
  if (head.length) return { pairs: head, method: 'headings', text: '', title };
  return { pairs: [], method: '', text: text.slice(0, MAX_TEXT_FOR_AI), title };
}
