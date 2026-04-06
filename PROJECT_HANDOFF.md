# Project Handoff

## Project Goal
Cipher Workspace should become a Windows desktop app where one prompt can generate or fix an app autonomously, repair failures, verify the result, and only report success when the output actually works.

## Product Intent
- Windows-first desktop software, not a browser-only tool
- Low-headache agent experience for the end user
- Local-first via Ollama where practical
- The user should not need Codex/manual rescue after release

## Current Status
- Electron desktop app is already the base architecture
- Windows packaging scripts exist in `package.json`
- Main orchestration file is `src/main/services/agentTaskRunner.ts`
- Agent runner reliability has been improved recently around structured-fix parsing
- Persistent per-task telemetry now exists for selected model, fallback model, failure stage, and final verification result
- Workspace-kind enforcement is stricter now: static and React generated apps no longer silently mix scaffolds
- Model routing now uses stage-aware planner/generator/repair preferences, persisted reliability stats, semantic failure penalties, and per-task blacklisting after repeated failures
- Interactive agent routing now filters out oversized or vision-heavy Ollama routes for implementation work when smaller code-oriented local models are configured, which avoids avoidable `gpt-oss`/`qwen3-vl` timeout fallthrough in normal app use
- New desktop-app prompts now classify as desktop work from the prompt itself and bootstrap into isolated `generated-apps/...` targets instead of accidentally mutating the host Cipher workspace root
- Recent known test state from the active workstream: `179/179` passing
- A repeatable soak workflow now exists via `npm run soak:agent:prompts`, `npm run soak:agent:report`, and `npm run soak:agent:run`
- Renderer settings now expose agent route-bias controls and a live strategy preview for implementation, repair, and planning stages
- Agent panel now exposes runtime route reliability scores plus task-local blacklist and remembered stage-route state while a task is active
- Completed tasks now retain a persisted route-summary snapshot in telemetry so blacklist and stage-route context survives cleanup and app restart
- Soak reporting now includes route-diagnostics capture counts, blacklisted-model summaries, and remembered stage-route summaries
- Soak reporting now also persists run history in `tmp/agent-soak-history.json` and surfaces cross-run trend summaries for instability, failure categories, and blacklist frequency
- Soak reporting now also includes a recent-run trend window so old pre-fix noise remains visible for forensics without obscuring the current baseline
- The soak catalog is now executable end to end and has been run successfully across the original baseline scenarios with snapshot restore between each run
- The soak runner now supports `--prefer-local` and `--local-only` so real prompt batches can use Ollama routes when cloud auth is unavailable or intentionally bypassed
- The soak catalog now spans `28` scenarios across static-web, interactive-web, react-web, desktop-app, api-service, developer-tool, and library outputs
- Current real soak baseline is `28/28` scenarios run with `28` completed, `0` failed, `0` fallback used, `0` blacklisted scenarios, and `28/28` verification passed under local-only routing
- A separate realworld prompt pack now exists in `prompts/agent-realworld-pack.json` with `7` freeform scenarios, and the latest local-only run is `7/7` completed with `0` failed, `0` fallback used, `0` blacklisted scenarios, and `7/7` verification passed
- A separate messy natural-language prompt pack now exists in `prompts/agent-messy-pack.json`, and the expanded harder mixed-wording baseline is now green at `11/11` completed with `0` failed, `0` fallback used, and `0` blacklisted scenarios under local-only routing
- A separate manual-freeform prompt pack now exists in `prompts/agent-manual-freeform-pack.json` and has been expanded to `11` scenarios spanning dashboard, CRUD/stateful web, desktop, API, tool, and library prompts proven during hands-on testing
- The manual-freeform soak baseline is now fully green at `11/11` completed with `0` failed, `0` fallback used, and `0` blacklisted scenarios, covering dashboard, CRUD/stateful web, desktop, API, tool, and library prompts proven during hands-on testing
- A manual exploratory session guide now exists in `prompts/agent-manual-session.md` so UI/multi-window/freeform prompt testing can be run consistently instead of ad hoc
- Simple desktop-shell prompts now prefer the existing heuristic desktop builder first, which removes avoidable local-model blacklist churn for cases like the helpdesk desktop shell while preserving model-driven generation for broader desktop prompts
- Simple generated-package prompts that already map cleanly to the API, CLI, or library heuristics now prefer those heuristics first inside isolated `generated-apps/...` workspaces, which removes avoidable local-model fallback/blacklist churn for the current manual and messy prompt packs
- Current biggest gap has shifted from first-batch soak execution to live Windows CI observation, packaged update-smoke validation, and longer-run trend watching rather than current-pack correctness
- Cipher Workspace now supports first-class multi-window use: a fresh workspace window can be opened from the top bar, via `Ctrl/Cmd+Shift+N`, or by launching the app again while an instance is already running

