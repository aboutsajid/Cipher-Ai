# Upgrade Checkpoint (2026-04-27)

## Purpose
- Keep a clear memory of what was being upgraded.
- Preserve rollback-safe anchors while continuing incremental improvements.

## Autonomous Product Goal Roadmap (2026-04-30)
Goal: convert Cipher into a prompt-to-product factory where a detailed prompt can produce a verified Windows installer end-to-end.

1. Stabilization closeout (active now):
   - Finish partial P1 event-driven refresh work (polling as stale-event fallback only).
   - Keep renderer/source contracts green after each extraction or runtime tweak.
   - Keep one source-of-truth checkpoint in this workspace and sync external copies later.
2. Definition of Done hardening:
   - Require plan -> implement -> verify -> repair -> package -> installer smoke to pass before a run is marked successful.
   - Standardize structured task output for product handoff (`run`, `installer`, `known limitations`, `next fixes`).
3. One-click product pipeline:
   - Add an orchestrated "Build Product" run mode for agent tasks that enforces the full gated pipeline automatically.
4. Productization features:
   - Improve artifact diagnostics, failure auto-repair loops, and packaging quality signals for higher autonomous success rate.

## Current Snapshot
- Last sync: `2026-05-03 02:27:20 +04:00`
- Branch: `main`
- Workspace state: contains many existing modified/untracked files from the in-progress stream.
- App status: Electron app launches and runs.
- Manual launch check: `npm run start` executed on `2026-04-28`; Electron renderer processes started successfully.
- Landing status: duplicate bottom tagline removed from the main landing/empty state.
- Test status (latest run): `466 passed / 0 failed` (`npm test`).
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
3. Polling replacement with event-driven refresh: completed (event-driven primary with stale-event fallback polling for agent tasks; router/MCP already event-driven with guarded refresh paths).
4. Image history pagination/lazy loading: completed.
5. Router diagnostics now avoid redundant log history fetches during status-only refreshes: completed.

### P2 (Maintainability)
1. Unsubscribe-safe preload listener wrappers: completed.
2. Renderer listener teardown on unload: completed.
3. Large-file modularization (`renderer/app.ts`, `agentTaskRunner.ts`): completed for high-value orchestration scope (renderer modularization complete; `agentTaskRunner` run-task orchestration decomposition completed in entries `375/378/380/382/384/386`).
4. Async buffered logging with redaction guardrails: completed.
5. Orphan placeholder cleanup: completed (`2026-05-03`; removed orphan renderer backup placeholders and normalized node-package scaffold smoke-test labels).

## Confirmed Pending Scope (May 3, 2026)
1. Modularization pass:
   - Renderer split status: completed for `src/renderer/app.ts`; it now acts as a bootstrap hook while runtime/state/listener flows are hosted in extracted `app*UiUtils` modules.
   - `src/main/services/agentTaskRunner.ts` high-value orchestration decomposition is completed (`runTask`, verification gate coordination, packaging/installer-smoke flow, approval/finalization, inspect/setup/plan, and failure/finally helper extraction).
2. Cleanup pass:
   - Orphan placeholder cleanup completed after ownership/scope confirmation (`src/renderer/ui-backups/*.bak` removed; node-package scaffold test names no longer use placeholder wording).
3. Verification note:
   - All `46` commit anchors referenced in this checkpoint were validated in local git history on `2026-04-28`.
4. Operational pending:
   - Commit/sync is still pending; validated slices through `393` are checkpointed in workspace state.

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
36. `refactor(agent): extract preview bootstrap signal helper`
   - Moved preview bootstrap signal detection logic from `hasPreviewBootstrapSignals` in `src/main/services/agentTaskRunner.ts` into `src/main/services/previewBootstrapSignals.ts`.
   - Kept behavior unchanged by preserving existing static/react marker checks and delegating through a thin wrapper method in `agentTaskRunner`.
38. `refactor(agent): extract preview asset helper utilities`
   - Moved preview asset helper logic from `src/main/services/agentTaskRunner.ts` into `src/main/services/previewAssetHelpers.ts`.
   - Kept behavior unchanged by preserving existing regex/path/css checks and delegating `normalizeLocalHtmlScriptsForVite`, `resolvePreviewAssetPath`, `escapeRegExp`, and `isLikelyValidStylesheet` through thin wrappers in `agentTaskRunner`.
40. `refactor(agent): extract served web page URL resolver helper`
   - Moved served web page URL resolution logic from `resolveServedWebPageUrl` in `src/main/services/agentTaskRunner.ts` into `src/main/services/servedWebPageUrlResolver.ts`.
   - Kept behavior unchanged by preserving runtime-output URL parsing and static/react script fallback behavior, while delegating through a thin wrapper method in `agentTaskRunner`.
41. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
42. `refactor(agent): extract generated prompt guard helpers`
   - Moved generated notes/package prompt guard logic from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicGeneratedPromptGuards.ts`.
   - Kept behavior unchanged by preserving existing regex heuristics and delegating `isSimpleNotesAppPrompt` and `isSimpleGeneratedPackagePrompt` through thin wrappers in `agentTaskRunner`.
43. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
44. `refactor(agent): extract prompt requirement heuristics`
   - Moved prompt-requirement extraction and related summary/auth requirement guards from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicPromptRequirements.ts`.
   - Kept behavior unchanged by preserving existing requirement IDs/regex heuristics and delegating `extractPromptRequirements` through a thin wrapper in `agentTaskRunner`.
45. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
46. `refactor(agent): extract workspace path helper heuristics`
   - Moved workspace path normalization/guard helpers and explicit prompt file-path extraction from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicWorkspacePathHelpers.ts`.
   - Kept behavior unchanged by preserving path normalization rules and delegating `joinWorkspacePath`, `isPathInsideWorkingDirectory`, and `extractExplicitPromptFilePaths` through thin wrappers in `agentTaskRunner`.
47. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
48. `refactor(agent): extract generated scaffold recovery heuristics`
   - Moved builder-recovery scaffold heuristics from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicGeneratedScaffoldRecovery.ts`.
   - Kept behavior unchanged by preserving builder-mode/scaffold conflict detection and delegating `isBuilderRecoveryPrimaryPlan`, `getConflictingScaffoldPaths`, and `isUnexpectedGeneratedAppFile` through thin wrappers in `agentTaskRunner`.
49. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
50. `refactor(agent): extract builder mode guard helpers`
   - Moved builder-mode detection and locked-builder guard logic from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicBuilderModeGuards.ts`.
   - Kept behavior unchanged by preserving prompt-signal heuristics and delegating `detectBuilderMode` plus `isLockedBuilderPlan` through thin wrappers in `agentTaskRunner`.
51. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
52. `refactor(agent): extract prompt artifact guard helpers`
   - Moved prompt artifact-classification heuristics from `src/main/services/agentTaskRunner.ts` into `src/main/services/heuristicPromptArtifactGuards.ts`.
   - Kept behavior unchanged by preserving desktop/CRUD/web/api/library/script signal rules and delegating `inferArtifactTypeFromPrompt`, `looksLikeDesktopPrompt`, and `looksLikeCrudAppPrompt` through thin wrappers in `agentTaskRunner`.
53. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
54. `refactor(agent): extract windows packaging verification guards`
   - Moved Windows packaging verification label/platform guard logic from `src/main/services/agentTaskRunner.ts` into `src/main/services/windowsPackagingVerificationGuards.ts`.
   - Kept behavior unchanged by delegating `getPackagingVerificationLabel` and `shouldVerifyWindowsPackaging` through thin wrappers in `agentTaskRunner`.
   - Updated generated desktop installer workflow source-introspection coverage to assert delegation in `agentTaskRunner` and template ownership in `windowsPackagingVerificationGuards.ts`.
55. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
56. `refactor(agent): extract package artifact inference helper`
   - Moved package-manifest artifact inference logic from `inferArtifactTypeFromPackage` in `src/main/services/agentTaskRunner.ts` into `src/main/services/packageArtifactType.ts`.
   - Kept behavior unchanged by preserving dependency/script/name heuristics and delegating through a thin wrapper in `agentTaskRunner`.
57. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
58. `refactor(agent): extract artifact type classifier helper`
   - Moved artifact type classification decision logic from `classifyArtifactType` in `src/main/services/agentTaskRunner.ts` into `src/main/services/artifactTypeClassifier.ts`.
   - Kept behavior unchanged by preserving prompt/package/workspace precedence and delegating through a thin wrapper in `agentTaskRunner`.
59. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
60. `refactor(agent): extract task output builder helper`
   - Moved task output action/message selection logic from `buildTaskOutput` in `src/main/services/agentTaskRunner.ts` into `src/main/services/taskOutputBuilder.ts`.
   - Kept behavior unchanged by preserving artifact-specific primary actions and usage-detail messaging, while delegating through a thin wrapper in `agentTaskRunner`.
61. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
62. `refactor(agent): extract entry-path alias group helper`
   - Moved requested entry-path alias group resolution logic from `getRequestedEntryPathAliasGroups` in `src/main/services/agentTaskRunner.ts` into `src/main/services/entryPathAliasGroups.ts`.
   - Kept behavior unchanged by preserving desktop-react alias mapping and delegating through a thin wrapper in `agentTaskRunner`.
63. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
64. `refactor(agent): extract entry-file requirement path helper`
   - Moved required entry-path assembly from `verifyExpectedEntryFiles` in `src/main/services/agentTaskRunner.ts` into `src/main/services/entryFileRequirements.ts`.
   - Kept behavior unchanged by preserving workspace-kind and desktop-react entry requirements, while delegating path set construction through a thin wrapper in `agentTaskRunner`.
65. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
66. `refactor(agent): extract workspace existence check helpers`
   - Moved filesystem existence checks from `pathExists` and `allFilesExist` in `src/main/services/agentTaskRunner.ts` into `src/main/services/workspaceExistenceChecks.ts`.
   - Kept behavior unchanged by preserving `stat`-based semantics and delegating through thin wrappers in `agentTaskRunner`.
67. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
68. `refactor(agent): extract workspace kind detector helper`
   - Moved workspace kind detection logic from `detectWorkspaceKind` in `src/main/services/agentTaskRunner.ts` into `src/main/services/workspaceKindDetector.ts`.
   - Kept behavior unchanged by preserving static/react file checks and delegating through a thin wrapper in `agentTaskRunner`.
69. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
70. `refactor(agent): extract repository convention detector helpers`
   - Moved repository convention detection logic from `detectModuleFormat`, `detectUiFramework`, `detectStylingApproach`, `detectTestingTool`, and `detectLintingTool` in `src/main/services/agentTaskRunner.ts` into `src/main/services/repositoryConventionDetectors.ts`.
   - Kept behavior unchanged by preserving dependency/script heuristics and delegating through thin wrappers in `agentTaskRunner`.
71. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
72. `refactor(agent): extract starter profile and domain focus heuristics`
   - Moved starter-profile and domain-focus heuristics from `inferStarterProfile`, `describeStarterProfile`, `inferDomainFocus`, and `describeDomainFocus` in `src/main/services/agentTaskRunner.ts` into `src/main/services/starterDomainFocusHeuristics.ts`.
   - Kept behavior unchanged by preserving existing artifact/builder-mode/domain regex rules and delegating through thin wrappers in `agentTaskRunner`.
73. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
74. `refactor(agent): extract task execution spec builder helpers`
   - Moved execution-spec assembly logic from `buildSpecRequiredFiles`, `buildSpecRequiredScriptGroups`, `buildSpecDeliverables`, `buildSpecAcceptanceCriteria`, and `buildSpecQualityGates` in `src/main/services/agentTaskRunner.ts` into `src/main/services/taskExecutionSpecBuilders.ts`.
   - Kept behavior unchanged by preserving starter-profile/workspace/domain rules and delegating path-guard checks through callbacks from `agentTaskRunner`.
75. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
76. `refactor(agent): extract workspace-kind prompt resolver helper`
   - Moved prompt/requested-path workspace-kind override logic from `resolveWorkspaceKindForPrompt` in `src/main/services/agentTaskRunner.ts` into `src/main/services/workspaceKindPromptResolver.ts`.
   - Kept behavior unchanged by preserving desktop/static/react signal precedence and delegating prompt artifact inference through a callback from `agentTaskRunner`.
77. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
78. `refactor(agent): extract task work-item planner helper`
   - Moved task work-item planning logic from `buildTaskWorkItems` in `src/main/services/agentTaskRunner.ts` into `src/main/services/taskWorkItemBuilder.ts`.
   - Kept behavior unchanged by preserving artifact-aware work-item branching and delegating prompt classification/domain labeling/path guards through callbacks from `agentTaskRunner`.
79. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
80. `refactor(agent): extract task execution spec planner helper`
   - Moved execution-spec assembly orchestration from `buildTaskExecutionSpec` in `src/main/services/agentTaskRunner.ts` into `src/main/services/taskExecutionSpecPlanner.ts`.
   - Kept behavior unchanged by preserving starter/domain/readme gating logic and delegating all spec sub-builder invocations through callbacks from `agentTaskRunner`.
81. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
82. `refactor(agent): extract repository-context summary helper`
   - Moved repository convention summary/conventions assembly from `buildRepositoryContext` in `src/main/services/agentTaskRunner.ts` into `src/main/services/repositoryContextSummary.ts`.
   - Kept behavior unchanged by preserving package-manager/language/module/ui/styling/testing/linting summary wording and delegating only signal collection to `agentTaskRunner`.
83. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
84. `refactor(renderer): extract managed-write permission helper cluster`
   - Moved Claude managed-write attachment/path/root permission and filesystem-tool guard helpers (`getEditableSourcePaths`, `getWritableRootPaths`, `getClaudeManagedEditPermissions`, `buildClaudeManagedEditBaselines`, `hasManagedSaveTargets`, `hasFilesystemToolConfigured`, `hasFilesystemToolEnabled`) from `src/renderer/app.ts` into `src/renderer/appManagedWriteUtils.ts`.
   - Kept behavior unchanged by preserving classic renderer script loading and adding `appManagedWriteUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer runtime source-introspection coverage to include `dist/renderer/appManagedWriteUtils.js`.
85. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (current local total after this extraction run).
86. `refactor(renderer): extract MCP and Ollama panel helpers`
   - Moved MCP/Ollama UI helper functions (`parseArgsInput`, `getEnabledToolNames`, `renderMcpTools`, `renderMcpServers`, `refreshMcpStatus`, `renderOllamaModels`, `toggleOllamaSettingsVisibility`) from `src/renderer/app.ts` into `src/renderer/appMcpOllamaUiUtils.ts`.
   - Kept behavior unchanged by preserving classic renderer script loading and adding `appMcpOllamaUiUtils.js` before `app.js` in `src/renderer/index.html`.
87. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
88. `refactor(renderer): extract chat UI helper clusters`
   - Moved composer attachment helpers (`mergeAttachments`, `renderComposerAttachments`, `updateAttachButtonState`) from `src/renderer/app.ts` into `src/renderer/appComposerAttachmentUiUtils.ts`.
   - Moved message/meta helpers (`refreshCompareUi`, `renderMessageAttachmentNames`, `updateHeaderBuildLabel`) from `src/renderer/app.ts` into `src/renderer/appMessageMetaUiUtils.ts`.
   - Moved chat-list search helpers (`updateChatSearchClearButton`, `getFilteredChats`, `setupChatListSearch`) from `src/renderer/app.ts` into `src/renderer/appChatListSearchUiUtils.ts`.
   - Moved chat rename/export helpers (`openRenameModalForChat`, `openRenameModal`, `closeRenameModal`, `exportChatById`, `confirmRename`) and associated rename state into `src/renderer/appChatRenameActionsUtils.ts`.
   - Kept behavior unchanged by preserving classic renderer script loading and adding the new helper scripts before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include the extracted helper modules.
89. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
90. `refactor(renderer): extract menu and clipboard image helpers`
   - Moved header/chat menu helpers (`showHeaderToolsMenu`, `closeChatItemMenus`, `showChatItemMenu`, `getHeaderToolsMenuItems`, `focusHeaderToolsMenuItem`, `showChatProviderMenu`, `refreshChatProviderMenuUi`) from `src/renderer/app.ts` into `src/renderer/appHeaderMenusUiUtils.ts`.
   - Moved clipboard image conversion helpers (`imageExtensionFromMime`, `fileToDataUrl`) from `src/renderer/app.ts` into `src/renderer/appClipboardImageUtils.ts`.
   - Kept behavior unchanged by preserving classic renderer script loading and adding helper scripts before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include the newly extracted helper modules.
91. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
92. `refactor(renderer): extract guided empty-state helpers`
   - Moved guided empty-state and onboarding action helpers (`createEmptyStateElement`, `handleGuidedUiAction`, `setupGuidedUiControls`) from `src/renderer/app.ts` into `src/renderer/appGuidedEmptyStateUiUtils.ts`.
   - Kept behavior unchanged by preserving classic renderer script loading and adding `appGuidedEmptyStateUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include the extracted guided-empty-state helper module.
93. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
94. `refactor(renderer): extract draft-chat and preview-modal helpers`
   - Moved draft-chat/reset helpers (`clearRenderedMessages`, `hideSummaryOverlay`, `showSummaryOverlay`, `clearMessages`, `openDraftChat`) from `src/renderer/app.ts` into `src/renderer/appChatDraftUiUtils.ts`.
   - Moved preview/stats modal helpers (`openCodePreview`, `openImagePreview`, `closePreviewWorkspace`, `closeCodePreview`, `closeImagePreviewModal`, `closeStatsModal`, `openStatsModal`) from `src/renderer/app.ts` into `src/renderer/appPreviewModalUiUtils.ts`.
   - Kept behavior unchanged by preserving classic renderer script loading and adding both helper scripts before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include the newly extracted helper modules.
95. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
96. `refactor(renderer): extract scroll and auto-scroll helpers`
   - Moved scroll-state helpers (`getMessagesBottomDistance`, `isNearBottom`, `ensureScrollBottomButton`, `updateScrollBottomButton`, `syncAutoScrollState`, `scrollToBottom`, `maybeAutoScroll`, `scheduleChunkAutoScroll`, `flushChunkAutoScroll`) from `src/renderer/app.ts` into `src/renderer/appScrollUiUtils.ts`.
   - Kept behavior unchanged by preserving classic renderer script loading and adding `appScrollUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include the extracted scroll helper module.
97. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
98. `refactor(renderer): extract image studio/history helpers`
   - Moved image provider/model/aspect sync helpers and image history/gallery rendering helpers from `src/renderer/app.ts` into `src/renderer/appImageStudioUiUtils.ts`.
   - Kept behavior unchanged by preserving `submitImageGeneration` in `src/renderer/app.ts` for elapsed-timer source-contract coverage while extracting the surrounding image-studio flow helpers.
   - Kept classic renderer script loading by adding `appImageStudioUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appImageStudioUiUtils.ts`.
99. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
100. `refactor(renderer): extract panel resize setup helpers`
   - Moved panel/side-bar resize setup helpers (`setupRightPanelResizeControls`, `setupSidebarResizeControls`) from `src/renderer/app.ts` into `src/renderer/appPanelResizeUiUtils.ts`.
   - Kept behavior unchanged by preserving existing width persistence, pointer drag handling, keyboard resize shortcuts, and button controls.
   - Kept classic renderer script loading by adding `appPanelResizeUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appPanelResizeUiUtils.ts`.
101. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
102. `refactor(renderer): extract runtime setup control helpers`
   - Moved runtime setup/control helpers (`setupPreviewPanel`, `refreshClaudeSessionStatus`, `setupClaudePanel`, `setupModeSwitcher`, `setupCompareControls`, `setupOllamaControls`, `setupMcpControls`, `setupMessageInteractions`, `closeRightPanel`, `setupVirtualScrolling`, `setupOnboardingControls`) from `src/renderer/app.ts` into `src/renderer/appRuntimeSetupUiUtils.ts`.
   - Kept behavior unchanged by preserving existing event wiring, preview actions, Claude status refresh handling, mode/provider toggles, message interaction handlers, panel closing behavior, and onboarding actions.
   - Kept classic renderer script loading by adding `appRuntimeSetupUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appRuntimeSetupUiUtils.ts`.
103. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
104. `refactor(renderer): extract keyboard shortcuts helper`
   - Moved `setupKeyboardShortcuts` from `src/renderer/app.ts` into `src/renderer/appKeyboardShortcutsUiUtils.ts`.
   - Kept behavior unchanged by preserving keyboard command handling (new chat/window, router/settings/model focus, selected-text paste shortcut, and Escape-driven modal/panel dismiss flow).
   - Kept classic renderer script loading by adding `appKeyboardShortcutsUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appKeyboardShortcutsUiUtils.ts`.
105. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
106. `refactor(renderer): extract composer tools setup helper`
   - Moved `setupComposerTools` from `src/renderer/app.ts` into `src/renderer/appComposerToolsUiUtils.ts`.
   - Kept behavior unchanged by preserving attachment picker wiring, provider-menu toggles, header-tools menu keyboard/click handling, and chat-item menu close behavior.
   - Kept classic renderer script loading by adding `appComposerToolsUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appComposerToolsUiUtils.ts`.
107. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
108. `refactor(renderer): extract composer and voice setup helpers`
   - Moved composer/voice helper cluster (`addClipboardImages`, `setupComposer`, `encodePcm16Wav`, `setupVoiceInput`) from `src/renderer/app.ts` into `src/renderer/appComposerVoiceUiUtils.ts`.
   - Kept behavior unchanged by preserving composer auto-resize/input/paste handling and full MediaRecorder/PCM fallback voice-transcription flow.
   - Kept classic renderer script loading by adding `appComposerVoiceUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appComposerVoiceUiUtils.ts`.
109. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
110. `refactor(renderer): extract agent controls setup helper`
   - Moved `setupAgentControls` from `src/renderer/app.ts` into `src/renderer/appAgentControlsUiUtils.ts`.
   - Kept behavior unchanged by preserving agent prompt/start/stop/restore handlers, route-health actions, history/snapshot click handlers, and task selection sync behavior.
   - Kept classic renderer script loading by adding `appAgentControlsUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appAgentControlsUiUtils.ts`.
111. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
112. `refactor(renderer): extract panel body and managed preview helpers`
   - Moved panel-body/preview helpers (`setPanelBody`, `refreshPreviewFrame`, `openManagedPreview`) from `src/renderer/app.ts` into `src/renderer/appPanelBodyPreviewUiUtils.ts`.
   - Kept behavior unchanged by preserving `openPanel` in `src/renderer/app.ts` (including router log-refresh trigger) while extracting the reusable panel-body/preview helper cluster.
   - Kept classic renderer script loading by adding `appPanelBodyPreviewUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appPanelBodyPreviewUiUtils.ts`.
113. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
114. `refactor(renderer): extract agent task lifecycle helpers`
   - Moved agent task lifecycle helpers (`startAgentTaskPrompt`, `restartAgentTaskPrompt`) from `src/renderer/app.ts` into `src/renderer/appAgentTaskActionsUiUtils.ts`.
   - Kept behavior unchanged by preserving existing target-selection checks, approval warnings, attachment handoff, task state updates, and retry-clean confirmation flow.
   - Kept classic renderer script loading by adding `appAgentTaskActionsUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appAgentTaskActionsUiUtils.ts`.
115. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
116. `refactor(renderer): extract window sync helpers`
   - Moved window sync helpers (`openFreshWorkspaceWindow`, `syncChatStoreAcrossWindows`, `syncSettingsAcrossWindows`, `syncRouterStateAcrossWindows`) from `src/renderer/app.ts` into `src/renderer/appWindowSyncUiUtils.ts`.
   - Kept behavior unchanged by preserving existing new-window toast behavior and cross-window chat/settings/router synchronization flow.
   - Kept classic renderer script loading by adding `appWindowSyncUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appWindowSyncUiUtils.ts`.
117. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
118. `refactor(renderer): extract desktop launch helpers`
   - Moved desktop-launch helpers (`quotePowerShellLiteral`, `toDisplayLabel`, `canPromptToLaunchDesktopApp`, `promptToLaunchDesktopApp`) from `src/renderer/app.ts` into `src/renderer/appDesktopLaunchUiUtils.ts`.
   - Kept behavior unchanged by preserving desktop launch confirmation, PowerShell quoting, launch command invocation, and user-facing toast flows.
   - Kept `completedTaskIsRecent` and `shouldQueueDesktopLaunchPrompt` in `src/renderer/app.ts` to preserve desktop-launch source-contract assertions.
   - Kept classic renderer script loading by adding `appDesktopLaunchUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appDesktopLaunchUiUtils.ts`.
119. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
120. `refactor(renderer): extract shell layout helpers`
   - Moved shell-layout and onboarding helpers (`getInitialTheme`, `applyTheme`, `toggleTheme`, `getInitialUiExperience`, `applyUiExperience`, `toggleUiExperience`, sidebar width helpers, right-panel width helpers, and onboarding visibility helpers) from `src/renderer/app.ts` into `src/renderer/appShellLayoutUiUtils.ts`.
   - Kept behavior unchanged by preserving theme toggle labels, UI experience transitions, provider state refresh, panel width persistence, and onboarding visibility criteria.
   - Kept classic renderer script loading by adding `appShellLayoutUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appShellLayoutUiUtils.ts`.
121. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
122. `refactor(renderer): extract agent artifact helpers`
   - Moved agent artifact display/action helpers (`formatAgentArtifactType`, `getArtifactResultTitle`, `parseAgentArtifactTypeLabel`, `isWebArtifactType`, `isTaskPreviewable`, `getArtifactOpenLabel`, `formatAgentPrimaryAction`, `getArtifactUsageCopy`) from `src/renderer/app.ts` into `src/renderer/appAgentArtifactUiUtils.ts`.
   - Kept behavior unchanged by preserving artifact labels, primary-action labels, preview eligibility, open-folder labels, and artifact usage copy for all artifact variants.
   - Kept classic renderer script loading by adding `appAgentArtifactUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appAgentArtifactUiUtils.ts`.
123. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
124. `refactor(renderer): extract snapshot restore helpers`
   - Moved snapshot restore helpers (`getSnapshotKindLabel`, `getSnapshotRestoreActionLabel`, `getRestoreStateForTask`, `getRestoreStateBadgeLabel`, `getRestoreStateSummary`, `getRestoreStateDetail`, `buildSnapshotRestoreWarning`, `buildSnapshotRestoreSummary`, `formatSnapshotFileSample`, `openSnapshotRestoreModal`, `closeSnapshotRestoreModal`) from `src/renderer/app.ts` into `src/renderer/appSnapshotRestoreUiUtils.ts`.
   - Kept behavior unchanged by preserving snapshot-kind labels, restore-state messaging, warning/detail copy, file samples, and the restore modal compare-section flow.
   - Kept classic renderer script loading by adding `appSnapshotRestoreUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appSnapshotRestoreUiUtils.ts`.
125. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
126. `refactor(renderer): extract agent route summary helpers`
   - Moved agent route-exhaustion summary helpers (`compactAgentProviderFailureMessage`, `parseExhaustedAgentModelRoutes`, `summarizeExhaustedAgentModelRoutes`, `summarizeAgentTaskSummary`, `buildExhaustedRouteText`) from `src/renderer/app.ts` into `src/renderer/appAgentRouteSummaryUiUtils.ts`.
   - Kept behavior unchanged by preserving normalization, route parsing, concise status summary formatting, and model-fallback detail text generation.
   - Kept classic renderer script loading by adding `appAgentRouteSummaryUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appAgentRouteSummaryUiUtils.ts`.
127. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
128. `refactor(renderer): extract agent task result helpers`
   - Moved agent task result/history helpers (`isTaskTargetMissing`, snapshot lookup/render helpers, task primary/restart action builders, verification/result-overview builders, and parsed-result overview rendering) from `src/renderer/app.ts` into `src/renderer/appAgentTaskResultsUiUtils.ts`.
   - Kept behavior unchanged by preserving snapshot restore badges/actions, target-missing states, result overview summaries, verification badges, restart CTA wiring, and parsed agent card overview formatting.
   - Kept classic renderer script loading by adding `appAgentTaskResultsUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appAgentTaskResultsUiUtils.ts`.
129. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
130. `refactor(renderer): extract agent history view helpers`
   - Moved agent history/main-card rendering helpers (`buildMainChatCards`, `buildMainAgentTaskCards`, `renderAgentHistoryFilters`, `renderAgentHistoryControls`, `syncAgentHistoryPanelWidth`, `renderAgentHistory`) from `src/renderer/app.ts` into `src/renderer/appAgentHistoryUiUtils.ts`.
   - Kept behavior unchanged by preserving history filtering/expansion controls, target-missing indicators, verification badges, restart/action controls, and main panel card rendering flow.
   - Kept classic renderer script loading by adding `appAgentHistoryUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appAgentHistoryUiUtils.ts`.
131. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
132. `refactor(renderer): extract agent route health helpers`
   - Moved route-health/status helpers (`setAgentStatus`, task/route timestamp formatters, route diagnostics mapping/state helpers, model-health summarizers, and `renderSettingsModelHealth`) from `src/renderer/app.ts` into `src/renderer/appAgentRouteHealthUiUtils.ts`.
   - Kept behavior unchanged by preserving settings health-card rendering, model score/failure badges, active blacklist visibility, and route diagnostic helper logic.
   - Kept classic renderer script loading by adding `appAgentRouteHealthUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appAgentRouteHealthUiUtils.ts`.
133. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
134. `refactor(renderer): extract agent snapshots helpers`
   - Moved agent snapshot rendering/refresh helpers (`syncActiveAgentTaskSelectionUi`, `renderAgentSnapshots`, `refreshAgentSnapshots`) from `src/renderer/app.ts` into `src/renderer/appAgentSnapshotsUiUtils.ts`.
   - Kept behavior unchanged by preserving active-task selection sync, snapshot card rendering, restore/view-task actions, restore-state refresh, and snapshot list fetching.
   - Kept classic renderer script loading by adding `appAgentSnapshotsUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appAgentSnapshotsUiUtils.ts`.
135. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
136. `refactor(renderer): extract agent task chat helpers`
   - Moved agent task chat/update helpers (`getAgentApprovalWarning`, `buildAgentChatContent`, `buildAgentActivityLabel`, `buildAgentLatestUpdateLabel`, `ensureChatForAgentOutput`, `appendAgentTaskToChat`, `updateAgentTaskInChat`) from `src/renderer/app.ts` into `src/renderer/appAgentTaskChatUiUtils.ts`.
   - Kept behavior unchanged by preserving pre-start warning copy, agent activity/status summaries, verification and step transcript formatting, recent log embedding, and agent-to-chat append/update flows.
   - Kept desktop-launch queue assertions (`completedTaskIsRecent`, `shouldQueueDesktopLaunchPrompt`) in `src/renderer/app.ts` to preserve contract-sensitive behavior.
   - Kept classic renderer script loading by adding `appAgentTaskChatUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appAgentTaskChatUiUtils.ts`.
137. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
138. `refactor(renderer): extract agent message parser helpers`
   - Moved agent message parsing helpers (`ParsedAgentMessage`, `detectAgentPreviewUrl`, action-label parsers, step-title humanizer, previewability checks, and `parseAgentMessageContent`) from `src/renderer/app.ts` into `src/renderer/appAgentMessageParserUiUtils.ts`.
   - Kept behavior unchanged by preserving preview URL detection heuristics, artifact/action normalization, verification-check parsing, changed-file extraction, and parsed summary/log assembly.
   - Kept contract-sensitive panel/router snippets in `src/renderer/app.ts` so renderer DOM contract assertions remain stable.
   - Kept classic renderer script loading by adding `appAgentMessageParserUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appAgentMessageParserUiUtils.ts`.
139. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
140. `refactor(renderer): extract agent task refresh helpers`
   - Moved agent task refresh helpers (`summarizeAgentPrompt`, `refreshAgentTaskTargetStates`, `ensureAgentPolling`, `scheduleAgentTaskRefreshFromEvent`) from `src/renderer/app.ts` into `src/renderer/appAgentTaskRefreshUiUtils.ts`.
   - Kept behavior unchanged by preserving agent prompt truncation, async target-path existence caching, poll fallback scheduling, and debounced event-driven task refresh semantics.
   - Kept contract-sensitive desktop-launch queue assertions and router-panel `openPanel` contract snippets in `src/renderer/app.ts`.
   - Kept classic renderer script loading by adding `appAgentTaskRefreshUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appAgentTaskRefreshUiUtils.ts`.
141. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
142. `refactor(renderer): extract agent route diagnostics helpers`
   - Moved route diagnostics panel helpers (`renderAgentRouteDiagnostics`, `refreshAgentRouteDiagnostics`) from `src/renderer/app.ts` into `src/renderer/appAgentRouteDiagnosticsUiUtils.ts`.
   - Kept behavior unchanged by preserving active-task route-state cards, route-score/failure badges, blacklist progress messaging, global reliability rendering, and route-health error fallback handling.
   - Kept contract-sensitive router-panel and desktop-launch assertions in `src/renderer/app.ts`.
   - Kept classic renderer script loading by adding `appAgentRouteDiagnosticsUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appAgentRouteDiagnosticsUiUtils.ts`.
143. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
144. `refactor(renderer): extract agent task render helpers`
   - Moved `renderAgentTask` from `src/renderer/app.ts` into `src/renderer/appAgentTaskRenderUiUtils.ts`.
   - Kept behavior unchanged by preserving agent step/log panel rendering, artifact and execution-spec status lines, verification and failure-memory summary output, and target/restore-state footer messaging.
   - Kept contract-sensitive refresh ordering (`shouldQueueDesktopLaunchPrompt` before `renderAgentTask`) in `src/renderer/app.ts`.
   - Kept classic renderer script loading by adding `appAgentTaskRenderUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appAgentTaskRenderUiUtils.ts`.
145. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
146. `refactor(renderer): extract message resend helpers`
   - Moved chat resend/edit helpers (`queueMessageForResend`, `editUserMessage`, `regenerateAssistantMessage`) from `src/renderer/app.ts` into `src/renderer/appMessageResendUiUtils.ts`.
   - Kept behavior unchanged by preserving streaming guards, attachment guardrails, modal edit flow, resend composer repopulation, and assistant-regeneration fallback to the nearest prior user message.
   - Kept contract-sensitive router/desktop-launch assertions in `src/renderer/app.ts`.
   - Kept classic renderer script loading by adding `appMessageResendUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appMessageResendUiUtils.ts`.
147. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
148. `refactor(renderer): extract preview execution helpers`
   - Moved preview execution helpers (`renderCodeOutput`, `openDetachedPreview`, `runJavaScriptPreview`) from `src/renderer/app.ts` into `src/renderer/appPreviewExecutionUiUtils.ts`.
   - Kept behavior unchanged by preserving inline code-output panel rendering, detached-preview window launch flow, console capture/replay for script previews, and script error formatting.
   - Kept contract-sensitive router/desktop-launch assertions in `src/renderer/app.ts`.
   - Kept classic renderer script loading by adding `appPreviewExecutionUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appPreviewExecutionUiUtils.ts`.
149. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
150. `refactor(renderer): extract chat summary helpers`
   - Moved chat summarization/title helpers (`summarizeCurrentChat`, `maybeGenerateTitle`) from `src/renderer/app.ts` into `src/renderer/appChatSummaryUiUtils.ts`.
   - Kept behavior unchanged by preserving summary preconditions, summarizer call flow, generated-title guards, header update behavior, and chat-list refresh after title generation.
   - Kept contract-sensitive router/desktop-launch assertions in `src/renderer/app.ts`.
   - Kept classic renderer script loading by adding `appChatSummaryUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appChatSummaryUiUtils.ts`.
151. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
152. `refactor(renderer): extract chat lifecycle helpers`
   - Moved chat lifecycle helpers (`updateChatHeaderTitle`, `createNewChat`) from `src/renderer/app.ts` into `src/renderer/appChatLifecycleUiUtils.ts`.
   - Kept behavior unchanged by preserving chat-title stack updates, new-chat context initialization, prompt panel reset, virtual-message reset flow, attachment reset, and chat list refresh after chat creation.
   - Kept contract-sensitive router/desktop-launch assertions in `src/renderer/app.ts`.
   - Kept classic renderer script loading by adding `appChatLifecycleUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appChatLifecycleUiUtils.ts`.
153. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
154. `refactor(renderer): extract chat list render/load helpers`
   - Moved `renderChatList` and `loadChatList` from `src/renderer/app.ts` into `src/renderer/appChatListRenderUiUtils.ts`.
   - Kept behavior unchanged by preserving empty-state text, filtered-search empty-state text, per-chat action menu wiring, active chat highlighting, and delete/rename/export actions.
   - Kept classic renderer script loading by adding `appChatListRenderUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appChatListRenderUiUtils.ts`.
155. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
156. `refactor(renderer): extract settings panel helpers`
   - Moved `loadSettings` and `saveSettings` from `src/renderer/app.ts` into `src/renderer/appSettingsUiUtils.ts`.
   - Kept behavior unchanged by preserving provider-aware default-model resolution, Ollama/cloud model normalization, OpenRouter key-format validation, Claude filesystem draft serialization, and local voice availability badge refresh.
   - Kept classic renderer script loading by adding `appSettingsUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appSettingsUiUtils.ts`.
157. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
158. `refactor(renderer): extract streaming/send dispatch helpers`
   - Moved `setStreamingUi` and `sendMessage` from `src/renderer/app.ts` into `src/renderer/appSendUiUtils.ts`.
   - Kept behavior unchanged by preserving Claude elapsed-timer start/stop semantics, stream-status button toggles, and send-mode routing (agent, claude, edit, chat+attachments).
   - Kept classic renderer script loading by adding `appSendUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appSendUiUtils.ts`.
   - Updated `src/test/claudeElapsedTimer.test.ts` source introspection to read both `app.ts` and `appSendUiUtils.ts` so timer contract assertions still cover extracted helper ownership.
159. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
160. `refactor(renderer): extract right-panel toggle/orchestration helpers`
   - Moved `rightPanelTab`, `openPanel`, and `togglePanel` from `src/renderer/app.ts` into `src/renderer/appPanelToggleUiUtils.ts`.
   - Kept behavior unchanged by preserving router/settings/agent tab activation logic, title updates, router logs refresh trigger, MCP refresh trigger, and agent panel refresh behavior.
   - Kept classic renderer script loading by adding `appPanelToggleUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appPanelToggleUiUtils.ts`.
   - Updated router-status source introspection in `src/test/rendererDomContract.test.ts` to read both `app.ts` and `appPanelToggleUiUtils.ts` so the open-panel refresh contract remains covered after extraction.
161. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
162. `perf(renderer): make agent polling fallback event-staleness aware`
   - Updated agent refresh behavior so `ensureAgentPolling()` only triggers fallback refresh when task-change events are stale, instead of polling continuously while running.
   - Added `lastAgentTaskChangeAt` tracking and `AGENT_EVENT_STALE_FALLBACK_MS` gating to preserve safety fallback while making event-driven updates primary.
   - Preserved existing behavior for log-force refreshes and debounced event refresh flow.
163. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`433` passed / `0` failed).
164. `refactor(renderer): extract router status/log helpers`
   - Moved `refreshRouterStatus` and `loadRouterLogs` from `src/renderer/app.ts` into `src/renderer/appRouterStatusUiUtils.ts`.
   - Kept behavior unchanged by preserving router running/stopped badge text, port/PID display, and explicit `includeLogs` gating.
   - Kept classic renderer script loading by adding `appRouterStatusUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appRouterStatusUiUtils.ts`.
   - Updated router-status source introspection in `src/test/rendererDomContract.test.ts` to read `app.ts`, `appPanelToggleUiUtils.ts`, and `appRouterStatusUiUtils.ts`.
165. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
166. `refactor(renderer): extract feedback + message-order helpers`
   - Moved feedback helpers (`mountTopbarControls`, `showToast`, `copyTextToClipboard`, `setStatus`) from `src/renderer/app.ts` into `src/renderer/appFeedbackUiUtils.ts`.
   - Moved message-order helpers (`messageRolePriority`, `compareMessagesForRender`, `normalizeRenderedMessageOrder`) from `src/renderer/app.ts` into `src/renderer/appMessageOrderUiUtils.ts`.
   - Kept behavior unchanged by preserving classic non-module script loading and wiring both helper scripts before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appFeedbackUiUtils.ts` and `src/renderer/appMessageOrderUiUtils.ts`.
167. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
168. `refactor(renderer): extract provider/settings helper cluster`
   - Moved provider/settings helpers (`normalizeApiKey`, cloud/image provider-mode resolvers, provider labels/defaults, route default builders, `syncBaseUrlInputForProvider`, `requireCloudApiKey`, `setRouterMsg`, `updateVoiceUi`) from `src/renderer/app.ts` into `src/renderer/appProviderSettingsUiUtils.ts`.
   - Kept behavior unchanged by preserving function bodies and classic non-module script loading with `appProviderSettingsUiUtils.js` loaded before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appProviderSettingsUiUtils.ts`.
169. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
170. `chore(renderer): track extracted utility modules for clean-checkout reproducibility`
   - Added previously extracted renderer utility files to source control: `appTypes`, `appTextUtils`, `appPathUtils`, `appChatListRenderUiUtils`, `appSendUiUtils`, `appPanelToggleUiUtils`, `appRouterStatusUiUtils`, and `appSettingsUiUtils`.
   - Kept behavior unchanged; this closes a tracking gap where `app.ts`/`index.html` already depended on these files but they were not yet committed.
171. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
172. `refactor(renderer): extract model/provider routing helpers`
   - Moved model-route and provider-mode helper cluster (`getEffectiveModels` through `autoSwitchToOllamaIfNeeded`) from `src/renderer/app.ts` into `src/renderer/appModelProviderRoutingUiUtils.ts`.
   - Kept behavior unchanged by preserving function bodies and loading `appModelProviderRoutingUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appModelProviderRoutingUiUtils.ts`.
173. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
174. `refactor(renderer): extract local-agent setup and target helpers`
   - Moved the local-agent setup/target helper cluster (`setLocalAgentStatus` through `ensureFilesystemToolReadyForEditSave`) from `src/renderer/app.ts` into `src/renderer/appLocalAgentSetupUiUtils.ts`.
   - Kept behavior unchanged by preserving function bodies and loading `appLocalAgentSetupUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appLocalAgentSetupUiUtils.ts`.
175. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
176. `refactor(renderer): extract chat-context and provider-selection helpers`
   - Moved chat/provider context and selection helpers (`populateModels` through `prepareOllamaProviderSelection`) from `src/renderer/app.ts` into `src/renderer/appChatContextProviderUiUtils.ts`.
   - Kept behavior unchanged by preserving function bodies and loading `appChatContextProviderUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appChatContextProviderUiUtils.ts`.
   - Updated `src/test/newWindowWorkflow.test.ts` source introspection for the Ollama refresh fallback assertion to read both `app.ts` and `appChatContextProviderUiUtils.ts` after extraction.
177. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
178. `refactor(renderer): extract Claude safety and timer helpers`
   - Moved Claude status/timer helpers plus Claude filesystem safety/resume helpers (`setClaudeStatus` through `fillClaudeResumePrompt`) from `src/renderer/app.ts` into `src/renderer/appClaudeSafetyUiUtils.ts`.
   - Kept behavior unchanged by preserving function bodies and loading `appClaudeSafetyUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appClaudeSafetyUiUtils.ts`.
   - Updated Claude source-introspection/runtime tests (`src/test/claudeElapsedTimer.test.ts` and `src/test/claudeRateLimitResume.test.ts`) to include the extracted helper file in source/runtime concatenation.
179. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
180. `refactor(renderer): extract provider-switch and startup query helpers`
   - Moved provider-switch and startup query helpers (`refreshOllamaModels`, `getInitialChatIdFromLocation`, `shouldOpenDraftChatFromLocation`, and `selectChatProvider`) from `src/renderer/app.ts` into `src/renderer/appChatContextProviderUiUtils.ts`.
   - Kept behavior unchanged by preserving function bodies and existing classic script order (`appChatContextProviderUiUtils.js` already loads before `app.js` in `src/renderer/index.html`).
   - Updated `src/test/newWindowWorkflow.test.ts` source introspection for query-param startup assertions to read both `app.ts` and `appChatContextProviderUiUtils.ts` after extraction.
181. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
182. `refactor(renderer): extract app-info and prompt-modal helpers`
   - Moved `loadAppInfo` from `src/renderer/app.ts` into `src/renderer/appRuntimeSetupUiUtils.ts`.
   - Moved `promptForTextInput` from `src/renderer/app.ts` into `src/renderer/appMessageResendUiUtils.ts` (its only call-site cluster), keeping behavior and modal UX unchanged.
   - Kept classic renderer script order unchanged; both destination utility files already load before `app.js`.
183. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
184. `refactor(renderer): extract chat loading helper`
   - Moved `loadChat` from `src/renderer/app.ts` into `src/renderer/appChatLoadUiUtils.ts`.
   - Kept behavior unchanged by preserving chat-context fallback handling, message reset/order refresh flow, system-prompt panel reset, and post-load chat-list refresh.
   - Added `appChatLoadUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appChatLoadUiUtils.ts`.
   - Updated `src/test/newWindowWorkflow.test.ts` source introspection assertions that check `loadChat` internals to read the extracted helper file.
185. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
186. `refactor(renderer): extract direct-save and vision helper slice`
   - Moved direct-save status helpers (`getDirectSaveStatus`, `updateDirectSaveUi`) and vision model helpers (`isLikelyVisionCapableModel`, `findVisionModelCandidate`) from `src/renderer/app.ts` into `src/renderer/appDirectSaveVisionUiUtils.ts`.
   - Kept behavior unchanged by preserving function bodies and adding `appDirectSaveVisionUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appDirectSaveVisionUiUtils.ts`.
187. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
188. `refactor(renderer): extract message render helpers`
   - Moved message render helpers (`renderMessageBody`, `shouldRenderMessageAsPlainText`, `updateMessageDensityState`, `applyGeneratedImageAssetIds`, `rerenderAllMessageBodies`, and `applyRawMode`) from `src/renderer/app.ts` into `src/renderer/appMessageRenderUiUtils.ts`.
   - Kept behavior unchanged by preserving function bodies and loading `appMessageRenderUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appMessageRenderUiUtils.ts`.
   - Updated `src/test/newWindowWorkflow.test.ts` source introspection assertions for plain-text renderer and sparse-density helpers to read `src/renderer/appMessageRenderUiUtils.ts`.
189. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
190. `refactor(renderer): extract virtual message and render-loop helpers`
   - Moved virtualization/message-render loop helpers (`buildVirtualItemsFromMessages` through `updateMessageContent`, including `renderAgentMessageBody`) from `src/renderer/app.ts` into `src/renderer/appVirtualMessagesUiUtils.ts`.
   - Kept behavior unchanged by preserving function bodies and loading `appVirtualMessagesUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer DOM contract source coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appVirtualMessagesUiUtils.ts`.
191. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
192. `refactor(renderer): extract message wrapper helper`
   - Moved `createMessageWrapper` from `src/renderer/app.ts` into `src/renderer/appVirtualMessagesUiUtils.ts`.
   - Kept behavior unchanged by preserving wrapper structure, role/avatar/meta rendering, assistant/user action buttons, markdown/plain-text mode selection, and agent-message card rendering flow.
   - Kept classic renderer script load order unchanged (`appVirtualMessagesUiUtils.js` already loads before `app.js` in `src/renderer/index.html`).
193. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
194. `refactor(renderer): extract chat id helpers`
   - Moved `nextClientMessageId` and `ensureActiveChatId` from `src/renderer/app.ts` into `src/renderer/appChatLifecycleUiUtils.ts`.
   - Kept behavior unchanged by preserving ID generation format and create-chat fallback behavior when no active chat is selected.
   - Kept classic renderer script load order unchanged (`appChatLifecycleUiUtils.js` already loads before `app.js` in `src/renderer/index.html`).
195. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
196. `refactor(renderer): extract Claude stream and save-guard helpers`
   - Moved Claude stream/render and save-guard helper cluster (`ensureClaudeAssistantMessage` through `finalizeClaudeAssistantMessage`) from `src/renderer/app.ts` into `src/renderer/appClaudeSafetyUiUtils.ts`.
   - Kept behavior unchanged by preserving assistant/system/user message append flow, batched Claude draft rendering, save-claim verification guardrails, and Claude render-state reset behavior.
   - Updated source-introspection coverage in `src/test/newWindowWorkflow.test.ts` to include `src/renderer/appClaudeSafetyUiUtils.ts` for system-notice assertions after extraction.
197. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
198. `refactor(renderer): extract managed-save helper cluster`
   - Moved managed-save helper cluster (`parseClaudeManagedEditResponse` through `applyManagedClaudeEdits`) from `src/renderer/app.ts` into `src/renderer/appClaudeSafetyUiUtils.ts`.
   - Kept behavior unchanged by preserving managed-edit JSON parsing, verifier fallback/auto-repair flow, preview modal controls, and final managed-write apply/cancel result messaging.
   - Kept classic renderer script load order unchanged (`appClaudeSafetyUiUtils.js` already loads before `app.js` in `src/renderer/index.html`).
199. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
200. `refactor(renderer): extract Claude filesystem settings helper cluster`
   - Moved Claude filesystem settings/root helper cluster (`normalizeClaudeChatFilesystemRoots` through `renderClaudeChatFilesystemSettingsUi`) from `src/renderer/app.ts` into `src/renderer/appClaudeSafetyUiUtils.ts`.
   - Kept behavior unchanged by preserving root-draft normalization, per-root write/overwrite controls, filesystem settings draft assembly, and settings panel status messaging.
   - Kept classic renderer script load order unchanged (`appClaudeSafetyUiUtils.js` already loads before `app.js` in `src/renderer/index.html`).
201. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
202. `refactor(renderer): extract Claude session start UI helpers`
   - Moved `setClaudeModeActiveVisual` and `ensureClaudeSessionStarted` from `src/renderer/app.ts` into `src/renderer/appClaudeSafetyUiUtils.ts`.
   - Kept behavior unchanged by preserving Claude quick-button active-state toggle plus full session-start status/toast/error handling flow.
   - Kept classic renderer script load order unchanged (`appClaudeSafetyUiUtils.js` already loads before `app.js` in `src/renderer/index.html`).
203. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
204. `refactor(renderer): extract Claude send prompt helpers`
   - Moved `sendClaudeEditSavePrompt` and `sendClaudePrompt` from `src/renderer/app.ts` into `src/renderer/appClaudeSafetyUiUtils.ts`.
   - Kept behavior unchanged by preserving managed-write gating, approved-folder/filesystem access routing, attachment handling, Claude chat session binding, and streaming/status transitions.
   - Updated source-introspection coverage in `src/test/newWindowWorkflow.test.ts` to include `src/renderer/appClaudeSafetyUiUtils.ts` for assertions that now reference extracted send-flow internals.
205. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
206. `refactor(renderer): extract Claude managed-write intent helper cluster`
   - Moved `isVagueEditRequest`, `isClaudeManagedWriteRequest`, `shouldPreferClaudeFilesystemProjectFlow`, `buildClaudeManagedWritePrompt`, and `buildClaudeEditSavePrompt` from `src/renderer/app.ts` into `src/renderer/appClaudeSafetyUiUtils.ts`.
   - Kept behavior unchanged by preserving managed-write intent heuristics, approved-folder filesystem flow preference logic, and managed-write/edit-save prompt contract text.
   - Updated `src/test/claudeManagedWriteIntent.test.ts` source extraction to read combined runtime source (`dist/renderer/app.js` + `dist/renderer/appClaudeSafetyUiUtils.js`) after helper extraction.
207. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
208. `refactor(renderer): extract Claude chat-session context helper pair`
   - Moved `ensureClaudeChatSessionReady` and `stopClaudeSessionFromUi` from `src/renderer/app.ts` into `src/renderer/appClaudeSafetyUiUtils.ts`.
   - Kept behavior unchanged by preserving per-chat Claude session reset/start flow, status/toast/error handling, and top stop-button shutdown behavior.
   - Updated `src/test/newWindowWorkflow.test.ts` source introspection scope for stop-session assertions to include `src/renderer/appClaudeSafetyUiUtils.ts`.
209. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
210. `refactor(renderer): extract chat send flow helper`
   - Moved `sendChatPromptWithAttachments` from `src/renderer/app.ts` into `src/renderer/appSendUiUtils.ts`.
   - Kept behavior unchanged by preserving direct-save guard routing, vision-model fallback switching, cloud-key gating, compare-mode stream state, and chat send failure recovery.
   - Kept classic renderer script load order unchanged (`appSendUiUtils.js` already loads before `app.js` in `src/renderer/index.html`).
211. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
212. `refactor(renderer): extract image generation submit helper`
   - Moved `submitImageGeneration` from `src/renderer/app.ts` into `src/renderer/appImageStudioUiUtils.ts`.
   - Kept behavior unchanged by preserving image-provider/model resolution, user/assistant image message persistence, modal/history refresh flow, and streaming/status reset handling.
   - Updated `src/test/claudeElapsedTimer.test.ts` source introspection scope to include `src/renderer/appImageStudioUiUtils.ts` for image-stream timer assertions after extraction.
213. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
214. `refactor(renderer): extract agent task refresh helper`
   - Moved `refreshAgentTask` from `src/renderer/app.ts` into `src/renderer/appAgentTaskRefreshUiUtils.ts`.
   - Kept behavior unchanged by preserving agent-task fallback selection, logs/route diagnostics refresh, desktop launch prompt queueing, managed preview auto-open flow, and running-status streaming activity updates.
   - Updated `src/test/desktopLaunchPromptWorkflow.test.ts` and `src/test/claudeElapsedTimer.test.ts` source-introspection scopes to include `src/renderer/appAgentTaskRefreshUiUtils.ts`.
215. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
216. `refactor(renderer): co-locate desktop launch prompt helper pair with agent refresh flow`
   - Moved `completedTaskIsRecent` and `shouldQueueDesktopLaunchPrompt` from `src/renderer/app.ts` into `src/renderer/appAgentTaskRefreshUiUtils.ts`.
   - Kept behavior unchanged by preserving completed-task recency gating plus desktop-launch prompt queue eligibility checks used during refresh.
   - Updated `src/test/desktopLaunchPromptWorkflow.test.ts` source-introspection scope to include `src/renderer/appAgentTaskRefreshUiUtils.ts` for launch-prompt helper assertions after extraction.
217. Validation:
   - `npm run build:ts` passed.
   - `npm test` passed (`434` passed / `0` failed).
218. `refactor(renderer): extract agent/composer prompt sync helper trio`
   - Moved `syncComposerAgentPrompts`, `resolveAgentPromptInput`, and `clearAgentPrompts` from `src/renderer/app.ts` into `src/renderer/appAgentPromptSyncUiUtils.ts`.
   - Kept behavior unchanged by preserving bidirectional composer/agent prompt mirroring, focused prompt-source resolution, and paired prompt clear/reset dispatch behavior.
   - Kept classic renderer script load order unchanged by loading `appAgentPromptSyncUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer source-introspection coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appAgentPromptSyncUiUtils.ts`.
219. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
220. `refactor(renderer): extract interaction/composer context helper cluster`
   - Moved `getComposerPlaceholder`, `getActiveModeTemplates`, `refreshComposerContextUi`, `refreshEmptyStateIfNeeded`, `syncAgentLandingFocusPanel`, and `isAgentTaskRunning` from `src/renderer/app.ts` into `src/renderer/appInteractionModeUiUtils.ts`.
   - Kept behavior unchanged by preserving interaction-mode placeholder/hint text, empty-state refresh behavior, agent landing focus-panel closure guard, and active-agent running-state checks used during mode switching.
   - Kept classic renderer script load order unchanged by loading `appInteractionModeUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated renderer source-introspection coverage in `src/test/rendererDomContract.test.ts` to include `src/renderer/appInteractionModeUiUtils.ts`.
221. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
222. `refactor(renderer): co-locate interaction mode switching flow with interaction helpers`
   - Moved `applyInteractionMode` from `src/renderer/app.ts` into `src/renderer/appInteractionModeUiUtils.ts`.
   - Kept behavior unchanged by preserving agent-running guardrails, interaction mode view toggles (chat/agent/image), composer/attachment visibility rules, image studio refresh trigger, and mode-dependent composer status text and focus behavior.
   - Kept classic renderer script load order unchanged (`appInteractionModeUiUtils.js` already loads before `app.js` in `src/renderer/index.html`).
223. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
224. `refactor(renderer): co-locate apply-mode helper with interaction mode utilities`
   - Moved `applyMode` from `src/renderer/app.ts` into `src/renderer/appInteractionModeUiUtils.ts`.
   - Kept behavior unchanged by preserving mode button activation, Claude-mode visual/session status behavior, direct-save/compare refreshes, and agent-mode re-application flow.
   - Kept classic renderer script load order unchanged (`appInteractionModeUiUtils.js` already loads before `app.js` in `src/renderer/index.html`).
225. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
226. `refactor(renderer): co-locate snapshot restore result notifier with snapshot helpers`
   - Moved `reportSnapshotRestoreResult` from `src/renderer/app.ts` into `src/renderer/appSnapshotRestoreUiUtils.ts`.
   - Kept behavior unchanged by preserving agent status tone updates plus toast visibility behavior outside active agent tab and on restore errors.
227. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
228. `refactor(renderer): extract IPC listener lifecycle helpers`
   - Moved `registerIpcListener`, `teardownIpcListeners`, and `setupIpcListeners` from `src/renderer/app.ts` into `src/renderer/appIpcListenerUiUtils.ts`.
   - Kept behavior unchanged by preserving idempotent listener setup, chat/agent/router/Claude event wiring, and unload-time unsubscribe cleanup semantics.
   - Kept classic renderer script load order unchanged by loading `appIpcListenerUiUtils.js` before `app.js` in `src/renderer/index.html`.
   - Updated source-introspection coverage to include `src/renderer/appIpcListenerUiUtils.ts` in `src/test/rendererDomContract.test.ts` and `src/test/claudeRateLimitResume.test.ts` where extracted listener code is asserted.
229. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
230. `fix(renderer): recover app.ts after partial extraction truncation`
   - Restored `src/renderer/app.ts` to a typed baseline and re-applied helper-boundary removals for previously extracted functions (`submitImageGeneration`, `refreshAgentTask`, agent/composer prompt sync helpers, interaction-mode helpers, snapshot-restore notifier, and IPC listener lifecycle helpers).
   - Removed unfinished duplicate helper attempt `src/renderer/appDomLookupUiUtils.ts` from the broken state before recovery so build scope returned to a single source of truth.
231. `refactor(renderer): extract DOM lookup helper pair`
   - Moved `$` and `qs` from `src/renderer/app.ts` into `src/renderer/appDomLookupUiUtils.ts`.
   - Kept behavior unchanged by loading `appDomLookupUiUtils.js` before downstream renderer helpers and `app.js` in `src/renderer/index.html`.
232. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
233. `refactor(renderer): extract renderer state/type declarations into appTypes`
   - Moved renderer-only type/interface aliases from `src/renderer/app.ts` into `src/renderer/appTypes.ts` (`ThemeMode`, `UiMode`, `ProviderMode`, `CloudProviderMode`, `ImageProviderMode`, `InteractionMode`, `UiExperienceMode`, `ImageStudioSortMode`, `ClaudeChatFilesystemRootDraft`, `ClaudeFilesystemEvent`, `DirectSaveStatus`, `AgentTargetPromptChoice`, `SpeechRecognition*`, and `VirtualChatItem`).
   - Kept behavior unchanged by leaving runtime state/constants/logic in `app.ts` and moving compile-time declarations only.
234. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
235. `refactor(renderer): extract startup bootstrap orchestration from app.ts`
   - Moved `init()` from `src/renderer/app.ts` into `src/renderer/appBootstrapUiUtils.ts`.
   - Kept behavior unchanged by loading `appBootstrapUiUtils.js` before `app.js` in `src/renderer/index.html`, while leaving `document.addEventListener("DOMContentLoaded", init);` in `app.ts`.
   - Updated source-introspection scopes in `src/test/rendererDomContract.test.ts` and `src/test/newWindowWorkflow.test.ts` to include `src/renderer/appBootstrapUiUtils.ts` where startup bindings are asserted.
236. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
237. `refactor(renderer): extract runtime state/constants block from app.ts`
   - Moved renderer runtime state and constant declarations from `src/renderer/app.ts` into `src/renderer/appStateUiUtils.ts`.
   - Kept behavior unchanged by loading `appStateUiUtils.js` before downstream renderer helper scripts and before `app.js` in `src/renderer/index.html`.
   - Left `document.addEventListener("DOMContentLoaded", init);` in `app.ts` so startup ownership remains explicit and bootstrap flow unchanged.
   - Updated source-introspection scopes in `src/test/rendererDomContract.test.ts`, `src/test/newWindowWorkflow.test.ts`, `src/test/claudeElapsedTimer.test.ts`, `src/test/claudeRateLimitResume.test.ts`, and `src/test/desktopLaunchPromptWorkflow.test.ts` to include `src/renderer/appStateUiUtils.ts` where state declarations are asserted.
238. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
239. `refactor(main): remove thin artifact verification wrapper methods in AgentTaskRunner`
   - Replaced `this.usesStartupVerification(...)`, `this.shouldVerifyLaunch(...)`, `this.shouldVerifyPreviewHealth(...)`, `this.shouldVerifyUiSmoke(...)`, `this.shouldVerifyServedWebPage(...)`, and `this.shouldVerifyRuntimeDepth(...)` call sites with direct helper calls (`usesStartupVerificationText(...)` and the `shouldVerify*Text(...)` variants).
   - Removed the now-redundant private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving all existing runtime/preview/smoke/served-page/depth verification branch conditions and startup probe gating logic.
240. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
241. `refactor(main): remove thin verification label/runtime wrapper cluster in AgentTaskRunner`
   - Replaced `this.getRequestedEntryPathAliasGroups(...)`, `this.getEntryVerificationLabel(...)`, `this.getBuildVerificationLabel(...)`, `this.getLintVerificationLabel(...)`, `this.getTestVerificationLabel(...)`, `this.getLaunchVerificationLabel(...)`, `this.getPackagingVerificationLabel(...)`, `this.resolveRuntimeVerificationScript(...)`, and `this.shouldVerifyWindowsPackaging(...)` call sites with direct helper calls.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/generatedDesktopInstallerWorkflow.test.ts` source-introspection assertions to validate the direct helper-call pattern for Windows packaging checks and labels.
242. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
243. `refactor(main): remove runtime-probe/parser thin wrappers in AgentTaskRunner`
   - Replaced `this.stripAnsiControlSequences(...)`, `this.parseBrowserSmokeResult(...)`, `this.isBrowserSmokeInfrastructureFailure(...)`, `this.extractServedPageProbeResult(...)`, `this.extractApiProbeResult(...)`, `this.looksLikeCliUsageFailure(...)`, `this.parseJsonFromOutput(...)`, `this.buildFetchHeaders(...)`, and `this.isApiCollectionPayload(...)` call sites with direct helper calls from existing utility modules.
   - Removed the now-redundant private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving all runtime probe parsing, browser-smoke fallback handling, CLI usage detection, JSON extraction, and API payload validation logic.
244. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
245. `refactor(main): remove thin desktop prompt-guard wrappers in AgentTaskRunner`
   - Replaced `this.isSimpleDesktopShellPrompt(...)`, `this.isDesktopBusinessReportingPrompt(...)`, and `this.isSimpleDesktopUtilityPrompt(...)` call sites with direct helper calls (`isSimpleDesktopShellPromptText(...)`, `isDesktopBusinessReportingPromptText(...)`, `isSimpleDesktopUtilityPromptText(...)`).
   - Removed the now-redundant private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving the same heuristic prompt-gating inputs and helper wiring used by prompt-requirement extraction and desktop workspace builder composition.
246. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
247. `refactor(main): remove generated install/packaging lock thin wrappers in AgentTaskRunner`
   - Replaced `this.isRecoverableGeneratedInstallFailure(...)`, `this.isTransientGeneratedInstallLockFailure(...)`, `this.isTransientGeneratedPackagingLockFailure(...)`, and `this.buildElectronBuilderPackagingRequest(...)` call sites with direct helper calls from `generatedInstallFailureGuards` and `packagingRequestBuilder`.
   - Removed the now-redundant private wrapper methods plus the dead `parseCommandArgs(...)` wrapper from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving generated workspace install recovery heuristics, packaging lock retry/fallback behavior, and isolated packaging output retry flow.
248. `refactor(main): remove prompt artifact inference thin wrappers in AgentTaskRunner`
   - Replaced `this.inferArtifactTypeFromPrompt(...)` and `this.looksLikeCrudAppPrompt(...)` call sites with direct helper calls (`inferArtifactTypeFromPromptText(...)` and `looksLikeCrudAppPromptText(...)`) across classifier, builder-mode guards, work-item planning, heuristics, bootstrap planning, and failure-memory context selection.
   - Removed the now-redundant private wrapper methods and dropped the unused `looksLikeDesktopPromptText` import after wrapper removal.
   - Kept behavior unchanged by preserving all existing normalized-prompt inputs and heuristic/route gating decisions.
249. `test(main): update transient lock-failure coverage to helper-level assertions`
   - Updated `src/test/agentTaskRunner.test.ts` transient lock tests to assert `isTransientGeneratedInstallLockFailure(...)` and `isTransientGeneratedPackagingLockFailure(...)` directly from `generatedInstallFailureGuards`.
   - Added typed `TerminalCommandResult` stubs in those tests so coverage remains behavior-focused after `AgentTaskRunner` wrapper removal.
250. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
251. `refactor(main): remove repository-context convention thin wrappers in AgentTaskRunner`
   - Replaced `this.detectModuleFormat(...)`, `this.detectUiFramework(...)`, `this.detectStylingApproach(...)`, `this.detectTestingTool(...)`, and `this.detectLintingTool(...)` call sites with direct helper calls from `taskRepositoryConventions`.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving the same package-manifest/workspace-kind inputs and repository-context summary assembly flow.
252. `refactor(main): remove starter/domain profile thin wrappers in AgentTaskRunner`
   - Replaced `this.inferStarterProfile(...)`, `this.describeStarterProfile(...)`, `this.inferDomainFocus(...)`, and `this.describeDomainFocus(...)` call sites with direct helper calls from `taskStarterProfiles` and `taskDomainFocus`.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving starter-profile labels, domain-focus inference inputs, execution-spec callback wiring, bootstrap plan selection, and heuristic domain-content resolution.
253. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
254. `refactor(main): remove desktop/API domain-content thin wrappers in AgentTaskRunner`
   - Replaced `this.buildDesktopDomainContent(...)` and `this.buildApiEntityForDomain(...)` call sites with direct helper calls (`buildDesktopDomainContentForFocus(...)` and `buildApiEntityForDomainFocus(...)`).
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving domain-focus mapping for desktop starter copy, API entity defaults, and node-package bootstrap API metadata wiring.
255. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
256. `refactor(main): remove display/readme/runtime-detail thin wrappers in AgentTaskRunner`
   - Replaced `this.toDisplayNameFromDirectory(...)`, `this.toDisplayLabel(...)`, `this.buildProjectReadme(...)`, `this.buildRuntimeVerificationDetails(...)`, and `this.buildRuntimeVerificationAfterRepairDetails(...)` call sites with direct helper calls.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts` and cleaned the now-unused `toDisplayLabelText` import.
   - Kept behavior unchanged by preserving `projectNaming` display-name defaults, README section assembly, and runtime verification detail text formatting.
257. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
258. `refactor(main): remove restore/restart/command-failure thin wrappers in AgentTaskRunner`
   - Replaced `this.buildRestoreSuccessMessage(...)`, `this.isRetriableWorkspaceFsError(...)`, `this.isNoSpaceLeftError(...)`, `this.buildRestartPrompt(...)`, `this.describeRestartMode(...)`, `this.buildRequirementFailureMessage(...)`, and `this.buildCommandFailureMessage(...)` call sites with direct helper calls.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts` and cleaned no-longer-used message helper imports (`describeArtifactTypeText`, `extractTerminalFailureDetailText`).
   - Kept behavior unchanged by preserving workspace-fs retry gates, restart prompt/mode messaging, command failure text shape, and ENOSPC retry semantics.
259. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
260. `refactor(main): remove build-spec callback thin wrappers in AgentTaskRunner`
   - Replaced `this.buildSpecRequiredFiles(...)`, `this.buildSpecRequiredScriptGroups(...)`, `this.buildSpecDeliverables(...)`, `this.buildSpecAcceptanceCriteria(...)`, and `this.buildSpecQualityGates(...)` callback wiring with direct helper calls inside `buildTaskExecutionSpec(...)`.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving required-file allowlist shaping, script-group requirements, deliverable/acceptance/gate text generation, and existing workspace path/join helper callback semantics.
261. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
262. `refactor(main): remove generated-workspace recovery and heuristic-gating thin wrappers in AgentTaskRunner`
   - Replaced `this.detectStarterPlaceholderSignals(...)`, `this.isLockedBuilderPlan(...)`, `this.isSimpleNotesAppPrompt(...)`, `this.isBuilderRecoveryPrimaryPlan(...)`, `this.getConflictingScaffoldPaths(...)`, `this.isUnexpectedGeneratedAppFile(...)`, and `this.inferGeneratedGenericArtifactType(...)` call sites with direct helper calls.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving generated-app scaffold conflict pruning, starter-placeholder detection, heuristic-preference gating, and generated generic package-manifest artifact inference.
263. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
264. `refactor(main): remove preview-bootstrap/path-regex thin wrappers in AgentTaskRunner`
   - Replaced `this.hasPreviewBootstrapSignals(...)`, `this.resolvePreviewAssetPath(...)`, and `this.escapeRegExp(...)` call sites with direct helper calls (`hasPreviewBootstrapSignalsText(...)`, `resolvePreviewAssetPathText(...)`, and `escapeRegExpText(...)`).
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving preview asset resolution, preview bootstrap signal checks for both static/react flows, and regex-safe path normalization for preview/plan guard logic.
265. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
266. `refactor(main): remove snapshot/artifact/run-command thin wrappers in AgentTaskRunner`
   - Replaced `this.collectReferencedSnapshotIds(...)`, `this.inferArtifactTypeFromPackage(...)`, and `this.resolvePreferredRunCommand(...)` call sites with direct helper calls.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving snapshot-prune referenced-id filtering, package-manifest artifact inference inputs, and task-output run-command suggestion logic.
267. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
268. `refactor(main): remove failure-memory/routing message thin wrappers in AgentTaskRunner`
   - Replaced `this.buildFailureCategoryGuidance(...)`, `this.formatFailureMemoryForPrompt(...)`, `this.buildExhaustedModelRouteMessage(...)`, `this.compactFailureMessage(...)`, `this.buildFailureMemorySignature(...)`, and `this.buildFailureMemoryGuidance(...)` call sites with direct helper calls.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving failure-category repair guidance assembly, exhausted-route error summaries, and failure-memory signature/guidance generation during semantic/repair fallback flows.
269. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
270. `refactor(main): remove task-attachment/vision route thin wrappers in AgentTaskRunner`
   - Replaced `this.getTaskAttachments(...)`, `this.taskRequiresVisionRoute(...)`, `this.buildTaskPromptMessages(...)`, and `this.buildTaskStageSelectionReason(...)` call sites with direct helper calls.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving attachment-aware prompt message construction, vision-route routing checks, and route-telemetry stage selection reasoning.
271. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
272. `refactor(main): remove package-manifest parse/script extraction thin wrappers in AgentTaskRunner`
   - Replaced `this.normalizeLooseJson(...)`, `this.parseLoosePackageManifest(...)`, and `this.extractScripts(...)` call sites with direct helper calls (`normalizeLooseJsonText(...)`, `parseLoosePackageManifestText(...)`, and `extractScriptsText(...)`).
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving loose `package.json` parsing semantics, script-detection flow for runtime/lint/test checks, and generated-app manifest normalization paths.
273. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
274. `refactor(main): remove model-route scoring/blacklist thin wrappers in AgentTaskRunner`
   - Replaced `this.getModelRouteScore(...)`, `this.buildModelRouteScoreFactors(...)`, `this.inferRoutingStage(...)`, and `this.isTaskModelBlacklisted(...)` call sites with direct helper calls.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving route ranking, active-route blacklist filtering, routing-stage labeling, and task route telemetry score-factor reporting.
275. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
276. `refactor(main): remove prompt/request/bootstrap thin wrappers in AgentTaskRunner`
   - Replaced `this.buildNpmScriptRequest(...)`, `this.extractPromptTerms(...)`, `this.extractProjectName(...)`, and `this.buildBootstrapCommands(...)` call sites with direct helper calls (`buildNpmScriptRequestText(...)`, `extractPromptTermsText(...)`, `extractProjectNameText(...)`, and `buildBootstrapCommandsText(...)`).
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Updated source-introspection expectation in `src/test/generatedDesktopInstallerWorkflow.test.ts` to assert direct helper usage in the packaging guard flow.
   - Kept behavior unchanged by preserving the same timeout defaults, prompt-term extraction rules, project-name fallback flow, and platform-aware bootstrap command generation.
277. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
278. `refactor(main): remove summary/preview/path-existence thin wrappers in AgentTaskRunner`
   - Replaced `this.buildCompletedTaskSummary(...)`, `this.pathExists(...)`, `this.normalizeLocalHtmlScriptsForVite(...)`, and `this.isLikelyValidStylesheet(...)` call sites with direct helper calls.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` to assert helper behavior directly (`buildCompletedTaskSummary`, `pathExists`, `normalizeLocalHtmlScriptsForVite`, `isLikelyValidStylesheet`) where wrapper method coverage previously existed.
   - Kept behavior unchanged by preserving task-summary text shape, file existence checks, local script-tag normalization behavior, and stylesheet validity heuristics.
279. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
280. `refactor(main): remove bootstrap/node-manifest thin wrappers in AgentTaskRunner`
   - Replaced `this.buildNodePackageScripts(...)`, `this.buildNodePackageManifest(...)`, `this.buildGeneralReactStarterApp(...)`, `this.buildGeneralReactStarterCss(...)`, `this.buildGeneralReactStarterIndexCss(...)`, `this.buildStaticBootstrapHtml(...)`, `this.buildStaticBootstrapCss(...)`, `this.buildStaticBootstrapJs(...)`, and `this.buildReactBootstrapHtml(...)` call sites with direct helper calls.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` to assert helper behavior directly for static bootstrap and node-package manifest/script template generation where wrapper coverage previously existed.
   - Kept behavior unchanged by preserving starter template content, node-package script/manifest shaping, and bootstrap file assembly flow.
281. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
282. `refactor(main): remove desktop bootstrap style/app-id thin wrappers in AgentTaskRunner`
   - Replaced `this.buildDesktopBootstrapAppCss(...)`, `this.buildDesktopBootstrapIndexCss(...)`, and `this.buildGeneratedDesktopAppId(...)` call sites with direct helper calls (`buildDesktopBootstrapAppCssTemplate(...)`, `buildDesktopBootstrapIndexCssTemplate(...)`, and `buildGeneratedDesktopAppIdTemplate(...)`).
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving desktop starter stylesheet generation and generated desktop app-id normalization flow in package-manifest shaping.
283. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
284. `refactor(main): remove dead generated-desktop template wrappers in AgentTaskRunner`
   - Removed unused private wrapper methods `buildGeneratedDesktopMainProcess(...)` and `buildGeneratedDesktopPreloadBridge(...)` from `src/main/services/agentTaskRunner.ts`.
   - Removed now-unused direct template imports for those wrappers from the AgentTaskRunner bootstrap-template import block.
   - Updated `src/test/generatedDesktopInstallerWorkflow.test.ts` source-introspection coverage to assert the direct scaffold-builder pattern (`buildGeneratedDesktopScaffoldFiles(projectName)`) and the absence of the removed wrapper method.
   - Kept behavior unchanged by preserving generated desktop scaffold template ownership in `src/main/services/heuristicBootstrapTemplates.ts`.
285. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
286. `refactor(main): remove notes-template thin wrappers in AgentTaskRunner`
   - Replaced `this.buildStaticNotesHtml(...)`, `this.buildStaticNotesCss(...)`, `this.buildStaticNotesJs(...)`, `this.buildNotesAppCss(...)`, and `this.buildNotesIndexCss(...)` call sites with direct helper calls.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving static-notes markup/style/script template generation and notes React stylesheet/index stylesheet composition in bootstrap/heuristic flows.
287. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
288. `refactor(main): remove marketing/dashboard/crud/kanban style/template thin wrappers in AgentTaskRunner`
   - Replaced wrapper-backed callsites in heuristic workspace builders and React starter profile file assembly with direct helper calls (landing/pricing/announcement/dashboard/crud/kanban template and style helpers).
   - Removed the now-redundant private wrapper methods for those direct pass-through helpers from `src/main/services/agentTaskRunner.ts` while keeping `buildNotesAppTsx(...)` and `buildKanbanBoardTsx(...)` wrappers currently exercised by direct unit tests.
   - Kept behavior unchanged by preserving the same template producers, domain-focus wiring, and workspace edit assembly callbacks.
289. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
290. `refactor(main): remove final notes/kanban template passthrough wrappers in AgentTaskRunner`
   - Replaced `buildNotesAppTsx(...)` and `buildKanbanBoardTsx(...)` wrapper callsites with direct template-helper calls in heuristic workspace builders and React starter profile file assembly.
   - Removed the now-redundant private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` to assert the same behavior directly via `buildNotesAppTsxTemplate(...)` and `buildKanbanBoardTsxTemplate(...)`.
   - Kept behavior unchanged by preserving the same generated TSX template outputs for notes and kanban workflows.
291. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
292. `refactor(main): remove route/startup signal thin wrappers in AgentTaskRunner`
   - Replaced `this.isTransientModelFailure(...)`, `this.buildModelRouteKey(...)`, and `this.hasStartupFailureSignal(...)` callsites with direct helper calls from `modelRouteScoring` and `startupSignalDetection`.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` to assert helper behavior directly (`buildModelRouteKey`, `isTransientModelFailure`, `hasStartupFailureSignal`) where wrapper calls were previously used.
   - Hardened the loose-JSON smart-quote parsing fixture by using explicit `\u201c/\u201d` escapes so the test remains stable across file encoding rewrites.
293. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
294. `refactor(main): remove builder-mode/workspace-kind prompt thin wrappers in AgentTaskRunner`
   - Replaced `this.detectBuilderMode(...)` and `this.resolveWorkspaceKindForPrompt(...)` callsites with direct helper calls (`detectBuilderModeText(...)` and `resolveWorkspaceKindForPromptText(...)`) in execution-planning and bootstrap-profile inference flows.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` to assert helper behavior directly for builder-mode and workspace-kind prompt resolution paths (including CRUD/dashboard and static/desktop prompt routing coverage).
   - Kept behavior unchanged by preserving helper option wiring (`looksLikeCrudAppPrompt` and `inferArtifactTypeFromPrompt`) used by the former wrappers.
295. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
296. `refactor(main): remove join-workspace-path thin wrapper in AgentTaskRunner`
   - Replaced `this.joinWorkspacePath(...)` callsites with direct helper calls (`joinWorkspacePathText(...)`) across `src/main/services/agentTaskRunner.ts`.
   - Removed the now-redundant private wrapper method `joinWorkspacePath(...parts)` from `src/main/services/agentTaskRunner.ts`.
   - Updated source-introspection expectation in `src/test/generatedDesktopInstallerWorkflow.test.ts` to assert direct helper usage for generated desktop scaffold path wiring.
   - Kept behavior unchanged by preserving the same path-joining helper and callback wiring semantics.
297. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
298. `refactor(main): remove workspace-kind existence thin wrappers in AgentTaskRunner`
   - Replaced `this.detectWorkspaceKind(...)` and `this.allFilesExist(...)` wrapper callsites with direct helper calls (`detectWorkspaceKindText(...)` and `allFilesExistText(...)`) in execution-plan workspace detection and requested-entry alias validation.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving the same callback wiring to `resolveWorkspacePath(...)` and `joinWorkspacePathText(...)`.
299. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
300. `refactor(main): remove prompt-requirements/path-extraction thin wrappers in AgentTaskRunner`
   - Replaced `this.extractPromptRequirements(...)` and `this.extractExplicitPromptFilePaths(...)` callsites with direct helper calls (`extractPromptRequirementsText(...)` and `extractExplicitPromptFilePathsText(...)`) in execution-plan assembly.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` to assert helper behavior directly for prompt-requirement extraction and explicit prompt file-path extraction.
   - Kept behavior unchanged by preserving the same helper option wiring for prompt artifact inference and desktop-reporting prompt detection.
301. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
302. `refactor(main): remove verification-script/path-scope thin wrappers in AgentTaskRunner`
   - Replaced `this.resolveVerificationScripts(...)` and `this.isPathInsideWorkingDirectory(...)` callsites with direct helper calls (`resolveVerificationScriptsText(...)` and `isPathInsideWorkingDirectoryText(...)`) across planning, verification, and edit-scope checks.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` to assert static-workspace verification-script normalization through direct helper usage.
   - Kept behavior unchanged by preserving the same workspace-kind and path-scope helper semantics.
303. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
304. `refactor(main): remove structured-fix parse thin wrapper in AgentTaskRunner`
   - Replaced `this.tryParseFixResponse(...)` callsites with direct helper calls (`tryParseStructuredFixResponseText(...)`) in both implementation-response and structured-repair response flows.
   - Removed the corresponding private wrapper method from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` to assert structured-fix parse behavior directly through `tryParseStructuredFixResponseText(...)`.
   - Kept behavior unchanged by preserving strict-schema parse options and existing retry/fallback control flow.
305. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
306. `refactor(main): remove simple generated-package heuristic-gate thin wrapper in AgentTaskRunner`
   - Inlined `isSimpleGeneratedPackagePrompt(...)` helper usage directly inside `shouldPreferHeuristicImplementation(...)`.
   - Removed the corresponding private wrapper method from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving the same prompt artifact inference and workspace context passed to `isSimpleGeneratedPackagePromptText(...)`.
307. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
308. `refactor(main): remove served-web-url and model-failure-status thin wrappers in AgentTaskRunner`
   - Replaced `this.resolveServedWebPageUrl(...)` callsites with direct helper calls (`resolveServedWebPageUrlText(...)`) while preserving ANSI-stripping via `stripAnsiControlSequencesText(...)` before URL parsing.
   - Removed `resolveServedWebPageUrl(...)` private wrapper from `src/main/services/agentTaskRunner.ts`.
   - Replaced `this.buildTaskModelFailureStatus(...)` callback usage in route telemetry summary with inline direct helper invocation (`buildModelFailureStatusText(...)` + `isTaskModelBlacklistedText(...)`).
   - Removed `buildTaskModelFailureStatus(...)` private wrapper from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` served-page URL coverage to assert helper behavior directly.
   - Kept behavior unchanged by preserving routing/fallback URL rules and model blacklist threshold semantics.
309. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
310. `refactor(main): remove task-target-path normalization thin wrapper in AgentTaskRunner`
   - Replaced `this.normalizeTaskTargetPath(...)` usage in task startup flow with a direct helper call (`normalizeTaskTargetPathText(this.workspaceRoot, ...)`).
   - Removed the corresponding private wrapper method from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` to assert explicit task-target normalization/rejection behavior directly through `normalizeTaskTargetPathText(...)`.
   - Kept behavior unchanged by preserving the same workspace-root scoped path normalization/escape guard semantics.
311. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
312. `refactor(main): remove workspace-path normalization thin wrappers in AgentTaskRunner`
   - Replaced `this.resolveWorkspacePath(...)` callsites with direct helper calls (`resolveWorkspacePathText(this.workspaceRoot, ...)`) across workspace hydration, bootstrap recovery, and generated-desktop verification flows.
   - Replaced `this.toWorkspaceRelative(...)` callsites with direct helper calls (`toWorkspaceRelativeText(this.workspaceRoot, ...)`) in packaging artifact reporting and route telemetry summaries.
   - Removed the corresponding private wrapper methods `resolveWorkspacePath(...)` and `toWorkspaceRelative(...)` from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving the same workspace-root guard and relative-path normalization semantics through shared helpers.
313. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
314. `refactor(main): remove script-tool/library heuristic thin wrappers in AgentTaskRunner`
   - Replaced `this.buildHeuristicScriptTool(...)` and `this.buildHeuristicLibrary(...)` callsites in `tryHeuristicImplementation(...)` with direct helper calls (`buildHeuristicScriptToolWorkspace(...)` and `buildHeuristicLibraryWorkspace(...)`).
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` to assert script-tool and library heuristic behavior directly via helper-module calls instead of private class wrapper access.
   - Kept behavior unchanged by preserving prompt/artifact inference callbacks, project-name callbacks, and workspace-path callback wiring.
315. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
316. `refactor(main): remove structured-edit filtering thin wrapper in AgentTaskRunner`
   - Replaced all `this.filterValidEdits(...)` callsites with direct `this.inspectStructuredEdits(...).acceptedEdits` usage across implementation, repair, and fallback flows.
   - Removed the corresponding private wrapper method `filterValidEdits(...)` from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` to use `inspectStructuredEdits(...).acceptedEdits` directly and to stub `inspectStructuredEdits` in focused recovery/spec-repair tests that intentionally bypass edit filtering.
   - Kept behavior unchanged by preserving the same underlying structured-edit inspection and allowlist enforcement logic.
317. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
318. `refactor(main): remove task-work-item planner thin wrapper in AgentTaskRunner`
   - Replaced `this.buildTaskWorkItems(...)` callsite in execution-plan assembly with a direct helper call to `buildTaskWorkItemsText(...)` and explicit callback wiring.
   - Removed the corresponding private wrapper method `buildTaskWorkItems(...)` from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` work-item planner coverage to assert helper behavior directly via `buildTaskWorkItemsText(...)` through a local test utility function.
   - Kept behavior unchanged by preserving the same domain-focus/artifact/path helper callbacks and allowlist path expectations.
319. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
320. `refactor(main): remove execution-spec planner thin wrapper in AgentTaskRunner`
   - Replaced all `this.buildTaskExecutionSpec(...)` callsites with direct helper calls to `buildTaskExecutionSpecText(...)` in execution-plan construction and generated/bootstrapped README planning flows.
   - Removed the corresponding private wrapper method `buildTaskExecutionSpec(...)` from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving the same callback wiring for acceptance criteria, deliverables, quality gates, required-file planning, starter/domain inference, and new-project detection.
321. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
322. `refactor(main): remove heuristic-preference gate thin wrapper in AgentTaskRunner`
   - Replaced `this.shouldPreferHeuristicImplementation(...)` callsite in implementation flow with direct helper guard composition (`isLockedBuilderModeText(...)`, `isSimpleDesktopShellPromptText(...)`, `isSimpleNotesAppPromptText(...)`, and `isSimpleGeneratedPackagePromptText(...)`).
   - Removed the corresponding private wrapper method `shouldPreferHeuristicImplementation(...)` from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` heuristic-preference coverage to assert helper-composed gate behavior directly through a local test utility function.
   - Kept behavior unchanged by preserving the same builder-mode, workspace-kind, and prompt-artifact inference semantics.
323. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
324. `refactor(main): remove artifact-classification thin wrapper in AgentTaskRunner`
   - Replaced all `this.classifyArtifactType(...)` callsites with direct helper composition (`classifyArtifactTypeText(...)` + `inferArtifactTypeFromPromptText(...)` + `inferArtifactTypeFromPackageText(...)`) across task initialization, planning, verification, and final output refresh flows.
   - Removed the corresponding private wrapper method `classifyArtifactType(...)` from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` artifact-classification assertions to use a helper-composed local test utility function instead of private class wrapper calls.
   - Kept behavior unchanged by preserving preview-ready, workspace-kind, prompt-artifact, and package-artifact classification inputs.
325. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
326. `refactor(main): remove route-telemetry-summary thin wrapper in AgentTaskRunner`
   - Replaced `this.buildTaskRouteTelemetrySummary(...)` callsites in route diagnostics and task telemetry sync flows with direct helper calls to `buildTaskRouteTelemetrySummaryText(...)`.
   - Removed the corresponding private wrapper method `buildTaskRouteTelemetrySummary(...)` from `src/main/services/agentTaskRunner.ts`.
   - Kept behavior unchanged by preserving model-blacklist/failure-count maps, route-score callbacks, and stage-selection-reason callback wiring.
327. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
328. `refactor(main): remove desktop-approval gate thin wrapper in AgentTaskRunner`
   - Replaced `this.buildTaskApproval(...)` callsite in the final approval step with a direct `buildTaskApprovalGuard(...)` invocation and inline desktop-approval predicate.
   - Removed the corresponding private wrapper method `buildTaskApproval(...)` from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` desktop approval-gate assertions to call helper-level approval logic through a local test utility function.
   - Kept behavior unchanged by preserving existing desktop gating conditions and packaging-signal checks.
329. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
330. `feat(main): wire structured handoff output to live verification findings`
   - Updated `buildTaskOutput(...)` in `src/main/services/agentTaskRunner.ts` to pass `verificationChecks` into `buildTaskOutputText(...)`, so structured handoff fields now reflect real verification outcomes.
   - This enables `knownLimitations` and `nextFixes` to be populated from current task checks instead of falling back to generic no-verification text when verification exists.
   - Kept behavior unchanged for run-command and action selection while tightening output fidelity for product handoff.
331. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
332. `refactor(main): remove snapshot-entry and desktop-bootstrap passthrough wrappers in AgentTaskRunner`
   - Replaced `this.listStoredSnapshotEntries()` in snapshot pruning with a direct helper call to `listStoredSnapshotEntries(this.snapshotRoot)`.
   - Removed the corresponding private wrapper method `listStoredSnapshotEntries(...)` from `src/main/services/agentTaskRunner.ts`.
   - Replaced `this.buildDesktopBootstrapAppTsx(...)` in React starter file assembly with direct helper composition (`buildDesktopBootstrapAppTsxTemplate(...)` + `buildDesktopDomainContentForFocus(...)`).
   - Removed the corresponding private wrapper method `buildDesktopBootstrapAppTsx(...)` and cleaned the now-unused `StoredSnapshotEntry` type import.
333. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`434` passed / `0` failed).
334. `refactor(main): remove node-package bootstrap passthrough wrappers in AgentTaskRunner`
   - Replaced `this.getNodePackageBootstrapPaths(...)` usage in node-package bootstrap reuse checks with direct path selection at the callsite (`src/server.js` for API services, otherwise `src/index.js`).
   - Removed the corresponding private wrapper method `getNodePackageBootstrapPaths(...)` from `src/main/services/agentTaskRunner.ts`.
   - Replaced `this.buildNodePackageStarterContent(...)` usage in node-package scaffold writes with direct helper invocation (`buildNodePackageStarterContentTemplate(...)`) plus inline domain API-entity composition.
   - Removed the corresponding private wrapper method `buildNodePackageStarterContent(...)` from `src/main/services/agentTaskRunner.ts`.
   - Updated `src/test/agentTaskRunner.test.ts` node-package starter coverage to assert helper behavior directly through `buildNodePackageStarterContentTemplate(...)` and `buildApiEntityForDomainFocus(...)`.
335. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/agentTaskRunner.test.ts` passed (`434` passed / `0` failed).
336. `feat(main): wire explicit DoD gate sequence with package and installer-smoke stages`
   - Extended `runTask(...)` in `src/main/services/agentTaskRunner.ts` to enforce explicit post-verification DoD stages in order: `Repair verification failures` -> `Package Windows installer` -> `Run Windows installer smoke` -> `Approve generated output`.
   - Kept verification/build/runtime quality behavior intact while moving Windows packaging execution out of the verification rerun path and into the dedicated package gate stage.
   - Added `verifyWindowsInstallerSmoke(...)` to execute `scripts/smoke-win-installer.mjs` for generated desktop apps on Windows, then fail the task when installer smoke fails.
   - Ensured verification-only prompts still record a completed implementation gate step (`Implement requested changes`) for consistent DoD pipeline auditability.
   - Tightened `ensureVerificationRequired(...)` in `src/main/services/agentTaskVerificationGuards.ts` to require completed DoD stage steps before task completion.
   - Added installer-smoke method coverage in `src/test/agentTaskRunner.test.ts` and updated `src/test/generatedDesktopInstallerWorkflow.test.ts` source-introspection assertions for the new package/smoke gate wiring.
337. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/agentTaskRunner.test.ts src/test/generatedDesktopInstallerWorkflow.test.ts` passed (`436` passed / `0` failed).
338. `feat(main): make run mode enforce product-DoD gate strictness while preserving standard lane completion`
   - Normalized task run mode at `runTask(...)` start and persisted it into telemetry so resumed/older tasks consistently execute as `standard` or `build-product`.
   - Updated package and installer-smoke stages in `src/main/services/agentTaskRunner.ts` to explicitly skip in `standard` mode, while retaining full gate execution in `build-product` mode.
   - Updated `ensureVerificationRequired(...)` in `src/main/services/agentTaskVerificationGuards.ts` to accept run mode and require product-only DoD gates (`repair`, `package`, `installer-smoke`) only for `build-product` runs; implementation/verification/approval and verification report remain required in both modes.
   - Added guard coverage in `src/test/agentTaskRunner.test.ts` for both paths: `standard` mode completion without product-only gates and `build-product` mode failure when packaging gate is missing.
339. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/agentIpcSupport.test.ts src/test/agentTaskRunner.test.ts src/test/generatedDesktopInstallerWorkflow.test.ts` passed (`439` passed / `0` failed).
340. `feat(renderer): add explicit Agent run-mode control and thread mode into live task starts`
   - Added a run-mode selector in the Agent panel (`Build Product (full DoD)` vs `Standard (implement + verify + approve)`) in `src/renderer/index.html`.
   - Added renderer run-mode preference state (`AGENT_RUN_MODE_STORAGE_KEY`, `selectedAgentRunMode`) in `src/renderer/appStateUiUtils.ts`.
   - Added run-mode selection helpers in `src/renderer/appAgentTaskActionsUiUtils.ts` to normalize mode values, hydrate/persist preference via local storage, and resolve the active mode for task launch.
   - Updated `startAgentTaskPrompt(...)` to send the selected mode in `window.api.agent.startTask(...)` instead of hardcoded `build-product`.
   - Updated restart flow to mirror resumed task run mode back into selector state and status copy.
   - Wired selector initialization and change handling in `setupAgentControls(...)` (`src/renderer/appAgentControlsUiUtils.ts`).
341. `test(main/renderer): tighten DoD telemetry contract coverage for ordered gates and stage mapping`
   - Added `AgentTaskRunner` tests in `src/test/agentTaskRunner.test.ts` for:
     - canonical DoD gate ordering + last-write-wins behavior when the same gate is recorded multiple times,
     - stage-title to DoD-gate mapping (`Plan task execution`, `Verify build and quality scripts`, `Run Windows installer smoke`).
   - Validation:
     - `npm run build:ts` passed.
     - `npm test -- src/test/agentTaskRunner.test.ts src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`441` passed / `0` failed).
342. `ci(test): add dedicated Build Product DoD gate lane and wire into Windows workflows`
   - Added `test:agent:dod` script in `package.json` to run the Build Product gate contract suite:
     - `src/test/agentTaskRunner.test.ts`
     - `src/test/agentIpcSupport.test.ts`
     - `src/test/generatedDesktopInstallerWorkflow.test.ts`
     - `src/test/rendererDomContract.test.ts`
     - `src/test/claudeElapsedTimer.test.ts`
     - `src/test/desktopLaunchPromptWorkflow.test.ts`
   - Updated `.github/workflows/desktop-smoke.yml` to run `npm.cmd run test:agent:dod` after dependency install and before full test/smoke stages.
   - Updated `.github/workflows/windows-packaging.yml` to run `npm.cmd run test:agent:dod` in both `package_and_smoke` and `update_smoke` jobs before startup/package smoke gates.
343. Validation:
   - `npm run test:agent:dod` passed (`441` passed / `0` failed).
344. `test(main): add end-to-end DoD contract tests for build-product and standard run modes`
   - Added full `runTask(...)` contract test coverage in `src/test/agentTaskRunner.test.ts` for:
     - `build-product` mode: asserts successful completion and exact DoD gate progression/status (`plan`, `implement`, `verify`, `repair`, `package`, `installer-smoke`, `approve` all `passed`).
     - `standard` mode: asserts successful completion with product-only gates marked `skipped` and verifies packaging/smoke executors are not invoked.
   - These tests execute the real task-stage orchestration while stubbing side-effectful command/runtime/install operations, giving deterministic gate-contract validation without weakening flow fidelity.
345. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/agentTaskRunner.test.ts` passed (`443` passed / `0` failed).
346. Validation:
   - `npm run test:agent:dod` passed (`443` passed / `0` failed).
347. `feat(renderer): surface DoD gate timeline in task result cards`
   - Added explicit DoD timeline rendering in `src/renderer/appAgentTaskResultsUiUtils.ts` with ordered gate badges (`plan`, `implement`, `verify`, `repair`, `package`, `installer-smoke`, `approve`) and per-gate status coloring.
   - Rendered the timeline in both compact/main and full/panel task result views so run outcomes are inspectable stage-by-stage instead of counts-only telemetry.
   - Kept existing summary and verification blocks intact while augmenting visibility with low-noise gate labels and hover summaries.
348. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/rendererDomContract.test.ts src/test/claudeElapsedTimer.test.ts src/test/desktopLaunchPromptWorkflow.test.ts` passed (`443` passed / `0` failed).
   - `npm run test:agent:dod` passed (`443` passed / `0` failed).
349. `feat(ci): add deterministic DoD telemetry artifact generation and contract verification scripts`
   - Added `scripts/generate-dod-telemetry-artifact.mjs` to execute deterministic `AgentTaskRunner` build-product and standard-mode runs (with side effects stubbed) and emit a machine-readable telemetry artifact at `tmp/agent-dod-telemetry-contract.json`.
   - Added `scripts/verify-dod-telemetry-contract.mjs` to enforce canonical DoD gate order and run-mode-specific status contracts from telemetry artifacts:
     - `build-product`: all gates `passed`.
     - `standard`: `package` and `installer-smoke` `skipped`, all other gates `passed`, and packaging/smoke executors not invoked.
   - Added `verify:agent:dod:contract` npm script in `package.json` to run generate + verify and emit a markdown summary at `tmp/agent-dod-telemetry-contract-summary.md`.
350. `ci(workflows): enforce DoD telemetry artifact contract in desktop and windows pipelines`
   - Updated `.github/workflows/desktop-smoke.yml` to run `npm.cmd run verify:agent:dod:contract` immediately after the DoD gate test lane.
   - Updated `.github/workflows/windows-packaging.yml` to run the same verification in both `package_and_smoke` and `update_smoke` jobs.
   - Added artifact uploads for telemetry contract outputs (`tmp/agent-dod-telemetry-contract.json`, `tmp/agent-dod-telemetry-contract-summary.md`) in both workflows for post-run auditability.
351. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`443` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
352. `fix(test): make run-tests honor requested test-file scope for targeted lanes`
   - Updated `scripts/run-tests.mjs` to accept explicit test file arguments and map `src/test/*.test.ts` selectors to compiled `dist/test/*.test.js` targets.
   - Added missing-file diagnostics for requested tests so scoped lanes fail fast when compile output is missing or selectors are invalid.
   - Preserved default behavior when no arguments are provided (`npm test` still runs the full compiled test inventory).
