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
- Test status (latest run): `433 passed / 0 failed`.
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
32. `refactor(agent): extract route telemetry summary helper` (`d44f5c5`)
33. `refactor(logging): add async buffered logger redaction guardrails` (`815682c`)
34. `refactor(agent): extract structured fix response parser` (`bedf67a`)
35. `refactor(agent): extract task log store helpers` (`a5d6879`)
36. `refactor(agent): extract failure memory store helpers` (`cb01d50`)
37. `refactor(agent): extract task route state cleanup helper` (`fc36878`)
38. `refactor(agent): extract failure memory upsert helper` (`f4869bd`)
39. `refactor(agent): extract project naming helpers` (`6debaaf`)
40. `refactor(agent): extract bootstrap command builder` (`16333cd`)

### Targeted Runtime Optimization
1. `perf(router): load logs only on explicit router refresh` (`a6e0d8f`)

### Test Coverage
1. `test(agent): cover task-change event emission paths` (`d483147`)
2. `test(mcp): runtime onChanged notification coverage` (included in `366c7a1`)
3. `test(agent): add model route scoring helper coverage` (`231b95f`)
4. `test(agent): add model route stats helper coverage` (`c141306`)
5. `test(agent): add model route task state helper coverage` (`8d327c7`)
6. `test(agent): add route telemetry summary helper coverage` (`d44f5c5`)
7. `test(logging): add buffered logger and redaction guardrail coverage` (`815682c`)
8. `test(agent): add task log store helper coverage` (`a5d6879`)
9. `test(agent): add failure memory store helper coverage` (`cb01d50`)
10. `test(agent): add task route state cleanup helper coverage` (`fc36878`)
11. `test(agent): add failure memory upsert helper coverage` (`f4869bd`)
12. `test(agent): add project naming helper coverage` (`6debaaf`)
13. `test(agent): add bootstrap command builder coverage` (`16333cd`)

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
3. Large-file modularization (`renderer/app.ts`, `agentTaskRunner.ts`): in progress (`agentTaskRunner` helper extraction advanced across snapshot/messaging/fs/lifecycle/failure-memory-store slices).
4. Async buffered logging with redaction guardrails: completed.
5. Orphan placeholder cleanup: pending (defer until file ownership scope is explicit).

## Confirmed Pending Scope (Apr 28, 2026)
1. Modularization pass:
   - Split `src/renderer/app.ts` into smaller modules with no behavior change (in progress; type/interface declarations plus text/markdown/path helper slices are extracted, while runtime orchestration logic remains in `app.ts`).
   - `src/main/services/agentTaskRunner.ts` helper extraction track is largely complete through `bootstrapCommandBuilder`; current working-tree progress now extracts desktop, notes, kanban, marketing, style, dashboard/CRUD heuristic template generation, dashboard/CRUD heuristic workspace edit-assembly builders, dashboard/CRUD domain-aware template composition builders, notes/kanban heuristic workspace edit-assembly builders, marketing heuristic workspace edit-assembly builders, desktop/API domain-content builders, bootstrap template builders, node-package starter template builders, node-package manifest/bootstrap metadata builders, generated React scaffold file templates, generated React/Desktop scaffold file-list builders, generated package-manifest normalization helpers, and generated generic-artifact inference helpers into dedicated helper modules.
2. Cleanup pass:
   - Remove orphan placeholders only after ownership/scope is explicitly confirmed.
3. Verification note:
   - All `46` commit anchors referenced in this checkpoint were validated in local git history on `2026-04-28`.

