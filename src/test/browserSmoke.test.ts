import test from "node:test";
import assert from "node:assert/strict";
import {
  createBrowserSmokeResult,
  evaluateBrowserSmoke,
  requiresStatefulInteractionProbe,
  summarizeBrowserSmokeSnapshot,
  type BrowserSmokeInteractionProbe,
  type BrowserSmokeSnapshot
} from "../shared/browserSmoke";

function createSnapshot(overrides: Partial<BrowserSmokeSnapshot> = {}): BrowserSmokeSnapshot {
  return {
    readyState: "complete",
    title: "Cipher Test",
    hasHtml: true,
    hasBody: true,
    headingCount: 1,
    actionCount: 1,
    inputCount: 1,
    collectionCount: 1,
    rootCount: 1,
    scriptCount: 1,
    appScriptCount: 1,
    textLength: 120,
    htmlLength: 240,
    localStorageKeys: 0,
    sessionStorageKeys: 0,
    ...overrides
  };
}

function createProbe(overrides: Partial<BrowserSmokeInteractionProbe> = {}): BrowserSmokeInteractionProbe {
  return {
    attempted: true,
    changed: true,
    details: "Basic stateful interaction changed the rendered page or storage.",
    typedValueVisible: true,
    collectionDelta: 1,
    textDelta: 24,
    localStorageDelta: 1,
    sessionStorageDelta: 0,
    ...overrides
  };
}

test("browser smoke snapshot summary stays compact and stable", () => {
  assert.equal(
    summarizeBrowserSmokeSnapshot(createSnapshot({ headingCount: 2, localStorageKeys: 3, sessionStorageKeys: 1 })),
    "heading=2, action=1, input=1, collection=1, text=120, storage=3/1"
  );
});

test("browser smoke identifies stateful builder modes", () => {
  assert.equal(requiresStatefulInteractionProbe("landing"), false);
  assert.equal(requiresStatefulInteractionProbe("notes"), true);
  assert.equal(requiresStatefulInteractionProbe("crud"), true);
  assert.equal(requiresStatefulInteractionProbe("kanban"), true);
});

test("browser smoke passes a healthy landing page without requiring interaction", () => {
  const result = evaluateBrowserSmoke(createSnapshot(), "static", "landing", []);
  assert.equal(result.status, "passed");
  assert.match(result.details, /Rendered page smoke passed/i);
});

test("browser smoke fails stateful apps when no stateful interaction probe ran", () => {
  const result = evaluateBrowserSmoke(
    createSnapshot(),
    "static",
    "notes",
    [],
    null
  );
  assert.equal(result.status, "failed");
  assert.match(result.details, /did not run a stateful interaction probe/i);
});

test("browser smoke fails stateful apps when interaction does not change page state", () => {
  const result = evaluateBrowserSmoke(
    createSnapshot(),
    "static",
    "crud",
    [],
    createProbe({
      changed: false,
      typedValueVisible: false,
      collectionDelta: 0,
      textDelta: 0,
      localStorageDelta: 0,
      details: "Input and submit flow completed, but no collection, text, or storage change was detected."
    })
  );
  assert.equal(result.status, "failed");
  assert.match(result.details, /did not react to a basic stateful interaction/i);
});

test("browser smoke passes stateful apps when interaction mutates visible state", () => {
  const result = evaluateBrowserSmoke(
    createSnapshot(),
    "static",
    "kanban",
    [],
    createProbe()
  );
  assert.equal(result.status, "passed");
  assert.match(result.details, /Interaction: Basic stateful interaction changed/i);
});

test("browser smoke includes console errors in failure details", () => {
  const result = evaluateBrowserSmoke(
    createSnapshot(),
    "react",
    "dashboard",
    ["uncaught reference error"],
    null
  );
  assert.equal(result.status, "failed");
  assert.match(result.details, /Browser console\/runtime errors detected/i);
});

test("browser smoke result helper shapes structured output", () => {
  const result = createBrowserSmokeResult("skipped", "helper unavailable", { source: "test" });
  assert.deepEqual(result, {
    status: "skipped",
    details: "helper unavailable",
    diagnostics: { source: "test" }
  });
});
