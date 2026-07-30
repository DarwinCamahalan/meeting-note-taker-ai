# 06 — Conventions (Code, Git, Delivery)

> For future AI: these are the rules the repo was built under and expects you to keep. They are drawn from [`../RULES.md`](../RULES.md), the repo/root `CLAUDE.md`, and the observed commit history. Follow them exactly — they override convenience. The one-line version lives in [`../AGENTS.md`](../AGENTS.md#golden-rules-read-before-you-commit-anything).

## Code standards

From [`../RULES.md`](../RULES.md) §Code standards and the global `CLAUDE.md`:

- **React code-splitting on every module/page.** Split each module into:
  - `types.ts` — the module's types.
  - `utils.ts` — pure helpers.
  - `hooks/use-*.ts` — stateful/logic hooks.
  - focused component files — one concern each.
  - The page / top-level component **orchestrates**; logic lives in hooks and utils, not in the page.
- **No single file over 700 LOC.** Split before you cross it.
- **Strong TypeScript types; avoid `any`.** The whole monorepo is TypeScript **strict** (`@cue/config` owns the shared tsconfig base).
- **Contracts are typed and shared, not duplicated.** DTOs/IPC/api/billing/document/sso/admin types live in [`@cue/types`](reference/packages.md); the gRPC hot-path contract lives in [`@cue/proto`](reference/packages.md) (`cue.orchestrator.v1`); Zod schemas are the REST contract source of truth in [`@cue/api`](reference/services.md). Don't hand-copy a type across a boundary — import it.
- **Professional, modern, readable code** following industry standards.

> Applies equally to non-React code: services split into Nest modules, packages into focused source files, each staying under the LOC ceiling.

## Git & branch workflow

From [`../RULES.md`](../RULES.md) §Git & delivery. **This is the highest-risk area — read it fully.**

### Branch model

```
main   ← stable / baseline (currently HELD at v0.4.0 plan docs, PR #5)
  ▲
  │  promote dev → main for releases
  │
dev    ← integration branch (all of Phases 0–4 live here)
  ▲
  │  PRs target dev
  │
feat/* , docs/*   ← cut from dev
```

- **`main`** is the stable/baseline branch. **`dev`** is the integration branch.
- Feature/docs branches are **cut from `dev`**; PRs **target `dev`**.
- `dev` is **promoted to `main` for releases** — deliberately, not automatically.
- **`main` is intentionally held.** At time of writing it sits at PR #5 (the v0.4.0 plan-docs baseline); all five build phases are on `dev`, ~26 commits ahead, pending a local build/verification. **Do not promote dev→main unless explicitly asked.**

### Auto git flow vs gated actions

- **Auto flow (when a task is complete):** branch → commit in logical chunks → push → pull/sync → open PR → merge, with short status lines ("committed", "pushed", "PR opened", "merged"), no per-action prompts, no pasting the PR URL back.
- **Still gated — ask first:** force-push, history rewrites (rebase dropping commits, amending already-pushed history), deleting remote branches, hard resets discarding others' work. Surface immediately if a hook pushes on our behalf.
- **Owner override (root/global `CLAUDE.md`):** the repo owner treats `git commit`, `git push`, `git merge origin/<branch>`, and `gh pr create` as **forbidden by default until explicitly asked**. "Make the change" / "fix this" is **not** permission to commit or push. Only an explicit "commit" / "push" / "open PR" / "create PR" counts. **When in doubt, stop after the edit and show `git status` / diff.** Do not merge `origin/main`/`origin/dev` into a feature branch on your own — some repos auto-push on merge.

> Reconciling the two: `RULES.md` describes the *shape* of a completed flow; the owner's `CLAUDE.md` controls *when* you're allowed to trigger it. Default to the stricter rule — **wait for explicit instruction to write to origin.**

## Commit conventions

- **Conventional Commits**, imperative, scoped: `docs:`, `feat:`, `fix:`, `chore:`, `refactor:`, …
- Phase work uses a **phase scope**: `feat(phase-0): …`, `feat(phase-3): …`. Docs work uses `docs(phase-N): …` or a topic scope (`docs: …`).
- **Single PR per body of work, many commits**, grouped by domain (foundation, frontend, backend & AI, data/auth, monetization, infra, audits) — one PR, one review thread, clean history.

Observed examples from `git log --oneline`:

```
feat(phase-0): monorepo foundation + @cue/{config,types,core}
feat(phase-1): backend services — api (NestJS auth/sessions), ai-orchestrator (gRPC), ws-gateway
feat(phase-2): api — documents/RAG, Stripe billing + webhooks, entitlements gate, usage metering; orchestrator RAG context
feat(phase-3): api — WorkOS SSO + SCIM provisioning, RBAC guard, org admin (invites/members/settings/audit), shared team KB
feat(phase-4): @cue/observability (OTel/pino/Prometheus/Sentry + circuit-breaker/backoff) + core reliability wrapping
```

## How the phases were delivered

Each phase was a single feature branch → PR → merge to `dev`, with commits grouped by domain and a docs commit closing the phase. Verified against `git log` (full detail in [`03-build-journal.md`](03-build-journal.md)):

| Phase | Branch | PR | Theme |
|-------|--------|----|-------|
| Plan | `docs/*` | #1, #2, #4 | Master plan, audit remediation + legal descope, plan deepening. |
| Promote | `dev` | #3, #5 | dev → main promotions (the v0.4.0 baseline `main` now holds). |
| **0** | `feat/phase-0-spike` | #6 | Monorepo foundation + `@cue/{config,types,core}` + content-protection overlay spike. |
| **1** | `feat/phase-1-mvp` | #7 | Backend services + data/contracts + web + desktop backend wiring (opt-in). |
| **2** | `feat/phase-2` | #8 | RAG + Stripe billing/entitlements + signed auto-update + Three.js hero. |
| **3** | `feat/phase-3` | #9 | Enterprise SSO/SCIM + RBAC + admin console + shared team KB + Team seats. |
| **4** | `feat/phase-4` | #10 | Observability + Terraform infra + CI/CD + reliability/scale plumbing. |

**Additive discipline:** every phase after 0 is layered so the prior phase keeps working unchanged, and new capability is env-gated (unset env ⇒ feature is a no-op/degrades to the earlier behavior). This is a load-bearing convention — preserve it when extending.

## Documentation conventions

From [`../RULES.md`](../RULES.md) §Documentation (the **plan** docs follow this strictly; the as-built `ai-context/` set adopts a lighter "for future AI" house style):

- Plan docs start with an H1 + metadata block (`Status · Owner · Last updated · Related`) and end with an "Open questions & risks" section.
- Mermaid for architecture/sequence/ER/flow; tables for comparisons; concrete config/DDL/API snippets over hand-waving.
- Key decisions recorded ADR-style (Decision / Context / Alternatives / Trade-offs / Consequence) — see [`../docs/04-decision-record.md`](../docs/04-decision-record.md).
- Cross-link siblings by **relative path**; don't duplicate what another doc owns — link it.

## AI / LLM defaults

From [`../RULES.md`](../RULES.md) §AI / LLM defaults:

- Latest Claude models, routed by need: **`claude-haiku-4-5`** for ultra-low-latency live cues (the built default), `claude-sonnet-5` balanced, `claude-opus-5` deep prep. Embeddings: **Voyage `voyage-3.5`@1024**.
- **Streaming + Anthropic prompt caching** on the stable system prompt and user/RAG context.
- **Never log transcripts or PII** in telemetry; honor model-training opt-out. `@cue/observability` enforces this with pino redaction + a Sentry `beforeSend` scrubber.

## Product guardrails (non-negotiable)

- The capture-excluded overlay + meeting-audio combination carries **consent-law + platform-policy exposure**. Consent capture / disclosed mode is a **gating requirement** — but the legal work is currently **descoped** (see [`07-todos-and-gaps.md`](07-todos-and-gaps.md)). Do not re-introduce legal docs; document the residual risk.
- **Content protection is a privacy capability only.** Do **not** attempt to hide the process from the OS process list, task manager, EDR, or antivirus — explicitly out of scope and off-limits.
