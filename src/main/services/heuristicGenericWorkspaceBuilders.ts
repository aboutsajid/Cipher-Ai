import type { ApiEntityContent } from "./heuristicDesktopApiDomainContent";

interface StructuredEdit {
  path: string;
  content: string;
}

export interface HeuristicWorkspaceResult {
  summary: string;
  edits: StructuredEdit[];
}

type WorkspaceKind = "static" | "react" | "generic";

export interface HeuristicApiServiceWorkspaceInput {
  prompt: string;
  normalizedPrompt: string;
  title: string;
  domainFocus: string;
  workingDirectory: string;
  extractProjectName: (prompt: string) => string;
  resolveWorkspacePath: (workingDirectory: string, relativePath: string) => string;
  resolveDomainEntity: (domainFocus: string) => ApiEntityContent;
}

export interface HeuristicScriptToolWorkspaceInput {
  prompt: string;
  workspaceKind: WorkspaceKind;
  workingDirectory: string;
  inferArtifactTypeFromPrompt: (prompt: string) => string | null;
  extractProjectName: (prompt: string) => string;
  resolveWorkspacePath: (workingDirectory: string, relativePath: string) => string;
}

export interface HeuristicLibraryWorkspaceInput {
  prompt: string;
  workspaceKind: WorkspaceKind;
  workingDirectory: string;
  inferArtifactTypeFromPrompt: (prompt: string) => string | null;
  extractProjectName: (prompt: string) => string;
  resolveWorkspacePath: (workingDirectory: string, relativePath: string) => string;
}

