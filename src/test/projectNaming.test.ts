import test from "node:test";
import assert from "node:assert/strict";
import {
  extractProjectName,
  extractPromptTerms,
  toDisplayLabel,
  toDisplayNameFromDirectory
} from "../main/services/projectNaming";

test("extractPromptTerms removes stop words, deduplicates, and caps to ten terms", () => {
  const terms = extractPromptTerms(
    "Build a safe dashboard app with audit logs, audit exports, and workspace summary plus alerts and charts and trends and reports and alerts"
  );

  assert.deepEqual(terms, [
    "dashboard",
    "audit",
    "logs",
    "exports",
    "summary",
    "plus",
    "alerts",
    "charts",
    "trends",
    "reports"
  ]);
});

test("extractProjectName prefers explicit called/named project names", () => {
  const name = extractProjectName("Create a tool called \"Vendor Payments Desk\" with CRUD flows.");
  assert.equal(name, "vendor-payments-desk");
});

test("extractProjectName falls back to prompt terms and defaults when needed", () => {
  assert.equal(extractProjectName("Please build notes organizer with tags and reminders"), "please-notes-organizer");
  assert.equal(extractProjectName("++"), "agent-app");
});

test("toDisplayLabel normalizes separators and extensions", () => {
  assert.equal(toDisplayLabel("focus_notes-app.tsx"), "Focus Notes App");
  assert.equal(toDisplayLabel("   ", "Fallback"), "Fallback");
});

test("toDisplayNameFromDirectory uses the last workspace segment", () => {
  assert.equal(toDisplayNameFromDirectory("generated-apps/focus-notes"), "Focus Notes");
  assert.equal(toDisplayNameFromDirectory(""), "Focus Notes");
});
