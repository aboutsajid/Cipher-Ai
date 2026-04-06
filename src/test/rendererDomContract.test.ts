import test from "node:test";
import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";

function readProjectFile(path: string): string {
  return readFileSync(resolve(process.cwd(), path), "utf8");
}

function collectRendererIdReferences(source: string): string[] {
  const ids = new Set<string>();

  for (const match of source.matchAll(/\$\("([^"]+)"\)/g)) {
    ids.add(match[1]);
  }

  for (const match of source.matchAll(/document\.getElementById\("([^"]+)"\)/g)) {
    ids.add(match[1]);
  }

  return [...ids].sort();
}

function collectHtmlIds(html: string): Set<string> {
  return new Set([...html.matchAll(/\sid="([^"]+)"/g)].map((match) => match[1]));
}

test("renderer index html provides every id referenced by renderer app bindings", () => {
  const rendererSource = readProjectFile("src/renderer/app.ts");
  const rendererHtml = readProjectFile("src/renderer/index.html");

  const referencedIds = collectRendererIdReferences(rendererSource);
  const htmlIds = collectHtmlIds(rendererHtml);
  const missingIds = referencedIds.filter((id) => !htmlIds.has(id));

  assert.deepEqual(
    missingIds,
    [],
    `renderer app references missing HTML ids: ${missingIds.join(", ")}`
  );
  assert.ok(referencedIds.includes("agent-refresh-route-health-btn"));
});
