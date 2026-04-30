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
