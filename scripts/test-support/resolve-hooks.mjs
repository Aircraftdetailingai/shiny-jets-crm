import path from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..', '..');

export async function resolve(specifier, context, nextResolve) {
  let spec = specifier;
  if (spec.startsWith('@/')) spec = pathToFileURL(path.join(ROOT, spec.slice(2))).href;
  const isPathLike = spec.startsWith('.') || spec.startsWith('/') || spec.startsWith('file:');
  try {
    return await nextResolve(spec, context);
  } catch (err) {
    // Extensionless relative paths ("./plans") and package subpaths without
    // an exports map ("next/headers") → try the .js file.
    if ((isPathLike || spec.includes('/')) && !/\.[cm]?[jt]sx?$/.test(spec)) {
      return nextResolve(`${spec}.js`, context);
    }
    throw err;
  }
}

export async function load(url, context, nextLoad) {
  // lib/*.js files are ES modules but package.json has no "type": "module".
  if (url.startsWith('file:') && url.endsWith('.js') && url.includes('/lib/')) {
    return nextLoad(url, { ...context, format: 'module' });
  }
  return nextLoad(url, context);
}
