# Upgrade Checkpoint (2026-04-27)

## Purpose
- Keep a clear memory of what was being upgraded.
- Preserve rollback-safe anchors while continuing incremental improvements.

## Current Snapshot
- Last sync: `2026-04-28`
- Branch: `main`
- Workspace state: contains many existing modified/untracked files from the in-progress stream.
- App status: Electron app launches and runs.
- Manual launch check: `npm run start` executed on `2026-04-28`; Electron renderer processes started successfully.
- Landing status: duplicate bottom tagline removed from the main landing/empty state.
- Test status (latest run): `411 passed / 0 failed`.
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
3. `refactor(agent): extract workspace folder guard helpers` (`7c7e89a`)
4. `refactor(agent): extract snapshot listing helpers` (`d147fe5`)
5. `refactor(agent): extract task summary and failure message helpers` (`fde71a8`)
6. `refactor(agent): extract workspace fs retry helpers` (`0f40aaa`)
7. `refactor(agent): extract lifecycle prompt and restore message helpers` (`05b4224`)
8. `refactor(agent): extract referenced snapshot id collection` (`48c0d39`)
9. `refactor(agent): extract verification and approval guard helpers` (`78a6069`)
10. `refactor(agent): extract task run guard helpers` (`9193a75`)
11. `refactor(agent): extract runtime probe parser helpers` (`048428e`)
12. `refactor(agent): extract verification label helpers` (`12924d0`)
13. `refactor(agent): extract runtime verification selector helpers` (`a79628e`)
14. `refactor(agent): extract runtime verification message helpers` (`96017a3`)
15. `refactor(agent): extract preferred run command resolver` (`aea3620`)
16. `refactor(agent): extract verification script resolver helpers` (`2ca447d`)
17. `refactor(agent): extract loose package manifest parser` (`b2460bc`)
18. `refactor(agent): extract npm script request builder` (`a2b10b0`)
19. `refactor(agent): extract model route selection reason builder` (`4708e95`)
20. `refactor(agent): extract task attachment prompt helpers` (`200fcf4`)
21. `refactor(agent): extract task failure classification helpers` (`00ae10e`)
22. `refactor(agent): extract workspace path resolution helpers` (`3225358`)
23. `refactor(agent): extract task telemetry initialization helper` (`e0dfa25`)
24. `refactor(agent): extract startup signal detection helpers` (`5990ab3`)
25. `refactor(agent): extract failure category guidance helper` (`9b09236`)
26. `refactor(agent): extract model failure status helper` (`f6ee151`)
27. `refactor(agent): extract failure memory guidance helpers` (`f133937`)
28. `refactor(agent): extract model route failure message helpers` (`76b7659`)
29. `refactor(agent): extract model route scoring helpers` (`231b95f`)
30. `refactor(agent): extract model route stats helpers` (`c141306`)
31. `refactor(agent): extract model route task state helpers` (`8d327c7`)

### Targeted Runtime Optimization
1. `perf(router): load logs only on explicit router refresh` (`a6e0d8f`)

### Test Coverage
1. `test(agent): cover task-change event emission paths` (`d483147`)
2. `test(mcp): runtime onChanged notification coverage` (included in `366c7a1`)
3. `test(agent): add model route scoring helper coverage` (`231b95f`)
4. `test(agent): add model route stats helper coverage` (`c141306`)
5. `test(agent): add model route task state helper coverage` (`8d327c7`)

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
3. Large-file modularization (`renderer/app.ts`, `agentTaskRunner.ts`): in progress (`agentTaskRunner` helper extraction advanced across snapshot/messaging/fs/lifecycle/model-route-task-state slices).
4. Async buffered logging with redaction guardrails: pending.
5. Orphan placeholder cleanup: pending (defer until file ownership scope is explicit).

## Confirmed Pending Scope (Apr 28, 2026)
1. Modularization pass:
   - Split `src/renderer/app.ts` into smaller modules with no behavior change.
   - Continue splitting `src/main/services/agentTaskRunner.ts` into smaller units (workspace guards, snapshot helpers, task/lifecycle messages, fs retry helpers, verification guards, run guards, runtime probe parsers, verification labels, runtime verification selectors/messages, preferred run command resolver, verification script resolver, loose manifest parser, npm script request builder, model route selection reason builder, task attachment prompt helpers, task failure classification helpers, workspace path resolution helpers, task telemetry initialization helper, startup signal detection helpers, failure category guidance helper, model failure status helper, failure memory guidance helpers, model route failure message helpers, model route scoring helpers, model route stats helpers, and model route task state helpers extracted).
2. Logging hardening:
   - Introduce async buffered logging with redaction guardrails.
3. Cleanup pass:
   - Remove orphan placeholders only after ownership/scope is explicitly confirmed.

## Rollback Guidance
- Keep one commit per small change (already followed).
- If regression appears, rollback to the latest green checkpoint commit.
- Suggested rollback anchors (latest first):
  - `8d327c7`
  - `c141306`
  - `231b95f`
  - `76b7659`
  - `f133937`
  - `f6ee151`
  - `9b09236`
  - `5990ab3`
  - `e0dfa25`
  - `3225358`
  - `00ae10e`
  - `200fcf4`
  - `4708e95`
  - `a2b10b0`
  - `b2460bc`
  - `2ca447d`
  - `aea3620`
  - `96017a3`
  - `a79628e`
  - `12924d0`
  - `048428e`
  - `9193a75`
  - `78a6069`
  - `48c0d39`
  - `05b4224`
  - `0f40aaa`
  - `fde71a8`
  - `d147fe5`
  - `7c7e89a`
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
