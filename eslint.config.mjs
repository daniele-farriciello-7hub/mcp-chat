import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';

export default defineConfig([
  ...nextVitals,
  // functions/ runs on Node and has its own entry point; it is formatted by Prettier only.
  globalIgnores(['.next/**', 'out/**', 'node_modules/**', 'functions/**'])
]);