export function buildHeuristicApiServiceWorkspace(
  input: HeuristicApiServiceWorkspaceInput
): HeuristicWorkspaceResult {
  const {
    prompt,
    normalizedPrompt,
    title,
    domainFocus,
    workingDirectory,
    extractProjectName,
    resolveWorkspacePath,
    resolveDomainEntity
  } = input;

  const entity = normalizedPrompt.includes("invoice")
    ? { singular: "invoice", plural: "invoices", collectionPath: "/invoices", primaryField: "customer", defaultPrimaryValue: "Acme Corp" }
    : normalizedPrompt.includes("booking")
      ? { singular: "booking", plural: "bookings", collectionPath: "/bookings", primaryField: "guest", defaultPrimaryValue: "Jordan Lee" }
      : normalizedPrompt.includes("ticket")
        ? { singular: "ticket", plural: "tickets", collectionPath: "/tickets", primaryField: "subject", defaultPrimaryValue: "Login issue" }
        : normalizedPrompt.includes("expense")
          ? { singular: "request", plural: "requests", collectionPath: "/requests", primaryField: "requester", defaultPrimaryValue: "Morgan Chen" }
          : resolveDomainEntity(domainFocus);

  const actions: Array<{ path: string; status?: string; assign?: boolean }> = [];
  if (normalizedPrompt.includes("approve")) actions.push({ path: "approve", status: "approved" });
  if (normalizedPrompt.includes("reject")) actions.push({ path: "reject", status: "rejected" });
  if (normalizedPrompt.includes("cancel")) actions.push({ path: "cancel", status: "canceled" });
  if (normalizedPrompt.includes("confirm")) actions.push({ path: "confirm", status: "confirmed" });
  if (normalizedPrompt.includes("close")) actions.push({ path: "close", status: "closed" });
  if (normalizedPrompt.includes("assign")) actions.push({ path: "assign", assign: true });
  if (normalizedPrompt.includes("paid")) actions.push({ path: "pay", status: "paid" });
  if (actions.length === 0) {
    actions.push({ path: "update", status: "updated" });
  }

  const collectionPattern = entity.collectionPath.replace(/\//g, "\\/");
  const actionHandlers = actions.map((action) => {
    const routeVar = `${action.path}Match`;
    const matcher = `pathname.match(/^${collectionPattern}\\/([^/]+)\\/${action.path}$/)`;
    if (action.assign) {
      return [
        `  const ${routeVar} = ${matcher};`,
        `  if (req.method === "POST" && ${routeVar}) {`,
        `    const item = ${entity.plural}.find((entry) => entry.id === ${routeVar}[1]);`,
        "    if (!item) {",
        `      return sendJson(res, 404, { error: "${entity.singular} not found" });`,
        "    }",
        "    const body = await readJsonBody(req);",
        '    item.owner = String(body.owner ?? item.owner ?? "unassigned");',
        '    item.status = String(body.status ?? item.status ?? "assigned");',
        "    item.updatedAt = new Date().toISOString();",
        "    return sendJson(res, 200, item);",
        "  }"
      ].join("\n");
    }

    return [
      `  const ${routeVar} = ${matcher};`,
      `  if (req.method === "POST" && ${routeVar}) {`,
      `    const item = ${entity.plural}.find((entry) => entry.id === ${routeVar}[1]);`,
      "    if (!item) {",
      `      return sendJson(res, 404, { error: "${entity.singular} not found" });`,
      "    }",
      `    item.status = "${action.status ?? "updated"}";`,
      "    item.updatedAt = new Date().toISOString();",
      "    return sendJson(res, 200, item);",
      "  }"
    ].join("\n");
  }).join("\n\n");

  const serverContent = [
    "import http from 'node:http';",
    "import { URL } from 'node:url';",
    "",
    `const ${entity.plural} = [`,
    "  {",
    "    id: 'seed-1',",
    `    ${entity.primaryField}: "${entity.defaultPrimaryValue}",`,
    "    amount: 1200,",
    "    status: 'pending',",
    "    owner: 'ops-desk',",
    "    createdAt: new Date().toISOString()",
    "  }",
    "];",
    "",
    "function sendJson(res, statusCode, payload) {",
    "  res.writeHead(statusCode, { 'content-type': 'application/json; charset=utf-8' });",
    "  res.end(JSON.stringify(payload));",
    "}",
    "",
    "async function readJsonBody(req) {",
    "  const chunks = [];",
    "  for await (const chunk of req) chunks.push(Buffer.from(chunk));",
    "  if (chunks.length === 0) return {};",
    "  try {",
    "    return JSON.parse(Buffer.concat(chunks).toString('utf8'));",
    "  } catch {",
    "    return {};",
    "  }",
    "}",
    "",
    "const server = http.createServer(async (req, res) => {",
    "  const url = new URL(req.url ?? '/', `http://${req.headers.host ?? '127.0.0.1'}`);",
    "  const pathname = url.pathname.replace(/\\/+$/, '') || '/';",
    "",
    "  if (req.method === 'GET' && pathname === '/health') {",
    `    return sendJson(res, 200, { service: '${title}', status: 'ok', resource: '${entity.plural}' });`,
    "  }",
    "",
    `  if (req.method === 'GET' && pathname === '${entity.collectionPath}') {`,
    `    return sendJson(res, 200, { ${entity.plural} });`,
    "  }",
    "",
    `  if (req.method === 'POST' && pathname === '${entity.collectionPath}') {`,
    "    const body = await readJsonBody(req);",
    "    const next = {",
    "      id: String(Date.now()),",
    `      ${entity.primaryField}: String(body.${entity.primaryField} ?? "${entity.defaultPrimaryValue}"),`,
    "      amount: Number(body.amount ?? 500),",
    '      owner: String(body.owner ?? "ops-desk"),',
    '      status: String(body.status ?? "pending"),',
    "      createdAt: new Date().toISOString()",
    "    };",
    `    ${entity.plural}.unshift(next);`,
    "    return sendJson(res, 201, next);",
    "  }",
    "",
    actionHandlers,
    "",
    `  return sendJson(res, 404, { error: 'Unknown ${entity.singular} route' });`,
    "});",
    "",
    "const port = Number(process.env.PORT || 3000);",
    "server.listen(port, () => {",
    `  console.log('${title} API listening on ' + port);`,
    "});",
    ""
  ].join("\n");

  return {
    summary: `Created a heuristic ${title} API service with ${entity.plural} listing, creation, and lifecycle endpoints.`,
    edits: [
      {
        path: resolveWorkspacePath(workingDirectory, "package.json"),
        content: `${JSON.stringify({
          name: extractProjectName(prompt),
          private: true,
          version: "0.1.0",
          type: "module",
          scripts: {
            build: "node -e \"console.log('Service ready')\"",
            start: "node src/server.js"
          }
        }, null, 2)}\n`
      },
      {
        path: resolveWorkspacePath(workingDirectory, "src/server.js"),
        content: serverContent
      }
    ]
  };
}

export function buildHeuristicScriptToolWorkspace(
  input: HeuristicScriptToolWorkspaceInput
): HeuristicWorkspaceResult | null {
  const {
    prompt,
    workspaceKind,
    workingDirectory,
    inferArtifactTypeFromPrompt,
    extractProjectName,
    resolveWorkspacePath
  } = input;

  const normalized = (prompt ?? "").trim().toLowerCase();
  if (workspaceKind !== "generic") return null;

  const promptArtifact = inferArtifactTypeFromPrompt(normalized);
  const wantsCli = /\b(cli|command[- ]line|script|utility|tool|automation)\b/.test(normalized);
  const wantsJson = normalized.includes("json");
  const wantsCsv = normalized.includes("csv");
  const wantsMarkdown = normalized.includes("markdown");
  const wantsFileAudit = /\b(audit|summary|summarize|report|analy[sz]e|inspect|validate|lint)\b/.test(normalized)
    && (wantsJson || wantsCsv || wantsMarkdown);
  if (promptArtifact !== "script-tool" && !wantsCli && !wantsFileAudit) return null;

  const projectName = extractProjectName(prompt);
  const packageJson = {
    name: projectName,
    private: true,
    version: "0.1.0",
    type: "module",
    bin: {
      [projectName]: "./bin/cli.mjs"
    },
    scripts: {
      build: "node -e \"console.log('Tool ready')\"",
      start: "node src/index.js"
    }
  };

  const source = wantsJson
    ? [
      "import { readFileSync } from 'node:fs';",
      "",
      "function measureDepth(value) {",
      "  if (!value || typeof value !== 'object') return 0;",
      "  if (Array.isArray(value)) {",
      "    return value.length === 0 ? 1 : 1 + Math.max(...value.map((entry) => measureDepth(entry)));",
      "  }",
      "  const children = Object.values(value);",
      "  return children.length === 0 ? 1 : 1 + Math.max(...children.map((entry) => measureDepth(entry)));",
      "}",
      "",
      "const target = process.argv[2];",
      "if (!target) {",
      "  console.error('Usage: json-audit-cli <json-file>');",
      "  process.exit(1);",
      "}",
      "",
      "const raw = readFileSync(target, 'utf8');",
      "const parsed = JSON.parse(raw);",
      "const topLevelKeys = parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? Object.keys(parsed) : [];",
      "const missingFields = ['id', 'name', 'status'].filter((field) => !(parsed && typeof parsed === 'object' && field in parsed));",
      "console.log([",
      "  `top-level keys: ${topLevelKeys.length}`,",
      "  `nested depth: ${measureDepth(parsed)}`,",
      "  `missing fields: ${missingFields.length > 0 ? missingFields.join(', ') : 'none'}`",
      "].join('\\n'));"
    ].join("\n")
    : wantsCsv
      ? [
        "import { readFileSync } from 'node:fs';",
        "",
        "const target = process.argv[2];",
        "if (!target) {",
        "  console.error('Usage: csv-report-cli <csv-file>');",
        "  process.exit(1);",
        "}",
        "",
        "const raw = readFileSync(target, 'utf8').trim();",
        "const rows = raw.split(/\\r?\\n/).filter(Boolean);",
        "const headers = (rows[0] ?? '').split(',').map((value) => value.trim()).filter(Boolean);",
        "const dataRows = rows.slice(1);",
        "console.log([",
        "  `rows: ${dataRows.length}`,",
        "  `columns: ${headers.length}`,",
        "  `headers: ${headers.join(', ') || 'none'}`",
        "].join('\\n'));"
      ].join("\n")
      : [
        "import { readFileSync } from 'node:fs';",
        "",
        "const target = process.argv[2];",
        "if (!target) {",
        "  console.error('Usage: markdown-summary-cli <markdown-file>');",
        "  process.exit(1);",
        "}",
        "",
        "const raw = readFileSync(target, 'utf8');",
        "const headings = raw.match(/^#{1,6}\\s+.+$/gm) ?? [];",
        "console.log([",
        "  `sections: ${headings.length}`,",
        "  ...headings.slice(0, 5).map((heading) => `- ${heading.replace(/^#+\\s*/, '')}`)",
        "].join('\\n'));"
      ].join("\n");

  return {
    summary: `Created a heuristic ${projectName} CLI for ${wantsJson ? "JSON audit" : wantsCsv ? "CSV summary" : wantsMarkdown ? "markdown summary" : "file summary"} workflows.`,
    edits: [
      {
        path: resolveWorkspacePath(workingDirectory, "package.json"),
        content: `${JSON.stringify(packageJson, null, 2)}\n`
      },
      {
        path: resolveWorkspacePath(workingDirectory, "src/index.js"),
        content: `${source}\n`
      },
      {
        path: resolveWorkspacePath(workingDirectory, "bin/cli.mjs"),
        content: "#!/usr/bin/env node\nimport '../src/index.js'\n"
      },
      {
        path: resolveWorkspacePath(workingDirectory, "README.md"),
        content: `# ${projectName}\n\nGenerated by Cipher Workspace as a small ${wantsJson ? "JSON audit" : wantsCsv ? "CSV summary" : "file summary"} CLI.\n`
      }
    ]
  };
}

export function buildHeuristicLibraryWorkspace(
  input: HeuristicLibraryWorkspaceInput
): HeuristicWorkspaceResult | null {
  const {
    prompt,
    workspaceKind,
    workingDirectory,
    inferArtifactTypeFromPrompt,
    extractProjectName,
    resolveWorkspacePath
  } = input;

  const normalized = (prompt ?? "").trim().toLowerCase();
  if (inferArtifactTypeFromPrompt(normalized) !== "library") return null;
  if (workspaceKind !== "generic") return null;

  const projectName = extractProjectName(prompt);
  const wantsValidation = /\b(valid|validation|validator|email|required|min[- ]?length|string guard)\b/.test(normalized);
  const wantsFormatting = /\b(format|formatting|money|currency|percent|percentage|compact counts?|compact numbers?|delta)\b/.test(normalized);
  if (!wantsValidation && !wantsFormatting) return null;

  const packageJson = {
    name: projectName,
    private: true,
    version: "0.1.0",
    type: "module",
    scripts: {
      build: "node -e \"import('./src/index.js').then(() => console.log('Package ready'))\""
    }
  };

  const source = wantsValidation
    ? [
      "const EMAIL_PATTERN = /^[^\\s@]+@[^\\s@]+\\.[^\\s@]+$/;",
      "",
      "export function isEmail(value) {",
      "  return typeof value === 'string' && EMAIL_PATTERN.test(value.trim());",
      "}",
      "",
      "export function requireString(value, label = 'Value') {",
      "  if (typeof value !== 'string' || value.trim().length === 0) {",
      "    return `${label} is required.`;",
      "  }",
      "  return null;",
      "}",
      "",
      "export function minLength(value, minimum, label = 'Value') {",
      "  if (typeof value !== 'string' || value.trim().length < minimum) {",
      "    return `${label} must be at least ${minimum} characters.`;",
      "  }",
      "  return null;",
      "}",
      "",
      "export function validateEmail(value, label = 'Email') {",
      "  if (!isEmail(value)) {",
      "    return `${label} must be a valid email address.`;",
      "  }",
      "  return null;",
      "}",
      "",
      "export function formatErrors(errors) {",
      "  return (errors ?? [])",
      "    .filter((entry) => typeof entry === 'string' && entry.trim().length > 0)",
      "    .map((entry) => `- ${entry.trim()}`)",
      "    .join('\\n');",
      "}",
      "",
      "export function validateRequiredMinEmail(value, minimum, label = 'Value') {",
      "  const issues = [",
      "    requireString(value, label),",
      "    minLength(value, minimum, label),",
      "    validateEmail(value, label)",
      "  ].filter(Boolean);",
      "  return {",
      "    ok: issues.length === 0,",
      "    errors: issues,",
      "    message: formatErrors(issues)",
      "  };",
      "}"
    ].join("\n")
    : [
      "function toNumber(value) {",
      "  const normalized = typeof value === 'string' ? Number(value) : value;",
      "  return Number.isFinite(normalized) ? Number(normalized) : 0;",
      "}",
      "",
      "export function formatMoney(value, currency = 'USD', locale = 'en-US') {",
      "  return new Intl.NumberFormat(locale, {",
      "    style: 'currency',",
      "    currency,",
      "    maximumFractionDigits: 2",
      "  }).format(toNumber(value));",
      "}",
      "",
      "export function formatPercentDelta(value, digits = 1) {",
      "  const amount = toNumber(value);",
      "  const sign = amount > 0 ? '+' : amount < 0 ? '-' : '';",
      "  return `${sign}${Math.abs(amount).toFixed(digits)}%`;",
      "}",
      "",
      "export function formatCompactCount(value, locale = 'en-US') {",
      "  return new Intl.NumberFormat(locale, {",
      "    notation: 'compact',",
      "    maximumFractionDigits: 1",
      "  }).format(toNumber(value));",
      "}",
      "",
      "export function formatDashboardMetrics(metrics, options = {}) {",
      "  return Object.entries(metrics ?? {}).reduce((acc, [key, metricValue]) => {",
      "    const normalizedKey = key.toLowerCase();",
      "    if (normalizedKey.includes('revenue') || normalizedKey.includes('amount') || normalizedKey.includes('money')) {",
      "      acc[key] = formatMoney(metricValue, options.currency, options.locale);",
      "      return acc;",
      "    }",
      "    if (normalizedKey.includes('delta') || normalizedKey.includes('change') || normalizedKey.includes('percent')) {",
      "      acc[key] = formatPercentDelta(metricValue, options.percentDigits);",
      "      return acc;",
      "    }",
      "    acc[key] = formatCompactCount(metricValue, options.locale);",
      "    return acc;",
      "  }, {});",
      "}"
    ].join("\n");

  return {
    summary: `Created a heuristic ${projectName} ${wantsValidation ? "validation" : "formatting"} library with reusable helpers.`,
    edits: [
      {
        path: resolveWorkspacePath(workingDirectory, "package.json"),
        content: `${JSON.stringify(packageJson, null, 2)}\n`
      },
      {
        path: resolveWorkspacePath(workingDirectory, "src/index.js"),
        content: `${source}\n`
      },
      {
        path: resolveWorkspacePath(workingDirectory, "README.md"),
        content: `# ${projectName}\n\nReusable ${wantsValidation ? "validation" : "formatting"} helpers generated by Cipher Workspace.\n`
      }
    ]
  };
}
