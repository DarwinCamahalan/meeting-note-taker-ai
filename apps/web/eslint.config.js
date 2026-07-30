// @cue/web ESLint — extends the canonical monorepo flat config. Ignores Next's
// generated output; the App Router source is linted with the shared rules.
import cueConfig from '@cue/config/eslint';

export default [
  { ignores: ['.next/**', 'out/**', 'next-env.d.ts'] },
  ...cueConfig,
];
