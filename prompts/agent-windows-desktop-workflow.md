# Windows Desktop Regression Pack

Use this pack when the goal is to harden Cipher Workspace for Windows-first desktop software prompts, not generic web output.

## Goal

Keep a repeatable baseline for the desktop prompts that matter most to normal Windows users:

- installable or standalone desktop utilities
- small business desktop workspaces
- personal productivity desktop tools
- local-first internal software shells

## Pack File

- `prompts/agent-windows-desktop-pack.json`

## Recommended Run Command

- `npm.cmd run soak:agent:run -- --scenarios-file prompts/agent-windows-desktop-pack.json --local-only`

## What To Check

- artifact type stays `desktop-app`
- verification stays meaningful and not just scaffold-only
- successful results offer the desktop runtime action
- generated desktop windows feel distinct from Cipher Workspace
- no renderer regressions happen while the agent is still running

## Promotion Rules

Add a prompt here when:

- it represents a realistic recurring Windows software request
- it exposed a bug that was fixed
- it needs to stay in permanent desktop coverage

Do not add a prompt here when:

- it is actually a better fit for web, API, tool, or library coverage
- it depends on user-specific business data
- it is too vague to be a stable regression
