# Real Usage Prompt Log Workflow

Use this after the current soak packs are green and the goal shifts from synthetic coverage to real-user confidence.

## Goal

Capture real prompts from actual use, grade them consistently, and convert the useful signals into permanent coverage or targeted fixes.

## When To Use This

- while using Cipher Workspace for actual app or tool generation work
- when a prompt is too specific, messy, or business-shaped to belong in the curated packs yet
- when a result technically passes but still feels misleading or weak

## Daily Loop

1. Initialize a fresh session log:
   - `npm.cmd run agent:real-usage:init`
2. Open two Cipher Workspace windows:
   - Agent in the first
   - Chat/help in the second
3. Run 3-10 real prompts from actual work.
4. For each prompt, paste the result-card summary or verification lines into the log entry.
5. Label each result:
   - `strong-pass`
   - `soft-pass`
   - `fail`
6. At the end of the session, decide which prompts should:
   - become pack coverage
   - become verification/routing fixes
   - stay as one-off usage notes

## What Counts As A Strong Pass

- correct artifact type
- verification matched the artifact and ran meaningful checks
- no manual rescue needed
- user-visible result matched the prompt well enough to trust it
- multi-window behavior stayed usable during the run

## What Counts As A Soft Pass

- completed but with weak or shallow verification
- result technically worked but the UI was misleading
- unnecessary retries, drift, or fallback happened
- artifact was acceptable but not the best fit

## What Counts As A Fail

- wrong artifact type
- runtime/build/preview failure
- manual rescue or prompt rewriting was required
- summary/result card was misleading enough to hide the real problem

## Promotion Rules

Promote a prompt into a pack when:

- it represents a realistic recurring use case
- it exposed a bug that was fixed
- it is specific enough to be repeatable

Do not promote a prompt into a pack when:

- it contains sensitive user/business data
- it is too one-off to be a useful regression
- the signal is better captured as a verifier or routing rule

## Files Used By This Workflow

- Session guide: `prompts/agent-real-usage-workflow.md`
- Session log output: `tmp/agent-real-usage-log.md`
- Log bootstrap command: `npm.cmd run agent:real-usage:init`
- Existing pack promotion targets:
  - `prompts/agent-manual-freeform-pack.json`
  - `prompts/agent-messy-pack.json`
  - `prompts/agent-realworld-pack.json`
  - `prompts/agent-windows-desktop-pack.json`
