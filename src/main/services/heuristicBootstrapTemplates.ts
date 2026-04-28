import type { DesktopDomainContent } from "./heuristicDesktopApiDomainContent";

export function buildGeneralReactStarterAppTemplate(projectName: string): string {
  return `import "./App.css";

const highlights = [
  { label: "Starter profile", value: "React app" },
  { label: "Surface", value: "Workspace shell" },
  { label: "Next move", value: "Add domain logic" }
];

export default function App() {
  return (
    <main className="starter-shell">
      <section className="starter-hero">
        <p className="starter-eyebrow">React starter</p>
        <h1>${projectName}</h1>
        <p className="starter-copy">
          This starter begins with a real layout, visible actions, and structured sections so the agent can extend the app without rewriting a blank scaffold.
        </p>
        <div className="starter-actions">
          <button type="button">Primary action</button>
          <a href="#details">Inspect sections</a>
        </div>
      </section>

      <section className="starter-grid">
        {highlights.map((item) => (
          <article key={item.label} className="starter-card">
            <span>{item.label}</span>
            <strong>{item.value}</strong>
          </article>
        ))}
      </section>

      <section id="details" className="starter-panel">
        <p className="starter-eyebrow">Next steps</p>
        <h2>Replace this with the product workflow</h2>
        <ul>
          <li>Preserve the current file structure and project conventions.</li>
          <li>Swap starter sections for the real app surface.</li>
          <li>Keep the primary action visible while new features are added.</li>
        </ul>
      </section>
    </main>
  );
}
`;
}

export function buildGeneralReactStarterCssTemplate(): string {
  return `.starter-shell {
  min-height: 100vh;
  padding: 32px;
  background:
    radial-gradient(circle at top right, rgba(59, 130, 246, 0.16), transparent 24%),
    linear-gradient(180deg, #f8fafc 0%, #e2e8f0 100%);
  color: #0f172a;
}

.starter-hero,
.starter-panel,
.starter-card {
  border-radius: 24px;
  border: 1px solid rgba(148, 163, 184, 0.22);
  background: rgba(255, 255, 255, 0.86);
  box-shadow: 0 22px 50px rgba(15, 23, 42, 0.08);
}

.starter-hero,
.starter-panel {
  padding: 28px;
}

.starter-eyebrow {
  margin: 0 0 10px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 12px;
  color: #2563eb;
}

.starter-hero h1,
.starter-panel h2 {
  margin: 0 0 12px;
}

.starter-copy {
  margin: 0;
  max-width: 720px;
  line-height: 1.7;
  color: #334155;
}

.starter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 22px;
}

.starter-actions button,
.starter-actions a {
  border: 0;
  border-radius: 999px;
  padding: 12px 18px;
  font: inherit;
  text-decoration: none;
}

.starter-actions button {
  background: linear-gradient(135deg, #0f172a, #2563eb);
  color: #fff;
}

.starter-actions a {
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
}

.starter-grid {
  margin-top: 20px;
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
}

.starter-card {
  padding: 20px;
  display: grid;
  gap: 8px;
}

.starter-card span {
  color: #475569;
  font-size: 0.9rem;
}

.starter-card strong {
  font-size: 1.1rem;
}

.starter-panel {
  margin-top: 20px;
}

.starter-panel ul {
  margin: 12px 0 0;
  padding-left: 18px;
  color: #334155;
  line-height: 1.7;
}

@media (max-width: 820px) {
  .starter-shell {
    padding: 20px;
  }

  .starter-grid {
    grid-template-columns: 1fr;
  }
}
`;
}

export function buildGeneralReactStarterIndexCssTemplate(): string {
  return `:root {
  color-scheme: light;
  font-family: "Segoe UI", "Inter", system-ui, sans-serif;
  line-height: 1.5;
  font-weight: 400;
  color: #0f172a;
  background: #f8fafc;
  font-synthesis: none;
  text-rendering: optimizeLegibility;
  -webkit-font-smoothing: antialiased;
  -moz-osx-font-smoothing: grayscale;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
}

body {
  min-width: 320px;
}

button,
input,
select,
textarea {
  font: inherit;
}
`;
}

