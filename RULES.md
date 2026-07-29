# Project Rules & Working Conventions

> Status: Active · Owner: Team · Last updated: 2026-07-29
>
> The standing rules for how work is done on **Cue** (working title — AI meeting/interview copilot). These are conventions the team and any AI assistant must follow.

## Git & delivery

- **Single PR per body of work, many commits.** Group commits by domain (e.g. foundation, frontend, backend & AI, data/auth, monetization, infra & business, audits). One PR, one review thread, clean history.
- **Branch model.** `main` is the stable/baseline branch; `dev` is the integration branch. Feature/docs branches are cut from `dev`, and PRs target `dev`. `dev` is promoted to `main` for releases.
- **Auto git flow.** When a task is complete, run the whole flow automatically — create the branch, commit in logical chunks, **push, pull/sync, open the PR, and merge it** — with no per-action approval prompt and without pasting the PR URL back. Report short status lines only ("committed", "pushed", "PR opened", "merged", "dev updated").
- **Still gated — ask first:** force-push, history rewrites (rebase that drops commits, amending already-pushed history), deleting remote branches, and hard resets that discard others' work. Surface immediately if a hook pushes on our behalf.
- **Commit messages:** Conventional Commits (`docs:`, `feat:`, `fix:`, `chore:`, `refactor:`…), imperative, scoped.

## Communication

- **Always keep the requester updated** at each meaningful checkpoint during long-running or background work — real state (files produced, phase reached), never "still working" filler, never fabricated progress.

## Code standards

- **React code-splitting** on every module/page: split into `types.ts`, `utils.ts`, `hooks/use-*.ts`, and focused component files. Page/top-level components orchestrate; logic lives in hooks and utils.
- **No single file over 700 LOC.**
- **Strong TypeScript types**; avoid `any`.
- Professional, modern, readable code following industry standards.

## Documentation

- Every doc starts with an H1 and a metadata block: `Status · Owner · Last updated · Related`.
- Use Mermaid for architecture/sequence/ER/flow diagrams; tables for comparisons; concrete config/DDL/API snippets (no hand-waving).
- Record key decisions ADR-style: Decision / Context / Alternatives / Trade-offs / Consequence.
- Cross-link sibling docs by relative path; don't duplicate content another doc owns — link it.
- End each doc with an "Open questions & risks" section.

## Product & compliance guardrails

- The screen-capture-excluded overlay + meeting-audio recording combination carries **consent-law and platform-policy exposure** (two-party-consent jurisdictions, GDPR, Zoom/Meet/Teams ToS). Treat consent capture / a "disclosed mode" as a **gating requirement**, not a nice-to-have.
- Frame and build the product around legitimate use cases: interview prep, sales/support copiloting, note-taking, and accessibility.
- Content protection is a standard privacy capability (as used by password managers/banking/DRM). Do **not** attempt to hide the process from the OS process list, task manager, or antivirus — that is out of scope and off-limits.

## AI / LLM defaults

- Default to the latest Claude models. Route by need: `claude-haiku-4-5` for ultra-low-latency live cues, `claude-sonnet-5` for balanced answers, `claude-opus-5` for deep prep/analysis.
- Use streaming + Anthropic prompt caching for the stable system prompt and user/RAG context.
- Never log transcripts or PII in telemetry; honor model-training opt-out.
