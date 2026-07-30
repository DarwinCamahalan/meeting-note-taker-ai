// @cue/ws-gateway ESLint — extends the canonical monorepo flat config.
import cueConfig from '@cue/config/eslint';

export default [{ ignores: ['dist/**'] }, ...cueConfig];
