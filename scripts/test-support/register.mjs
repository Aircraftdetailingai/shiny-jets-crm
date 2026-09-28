// Lets plain `node` import the repo's lib/*.js ES modules, which use
// extensionless relative imports ("./plans") and the "@/..." alias the way
// Next.js does.  Usage: node --import ./scripts/test-support/register.mjs <test>
import { register } from 'node:module';

register('./resolve-hooks.mjs', import.meta.url);
