/**
 * lib/website-url.js — intake thank-you redirect target validation.
 * Run: node --import ./scripts/test-support/register.mjs scripts/test-website-url.mjs
 */
import { normalizeWebsiteUrl, websiteHomepage, intakeRedirectTarget, INTAKE_REDIRECT_SECONDS } from '../lib/website-url.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

console.log('normalizeWebsiteUrl');
check('adds https:// when scheme missing', normalizeWebsiteUrl('shinyjets.com') === 'https://shinyjets.com/');
check('keeps https', normalizeWebsiteUrl('https://www.shinyjets.com/about') === 'https://www.shinyjets.com/about');
check('keeps http', normalizeWebsiteUrl('http://shinyjets.com') === 'http://shinyjets.com/');
check('trims whitespace', normalizeWebsiteUrl('  www.shinyjets.com  ') === 'https://www.shinyjets.com/');
check('protocol-relative -> https', normalizeWebsiteUrl('//shinyjets.com') === 'https://shinyjets.com/');
check('uppercase scheme ok', normalizeWebsiteUrl('HTTPS://ShinyJets.com') === 'https://shinyjets.com/');
check('rejects javascript:', normalizeWebsiteUrl('javascript:alert(1)') === null);
check('rejects data:', normalizeWebsiteUrl('data:text/html,hi') === null);
check('rejects mailto:', normalizeWebsiteUrl('mailto:brett@shinyjets.com') === null);
check('rejects ftp:', normalizeWebsiteUrl('ftp://shinyjets.com') === null);
check('rejects "manual" sentinel', normalizeWebsiteUrl('manual') === null);
check('rejects empty / null', normalizeWebsiteUrl('') === null && normalizeWebsiteUrl(null) === null && normalizeWebsiteUrl(undefined) === null);
check('rejects host without dot', normalizeWebsiteUrl('localhost') === null && normalizeWebsiteUrl('https://intranet') === null);
check('rejects credentials', normalizeWebsiteUrl('https://user:pw@evil.example.com') === null);
check('rejects spaces inside', normalizeWebsiteUrl('shiny jets.com') === null);

console.log('websiteHomepage');
check('homepage = origin + /', websiteHomepage('https://www.shinyjets.com/services/detailing?x=1') === 'https://www.shinyjets.com/');
check('homepage from bare domain', websiteHomepage('shinyjets.com') === 'https://shinyjets.com/');
check('homepage null when invalid', websiteHomepage('javascript:alert(1)') === null);

console.log('intakeRedirectTarget');
const t = intakeRedirectTarget({ company: 'Shiny Jets', website_url: 'shinyjets.com' });
check('target with business name', t && t.href === 'https://shinyjets.com/' && t.label === 'Shiny Jets', JSON.stringify(t));
check('falls back to hostname label', intakeRedirectTarget({ website_url: 'https://www.shinyjets.com' })?.label === 'shinyjets.com');
check('no website -> no redirect', intakeRedirectTarget({ company: 'Shiny Jets', website_url: null }) === null);
check('invalid website -> no redirect', intakeRedirectTarget({ company: 'X', website_url: 'javascript:alert(1)' }) === null);
check('embedded form -> no redirect', intakeRedirectTarget({ company: 'Shiny Jets', website_url: 'shinyjets.com' }, { embedded: true }) === null);
check('no detailer -> null', intakeRedirectTarget(null) === null);
check('countdown is 5 seconds', INTAKE_REDIRECT_SECONDS === 5);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
