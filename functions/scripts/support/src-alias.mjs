/** Call before importing browser code that uses the `@/` alias (see `./src-alias-loader.mjs`). */
import { register } from 'node:module';

let registered = false;

export function registerSrcAlias() {
  if (registered) return;
  registered = true;
  register('./src-alias-loader.mjs', import.meta.url);
}
