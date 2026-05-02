import type { AgentArtifactType } from "../../shared/types";
import type { ApiEntityContent } from "./heuristicDesktopApiDomainContent";

export interface NodePackageStarterTemplateOptions {
  artifactType?: AgentArtifactType;
  apiEntity?: ApiEntityContent;
}

export interface NodePackageManifestTemplate {
  name: string;
  private: boolean;
  version: string;
  type: "module";
  scripts: Record<string, string>;
  main?: string;
  exports?: Record<string, string>;
  bin?: Record<string, string>;
}

export function buildNodePackageScriptsTemplate(artifactType?: AgentArtifactType): Record<string, string> {
  if (artifactType === "api-service") {
    return {
      build: "node -e \"console.log('Service ready')\"",
      test: "node --test",
      start: "node src/server.js"
    };
  }
  if (artifactType === "library") {
    return {
      build: "node -e \"console.log('Package ready')\"",
      test: "node --test"
    };
  }
  return {
    build: "node -e \"console.log('Tool ready')\"",
    test: "node --test",
    start: "node src/index.js"
  };
}

export function buildNodePackageManifestTemplate(projectName: string, artifactType?: AgentArtifactType): NodePackageManifestTemplate {
  const manifest: NodePackageManifestTemplate = {
    name: projectName,
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: buildNodePackageScriptsTemplate(artifactType)
  };

  if (artifactType === "library") {
    manifest.main = "./src/index.js";
    manifest.exports = {
      ".": "./src/index.js"
    };
  } else if (artifactType === "script-tool") {
    manifest.bin = {
      [projectName]: "./bin/cli.mjs"
    };
  } else if (artifactType === "api-service") {
    manifest.main = "./src/server.js";
  }

  return manifest;
}

export function buildNodePackageStarterContentTemplate(
  projectName: string,
  options: NodePackageStarterTemplateOptions = {}
): Array<{ path: string; content: string }> {
  const artifactType = options.artifactType;
  const entity = options.apiEntity;

  if (artifactType === "api-service" && entity) {
    return [
      {
        path: "src/server.js",
        content: [
          "import http from 'node:http';",
          "import { randomUUID } from 'node:crypto';",
          "",
          `const ${entity.plural} = [`,
          `  { id: randomUUID(), ${entity.primaryField}: '${entity.defaultPrimaryValue}', status: 'active' }`,
          "];",
          "",
          "function sendJson(res, statusCode, payload) {",
          "  res.writeHead(statusCode, { 'content-type': 'application/json' });",
          "  res.end(JSON.stringify(payload));",
          "}",
          "",
          "function readJsonBody(req) {",
          "  return new Promise((resolve, reject) => {",
          "    let raw = '';",
          "    req.on('data', (chunk) => { raw += chunk; });",
          "    req.on('end', () => {",
          "      if (!raw.trim()) return resolve({});",
          "      try { resolve(JSON.parse(raw)); } catch (error) { reject(error); }",
          "    });",
          "    req.on('error', reject);",
          "  });",
          "}",
          "",
          "const server = http.createServer(async (req, res) => {",
          "  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? 'localhost'}`);",
          "  if (req.method === 'GET' && url.pathname === '/health') {",
          `    return sendJson(res, 200, { service: '${projectName}', status: 'ok', resource: '${entity.plural}' });`,
          "  }",
          `  if (req.method === 'GET' && url.pathname === '${entity.collectionPath}') {`,
          `    return sendJson(res, 200, { ${entity.plural} });`,
          "  }",
          `  if (req.method === 'POST' && url.pathname === '${entity.collectionPath}') {`,
          "    const body = await readJsonBody(req);",
          `    const ${entity.singular} = {`,
          "      id: randomUUID(),",
          `      ${entity.primaryField}: String(body.${entity.primaryField} ?? '${entity.defaultPrimaryValue}'),`,
          "      status: String(body.status ?? 'active')",
          "    };",
          `    ${entity.plural}.unshift(${entity.singular});`,
          `    return sendJson(res, 201, ${entity.singular});`,
          "  }",
          "  return sendJson(res, 404, { error: 'Not found' });",
          "});",
          "",
          "server.listen(process.env.PORT || 3000, () => {",
          `  console.log('${projectName} listening');`,
          "});"
        ].join("\n") + "\n"
      },
      {
        path: "test/server.test.js",
        content: [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "",
          "test('service smoke runs in node runtime', () => {",
          "  assert.equal(typeof process.version, 'string');",
          "});"
        ].join("\n") + "\n"
      }
    ];
  }

  if (artifactType === "library") {
    return [
      {
        path: "src/index.js",
        content: [
          `export function describe${projectName.replace(/(^|[-_\s]+)([a-z])/gi, (_match, _sep, char) => char.toUpperCase())}() {`,
          `  return '${projectName} package ready';`,
          "}",
          "",
          "export function formatCompactCount(value) {",
          "  return new Intl.NumberFormat('en', { notation: 'compact' }).format(Number(value || 0));",
          "}",
          "",
          "export function formatPercentDelta(value) {",
          "  const amount = Number(value || 0);",
          "  const prefix = amount > 0 ? '+' : '';",
          "  return `${prefix}${amount.toFixed(1)}%`;",
          "}"
        ].join("\n") + "\n"
      },
      {
        path: "test/index.test.js",
        content: [
          "import test from 'node:test';",
          "import assert from 'node:assert/strict';",
          "import { formatCompactCount } from '../src/index.js';",
          "",
          "test('formatCompactCount returns a compact number string', () => {",
          "  assert.equal(typeof formatCompactCount(1200), 'string');",
          "});"
        ].join("\n") + "\n"
      }
    ];
  }

  return [
    {
      path: "src/index.js",
      content: [
        "#!/usr/bin/env node",
        "",
        "import { readFile } from 'node:fs/promises';",
        "",
        "const [targetPath, ...rest] = process.argv.slice(2);",
        "const inlineText = rest.join(' ').trim();",
        "",
        "if (targetPath) {",
        "  try {",
        "    const content = await readFile(targetPath, 'utf8');",
        "    const lines = content.split(/\\r?\\n/).filter(Boolean);",
        `    console.log(JSON.stringify({ tool: '${projectName}', file: targetPath, lines: lines.length, preview: lines.slice(0, 3) }, null, 2));`,
        "    process.exit(0);",
        "  } catch (error) {",
        "    console.error(`Unable to read ${targetPath}: ${error instanceof Error ? error.message : String(error)}`);",
        "    process.exit(1);",
        "  }",
        "}",
        "",
        `console.log(inlineText || '${projectName} tool ready');`
      ].join("\n") + "\n"
    },
    {
      path: "bin/cli.mjs",
      content: [
        "#!/usr/bin/env node",
        "import '../src/index.js';"
      ].join("\n") + "\n"
    },
    {
      path: "test/index.test.js",
      content: [
        "import test from 'node:test';",
        "import assert from 'node:assert/strict';",
        "",
        "test('cli smoke runs in node runtime', () => {",
        "  assert.equal(2 + 2, 4);",
        "});"
      ].join("\n") + "\n"
    }
  ];
}