## Current Constraints
- Disk space on `C:` has been tight
- A new 500GB NVMe is planned and should be used for Ollama models, generated apps, snapshots, and release artifacts
- Ollama is the preferred local provider
- The current local default has been centered around `qwen2.5-coder:14b`

## Current Architecture Focus
- Deterministic planning and verification happen in `src/main/services/agentTaskRunner.ts`
- Provider/model selection UI lives in `src/renderer/app.ts`
- Utility model route selection lives in `src/main/utilityPromptSupport.ts`
- Agent tasks already support ordered model routes and transport-level fallback

## What Has Been Done Recently
- Structured JSON replies with no usable edits are no longer mislabeled as malformed
- The structured edit parser was widened to accept:
  - object-map edits
  - alternative path/content field names
  - line-array content forms
- Regression tests were added for those parsing cases
- A broken generated app under `generated-apps/daily-records-app` was normalized into a consistent static app shape so preview/build verification would stop failing on a missing `src/main.tsx`
- Agent task telemetry is now persisted in task state and tracks:
  - selected model
  - fallback model used
  - failure stage
  - final verification result
- Renderer task cards now expose that telemetry in the result overview
- Regression tests were added for telemetry fallback tracking, failure-stage capture, and persistence
- Generated static workspaces now fail verification if React scaffold leftovers remain
- Generated-app cleanup now prunes conflicting scaffold files deterministically
- Notes/dashboard/CRUD work-item allowlists now respect the resolved scaffold instead of forcing React paths
- Heuristic notes, dashboard, and CRUD builders now support static outputs when the task is classified as static
- Model route reliability is now persisted and used to reorder routes automatically
- Models are blacklisted for the rest of a task after two failures in that task
- Semantic failures such as malformed JSON and valid JSON with no usable edits now penalize model reliability
- Routing is now stage-aware:
  - planner prefers `routing.longContext`
  - generator prefers `defaultModel` / `routing.default`
  - repair prefers `routing.think`
