// Verification for the linked-product quantity fix.
//
// Two guarantees:
//   1. computeLinkedProductQuantity (the extracted, schema-correct function)
//      returns the right amounts for the four canonical cases.
//   2. The phantom columns the old code read — `fixed_quantity` and
//      `quantity_per_hour` — have ZERO remaining references under app/. Those
//      columns don't exist on service_products, which is why quantities used to
//      render 0.0; this asserts the drift can't creep back in.
//
// Run: node scripts/verify-product-quantities.mjs   (exits nonzero on any FAIL)

import { execSync } from 'node:child_process';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { computeLinkedProductQuantity } from '../lib/product-quantity.js';

const __dirname = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(__dirname, '..');

let failures = 0;
function check(label, actual, expected) {
  const ok = actual === expected;
  if (!ok) failures++;
  console.log(`${ok ? 'PASS' : 'FAIL'}  ${label}  (got ${actual}, expected ${expected})`);
}

// ── 1. Unit tests for the quantity function ──
console.log('— quantity function —');
// per_job 5 + per_sqft 0.1 x 1200 sqft = 5 + 120 = 125
check('per_job + per_sqft', computeLinkedProductQuantity({ quantity_per_job: 5, quantity_per_sqft: 0.1 }, 1200), 125);
// per_job only = 5 (sqft irrelevant)
check('per_job only', computeLinkedProductQuantity({ quantity_per_job: 5, quantity_per_sqft: null }, 1200), 5);
// per_sqft only = 0.1 x 1200 = 120
check('per_sqft only', computeLinkedProductQuantity({ quantity_per_job: null, quantity_per_sqft: 0.1 }, 1200), 120);
// all null = 0
check('all null', computeLinkedProductQuantity({ quantity_per_job: null, quantity_per_sqft: null }, null), 0);

// ── 2. Schema-drift grep: zero hits under app/ ──
console.log('— schema drift grep (app/) —');
for (const pattern of ['fixed_quantity', 'quantity_per_hour']) {
  let hits = '';
  try {
    hits = execSync(`grep -rn "${pattern}" app/ || true`, { cwd: repoRoot, encoding: 'utf8' }).trim();
  } catch {
    hits = '';
  }
  const count = hits ? hits.split('\n').filter(Boolean).length : 0;
  if (count > 0) {
    failures++;
    console.log(`FAIL  no "${pattern}" in app/  (found ${count}):\n${hits}`);
  } else {
    console.log(`PASS  no "${pattern}" in app/`);
  }
}

console.log(`\n${failures === 0 ? 'ALL GREEN' : `${failures} FAILURE(S)`}`);
process.exit(failures === 0 ? 0 : 1);
