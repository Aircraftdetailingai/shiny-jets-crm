/**
 * Default service import, quote hour priority, pins, and job learning.
 * Run: node --import ./scripts/test-support/register.mjs scripts/test-service-defaults.mjs
 */
import {
  DEFAULT_SERVICE_CATALOG,
  prepareImportedService,
  resolveHoursField,
} from '../lib/service-defaults.js';
import { resolveServiceHours } from '../lib/resolve-service-hours.js';
import { pinsForAircraft } from '../lib/aircraft-pins.js';
import { learningUpdates } from '../lib/learn-from-job.js';

let pass = 0, fail = 0;
function check(name, cond, detail = '') {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name} ${detail}`); }
}

console.log('default catalog');
check('ten starter services', DEFAULT_SERVICE_CATALOG.length === 10);
for (const svc of DEFAULT_SERVICE_CATALOG) {
  check(`${svc.name} has a rate and hours`, svc.hourly_rate > 0 && svc.default_hours > 0 && !!svc.hours_field, JSON.stringify(svc));
}
check('Decon Wash is decon_hours, not a plain wash', DEFAULT_SERVICE_CATALOG.find((s) => s.name === 'Decon Wash').hours_field === 'decon_hours');

console.log('import fill-in');
const bare = prepareImportedService({ name: 'Maintenance Wash', hourly_rate: 120 });
check('bare wash gains hours column and 2h', bare.hours_field === 'ext_wash_hours' && bare.default_hours === 2 && bare.hourly_rate === 120);
const deconBug = prepareImportedService({ name: 'Decon Wash', hourly_rate: 130, category: 'exterior', hours_field: 'ext_wash_hours' });
check('explicit generic wash loses to Decon', deconBug.hours_field === 'decon_hours' && deconBug.default_hours === 3);
check('resolveHoursField agrees', resolveHoursField({ name: 'Decon Wash', category: 'exterior', hours_field: 'ext_wash_hours' }) === 'decon_hours');
const named = prepareImportedService({ name: 'Ceramic Coating' });
check('name-only import fills rate, field, and hours', named.hourly_rate === 175 && named.hours_field === 'ceramic_hours' && named.default_hours === 18);
const custom = prepareImportedService({ name: 'Hangar Sweep', hourly_rate: 90 });
check('unknown service keeps its rate and does not invent hours', custom.hourly_rate === 90 && custom.default_hours == null && custom.hours_field == null);
const zero = prepareImportedService({ name: 'Wax Application', hourly_rate: 0, default_hours: 0 });
check('zero inputs fall back to the catalog', zero.hourly_rate === 100 && zero.default_hours === 6);
for (const svc of DEFAULT_SERVICE_CATALOG) {
  const prepared = prepareImportedService({ name: svc.name, description: svc.description, hourly_rate: svc.hourly_rate, category: svc.category });
  check(`import ${svc.name} is fully numbered`, prepared.default_hours > 0 && prepared.hourly_rate > 0 && prepared.hours_field === svc.hours_field);
}

console.log('quote hour priority');
const service = { id: 's1', name: 'One-Step Polish', default_hours: 12, hours_field: 'polish_hours' };
check('manual wins', resolveServiceHours({ service, hasCustom: true, customHours: 4, hasPin: true, pinnedHours: 9, calibrated: { source: 'calibrated', hours: 7 }, aircraftHours: 10 }).source === 'manual');
check('pin beats calibration and catalog', resolveServiceHours({ service, hasPin: true, pinnedHours: 9, calibrated: { source: 'calibrated', hours: 7 }, aircraftHours: 10, communityHours: 3 }).hours === 9);
check('pin of 0 is a real pin', resolveServiceHours({ service, hasPin: true, pinnedHours: 0, aircraftHours: 10 }).source === 'pin' && resolveServiceHours({ service, hasPin: true, pinnedHours: 0, aircraftHours: 10 }).hours === 0);
check('calibration beats catalog and shop default', resolveServiceHours({ service, calibrated: { source: 'calibrated', hours: 7 }, aircraftHours: 10 }).source === 'calibrated');
check('catalog beats shop default', resolveServiceHours({ service, aircraftHours: 10 }).source === 'aircraft' && resolveServiceHours({ service, aircraftHours: 10 }).hours === 10);
check('shop default is the no-aircraft starting point', resolveServiceHours({ service }).source === 'default' && resolveServiceHours({ service }).hours === 12);
check('community then 1h', resolveServiceHours({ service: { default_hours: 0 }, communityHours: 3 }).source === 'community' && resolveServiceHours({ service: {} }).hours === 1);

console.log('pins');
const services = [{ id: 's1', name: 'One-Step Polish' }, { id: 's2', name: 'Maintenance Wash' }];
const fromSettings = pinsForAircraft([
  { aircraft_id: 'hours-row', service_id: 's1', hours: 9 },
  { aircraft_id: 'other', service_id: 's1', hours: 4 },
], { aircraftId: 'aircraft-row', aircraftHoursId: 'hours-row', services });
check('settings pin matches aircraft_hours id', fromSettings.s1 === 9);
const fromName = pinsForAircraft([
  { aircraft_id: 'aircraft-row', service_name: 'Maintenance Wash', hours: 2.5 },
], { aircraftId: 'aircraft-row', services });
check('name-only pin maps onto the service id', fromName.s2 === 2.5);
const customPin = pinsForAircraft([
  { custom_aircraft_id: 'c1', service_id: 's1', hours: 6 },
  { aircraft_id: 'c1', service_id: 's1', hours: 99 },
], { customAircraftId: 'c1', aircraftId: null, services });
check('custom aircraft pin uses custom_aircraft_id', customPin.s1 === 6);

console.log('learning');
const hoursRow = { maintenance_wash_hrs: 2, one_step_polish_hrs: 8, decon_paint_hrs: 4 };
const learned = learningUpdates({
  serviceHours: [
    { service_name: 'One-Step Polish', hours_field: 'polish_hours', actual_hours: 10 },
    { service_name: 'Maintenance Wash', actual_hours: 3 },
    { service_name: 'Vacuum & Wipe Down', hours_field: 'int_detail_hours', actual_hours: 5 },
    { service_name: 'One-Step Polish', actual_hours: 0 },
  ],
  services: [
    { id: 's1', name: 'One-Step Polish', hours_field: 'polish_hours' },
    { id: 's2', name: 'Maintenance Wash', hours_field: 'ext_wash_hours' },
    { id: 's3', name: 'Vacuum & Wipe Down', hours_field: 'int_detail_hours' },
  ],
  aircraftHoursRow: hoursRow,
});
const polish = learned.find((u) => u.service_id === 's1');
const wash = learned.find((u) => u.service_id === 's2');
check('polish actual 10 vs catalog 8 is +25%', polish && polish.adjustment_pct === 25 && polish.pin_hours === 10 && polish.reference_service_type === 'polish');
check('wash actual 3 vs catalog 2 is +50%', wash && wash.adjustment_pct === 50 && wash.reference_service_type === 'wash');
check('interior detail has no catalog column so it is skipped', !learned.some((u) => u.service_id === 's3'));
check('zero actuals are skipped', learned.length === 2);
check('missing baseline does not invent a ratio', learningUpdates({
  serviceHours: [{ service_name: 'One-Step Polish', actual_hours: 10 }],
  services: [{ id: 's1', name: 'One-Step Polish', hours_field: 'polish_hours' }],
  aircraftHoursRow: {},
}).length === 0);

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