## Current Working-Tree Progress (Uncommitted, Apr 28, 2026)
1. `refactor(agent): extract desktop heuristic workspace template builder`
   - Moved large `buildHeuristicDesktopWorkspace` string-template blocks from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicDesktopWorkspaceTemplate.ts`.
   - Kept behavior unchanged by wiring `agentTaskRunner` to consume `buildHeuristicDesktopWorkspaceTemplate(...)`.
2. `refactor(agent): extract notes heuristic template builders`
   - Moved `buildNotesAppTsx`, `buildStaticNotesHtml`, `buildStaticNotesCss`, and `buildStaticNotesJs` template bodies into `src/main/services/heuristicNotesTemplates.ts`.
   - Kept behavior unchanged by using delegating wrappers from `agentTaskRunner`.
3. `refactor(agent): extract kanban heuristic template builders`
   - Moved `buildKanbanBoardTsx`, `buildKanbanBoardCss`, `buildKanbanBoardIndexCss`, `buildStaticKanbanHtml`, and `buildStaticKanbanJs` template bodies into `src/main/services/heuristicKanbanTemplates.ts`.
   - Kept behavior unchanged by using delegating wrappers from `agentTaskRunner`.
4. `refactor(agent): extract marketing heuristic template builders`
   - Moved pricing, announcement, and landing page template bodies from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicMarketingTemplates.ts`.
   - Kept behavior unchanged by using delegating wrappers from `agentTaskRunner`.
5. `refactor(agent): extract style heuristic template builders`
   - Moved dashboard and CRUD stylesheet template bodies from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicStyleTemplates.ts`.
   - Kept behavior unchanged by using delegating wrappers from `agentTaskRunner`.
6. `refactor(agent): extract static dashboard and CRUD template builders`
   - Moved `buildStaticDashboardHtml`, `buildStaticDashboardJs`, `buildStaticCrudHtml`, and `buildStaticCrudJs` template bodies from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicStaticDashboardCrudTemplates.ts`.
   - Kept behavior unchanged by using delegating wrappers from `agentTaskRunner`.
7. `refactor(agent): extract React dashboard and CRUD template builders`
   - Moved `buildDashboardTsx`, `buildCrudAppTsx`, and `buildVendorPaymentsCrudAppTsx` template bodies from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicReactDashboardCrudTemplates.ts`.
   - Kept behavior unchanged by using delegating wrappers from `agentTaskRunner`.
8. `refactor(agent): extract dashboard and CRUD domain-content builders`
   - Moved `buildDashboardDomainContent` and `buildCrudDomainContent` data builders from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicDashboardCrudDomainContent.ts`.
   - Kept behavior unchanged by using delegating wrappers from `agentTaskRunner`.
9. `refactor(renderer): extract app type/interface declarations`
   - Moved the large renderer type/interface declaration block from `src/renderer/app.ts` into `src/renderer/appTypes.ts`.
   - Kept behavior unchanged by leaving runtime logic in `app.ts` and preserving the existing non-module renderer script load path.
10. `refactor(agent): extract desktop and API domain-content builders`
   - Moved `buildDesktopDomainContent` and `buildApiEntityForDomain` data builders from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicDesktopApiDomainContent.ts`.
   - Kept behavior unchanged by using delegating wrappers from `agentTaskRunner`.
11. `refactor(renderer): extract non-module text/markdown utility helpers`
   - Moved shared renderer helpers (`formatUiTime`, `compactModelName`, `stripAnsi`, `escHtml`, `sanitizeDownloadName`, `renderMarkdown`, and `formatConsoleValue`) from `src/renderer/app.ts` into `src/renderer/appTextUtils.ts`.
   - Preserved classic script runtime behavior by loading `appTextUtils.js` before `app.js` in `src/renderer/index.html`.
12. `refactor(renderer): extract non-module path utility helpers`
   - Moved shared renderer path helpers (`normalizePathForComparison`, `isSameOrInsidePath`, `getParentPath`, `findCommonPath`, `getPathDisplayName`, and `formatClaudeTimelinePath`) from `src/renderer/app.ts` into `src/renderer/appPathUtils.ts`.
   - Preserved classic script runtime behavior by loading `appPathUtils.js` before `appTextUtils.js` and `app.js` in `src/renderer/index.html`.
13. `refactor(agent): extract bootstrap template builders`
   - Moved general React starter, static bootstrap HTML/CSS/JS, desktop bootstrap app/style templates, and generated desktop Electron main/preload template bodies from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicBootstrapTemplates.ts`.
   - Kept behavior unchanged by using delegating wrappers from `agentTaskRunner`.
