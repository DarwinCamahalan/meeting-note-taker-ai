# ai-context — As-Built Documentation for Future AI

> For future AI: this directory documents **what AssistMe actually is on disk**, read from real source and git history — distinct from [`../docs/`](../docs/), which is the intended **design plan**. Every file here has been written to be accurate over complete: where the code is a stub or TODO, it says so plainly. When source and this doc disagree, **re-read the source** — it moves faster than prose.

Entry point for the whole repo is [`../AGENTS.md`](../AGENTS.md). This README indexes the as-built set.

## The set (file manifest)

| File | What it covers |
|------|----------------|
| [`00-overview.md`](00-overview.md) | What AssistMe is, the current state (5 phases on `dev`), product surfaces, and the high-level shape. |
| [`01-architecture-as-built.md`](01-architecture-as-built.md) | The real runtime architecture: the audio→cue hot path, transport hops, RAG injection, and how the services actually wire together. |
| [`02-monorepo-map.md`](02-monorepo-map.md) | The 12 workspaces, their `@cue/*` names, dependency edges, and the layering rules the code obeys. |
| [`reference/packages.md`](reference/packages.md) | Per-package reference: `config`, `types`, `core`, `db`, `proto`, `sdk`, `observability` — exports, key symbols, real vs stubbed. |
| [`reference/services.md`](reference/services.md) | Per-service reference: `api`, `ai-orchestrator`, `ws-gateway` — modules, endpoints, ports, gRPC surface. |
| [`reference/apps.md`](reference/apps.md) | Per-app reference: `desktop` (Electron overlay, IPC, capture, updater) and `web` (Next.js surfaces, admin console, release feed). |
| [`03-build-journal.md`](03-build-journal.md) | The build history: Phases 0–4 mapped to PRs #6–#10 and their commits, what each delivered, verified against `git log`. |
| [`04-plan-mapping.md`](04-plan-mapping.md) | Plan (`docs/`) ↔ code map: which design docs correspond to which built artifacts, and where reality diverges from intent. |
| [`05-setup-and-run.md`](05-setup-and-run.md) | How to install, configure env, migrate the DB, and run each surface locally (per phase). |
| [`06-conventions.md`](06-conventions.md) | Code standards (code-splitting, <700 LOC, strong types), the git/branch workflow, commit conventions, and how phases were delivered. |
| [`07-todos-and-gaps.md`](07-todos-and-gaps.md) | The honest "real vs stubbed/TODO" inventory: known stubs, descoped legal/consent + residual risk, and skeleton caveats. |
| [`08-glossary.md`](08-glossary.md) | Terms of art: overlay, content protection, cue, orchestrator, ws-gateway, entitlement, RAG, SSO/SCIM, SLI, and more. |

## Suggested reading order

1. **[`../AGENTS.md`](../AGENTS.md)** — orientation + golden rules (read first, always).
2. **[`00-overview.md`](00-overview.md)** — what and why.
3. **[`01-architecture-as-built.md`](01-architecture-as-built.md)** — how it runs.
4. **[`02-monorepo-map.md`](02-monorepo-map.md)** — where the code lives.
5. **`reference/`** (`packages` → `services` → `apps`) — the detail for whatever you're touching.
6. **[`03-build-journal.md`](03-build-journal.md)** + **[`04-plan-mapping.md`](04-plan-mapping.md)** — how it got here and how it maps to the plan.
7. **[`05-setup-and-run.md`](05-setup-and-run.md)** — when you need to actually run it.
8. **[`06-conventions.md`](06-conventions.md)** + **[`07-todos-and-gaps.md`](07-todos-and-gaps.md)** — before you write or trust code.
9. **[`08-glossary.md`](08-glossary.md)** — keep open as a lookup.

## Ground truth reminders

- **Branch:** the as-built state is on **`dev`** (Phases 0–4). **`main` is held** at the v0.4.0 plan baseline. See [`../AGENTS.md`](../AGENTS.md#golden-rules-read-before-you-commit-anything).
- **Legal/consent is descoped** — documented as descoped with residual risk in [`07-todos-and-gaps.md`](07-todos-and-gaps.md); do not re-introduce legal docs.
- **The plan is not the build.** Use [`04-plan-mapping.md`](04-plan-mapping.md) to translate between [`../docs/`](../docs/) and reality.