353. Validation:
   - `npm run test:agent:dod` passed with targeted scope (`210` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
354. Validation:
   - `npm test` passed (`443` passed / `0` failed) after scoped-test selector support in `scripts/run-tests.mjs`.
355. `refactor(main): remove additional guard passthrough wrappers in AgentTaskRunner`
   - Replaced `this.ensureVerificationRequired(...)` call with direct `ensureVerificationRequiredGuard(...)` invocation at completion gate enforcement.
   - Replaced all `this.upsertVerificationCheck(...)` callsites with direct `upsertVerificationCheckGuard(...)` usage across verification, repair reruns, packaging, and installer-smoke flows.
   - Replaced `this.ensureNoRunningTask()` usage in `startTask(...)` and `restartTask(...)` with direct `ensureNoRunningTaskGuard(...)` calls.
   - Removed the corresponding private wrapper methods from `src/main/services/agentTaskRunner.ts` while preserving behavior.
356. `test(ci): add negative-case contract tests for DoD telemetry verifier`
   - Added `src/test/dodTelemetryContractScript.test.ts` with explicit failing-shape coverage for `scripts/verify-dod-telemetry-contract.mjs`:
     - non-canonical gate ordering,
     - missing required gate,
     - invalid standard-mode product-gate statuses and executor-call flags.
   - Updated `test:agent:dod` in `package.json` to include the new verifier-script contract test file so CI lane validates both positive and negative contract behavior.
357. Validation:
   - `npm run build:ts` passed.
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm run test:agent:dod` passed (`213` passed / `0` failed).
   - `npm test` passed (`446` passed / `0` failed).
358. `feat(ci): enforce strict generator-side DoD telemetry artifact contract before write`
   - Added internal artifact contract validation to `scripts/generate-dod-telemetry-artifact.mjs` so generation fails fast when emitted telemetry is malformed.
   - Enforced canonical gate order and required gates for each scenario (`plan`, `implement`, `verify`, `repair`, `package`, `installer-smoke`, `approve`).
   - Enforced run-mode-specific status and executor-call expectations at generation time:
     - `build-product`: all gates `passed`, packaging and installer-smoke executors must run.
     - `standard`: `package` and `installer-smoke` must be `skipped`, and both executors must be skipped.
   - Added duplicate/missing run-mode scenario checks for `build-product` and `standard` before artifact persistence.
359. `test(ci): add strict malformed-output contract tests for DoD telemetry generator script`
   - Extended `src/test/dodTelemetryContractScript.test.ts` with generator-script integration tests that execute `scripts/generate-dod-telemetry-artifact.mjs` against a temporary fake compiled `AgentTaskRunner` module.
   - Added positive contract test for canonical generated scenarios and explicit negative cases that must fail generation:
     - non-canonical gate order,
     - missing required gate,
     - invalid standard-mode product-gate statuses and executor-call flags.
   - Asserted malformed artifacts are rejected before write (no output JSON emitted on failure).
360. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`217` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm test` passed (`450` passed / `0` failed).
361. `refactor(main): remove output/failure-memory passthrough wrappers in AgentTaskRunner`
   - Replaced all `this.appendOutput(...)` callsites in command/startup process stream collectors with direct `extractTaskOutputLogLinesText(...)` + `appendLog(...)` usage.
   - Replaced `this.trimFailureMemory()` usage in failure-memory upsert flow with a direct `trimFailureMemoryStoreText(...)` helper call.
   - Removed the corresponding private wrapper methods `appendOutput(...)` and `trimFailureMemory(...)` from `src/main/services/agentTaskRunner.ts` while preserving behavior.
362. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`217` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm test` passed (`450` passed / `0` failed).
363. `refactor(main): remove persist-task-state passthrough wrapper in AgentTaskRunner`
   - Replaced all `this.persistTaskState(...)` callsites with direct `this.persistTaskStateNow(Date.now(), ...)` calls throughout `src/main/services/agentTaskRunner.ts`.
   - Removed the now-redundant private wrapper method `persistTaskState(...)` while preserving persistence timing and reason semantics.
364. `test(main): align AgentTaskRunner persistence tests to direct persistTaskStateNow calls`
   - Updated private-method harness typings and invocations in `src/test/agentTaskRunner.test.ts` to use `persistTaskStateNow(...)` instead of removed `persistTaskState(...)` shim.
   - Updated two DoD-run stubs to override `persistTaskStateNow` so deterministic task-run tests remain isolated from persistence side effects.
   - Renamed the persistence debounce test title to reflect direct method usage (`persistTaskStateNow`).
365. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`217` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm test` passed (`450` passed / `0` failed).
366. `refactor(main): remove telemetry passthrough wrappers in AgentTaskRunner step/failure flows`
   - Inlined `markTaskStage(...)` callsites in `runStep(...)` and `runDeferredStep(...)` with direct `ensureTaskTelemetry(...).lastStage` writes.
   - Inlined `markTaskFailureStage(...)` callsites in step-failure branches and task-failure catch handling with direct telemetry failure-stage/category updates.
   - Inlined `getMostRelevantFailureStage(...)` usage in task-failure handling by computing fallback stage directly from latest failed step + telemetry stage state.
   - Inlined verification telemetry updates in `updateTaskVerification(...)` and removed `updateTaskVerificationTelemetry(...)`.
   - Removed now-redundant private wrapper methods `markTaskStage(...)`, `markTaskFailureStage(...)`, `getMostRelevantFailureStage(...)`, and `updateTaskVerificationTelemetry(...)`.
367. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`217` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm test` passed (`450` passed / `0` failed).
368. `refactor(main): inline thin marketing heuristic wrappers in AgentTaskRunner`
   - Inlined pricing-page heuristic prompt matching and `buildHeuristicMarketingPageWorkspace(...)` assembly directly into `tryHeuristicImplementation(...)`.
   - Inlined announcement-page heuristic prompt matching and `buildHeuristicMarketingPageWorkspace(...)` assembly directly into `tryHeuristicImplementation(...)`.
   - Removed now-redundant private wrapper methods `buildHeuristicPricingPage(...)` and `buildHeuristicAnnouncementPage(...)` from `src/main/services/agentTaskRunner.ts`.
   - Preserved behavior by keeping the same prompt term checks, summary prefixes, template builders, and workspace-path resolution wiring.
369. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`217` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm test` passed (`450` passed / `0` failed).
370. `refactor(main): inline landing/dashboard heuristic wrappers in AgentTaskRunner`
   - Inlined landing-page heuristic prompt matching and `buildHeuristicLandingWorkspace(...)` assembly directly into `tryHeuristicImplementation(...)`.
   - Inlined dashboard heuristic prompt matching and `buildHeuristicDashboardWorkspace(...)` assembly directly into `tryHeuristicImplementation(...)`.
   - Removed now-redundant private wrapper methods `buildHeuristicLandingPage(...)` and `buildHeuristicDashboard(...)` from `src/main/services/agentTaskRunner.ts`.
   - Preserved behavior by keeping the same prompt term checks, domain-focus inference, template builders, and workspace-path resolution wiring.
371. `test(main): align dashboard heuristic fallback test to direct heuristic entrypoint`
   - Updated `src/test/agentTaskRunner.test.ts` wallboard fallback coverage to call `tryHeuristicImplementation(...)` instead of removed private `buildHeuristicDashboard(...)`.
   - Preserved assertion intent by continuing to validate dashboard summary output and `src/App.tsx` edit generation for wallboard prompts.
372. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`217` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm test` passed (`450` passed / `0` failed).
373. `refactor(main): inline notes/kanban heuristic wrappers in AgentTaskRunner`
   - Inlined kanban heuristic prompt matching and `buildHeuristicKanbanWorkspace(...)` assembly directly into `tryHeuristicImplementation(...)`.
   - Inlined notes-app heuristic prompt matching, feature-flag extraction (`search` / `delete` / `add`), and `buildHeuristicNotesWorkspace(...)` assembly directly into `tryHeuristicImplementation(...)`.
   - Removed now-redundant private wrapper methods `buildHeuristicKanbanBoard(...)` and `buildHeuristicNotesApp(...)` from `src/main/services/agentTaskRunner.ts`.
   - Preserved behavior by keeping the same heuristic ordering (`kanban` before desktop/notes), prompt term checks, template builders, and workspace-path resolution wiring.
374. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`217` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm test` passed (`450` passed / `0` failed).
375. `refactor(main): extract runTask implementation phase orchestration into helper`
   - Moved the large implementation-orchestration block from `runTask(...)` into `executeImplementationPhase(task, plan)` in `src/main/services/agentTaskRunner.ts`.
   - Preserved implementation behavior by keeping the same heuristic-first gating, model fallback flow, scoped-edit filtering, apply-edits path, summary logging, and DoD gate outcomes (`implement` passed/skipped).
   - Reduced `runTask(...)` nesting and critical-path complexity while keeping verification, packaging, installer-smoke, and approval gate orchestration unchanged.
376. `docs(checkpoint): refresh pending-scope metadata to match current modularization status`
   - Updated P2 modularization status to reflect that renderer modularization is completed and remaining maintainability scope is centered on `agentTaskRunner` orchestration decomposition.
   - Updated `Confirmed Pending Scope` date to `May 2, 2026` and rewrote pending-scope bullets to remove stale `app.ts` runtime-in-progress wording.
377. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`217` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm test` passed (`450` passed / `0` failed).
378. `refactor(main): extract runTask verification gate orchestration into helper`
   - Moved the large `Verify build and quality scripts` + `Repair verification failures` orchestration block from `runTask(...)` into `executeVerificationPhase(task, plan, inspectionPackageManifest)` in `src/main/services/agentTaskRunner.ts`.
   - Preserved behavior for artifact classification, script checks, runtime/preview/UI smoke verification, spec/requirements repair loops, final entry-file guard, report synthesis, and persisted verification telemetry/output shaping.
   - Kept `runTask(...)` packaging/installer-smoke/approval flow unchanged while reducing orchestration nesting and tightening helper boundaries.
379. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`217` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm test` passed (`450` passed / `0` failed).
380. `refactor(main): extract runTask packaging and installer-smoke orchestration into helper`
   - Moved the `Package Windows installer` and `Run Windows installer smoke` orchestration from `runTask(...)` into `executePackagingPhases(task, plan, runMode, verificationArtifactType, verificationChecks, inspectionPackageName)` in `src/main/services/agentTaskRunner.ts`.
   - Preserved behavior by keeping the same packaging guard checks, task output synchronization after each packaging stage, and DoD gate skip outcomes for `standard` mode.
   - Updated `src/test/generatedDesktopInstallerWorkflow.test.ts` source-contract assertion to match the helper-based structure while continuing to verify packaging guard usage and stage labels.
381. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`217` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm test` passed (`450` passed / `0` failed).
382. `refactor(main): extract runTask approval and completion finalization into helpers`
   - Moved `Approve generated output` orchestration into `executeApprovalPhase(task, plan)` in `src/main/services/agentTaskRunner.ts`.
   - Moved completion-state finalization (verification-required guard, summary/status updates, completion snapshot handling, and persistence/logging) into `finalizeCompletedTask(task, runMode)`.
   - Preserved behavior by keeping the same approval guard conditions and unchanged completion snapshot error handling/log semantics.
383. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`217` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm test` passed (`450` passed / `0` failed).
384. `refactor(main): extract runTask inspect/setup/plan orchestration into helpers`
   - Moved `Inspect workspace` orchestration into `inspectTaskWorkspace(task)` and reused `WorkspaceInspectionResult` as the helper contract.
   - Moved target selection/bootstrap setup orchestration into `resolveTaskWorkingDirectory(task, inspection)` including explicit target handling, generated-app context handling, and optional bootstrap execution.
   - Moved `Plan task execution` orchestration into `planTaskExecutionPhase(task, workingDirectory, inspection)` and simplified `runTask(...)` to consume the returned `TaskExecutionPlan` directly.
   - Preserved behavior while tightening type safety by normalizing optional inspection manifest fallbacks with `?? null` when passing package-manifest inputs into artifact/verification classification.
385. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`217` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm test` passed (`450` passed / `0` failed).
386. `refactor(main): extract runTask failure/finally orchestration into helpers`
   - Moved catch-path failure handling into `handleTaskRunFailure(task, err)` in `src/main/services/agentTaskRunner.ts`, preserving failure-stage telemetry updates, DoD failure mapping, logging, and immediate persistence.
   - Moved finally-path cleanup into `cleanupTaskRunState(task)` while preserving active task/process cleanup, route-state reset, and post-cleanup persistence behavior.
   - Kept `runTask(...)` control flow unchanged while reducing inline branching and making success-path orchestration easier to scan.
387. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`217` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm test` passed (`450` passed / `0` failed).
388. `test(contract): harden DoD generator malformed-artifact coverage`
   - Expanded `src/test/dodTelemetryContractScript.test.ts` fake-runner fault matrix to exercise additional generator-side malformed artifact conditions:
     - build-product verification gate status mismatch (`verify` not `passed`)
     - build-product packaging executors skipped when they must run
     - build-product task status not `completed`
     - duplicate DoD gate entries
     - unknown DoD gate entries
   - Added strict negative assertions that generator execution fails, no artifact file is written, and contract error output explicitly reports the malformed condition.
389. Validation:
   - `npm run build:ts` passed.
   - `npm run test:agent:dod` passed (`222` passed / `0` failed).
   - `npm run verify:agent:dod:contract` passed (artifact + summary emitted, status `passed`).
   - `npm test` passed (`455` passed / `0` failed).
390. `chore(cleanup): complete orphan placeholder cleanup scope`
   - Removed unreferenced renderer backup placeholder files:
     - `src/renderer/ui-backups/app.ts.bak`
     - `src/renderer/ui-backups/index.html.bak`
     - `src/renderer/ui-backups/styles.css.bak`
   - Updated node-package scaffold smoke test labels in `src/main/services/heuristicNodePackageTemplates.ts`:
     - `service smoke placeholder` -> `service smoke runs in node runtime`
     - `cli smoke placeholder` -> `cli smoke runs in node runtime`
391. Validation:
   - `npm run build:ts` passed.
   - `npm test -- src/test/agentTaskRunner.test.ts` ran and reported `203` passed / `3` failed.
   - Failing tests observed in this workspace run:
     - `AgentTaskRunner does not attach dashboard UI requirements to library prompts that mention dashboards as a usage context`
     - `AgentTaskRunner plans library prompts with package-scoped work items even when they mention dashboards as a usage context`
     - `AgentTaskRunner advances to the next repair model route after strict contract failures`
392. `fix(main): restore library artifact routing for reusable package prompts and keep strict repair-route fallback behavior`
   - Updated `src/main/services/heuristicPromptArtifactGuards.ts` to classify reusable/shared JavaScript/TypeScript/Node package prompts as `library`, preventing dashboard-usage wording from incorrectly falling through to `workspace-change`.
   - Updated `src/main/services/agentTaskRunner.ts` repair retry fallback to accept loose-wrapped responses only when the extracted JSON also satisfies the strict `{summary, edits:[{path,content}]}` contract.
   - Preserved loose-wrapper recovery for valid strict JSON while ensuring alternate schemas (for example `files`) continue to route to the next repair model when strict mode is required.
393. Validation:
   - `npm test -- src/test/agentTaskRunner.test.ts` passed (`206` passed / `0` failed).
   - `npm test` passed (`466` passed / `0` failed).
394. `docs(checkpoint): align pending-scope metadata with completed orchestration decomposition`
   - Updated P2 modularization status to mark high-value `agentTaskRunner` orchestration decomposition as completed (entries `375/378/380/382/384/386`).
   - Updated `Confirmed Pending Scope` so modularization and cleanup are reflected as completed and only operational commit/sync remains pending.
   - Updated Notes section to remove stale escalation-block wording and to reflect validated slices through `393`.
395. `docs(checkpoint): refresh current snapshot timestamp and validation counters`
   - Updated `Current Snapshot` `Last sync` timestamp to `2026-05-03 02:24:43 +04:00`.
   - Updated latest test baseline to `npm test` = `466 passed / 0 failed`.
396. `chore(sync): begin commit/sync follow-through from pending scope`
   - Created local checkpoint/fix commit: `314ce83` (`chore(checkpoint): finalize placeholder cleanup and strict repair routing`).
   - Commit includes placeholder cleanup completion artifacts, strict repair-route fallback hardening, reusable-package library classification guard updates, and checkpoint metadata refresh.
   - Current branch sync state after `git fetch origin`: `main` is `ahead 198 / behind 1` (`origin/main...main` left/right count `1 198`), so remote push requires an explicit merge/rebase/force strategy decision before final sync.
397. `docs(checkpoint): record post-commit sync attempt status`
   - Created follow-up checkpoint metadata commit: `b40d705` (`docs(checkpoint): record local commit and sync divergence state`).
   - Attempted `git push origin main`; push rejected as `non-fast-forward` because remote `origin/main` is ahead by one commit.
   - Current branch divergence after local commits is `ahead 199 / behind 1`.

## Rollback Guidance
- Keep one commit per small change (already followed).
- If regression appears, rollback to the latest green checkpoint commit.
- Suggested rollback anchors (latest first):
  - `3aa9c70`
  - `86fb52c`
  - `7dab029`
  - `bdc411c`
  - `5a14ce7`
  - `50b0937`
  - `afd942a`
  - `c015f5e`
  - `ec0a6d5`
  - `f060ccf`
  - `02b9e22`
  - `a1af305`
  - `92daefb`
  - `3345f4e`
  - `abe6e7e`
  - `0f6c1b3`
  - `444ee79`
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
- Remote sync is still pending; local commit progress includes slice `397` and branch divergence currently reports `ahead 199 / behind 1`.