- Stage preference now biases route order without disabling reliability-based reordering
- Repair-stage models are now penalized when their edits still fail downstream build/lint/runtime verification
- Generation-stage implementation replies now fail fast when they include out-of-scope or mixed invalid edit payloads
- Web verification now includes a basic UI smoke pass for heading, primary action, and input flow on interactive app types
- Task telemetry now records explicit failure categories in addition to failure stage
- Preview verification now checks bootstrap wiring, not just linked asset existence
- Interactive UI smoke now requires evidence of stateful save/update flow for notes and CRUD-style apps
- Structured repair prompts now include explicit failure categories and category-specific repair guidance
- Generation-stage implementation replies now enforce a stricter schema contract: exact `summary` + `edits[]` shape, with route fallback when a model keeps violating that contract
- Structured repair replies now enforce the same strict `summary` + `edits[]` contract, including route fallback on schema mismatch, empty replies, and other semantic failures instead of treating the first bad repair response as terminal
- `src/shared/agentSoakScenarios.ts` now defines stable `[SOAK:...]` prompt fixtures across common app categories, and the catalog has been widened again to `28` scenarios including additional landing, CRUD, React dashboard, desktop shell, API-service, developer-tool, and library cases
- `scripts/agent-soak-report.mjs` now turns persisted `/.cipher-snapshots/agent-task-state.json` data into Markdown and JSON soak reports
- New-project detection now handles messier user phrasing like `Give me...` and `I want...`, which keeps CLI and desktop prompts isolated in `generated-apps/...` instead of falling back into the host workspace root
- CRUD classification now catches `admin console` / supplier-dispute wording, so those prompts route to generated web apps instead of inheriting the host desktop package
- Completed task summaries now omit the host-root `.` target instead of rendering `for ..`
- Generated node-package workspaces now accept package-local helper files under `src/`, `bin/`, and `scripts/` without treating them as host-workspace scope violations
- Generated node-package package manifests now preserve canonical bootstrap `build` scripts during normalization, which reduces build-recovery churn caused by model-edited `package.json` scripts
- Generic package run/build recovery now gathers context from node-package entry files by default instead of only web/react-biased candidates
- `scripts/agent-soak-run.mjs` now executes selected soak scenarios sequentially, waits for task completion, restores snapshots between runs, and writes an updated soak report
- Local soak runs can now override route bias without changing app settings by using `--prefer-local` or `--local-only`
- Local-only soak runs now also filter out oversized or vision-heavy Ollama models by default and apply that filtered set to both `models` and `ollamaModels`, which prevents avoidable memory/timeouts from poisoning the soak batch
- Local-only soak runs now also bias toward small code-oriented Ollama models and skip less suitable reasoning/general local routes when better coding routes are available, which prevents avoidable generator timeouts from dominating soak batches
- Soak reporting captures run status, verification result, failure category, fallback usage, and artifact expectation match per scenario
- Settings UI now persists explicit `routing.default`, `routing.think`, and `routing.longContext` choices and previews stage bias order in the renderer
- Agent IPC now exposes route diagnostics so the renderer can show reliability scores and active task route state without duplicating runner logic
- Task telemetry now stores compact route-summary state for completed tasks, and the renderer falls back to that summary after runtime route maps are cleared
- `src/shared/agentSoak.ts` now folds persisted route-summary data into per-scenario soak results and cross-scenario summaries
- React preview verification now accepts built `dist` bundle entries instead of falsely requiring a source `src/main.*` script tag in bundled output
- Explicit `script-tool`, `api-service`, and `library` prompts now win over the host Electron package when artifact type is classified
- New non-web prompts for tools, libraries, and API services now bootstrap into `generated-apps/...` with a minimal Node package scaffold instead of starting inside the host Electron workspace
- Utility-package prompts now classify as libraries before generic tool matches, which fixed the library soak path
- Kanban prompts now classify as React/web tasks with a dedicated builder mode, isolated project bootstrap, and heuristic board implementation
- UI smoke verification now recognizes kanban board/card layouts as valid stateful collection views instead of falsely failing them
- Script-tool runtime verification now retries with a generated fixture file when a CLI clearly expects an input argument instead of treating a usage message as a terminal failure
- `scripts/smoke-win-installer.mjs` now covers silent install, launch, reinstall, relaunch, uninstall, and version-to-version upgrade validation when a baseline installer and upgrade installer are provided
- `.github/workflows/windows-packaging.yml` is restored in the current repo state and now builds the Windows installer in CI, runs install smoke automatically, uploads installer artifacts with explicit retention, writes installer metadata, and can auto-select the latest successful retained baseline run for version-to-version update smoke while still allowing an explicit override run id
- Windows packaging CI now also runs on a weekly schedule, retains installer/report artifacts for 90 days, falls back from the current branch to the default branch when selecting a baseline installer, and skips the scheduled upgrade leg gracefully when no retained baseline exists yet
- Web launch verification now probes the live served page during startup verification instead of only checking source/output files after the process exits
- Browser-level smoke is now wired as a best-effort served-page sub-check: real DOM/runtime failures can fail verification, but helper-runtime failures are downgraded to skipped so Windows/Electron helper instability does not poison the soak baseline
- Browser smoke now runs a basic stateful interaction probe for notes, CRUD, and kanban flows so rendered pages must react to an actual input-and-action cycle instead of only exposing static DOM markers
- Browser-smoke decision logic now lives in a shared module with regression coverage, so stronger runtime verification can evolve without hiding behavior inside an untested helper script
- `scripts/agent-soak-report.mjs` and `scripts/agent-soak-run.mjs` now append compact soak history snapshots and expose longer-run trend summaries instead of only one-pass scenario totals
- Generic node-package API-service prompts now have a heuristic dependency-free fallback that writes a working `src/server.js` and stable package scripts, which avoids fragile model-authored dependency/version mistakes for CRUD-style service prompts
- Generated node-package verification now treats recoverable `npm install` failures as repairable: it can attempt a scoped structured repair or heuristic fallback before failing the task, and dependency-install failures now classify cleanly as `build-error` in telemetry and repair guidance
- Strict structured implementation parsing now accepts JSON-serializable content for JSON-like file edits such as `package.json`, which prevents avoidable route failures when models return object-valued manifest content instead of stringified JSON
- Generic library prompts now have a heuristic validation-library fallback, which keeps reusable helper-package prompts from failing outright when local models exhaust their strict JSON contract during implementation
- Freer-form prompt handling is broader now: tracker/wallboard phrasing maps into the correct CRUD/dashboard heuristics, and prompts that mention a "next contact date" no longer get misclassified as Next.js apps or landing-page contact CTAs
- The widened executed soak baseline is now fully green under local-only routing:
  - `5` static-web
  - `5` interactive-web
  - `5` react-web
  - `3` desktop-app
  - `4` api-service
  - `3` developer-tool
  - `3` library
