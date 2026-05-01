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
   - Add an orchestrated “Build Product” run mode for agent tasks that enforces the full gated pipeline automatically.
4. Productization features:
   - Improve artifact diagnostics, failure auto-repair loops, and packaging quality signals for higher autonomous success rate.

## Current Snapshot
- Last sync: `2026-04-30`
- Branch: `main`
- Workspace state: contains many existing modified/untracked files from the in-progress stream.
- App status: Electron app launches and runs.
- Manual launch check: `npm run start` executed on `2026-04-28`; Electron renderer processes started successfully.
- Landing status: duplicate bottom tagline removed from the main landing/empty state.
- Test status (latest run): `434 passed / 0 failed`.
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

## Rollback Guidance
- Keep one commit per small change (already followed).
- If regression appears, rollback to the latest green checkpoint commit.
- Suggested rollback anchors (latest first):
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
