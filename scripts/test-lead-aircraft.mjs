/**
 * lib/lead-aircraft.js — customer-selected aircraft wins over FAA registry data.
 * Run: node --import ./scripts/test-support/register.mjs scripts/test-lead-aircraft.mjs
 */
import { leadAircraft, leadAircraftName, marketingNameFromRegistry, isInternalIntakeKey } from '../lib/lead-aircraft.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}
const eq = (a, b) => JSON.stringify(a) === JSON.stringify(b);

console.log('lead aircraft display');
let r = leadAircraft({ aircraft_model: 'Raytheon B300' });
check('legacy FAA string maps to King Air 350 + registry line', eq(r, { primary: 'Beechcraft King Air 350', registry: 'Raytheon B300' }), JSON.stringify(r));
r = leadAircraft({ aircraft_model: 'Beechcraft King Air 350', intake_responses: { _faa_registry: { manufacturer: 'Raytheon', model: 'B300', display: 'Raytheon B300' } } });
check('new lead: selection primary, registry secondary', eq(r, { primary: 'Beechcraft King Air 350', registry: 'Raytheon B300' }), JSON.stringify(r));
r = leadAircraft({ aircraft_model: 'Gulfstream G450', intake_responses: { _faa_registry: { display: 'Gulfstream G450' } } });
check('registry identical -> no secondary line', eq(r, { primary: 'Gulfstream G450', registry: null }), JSON.stringify(r));
r = leadAircraft({ aircraft_model: 'Cessna Citation CJ3' });
check('normal selection untouched', eq(r, { primary: 'Cessna Citation CJ3', registry: null }));
r = leadAircraft({ aircraft_model: 'Raytheon Hawker 800XP' });
check('non King Air Raytheon types left as-is', eq(r, { primary: 'Raytheon Hawker 800XP', registry: null }), JSON.stringify(r));
r = leadAircraft({ aircraft_model: null, intake_responses: { _faa_registry: { display: 'Raytheon B300' } } });
check('no selection -> mapped registry as primary', r.primary === 'Beechcraft King Air 350' && r.registry === 'Raytheon B300', JSON.stringify(r));
r = leadAircraft({});
check('empty lead', eq(r, { primary: '', registry: null }));
check('leadAircraftName fallback', leadAircraftName({}, 'aircraft') === 'aircraft');
check('marketing map B200GT', marketingNameFromRegistry('HAWKER BEECHCRAFT CORP', 'B200GT') === 'Beechcraft King Air 250');
check('marketing map unknown maker', marketingNameFromRegistry('Piper', 'B300') === null);
check('internal intake key', isInternalIntakeKey('_faa_registry') && !isInternalIntakeKey('Packages'));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
