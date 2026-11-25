/**
 * Module hooks that let a test import browser code from `src/` as it is. The browser code is written for a
 * bundler, so two things Node does not do on its own are done here:
 *   - the `@/` alias of jsconfig.json: `@/features/x/y` is `<repo>/src/features/x/y.js`;
 *   - relative imports without an extension (`./tools/hostTools`), inside `src/`.
 * Everything else resolves as usual. Registered by `registerSrcAlias()` in `./src-alias.mjs`.
 */
import { existsSync, statSync } from 'node:fs';
import { fileURLToPath, pathToFileURL } from 'node:url';

const SRC = new URL('../../../src/', import.meta.url);

const isFile = path => existsSync(path) && statSync(path).isFile();
const withExtension = base => [base, `${base}.js`, `${base}/index.js`].find(isFile);

export async function resolve(specifier, context, nextResolve) {
  let base = null;
  if (specifier.startsWith('@/')) {
    base = fileURLToPath(new URL(specifier.slice(2), SRC));
  } else if (/^\.\.?\//.test(specifier) && context.parentURL?.startsWith(SRC.href)) {
    base = fileURLToPath(new URL(specifier, context.parentURL));
  }
  if (!base) return nextResolve(specifier, context);
  const file = withExtension(base);
  if (!file) throw new Error(`The test loader cannot find "${specifier}" (from ${context.parentURL}).`);
  return nextResolve(pathToFileURL(file).href, context);
}
