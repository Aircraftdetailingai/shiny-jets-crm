import assert from 'node:assert/strict';
import { requestIdentifier, publicRequestUrl, embedCode, stickyQuoteButtonSnippet } from '../lib/share-snippets.js';
let n = 0; const t = (name, fn) => { fn(); n++; };
const d = { id: '11111111-2222-3333-4444-555555555555', slug: 'shiny-jets', company: 'Shiny Jets' };
t('slug preferred', () => assert.equal(requestIdentifier(d), 'shiny-jets'));
t('id fallback', () => assert.equal(requestIdentifier({ id: 'abc', slug: '' }), 'abc'));
t('bad slug ignored', () => assert.equal(requestIdentifier({ id: 'abc', slug: 'a b"<' }), 'abc'));
t('nothing -> null', () => { assert.equal(requestIdentifier(null), null); assert.equal(publicRequestUrl('https://x.com', {}), null); });
t('url', () => assert.equal(publicRequestUrl('https://crm.shinyjets.com/', d), 'https://crm.shinyjets.com/request/shiny-jets'));
t('bad base -> default', () => assert.equal(publicRequestUrl('javascript:alert(1)', d), 'https://crm.shinyjets.com/request/shiny-jets'));
t('embed has title + embed=1', () => {
  const e = embedCode('https://crm.shinyjets.com', d);
  assert.match(e, /src="https:\/\/crm\.shinyjets\.com\/request\/shiny-jets\?embed=1"/);
  assert.match(e, /title="Request a quote from Shiny Jets"/);
});
t('embed escapes company', () => assert.match(embedCode('https://a.com', { ...d, company: 'A "B" <C>' }), /title="Request a quote from A &quot;B&quot; &lt;C&gt;"/));
t('sticky button links to form', () => {
  const s = stickyQuoteButtonSnippet('https://crm.shinyjets.com', d);
  assert.match(s, /<a class="sj-quote-btn" href="https:\/\/crm\.shinyjets\.com\/request\/shiny-jets">/);
  assert.match(s, /<span>Request a Quote<\/span>/);
  assert.match(s, /right:max\(16px/);
  assert.match(s, /focus-visible/);
  assert.match(s, /min-height:48px/);
  assert.doesNotMatch(s, /<script/i);
  assert.doesNotMatch(s, /chat/i);
});
t('sticky left', () => assert.match(stickyQuoteButtonSnippet('https://a.com', d, { position: 'left' }), /left:max\(16px,env\(safe-area-inset-left\)\)/));
t('sticky label escaped', () => assert.match(stickyQuoteButtonSnippet('https://a.com', d, { label: '<b>Hi</b>' }), /<span>&lt;b&gt;Hi&lt;\/b&gt;<\/span>/));
console.log(`share-snippets: ${n} checks passed`);