14. `test: update source-introspection coverage for extracted helper modules`
   - Updated renderer/source introspection tests to load the compiled runtime script set (`appPathUtils.js`, `appTextUtils.js`, and `app.js`) instead of assuming all helper functions live in `app.js`.
   - Updated generated desktop installer workflow coverage to assert `agentTaskRunner` delegation plus template-body ownership in `heuristicBootstrapTemplates.ts`.
15. `refactor(agent): extract node-package starter templates`
   - Moved `buildNodePackageStarterContent` template bodies from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicNodePackageTemplates.ts`.
   - Kept behavior unchanged by using delegating wrappers from `agentTaskRunner` and passing domain-resolved API entity content.
16. `refactor(agent): extract node-package manifest/bootstrap metadata builders`
   - Moved `buildNodePackageScripts`, `buildNodePackageManifest`, `buildReactBootstrapHtml`, and `buildGeneratedDesktopAppId` template/helper bodies from `src/main/services/agentTaskRunner.ts` into dedicated helper modules (`src/main/services/heuristicNodePackageTemplates.ts` and `src/main/services/heuristicBootstrapTemplates.ts`).
   - Kept behavior unchanged by using delegating wrappers from `agentTaskRunner`.
17. `refactor(agent): extract project readme template builder`
   - Moved `buildProjectReadme` content assembly and run-command recommendation logic from `src/main/services/agentTaskRunner.ts` into `src/main/services/projectReadmeTemplate.ts`.
   - Kept behavior unchanged by preserving the same markdown sections and delegating starter-profile label rendering through existing `agentTaskRunner` logic.
18. `refactor(agent): extract generated desktop launch script template`
   - Moved the large generated desktop `scripts/desktop-launch.mjs` scaffold body from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicBootstrapTemplates.ts`.
   - Kept behavior unchanged by delegating `ensureGeneratedReactProjectFiles` script writing to `buildGeneratedDesktopLaunchScriptTemplate()`.
19. `refactor(agent): extract generated react scaffold file templates`
   - Moved generated React scaffold file bodies for `vite.config.ts`, `eslint.config.js`, `tsconfig.json`, `tsconfig.app.json`, `tsconfig.node.json`, and `src/main.tsx` from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicBootstrapTemplates.ts`.
   - Kept behavior unchanged by delegating `ensureGeneratedReactProjectFiles` file writes to the new helper builders.
20. `refactor(agent): extract generated package-manifest normalization helpers`
   - Moved static/generic generated `package.json` normalization logic from `ensureGeneratedAppPackageJson` in `src/main/services/agentTaskRunner.ts` into `src/main/services/generatedPackageManifestTemplates.ts`.
   - Kept behavior unchanged by delegating static/generic manifest construction while preserving the existing react/desktop manifest block in `agentTaskRunner`.
21. `refactor(agent): extract generated generic artifact inference helper`
   - Moved `inferGeneratedGenericArtifactType` decision logic from `src/main/services/agentTaskRunner.ts` into `src/main/services/generatedGenericArtifactType.ts`.
   - Kept behavior unchanged by preserving the `agentTaskRunner` method signature and delegating to the helper.
22. `refactor(agent): extract generated react scaffold generic-artifact inference helper`
   - Moved the `generated-apps` generic workspace artifact inference rules (`api-service` / `script-tool` / `library`) into `src/main/services/generatedGenericArtifactType.ts`.
   - Kept behavior unchanged by delegating the existing `agentTaskRunner` method to the new helper.
23. `refactor(agent): extract generated react/desktop scaffold file-list builders`
   - Moved generated scaffold file-list assembly from `ensureGeneratedReactProjectFiles` in `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicBootstrapTemplates.ts` via `buildGeneratedReactScaffoldFiles(...)` and `buildGeneratedDesktopScaffoldFiles(...)`.
   - Kept behavior unchanged by delegating scaffold write orchestration to helper-provided file lists while preserving the existing launch-script and desktop process/preload writes.
24. `refactor(agent): extract dashboard/crud heuristic workspace edit builders`
   - Moved heuristic dashboard/CRUD workspace edit assembly from `buildHeuristicDashboard` and `buildHeuristicCrudApp` in `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicDashboardCrudWorkspaceBuilders.ts`.
   - Kept behavior unchanged by delegating summary + edit payload construction while preserving prompt detection, domain-focus inference, and template-builder wiring in `agentTaskRunner`.
25. `refactor(agent): extract dashboard/crud domain-aware template composition builders`
   - Moved dashboard/CRUD domain-aware template composition wrappers from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicDashboardCrudTemplateComposers.ts`.
   - Kept behavior unchanged by delegating `buildStaticDashboardHtml`, `buildStaticDashboardJs`, `buildStaticCrudHtml`, `buildStaticCrudJs`, `buildDashboardTsx`, and `buildCrudAppTsx` while preserving existing call sites.
