/**
 * Compile-time contract-drift guards.
 *
 * Zod is the source of truth for the api's request/response shapes (per
 * 22-api-contracts.md §7). @cue/types holds the hand-authored wire DTOs the SDK
 * and desktop import. These helpers assert — at *type-check time only, zero
 * runtime cost* — that every Zod-inferred DTO is structurally identical to its
 * @cue/types counterpart. If either side drifts, the build fails here.
 */

/**
 * Strip `undefined` from every property's value type while preserving the
 * optional (`?`) modifier. This normalizes the well-known mismatch between
 * Zod's `.optional()` (which infers `T | undefined`) and @cue/types' optional
 * properties (which, under `exactOptionalPropertyTypes`, are `T` present-or-
 * absent) so the equality check compares the meaningful shape, not the modifier
 * encoding.
 */
export type StripUndef<T> = { [K in keyof T]: Exclude<T[K], undefined> };

/** Exact structural equality between two types (invariant, both directions). */
export type Equal<A, B> =
  (<T>() => T extends A ? 1 : 2) extends <T>() => T extends B ? 1 : 2 ? true : false;

/**
 * Type-level assertion: resolves only when `T` is exactly `true`. Use as
 * `type _Check = Assert<Equal<StripUndef<Inferred>, StripUndef<Dto>>>;` — a
 * mismatch collapses `Equal` to `false` and this alias fails to resolve.
 */
export type Assert<T extends true> = T;