export function buildStaticBootstrapHtmlTemplate(projectName: string, starterProfile = "static-marketing"): string {
  if (starterProfile === "static-marketing") {
    return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="marketing-shell">
      <section class="hero">
        <p class="eyebrow">Starter app</p>
        <h1>${projectName}</h1>
        <p class="lede">A stronger starter app with a hero section, feature grid, proof strip, and CTA so the agent begins from a real landing page shape.</p>
        <div class="hero-actions">
          <button id="cta" type="button">Start trial</button>
          <a href="#features">See features</a>
        </div>
      </section>

      <section class="proof-strip" aria-label="Proof points">
        <span>Teams onboarded in 2 days</span>
        <span>Operational visibility in one workspace</span>
        <span>Built for lean software teams</span>
      </section>

      <section id="features" class="feature-grid">
        <article>
          <h2>Focused workflow</h2>
          <p>Start with a clear content hierarchy instead of a blank shell.</p>
        </article>
        <article>
          <h2>Fast iteration</h2>
          <p>Keep sections and styling easy for the agent to extend in later passes.</p>
        </article>
        <article>
          <h2>Conversion-ready</h2>
          <p>Primary CTA, proof points, and product value cues are already present.</p>
        </article>
      </section>

      <section class="cta-panel">
        <div>
          <p class="eyebrow">Ready to ship</p>
          <h2>Turn this into a full product page</h2>
        </div>
        <p id="status" class="status">Starter ready for feature-specific copy and branding.</p>
      </section>
    </main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`;
  }

  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
    <link rel="stylesheet" href="./styles.css" />
  </head>
  <body>
    <main class="shell">
      <p class="eyebrow">Starter app</p>
      <h1>${projectName}</h1>
      <p class="lede">This starter app was bootstrapped in a safe sandbox folder. Continue iterating from the Agent Runner.</p>
      <button id="cta" type="button">Test interaction</button>
      <p id="status" class="status">Ready.</p>
    </main>
    <script type="module" src="./app.js"></script>
  </body>
</html>
`;
}

export function buildDesktopBootstrapAppTsxTemplate(title: string, content: DesktopDomainContent): string {
  return `const activity = ${JSON.stringify(content.activity, null, 2)};

const shortcuts = ${JSON.stringify(content.shortcuts, null, 2)};

export default function App() {
  return (
    <main className="desktop-starter-shell">
      <section className="desktop-starter-hero">
        <div>
          <p className="desktop-starter-kicker">${content.kicker}</p>
          <h1>${title}</h1>
          <p className="desktop-starter-copy">
            ${content.copy}
          </p>
        </div>
        <div className="desktop-starter-card">
          <span>Current mode</span>
          <strong>${content.modeValue}</strong>
          <p>${content.modeCopy}</p>
        </div>
      </section>

      <section className="desktop-starter-grid">
        <article className="desktop-starter-panel">
          <h2>${content.checklistTitle}</h2>
          <ul>
            ${content.checklistItems.map((item) => `<li>${item}</li>`).join("\n            ")}
          </ul>
        </article>
        <article className="desktop-starter-panel">
          <h2>${content.actionTitle}</h2>
          <div className="desktop-starter-actions">
            {shortcuts.map((shortcut) => (
              <button key={shortcut} type="button">{shortcut}</button>
            ))}
          </div>
        </article>
      </section>

      <section className="desktop-starter-panel">
        <h2>${content.activityTitle}</h2>
        <div className="desktop-starter-activity">
          {activity.map((item) => (
            <article key={item.label}>
              <strong>{item.label}</strong>
              <p>{item.detail}</p>
            </article>
          ))}
        </div>
      </section>
    </main>
  );
}
`;
}

export function buildDesktopBootstrapAppCssTemplate(): string {
  return `.desktop-starter-shell {
  min-height: 100vh;
  padding: 32px;
  display: grid;
  gap: 24px;
  background:
    radial-gradient(circle at top right, rgba(14, 165, 233, 0.2), transparent 28%),
    linear-gradient(180deg, #08111f 0%, #0f172a 100%);
  color: #e2e8f0;
}

.desktop-starter-hero,
.desktop-starter-grid {
  display: grid;
  gap: 20px;
}

.desktop-starter-hero {
  grid-template-columns: minmax(0, 1.7fr) minmax(280px, 0.9fr);
  align-items: stretch;
}

.desktop-starter-kicker {
  margin: 0 0 10px;
  font-size: 0.82rem;
  letter-spacing: 0.18em;
  text-transform: uppercase;
  color: #7dd3fc;
}

.desktop-starter-hero h1,
.desktop-starter-panel h2 {
  margin: 0;
}

.desktop-starter-copy,
.desktop-starter-card p,
.desktop-starter-activity p {
  color: #cbd5e1;
}

.desktop-starter-card,
.desktop-starter-panel,
.desktop-starter-activity article {
  border: 1px solid rgba(148, 163, 184, 0.18);
  border-radius: 24px;
  background: rgba(15, 23, 42, 0.72);
  box-shadow: 0 24px 60px rgba(2, 6, 23, 0.28);
}

.desktop-starter-card,
.desktop-starter-panel {
  padding: 22px;
}

.desktop-starter-card span {
  display: block;
  font-size: 0.82rem;
  color: #7dd3fc;
  margin-bottom: 8px;
}

.desktop-starter-grid {
  grid-template-columns: repeat(2, minmax(0, 1fr));
}

.desktop-starter-panel ul {
  margin: 14px 0 0;
  padding-left: 18px;
  display: grid;
  gap: 10px;
}

.desktop-starter-actions {
  display: flex;
  flex-wrap: wrap;
  gap: 12px;
  margin-top: 14px;
}

.desktop-starter-actions button {
  border: 0;
  border-radius: 999px;
  padding: 10px 16px;
  background: linear-gradient(135deg, #38bdf8, #2563eb);
  color: #eff6ff;
  font: inherit;
  cursor: pointer;
}

.desktop-starter-activity {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 16px;
  margin-top: 14px;
}

.desktop-starter-activity article {
  padding: 18px;
}

@media (max-width: 880px) {
  .desktop-starter-shell {
    padding: 20px;
  }

  .desktop-starter-hero,
  .desktop-starter-grid,
  .desktop-starter-activity {
    grid-template-columns: 1fr;
  }
}
`;
}

export function buildDesktopBootstrapIndexCssTemplate(): string {
  return `:root {
  color-scheme: dark;
  font-family: "Segoe UI", sans-serif;
  background: #08111f;
  color: #e2e8f0;
}

* {
  box-sizing: border-box;
}

html,
body,
#root {
  margin: 0;
  min-height: 100%;
}

body {
  min-height: 100vh;
}

button {
  font: inherit;
}
`;
}

export function buildGeneratedDesktopMainProcessTemplate(projectName: string): string {
  return `import { app, BrowserWindow } from 'electron'
import { dirname, join } from 'node:path'
import { fileURLToPath } from 'node:url'

const __dirname = dirname(fileURLToPath(import.meta.url))
const windowTitle = ${JSON.stringify(projectName)}

function createWindow() {
  const window = new BrowserWindow({
    width: 1280,
    height: 860,
    minWidth: 980,
    minHeight: 720,
    autoHideMenuBar: true,
    backgroundColor: '#f4f6fb',
    title: windowTitle,
    webPreferences: {
      contextIsolation: true,
      nodeIntegration: false,
      sandbox: true,
      preload: join(__dirname, 'preload.mjs'),
    },
  })

  window.removeMenu()
  window.loadFile(join(__dirname, '..', 'dist', 'index.html'))
}

app.whenReady().then(() => {
  createWindow()
  app.on('activate', () => {
    if (BrowserWindow.getAllWindows().length === 0) createWindow()
  })
})

app.on('window-all-closed', () => {
  if (process.platform !== 'darwin') app.quit()
})
`;
}

export function buildGeneratedDesktopPreloadBridgeTemplate(): string {
  return `import { contextBridge } from 'electron'

contextBridge.exposeInMainWorld('desktopRuntime', {
  platform: process.platform,
})
`;
}

export function buildGeneratedDesktopLaunchScriptTemplate(): string {
  return [
    "import { spawn } from 'node:child_process';",
    "import { readFileSync } from 'node:fs';",
    "import { createServer } from 'node:net';",
    "import { dirname, join } from 'node:path';",
    "import { fileURLToPath } from 'node:url';",
    "",
    "const rootDir = dirname(dirname(fileURLToPath(import.meta.url)));",
    "const workspaceRoot = dirname(dirname(rootDir));",
    "const viteScript = join(rootDir, 'node_modules', 'vite', 'bin', 'vite.js');",
    "const desktopShellScript = join(workspaceRoot, 'scripts', 'generated-desktop-shell.mjs');",
    "const packageJsonPath = join(rootDir, 'package.json');",
    "",
    "function formatTitle(rawValue, fallback = 'Generated Desktop App') {",
    "  const normalized = String(rawValue ?? '')",
    "    .trim()",
    "    .replace(/\\.[^.]+$/, '')",
    "    .replace(/[_-]+/g, ' ')",
    "    .replace(/\\s+/g, ' ');",
    "  if (!normalized) return fallback;",
    "  const parts = normalized.split(' ').filter(Boolean);",
    "  if (parts.length === 0) return fallback;",
    "  return parts.map((part) => part.charAt(0).toUpperCase() + part.slice(1)).join(' ');",
    "}",
    "",
    "function resolveAppTitle() {",
    "  try {",
    "    const manifest = JSON.parse(readFileSync(packageJsonPath, 'utf8'));",
    "    if (typeof manifest.name === 'string' && manifest.name.trim()) {",
    "      return formatTitle(manifest.name.trim());",
    "    }",
    "  } catch {",
    "    // Fall back to the directory name when package metadata is unavailable.",
    "  }",
    "  return formatTitle(rootDir.split(/[/\\\\]/).filter(Boolean).pop() ?? 'Generated Desktop App');",
    "}",
    "",
    "const appTitle = resolveAppTitle();",
    "",
    "function findFreePort() {",
    "  return new Promise((resolve, reject) => {",
    "    const server = createServer();",
    "    server.unref();",
    "    server.on('error', reject);",
    "    server.listen(0, '127.0.0.1', () => {",
    "      const address = server.address();",
    "      if (!address || typeof address === 'string') {",
    "        server.close(() => reject(new Error('Unable to resolve a free localhost port.')));",
    "        return;",
    "      }",
    "      const port = address.port;",
    "      server.close((error) => {",
    "        if (error) reject(error);",
    "        else resolve(port);",
    "      });",
    "    });",
    "  });",
    "}",
    "",
    "let rendererReady = false;",
    "let shuttingDown = false;",
    "let desktopProcess = null;",
    "let renderer = null;",
    "",
    "function shutdown(exitCode = 0) {",
    "  if (shuttingDown) return;",
    "  shuttingDown = true;",
    "  if (desktopProcess && !desktopProcess.killed) {",
    "    desktopProcess.kill();",
    "  }",
    "  if (renderer && !renderer.killed) {",
    "    renderer.kill();",
    "  }",
    "  setTimeout(() => process.exit(exitCode), 50);",
    "}",
    "",
    "function handleRendererOutput(chunk, forward) {",
    "  const text = chunk.toString();",
    "  forward.write(text);",
    "  if (!rendererReady && /(?:local:\\s*http:\\/\\/127\\.0\\.0\\.1:\\d+|ready in)/i.test(text)) {",
    "    rendererReady = true;",
    "    desktopProcess = spawn(process.execPath, [desktopShellScript, '--url', desktopUrl, '--title', appTitle], {",
    "      cwd: workspaceRoot,",
    "      stdio: 'inherit',",
    "    });",
    "    desktopProcess.once('exit', (code) => shutdown(code ?? 0));",
    "    desktopProcess.once('error', (error) => {",
    "      console.error(error);",
    "      shutdown(1);",
    "    });",
    "  }",
    "}",
    "",
    "let desktopUrl = '';",
    "",
    "const port = await findFreePort();",
    "desktopUrl = `http://127.0.0.1:${port}`;",
    "renderer = spawn(process.execPath, [viteScript, '--host', '127.0.0.1', '--port', String(port), '--strictPort'], {",
    "  cwd: rootDir,",
    "  stdio: ['ignore', 'pipe', 'pipe'],",
    "});",
    "",
    "renderer.stdout.on('data', (chunk) => handleRendererOutput(chunk, process.stdout));",
    "renderer.stderr.on('data', (chunk) => handleRendererOutput(chunk, process.stderr));",
    "renderer.once('exit', (code) => {",
    "  if (!shuttingDown && !rendererReady) {",
    "    process.exit(code ?? 1);",
    "  }",
    "});",
    "renderer.once('error', (error) => {",
    "  console.error(error);",
    "  shutdown(1);",
    "});",
    "",
    "for (const signal of ['SIGINT', 'SIGTERM']) {",
    "  process.on(signal, () => shutdown(0));",
    "}",
    ""
  ].join("\n");
}

export function buildGeneratedReactViteConfigTemplate(): string {
  return "import { defineConfig } from 'vite'\nimport react from '@vitejs/plugin-react'\n\nexport default defineConfig({\n  plugins: [react()],\n})\n";
}

export function buildGeneratedReactEslintConfigTemplate(): string {
  return "import js from '@eslint/js'\nimport globals from 'globals'\nimport reactHooks from 'eslint-plugin-react-hooks'\nimport reactRefresh from 'eslint-plugin-react-refresh'\nimport tseslint from 'typescript-eslint'\nimport { defineConfig, globalIgnores } from 'eslint/config'\n\nexport default defineConfig([\n  globalIgnores(['dist']),\n  {\n    files: ['**/*.{ts,tsx}'],\n    extends: [\n      js.configs.recommended,\n      tseslint.configs.recommended,\n      reactHooks.configs.flat.recommended,\n      reactRefresh.configs.vite,\n    ],\n    languageOptions: {\n      ecmaVersion: 2020,\n      globals: globals.browser,\n    },\n  },\n])\n";
}

export function buildGeneratedReactTsconfigTemplate(): string {
  return "{\n  \"files\": [],\n  \"references\": [\n    { \"path\": \"./tsconfig.app.json\" },\n    { \"path\": \"./tsconfig.node.json\" }\n  ]\n}\n";
}

export function buildGeneratedReactTsconfigAppTemplate(): string {
  return "{\n  \"compilerOptions\": {\n    \"tsBuildInfoFile\": \"./node_modules/.tmp/tsconfig.app.tsbuildinfo\",\n    \"target\": \"ES2023\",\n    \"useDefineForClassFields\": true,\n    \"lib\": [\"ES2023\", \"DOM\", \"DOM.Iterable\"],\n    \"module\": \"ESNext\",\n    \"types\": [\"vite/client\"],\n    \"skipLibCheck\": true,\n    \"moduleResolution\": \"bundler\",\n    \"allowImportingTsExtensions\": true,\n    \"verbatimModuleSyntax\": true,\n    \"moduleDetection\": \"force\",\n    \"noEmit\": true,\n    \"jsx\": \"react-jsx\",\n    \"strict\": true,\n    \"noUnusedLocals\": true,\n    \"noUnusedParameters\": true,\n    \"erasableSyntaxOnly\": true,\n    \"noFallthroughCasesInSwitch\": true,\n    \"noUncheckedSideEffectImports\": true\n  },\n  \"include\": [\"src\"]\n}\n";
}

export function buildGeneratedReactTsconfigNodeTemplate(): string {
  return "{\n  \"compilerOptions\": {\n    \"tsBuildInfoFile\": \"./node_modules/.tmp/tsconfig.node.tsbuildinfo\",\n    \"target\": \"ES2023\",\n    \"lib\": [\"ES2023\"],\n    \"module\": \"ESNext\",\n    \"types\": [\"node\"],\n    \"skipLibCheck\": true,\n    \"moduleResolution\": \"bundler\",\n    \"allowImportingTsExtensions\": true,\n    \"verbatimModuleSyntax\": true,\n    \"moduleDetection\": \"force\",\n    \"noEmit\": true,\n    \"strict\": true,\n    \"noUnusedLocals\": true,\n    \"noUnusedParameters\": true,\n    \"erasableSyntaxOnly\": true,\n    \"noFallthroughCasesInSwitch\": true,\n    \"noUncheckedSideEffectImports\": true\n  },\n  \"include\": [\"vite.config.ts\"]\n}\n";
}

export function buildGeneratedReactMainTsxTemplate(): string {
  return "import { StrictMode } from 'react'\nimport { createRoot } from 'react-dom/client'\nimport './index.css'\nimport App from './App.tsx'\n\ncreateRoot(document.getElementById('root')!).render(\n  <StrictMode>\n    <App />\n  </StrictMode>,\n)\n";
}

export interface GeneratedScaffoldFile {
  path: string;
  content: string;
}

export function buildGeneratedReactScaffoldFiles(projectName: string): GeneratedScaffoldFile[] {
  return [
    { path: "vite.config.ts", content: buildGeneratedReactViteConfigTemplate() },
    { path: "eslint.config.js", content: buildGeneratedReactEslintConfigTemplate() },
    { path: "tsconfig.json", content: buildGeneratedReactTsconfigTemplate() },
    { path: "tsconfig.app.json", content: buildGeneratedReactTsconfigAppTemplate() },
    { path: "tsconfig.node.json", content: buildGeneratedReactTsconfigNodeTemplate() },
    { path: "src/main.tsx", content: buildGeneratedReactMainTsxTemplate() },
    { path: "index.html", content: buildReactBootstrapHtmlTemplate(projectName) }
  ];
}

export function buildGeneratedDesktopScaffoldFiles(projectName: string): GeneratedScaffoldFile[] {
  return [
    { path: "scripts/desktop-launch.mjs", content: buildGeneratedDesktopLaunchScriptTemplate() },
    { path: "electron/main.mjs", content: buildGeneratedDesktopMainProcessTemplate(projectName) },
    { path: "electron/preload.mjs", content: buildGeneratedDesktopPreloadBridgeTemplate() }
  ];
}

export function buildStaticBootstrapCssTemplate(starterProfile = "static-marketing"): string {
  if (starterProfile === "static-marketing") {
    return `:root {
  color-scheme: light;
  font-family: "Segoe UI", sans-serif;
  background: linear-gradient(180deg, #f8fafc 0%, #dbeafe 100%);
  color: #0f172a;
}

body {
  margin: 0;
  min-height: 100vh;
  background:
    radial-gradient(circle at top right, rgba(56, 189, 248, 0.28), transparent 28%),
    linear-gradient(180deg, #f8fafc 0%, #dbeafe 100%);
}

.marketing-shell {
  width: min(1120px, calc(100% - 48px));
  margin: 0 auto;
  padding: 48px 0 72px;
  display: grid;
  gap: 24px;
}

.hero,
.feature-grid article,
.cta-panel,
.proof-strip {
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.86);
  border: 1px solid rgba(148, 163, 184, 0.2);
  box-shadow: 0 24px 60px rgba(15, 23, 42, 0.08);
}

.hero {
  padding: 48px;
}

.eyebrow {
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.18em;
  font-size: 12px;
  color: #0ea5e9;
}

.hero h1,
.cta-panel h2,
.feature-grid h2 {
  margin: 0 0 12px;
}

.hero h1 {
  font-size: clamp(2.8rem, 6vw, 4.8rem);
}

.lede,
.status,
.feature-grid p,
.cta-panel p {
  margin: 0;
  font-size: 1.05rem;
  line-height: 1.7;
  color: #334155;
}

.hero-actions {
  margin-top: 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 14px;
  align-items: center;
}

button,
.hero-actions a {
  border: 0;
  border-radius: 999px;
  padding: 14px 22px;
  font: inherit;
  text-decoration: none;
}

button {
  background: linear-gradient(135deg, #0f172a, #2563eb);
  color: #fff;
  cursor: pointer;
}

.hero-actions a {
  background: rgba(37, 99, 235, 0.1);
  color: #1d4ed8;
}

.proof-strip {
  padding: 18px 24px;
  display: flex;
  flex-wrap: wrap;
  gap: 12px 24px;
  justify-content: space-between;
  color: #1e3a8a;
  font-weight: 600;
}

.feature-grid {
  display: grid;
  grid-template-columns: repeat(3, minmax(0, 1fr));
  gap: 18px;
}

.feature-grid article {
  padding: 24px;
}

.cta-panel {
  padding: 32px 36px;
  display: grid;
  gap: 10px;
}

@media (max-width: 820px) {
  .marketing-shell {
    width: min(100% - 28px, 1120px);
    padding-top: 24px;
  }

  .hero,
  .cta-panel {
    padding: 28px;
  }

  .feature-grid {
    grid-template-columns: 1fr;
  }
}
`;
  }

  return `:root {
  color-scheme: light;
  font-family: "Segoe UI", sans-serif;
  background: linear-gradient(180deg, #f6f7fb 0%, #e5ecff 100%);
  color: #14213d;
}

body {
  margin: 0;
  min-height: 100vh;
}

.shell {
  max-width: 720px;
  margin: 10vh auto;
  padding: 40px;
  border-radius: 28px;
  background: rgba(255, 255, 255, 0.88);
  box-shadow: 0 24px 80px rgba(20, 33, 61, 0.12);
}

.eyebrow {
  margin: 0 0 12px;
  text-transform: uppercase;
  letter-spacing: 0.2em;
  font-size: 12px;
  color: #4666d5;
}

h1 {
  margin: 0 0 12px;
  font-size: 48px;
}

.lede,
.status {
  font-size: 18px;
  line-height: 1.6;
}

button {
  margin-top: 24px;
  padding: 14px 22px;
  border: 0;
  border-radius: 999px;
  background: #14213d;
  color: #fff;
  font-size: 16px;
  cursor: pointer;
}
`;
}

export function buildStaticBootstrapJsTemplate(projectName: string, starterProfile = "static-marketing"): string {
  if (starterProfile === "static-marketing") {
    return `const statusEl = document.getElementById("status");
const buttonEl = document.getElementById("cta");

if (statusEl && buttonEl) {
  buttonEl.addEventListener("click", () => {
    statusEl.textContent = "Continue building in this workspace. ${projectName} is ready for product-specific copy, pricing, and proof blocks.";
  });
}
`;
  }

  return `const statusEl = document.getElementById("status");
const buttonEl = document.getElementById("cta");

if (statusEl && buttonEl) {
  buttonEl.addEventListener("click", () => {
    statusEl.textContent = "${projectName} is responding. Continue building in this workspace.";
  });
}
`;
}

export function buildReactBootstrapHtmlTemplate(projectName: string): string {
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1.0" />
    <title>${projectName}</title>
  </head>
  <body>
    <div id="root"></div>
    <script type="module" src="/src/main.tsx"></script>
  </body>
</html>
`;
}

export function buildGeneratedDesktopAppIdTemplate(packageName: string): string {
  const normalized = (packageName ?? "")
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, ".")
    .replace(/^\.+|\.+$/g, "");
  return `com.cipher.generated.${normalized || "desktop.app"}`;
}