26. `refactor(agent): extract marketing heuristic workspace edit builders`
   - Moved landing/pricing/announcement heuristic workspace edit assembly from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicMarketingWorkspaceBuilders.ts`.
   - Kept behavior unchanged by preserving prompt-intent checks and delegating summary + edit payload construction to helper builders.
27. `refactor(agent): extract notes/kanban heuristic workspace edit builders`
   - Moved notes and kanban heuristic workspace edit assembly from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicNotesKanbanWorkspaceBuilders.ts`.
   - Kept behavior unchanged by preserving prompt-intent checks and delegating summary + edit payload construction to helper builders.
28. `refactor(agent): extract generic API/script/library heuristic workspace edit builders`
   - Moved API service, script-tool, and library heuristic workspace edit assembly from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicGenericWorkspaceBuilders.ts`.
   - Kept behavior unchanged by preserving existing prompt-intent/workspace checks and delegating domain/entity/project/path wiring from `agentTaskRunner`.
30. `refactor(agent): extract desktop heuristic workspace edit builder`
   - Moved desktop heuristic workspace edit assembly from `buildHeuristicDesktopWorkspace` in `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicDesktopWorkspaceBuilders.ts`.
   - Kept behavior unchanged by preserving existing desktop prompt classification checks and delegating summary + edit payload construction to the helper builder.
32. `refactor(agent): extract desktop heuristic prompt guard helpers`
   - Moved desktop prompt-classification guard logic from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicDesktopPromptGuards.ts`.
   - Kept behavior unchanged by preserving existing regex heuristics and delegating `isSimpleDesktopShellPrompt`, `isDesktopBusinessReportingPrompt`, and `isSimpleDesktopUtilityPrompt` through thin wrappers in `agentTaskRunner`.
34. `refactor(agent): extract starter placeholder marker helpers`
   - Moved starter placeholder marker detection logic from `detectStarterPlaceholderSignals` in `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicStarterPlaceholderSignals.ts`.
   - Kept behavior unchanged by preserving the existing marker list and delegating through a thin wrapper method in `agentTaskRunner`.
35. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).

## Rollback Guidance
- Keep one commit per small change (already followed).
- If regression appears, rollback to the latest green checkpoint commit.
- Suggested rollback anchors (latest first):
  - `16333cd`
  - `6debaaf`
  - `f4869bd`
  - `fc36878`
  - `cb01d50`
  - `a5d6879`
  - `bedf67a`
  - `815682c`
  - `d44f5c5`
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
