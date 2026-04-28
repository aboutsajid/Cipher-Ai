# Upgrade Checkpoint (2026-04-27)

## Purpose
- Keep a clear memory of what was being upgraded.
- Preserve rollback-safe anchors while continuing incremental improvements.

## Current Snapshot
- Branch: `main`
- Workspace state: contains many existing modified/untracked files from the in-progress stream.
- App status: Electron app launches and runs.
- Landing status: duplicate bottom tagline removed from the main landing/empty state.
- Test status (latest run): `398 passed / 0 failed`.
- Security audit status: `npm audit --omit=dev` previously reported `0` vulnerabilities.

## Work Completed In This Autopilot Run

### Performance / Reliability
1. `perf(images): paginate and lazy-load generated image history` (`5184419`)
2. `perf(router): switch MCP status refresh to event-driven updates` (`a2ecde5`)
3. `perf(agent): push task updates and keep polling as fallback` (`83eb3df`)
4. `fix(mcp): emit runtime change events for live router panel updates` (`366c7a1`)

### Maintainability
1. `refactor(preload): return unsubscribe handles for IPC listeners` (`a944637`)
2. `refactor(renderer): teardown ipc listeners on unload` (`2127ce0`)

### Targeted Runtime Optimization
1. `perf(router): load logs only on explicit router refresh` (`a6e0d8f`)

### Test Coverage
1. `test(agent): cover task-change event emission paths` (`d483147`)
2. `test(mcp): runtime onChanged notification coverage` (included in `366c7a1`)

## Priority Matrix (Updated)

### P0 (Stability + Safety)
1. DOM contract mismatch: completed.
2. Preview path guard hardening: completed.
3. Shell/deprecation cleanup (`shell: true` removal path): completed.

### P1 (Performance Without Workflow Change)
1. Agent task-state persist rate limiting: completed.
2. Chat streaming persist coalescing: completed.
3. Polling replacement with event-driven refresh: mostly completed for agent/router/MCP paths with safe fallbacks.
4. Image history pagination/lazy loading: completed.
5. Router diagnostics now avoid redundant log history fetches during status-only refreshes.

### P2 (Maintainability)
1. Unsubscribe-safe preload listener wrappers: completed.
2. Renderer listener teardown on unload: completed.
3. Large-file modularization (`renderer/app.ts`, `agentTaskRunner.ts`): pending.
4. Async buffered logging with redaction guardrails: pending.
5. Orphan placeholder cleanup: pending (defer until file ownership scope is explicit).

## Rollback Guidance
- Keep one commit per small change (already followed).
- If regression appears, rollback to the latest green checkpoint commit.
- Suggested rollback anchors (latest first):
  - `2127ce0`
  - `a6e0d8f`
  - `366c7a1`
  - `d483147`
  - `a944637`
  - `83eb3df`
  - `a2ecde5`
  - `5184419`

## Notes
- All changes above were validated with full test runs after each enhancement cluster.
- No workflow-breaking changes were intentionally introduced.