- The separate realworld soak pack is also green under local-only routing:
  - `7` scenarios run
  - `7` completed
  - `0` failed
- The separate messy soak pack is also green under local-only routing:
  - `11` scenarios run
  - `11` completed
  - `0` failed
- Main-process IPC and window lifecycle now treat workspace windows as a managed set instead of a single `mainWindow`
- Chat, settings, router, and MCP changes now broadcast across workspace windows so secondary windows stay in sync without restarting
- The renderer header now exposes a dedicated `New Window` action, and `Ctrl/Cmd+Shift+N` opens another fresh Cipher Workspace window during long-running agent work

## What Is Still Broken / Incomplete
- Near-valid model outputs can still create inconsistent project shapes
- Success can still be reported too early if the generated output is structurally plausible but not actually healthy enough
- Generated-app verification still needs stronger packaged release smoke coverage beyond the current live-page probe plus browser interaction smoke
- Generation and repair stages still tolerate too much free-form model output before schema rejection
- Packaged Windows version-to-version update smoke now has a CI workflow path with scheduled baseline seeding, default-branch fallback, and 90-day retained installer/report artifacts, but live GitHub execution still needs to be observed to confirm the upgrade leg behaves as expected
- The Windows packaging workflow now also has working `smoke:win:install`, `smoke:win:update`, and `smoke:win:summary` npm entry points plus Markdown step-summary output, so install/update smoke results are visible directly in GitHub Actions and uploaded as summary artifacts instead of only raw JSON
- Repo-level regression tests now guard the Windows packaging workflow contract so missing npm scripts, missing summary steps, or formatter regressions are caught locally before CI

## Target End State
- User gives one prompt
- The app classifies the task correctly
- The app creates the correct scaffold deterministically
- The model fills only allowed files in a strict schema
- Build/lint/preview/smoke checks run automatically
- If something fails, the app repairs itself automatically
- Success is shown only after all required checks pass

## Recommended Model Strategy
- Local primary: `qwen2.5-coder:14b` if disk/VRAM are constrained
- Local stronger fallback after new NVMe: `qwen3-coder:30b` or `devstral:24b` if hardware permits
- Local code-repair fallback: `qwen2.5-coder:32b` if storage/perf permit
- Optional cloud escalation for hard cases remains useful even with good local models

## Immediate Must-Do Items
1. Expand the strict generation-stage contract beyond implementation edits if more model-authored stages are introduced.
2. Keep expanding and re-executing the soak catalog beyond the current baseline and keep category-level telemetry review in the loop.
3. Observe and keep version-to-version Windows update smoke exercised in live CI so the scheduled baseline/upgrade path stays healthy.

## Files That Matter Most
- `src/main/services/agentTaskRunner.ts`
- `src/test/agentTaskRunner.test.ts`
- `src/renderer/app.ts`
- `src/main/utilityPromptSupport.ts`
- `package.json`

## Current Repo State Notes
- The worktree is dirty; do not assume a clean branch
- Do not revert unrelated user changes
- Prefer small, verified edits around the agent loop

## Verification Commands
- `npm.cmd run build`
- `npm.cmd test`
- `npm.cmd run soak:agent:prompts`
- `npm.cmd run soak:agent:report`
- `npm.cmd run soak:agent:run -- --limit 1 --scenario landing.fintech-hero`
- `npm.cmd run soak:agent:run -- --scenario tool.markdown-cli --local-only --settings "C:\\Users\\about\\AppData\\Roaming\\Cipher Workspace\\cipher-workspace\\cipher-workspace-settings.json"`
- `npm.cmd run start`
- `npm.cmd run pack:win`
- `npm.cmd run start:packaged:win`

## Best Prompt For A New Chat
Use this exactly, then add the current task below it:

```text
Read this handoff carefully and continue from there. Do not redesign the goal.

Goal:
Cipher Workspace must become a Windows desktop app where one prompt can generate or fix an app autonomously, self-repair failures, verify the result, and only report success when it actually works.

Current handoff:
[paste PROJECT_HANDOFF.md here]

Current task:
[one concrete task]
```
