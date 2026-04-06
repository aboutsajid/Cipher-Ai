# Manual Agent Session

Use this when testing Cipher Workspace as a user instead of only through soak scripts.

The prompts that graduate from this session should also be added to `prompts/agent-manual-freeform-pack.json` so successful exploratory cases become repeatable automated regressions.

For day-to-day real prompts outside the curated session sets, use `prompts/agent-real-usage-workflow.md` and initialize a fresh log with `npm.cmd run agent:real-usage:init`.

## Session Goal

Validate three things at the same time:

- the agent can turn a vague prompt into a usable app or tool
- the renderer stays usable during a long-running task
- a second window remains useful for chat/help while the first window is busy

## Setup

1. Launch Cipher Workspace.
2. Open a second window with the top-bar `New Window` action or `Ctrl+Shift+N`.
3. Keep the first window on the Agent view.
4. Keep the second window on Chat so you can ask for rescue/help if the task drifts.

## What To Record

For every prompt, note:

- prompt id
- whether the agent chose the right artifact type
- whether the app/tool verified cleanly
- whether you had to intervene manually
- whether multi-window stayed usable
- any UI confusion, misleading output, or avoidable retries

## First Prompt Set

### manual.spa.bookkeeper

Prompt:

Build me a very small bookkeeping dashboard for a local shop. I want overdue invoices, this week revenue, a recent activity list, and a quick way to add a new invoice.

Expected:

- web app
- stateful add flow
- dashboard-style layout

### manual.crm.followups

Prompt:

Make a tiny follow-up tracker for sales calls. I need to add people, mark status, change next contact date, and still see the saved list after updates.

Expected:

- web app
- clear CRUD/stateful behavior

### manual.desktop.snippets

Prompt:

Create a desktop snippet desk for support work. Give me a sidebar, categories, a main snippet list, and a clear add snippet action.

Expected:

- desktop app

### manual.api.fulfillment

Prompt:

Build a tiny backend for fulfillment steps with endpoints to list orders, create one, mark packed, and mark shipped.

Expected:

- api service

### manual.tool.jsoncheck

Prompt:

Create a command line tool that reads a JSON file and prints a short health check summary about key counts, depth, and missing required fields.

Expected:

- script tool

### manual.library.validators

Prompt:

Create a reusable validation helpers package with required string checks, email validation, min length helpers, and friendly error formatting.

Expected:

- library

## Follow-On Prompt Set

### manual.api.shipment-exceptions

Prompt:

Build a tiny backend service for shipment exceptions with endpoints to list exceptions, create one, assign an owner, and mark one resolved.

Expected:

- api service
- real service build and boot verification

### manual.library.refunds-math

Prompt:

Create a small reusable JavaScript package for refunds math with helpers for subtotal, fees, tax, refund amount, and net payout.

Expected:

- library
- actual helper implementation, not just scaffold files

### manual.web.field-visits

Prompt:

Create a tiny web app for tracking field service visits. I need a form to add a visit, a visible list of saved visits, status updates, and a quick filter by technician.

Expected:

- web app
- clear CRUD/stateful behavior

### manual.tool.handoff-priority

Prompt:

Create a tiny command-line tool that reads a markdown handoff file and prints action items grouped by priority.

Expected:

- script tool

### manual.web.dispatch-followups

Prompt:

Build a small internal operations workspace for dispatch follow-ups. I need overdue items, owner assignment, status changes, and a visible saved list I can keep updating.

Expected:

- web app
- clear CRUD/stateful behavior

## UI Checklist

- Agent task starts without renderer errors.
- Task progress remains readable while work is in flight.
- Route health remains visible and sensible.
- Opening a second window does not break the first one.
- Chat remains usable in the second window during an agent run.
- Final result card matches the artifact actually produced.
- Preview or runtime action opens the expected target.

## Log Template

Copy this block into your notes for each session:

```md
# Manual Session Log

Date:
Build/Test baseline:

## Prompt
- Id:
- Text:
- Expected artifact:

## Result
- Actual artifact:
- Verification:
- Needed manual help: yes/no
- Multi-window usable: yes/no
- Chat usable in second window: yes/no

## Notes
- What worked:
- What broke:
- Follow-up fix:
```
