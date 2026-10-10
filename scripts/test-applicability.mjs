/**
 * Aircraft applicability, public offer shape, and pinned prices.
 * Run: node --import ./scripts/test-support/register.mjs scripts/test-applicability.mjs
 */
import {
  inferAircraftAttributes,
  resolveAircraftAttributes,
  isGulfstreamIv,
  defaultApplicability,
  offerApplies,
  packageApplies,
  filterOffers,
  publicServiceShape,
  publicPackageShape,
  publicOverrideFlags,
  shopPinBlocksLearning,
  indexOverrides,
} from '../lib/applicability.js';
import { resolveOfferPrice } from '../lib/offer-price.js';
import { prepareImportedService, DEFAULT_SERVICE_CATALOG } from '../lib/service-defaults.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

const heli = { manufacturer: 'Robinson', model: 'R44', category: 'helicopter', brightwork_hours: 4 };
const g4 = { manufacturer: 'Gulfstream', model: 'G4', category: 'midsize_jet', brightwork_hours: 24 };
const g450 = { manufacturer: 'Gulfstream', model: 'G450/350', category: 'super_midsize_jet', brightwork_hours: 24 };
const king = { manufacturer: 'Beechcraft', model: 'King Air 350', category: 'turboprop', brightwork_hours: 1.5 };
const skyhawk = { manufacturer: 'Cessna', model: '172 Skyhawk', category: 'piston', brightwork_hours: 0.5 };
const baron = { manufacturer: 'Beechcraft', model: 'Baron 58', category: 'piston', brightwork_hours: 0.75 };
const ag = { manufacturer: 'Air Tractor', model: 'AT-802', category: 'turboprop', brightwork_hours: 0 };

console.log('attributes');
check('helicopter has no brightwork and no boots', !inferAircraftAttributes(heli).has_polished_brightwork && !inferAircraftAttributes(heli).has_deice_boots);
check('Gulfstream IV / G4 is recognized and has no boots', isGulfstreamIv(g4) && !inferAircraftAttributes(g4).has_deice_boots);
check('G450 is not the IV', !isGulfstreamIv(g450));
check('G-IV alias', isGulfstreamIv({ manufacturer: 'Gulfstream', model: 'G-IV' }));
check('jets have brightwork and no boots', inferAircraftAttributes(g4).has_polished_brightwork && inferAircraftAttributes(g4).category === 'jet');
check('King Air has boots', inferAircraftAttributes(king).has_deice_boots && inferAircraftAttributes(king).category === 'turboprop');
check('Skyhawk has brightwork and no boots', inferAircraftAttributes(skyhawk).has_polished_brightwork && !inferAircraftAttributes(skyhawk).has_deice_boots);
check('Baron has boots', inferAircraftAttributes(baron).has_deice_boots);
check('zero brightwork hours means no polished brightwork', !inferAircraftAttributes(ag).has_polished_brightwork);
check('stored booleans win over inference', resolveAircraftAttributes({ ...heli, has_polished_brightwork: true, has_deice_boots: true }).has_polished_brightwork);

console.log('rules');
const bright = { id: 'b', name: 'Polish Brightwork', hours_field: 'brightwork_hours', hourly_rate: 130, default_hours: 6 };
const boots = { id: 'd', name: 'De-ice Boot Dressing', hourly_rate: 90 };
const wash = { id: 'w', name: 'Maintenance Wash', hours_field: 'ext_wash_hours', category: 'exterior' };
check('brightwork rule', defaultApplicability(bright).requires_brightwork && !defaultApplicability(wash).requires_brightwork);
check('de-ice rule', defaultApplicability(boots).requires_deice_boots);
check('imported brightwork carries the rule and hours', (() => {
  const row = prepareImportedService({ name: 'Polish Brightwork' });
  return row.requires_brightwork && row.default_hours === 6 && row.hourly_rate === 130;
})());
check('default catalog brightwork is flagged', DEFAULT_SERVICE_CATALOG.find((s) => s.name === 'Polish Brightwork') && prepareImportedService(DEFAULT_SERVICE_CATALOG.find((s) => s.name === 'Polish Brightwork')).requires_brightwork);

console.log('filtering');
check('helicopter hides brightwork and boot dressing', !offerApplies(bright, heli) && !offerApplies(boots, heli) && offerApplies(wash, heli));
check('King Air shows boot dressing', offerApplies(boots, king));
check('G4 hides boot dressing and shows brightwork', !offerApplies(boots, g4) && offerApplies(bright, g4));
check('no model yet shows the full catalog', offerApplies(bright, null) && offerApplies(boots, null));
check('shop can force brightwork onto a helicopter', offerApplies(bright, heli, { enabled: true }));
check('shop can hide a wash', !offerApplies(wash, king, { enabled: false }));
check('category limit', !offerApplies({ ...wash, allowed_categories: ['jet'] }, skyhawk));
check('category limit allows a jet', offerApplies({ ...wash, allowed_categories: ['jet'] }, g4));

const services = [wash, bright, boots];
const onlyBright = { id: 'p1', name: 'Metal Package', service_ids: ['b'] };
const mixed = { id: 'p2', name: 'Turn Package', service_ids: ['w', 'b'] };
check('package of only brightwork is hidden on a helicopter', !packageApplies(onlyBright, services, heli, {}));
check('package that still has a wash stays', packageApplies(mixed, services, heli, {}));
check('forced-off package is hidden', !packageApplies(mixed, services, king, { byPackageId: { p2: { enabled: false } } }));
const view = filterOffers({ services, packages: [onlyBright, mixed], aircraft: heli, overrides: indexOverrides([{ service_id: 'b', enabled: true }]) });
check('force-on puts brightwork back in the list', view.services.some((s) => s.id === 'b') && view.packages.some((p) => p.id === 'p1'));

console.log('public shape has no prices');
const pub = publicServiceShape({ ...bright, hourly_rate: 130, default_hours: 6, pinned_price: 400, pinned_hours: 3 });
check('service shape omits money and hours', pub.name === 'Polish Brightwork' && pub.requires_brightwork && !('hourly_rate' in pub) && !('default_hours' in pub) && !('pinned_price' in pub) && !('pinned_hours' in pub));
const pubPkg = publicPackageShape({ ...mixed, discount_percent: 10, pinned_price: 900 }, ['Maintenance Wash']);
check('package shape omits discount and price', pubPkg.included_services[0] === 'Maintenance Wash' && !('discount_percent' in pubPkg) && !('pinned_price' in pubPkg));
const flags = publicOverrideFlags([{ service_id: 'w', enabled: false, pinned_price: 10, pinned_hours: 2 }]);
check('public override is only the on/off flag', flags.length === 1 && flags[0].enabled === false && !('pinned_price' in flags[0]) && !('pinned_hours' in flags[0]));

console.log('pins beat calculated prices');
check('pinned price wins over hours × rate and the minimum', resolveOfferPrice({ hours: 2, hourlyRate: 100, minimumPrice: 500, pinnedPrice: 80 }).price === 80);
check('pin of 0 is a real price', resolveOfferPrice({ hours: 2, hourlyRate: 100, pinnedPrice: 0 }).source === 'pin');
check('no pin uses the minimum floor', resolveOfferPrice({ hours: 1, hourlyRate: 40, minimumPrice: 75 }).source === 'minimum');
check('shop hours pin blocks learning from overwriting it', shopPinBlocksLearning({ pinned_hours: 4 }) && !shopPinBlocksLearning({ pinned_hours: null }) && !shopPinBlocksLearning(null));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
