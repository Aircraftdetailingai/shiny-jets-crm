/**
 * Catalog and intake typos are corrected on read and on import.
 * Run: node --import ./scripts/test-support/register.mjs scripts/test-copy-corrections.mjs
 */
import { correctIntakeCopy, correctServiceName } from '../lib/copy-corrections.js';
import { prepareImportedService, DEFAULT_SERVICE_CATALOG } from '../lib/service-defaults.js';
import { schemaNotReady, invalidUuidInput } from '../lib/model-offers-errors.js';

let pass = 0, fail = 0;
function check(name, cond) {
  if (cond) { pass++; console.log(`  ✅ ${name}`); }
  else { fail++; console.log(`  ❌ ${name}`); }
}

check('catalog length stays at the seeded ten', DEFAULT_SERVICE_CATALOG.length === 10);
check('service name typo is corrected', correctServiceName('Restore Un-Pressurized Windows - Exteriro') === 'Restore Un-Pressurized Windows - Exterior');
check('clean names are unchanged', correctServiceName('Exterior Wash') === 'Exterior Wash');
const flow = correctIntakeCopy({
  questions: [{ options: ['Verfied Finish', 'Other'] }],
  flow_nodes: [{ data: { label: 'Restore Un-Pressurized Windows - Exteriro' } }],
});
check('intake option typo is corrected', flow.questions[0].options[0] === 'Verified Finish');
check('intake service label typo is corrected', flow.flow_nodes[0].data.label.endsWith('Exterior'));
const imported = prepareImportedService({ name: 'Restore Un-Pressurized Windows - Exteriro', hourly_rate: 80 });
check('import corrects the service name', imported.name.endsWith('Exterior'));

check('schema cache miss is pending migration', schemaNotReady('Could not find the table public.model_offer_overrides in the schema cache'));
check('invalid uuid is recognized', invalidUuidInput('invalid input syntax for type uuid: "g4"'));
check('unrelated errors are not schema misses', !schemaNotReady('permission denied for table model_offer_overrides'));

console.log(`\n${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
