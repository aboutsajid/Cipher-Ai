# Upgrade Checkpoint (2026-04-27)

## Purpose
- Keep a clear memory of what was being upgraded.
- Provide a safe rollback anchor commit without disturbing current workflows.

## Current Snapshot
- Branch: `main`
- Workspace state: already contains many existing modified/untracked files (in-progress workstream).
- App status: Electron app launches and runs.
- Landing work status: duplicate bottom tagline removed from main landing/empty state.
- Test status (latest run): `387 passed / 1 failed`.
  - Failing test: `renderer index html provides every id referenced by renderer app bindings`
  - Missing ID: `local-agent-workspace-root`
- Security audit status: `npm audit --omit=dev` reports `0` vulnerabilities.

## What We Were Doing
- Deep product-level analysis focused on safe enhancements only (no workflow break).
- Target areas reviewed:
  - Main process hardening and IPC boundaries
  - Agent runner reliability and telemetry flow
  - Renderer performance and polling behavior
  - Preview path safety and command execution risk
  - Packaging/CI coverage for Windows-first deployment

## High-Priority Enhancements (No Workflow Damage)

### P0 (Stability + Safety First)
1. Fix renderer DOM contract mismatch (`local-agent-workspace-root`).
2. Harden preview server path boundary validation (avoid string-prefix path checks).
3. Remove/replace `shell: true` execution paths where possible (deprecation + safety).

### P1 (Performance Without UX Change)
1. Debounce/queue `AgentTaskRunner` state persistence to reduce sync disk churn.
2. Coalesce chat streaming writes to reduce frequent full `chats.json` rewrites.
3. Replace periodic polling with event-driven refresh where feasible.
4. Paginate/lazy-load image history hydration for large histories.

### P2 (Maintainability)
1. Split large renderer/runner files into focused modules with behavior parity.
2. Add async buffered logging pipeline with redaction guardrails.
3. Add unsubscribe-safe preload listener wrappers.
4. Clean orphan placeholder files to reduce confusion.

## Safe Execution Order
1. P0.1 DOM contract fix + tests.
2. P0.2 preview path guard hardening + tests.
3. P0.3 shell/deprecation cleanup + tests.
4. P1 performance work in small independent commits.
5. P2 refactor in extraction-only steps first.

## Rollback Guidance
- Keep one commit per small step (no mega commits).
- Prefer commit messages like:
  - `fix(renderer): restore missing local-agent-workspace-root binding`
  - `fix(preview): harden workspace path boundary check`
  - `refactor(exec): remove shell-true spawn usage on windows`
  - `perf(agent): debounce task state persistence`
- If a step regresses behavior, rollback to the last green commit immediately.

## Notes
- This file is a checkpoint doc only; no functional upgrade code was applied in this checkpoint commit.
