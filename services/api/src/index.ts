/**
 * @cue/api public surface. The service runs from `main.ts`; this barrel exposes
 * the Zod contracts (and inferred DTOs) so other workspaces / codegen can
 * consume the source-of-truth schemas without importing Nest internals.
 */
export * from './contracts/index.js';
export { AppModule } from './app.module.js';
