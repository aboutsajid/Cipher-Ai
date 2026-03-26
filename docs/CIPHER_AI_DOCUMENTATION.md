# Cipher AI Documentation

Cipher AI is an Electron desktop app for AI chat, coding assistance, prompt workflows, model comparison, and local tooling integrations.


## 1. Getting Started Guide (Beginner Level)

### 1.1 System Requirements

| Component | Windows | macOS | Linux |
|---|---|---|---|
| OS | Windows 10/11 (64-bit) | macOS 12+ | Ubuntu 22.04+ (or equivalent) |
| CPU | Dual-core or better | Apple Silicon or Intel | Dual-core or better |
| RAM | 8 GB minimum, 16 GB recommended | 8 GB minimum, 16 GB recommended | 8 GB minimum, 16 GB recommended |
| Disk | 2 GB free minimum | 2 GB free minimum | 2 GB free minimum |
| Node.js | v22 LTS recommended | v22 LTS recommended | v22 LTS recommended |
| Network | Required for OpenRouter cloud models; optional for Ollama-only local use | Required for OpenRouter cloud models; optional for Ollama-only local use | Required for OpenRouter cloud models; optional for Ollama-only local use |

### 1.2 Installation Instructions

### Windows

1. Install Node.js LTS from `https://nodejs.org`.
2. Install Git from `https://git-scm.com/download/win`.
3. Open PowerShell and run:

```powershell
git clone <your-repo-url> cipher-chat
cd cipher-chat
npm install
npm.cmd run start
```

4. If PowerShell blocks scripts, use `npm.cmd` (as shown above) instead of `npm`.

### macOS

1. Install Homebrew (if needed): `https://brew.sh`.
2. Install dependencies:

```bash
brew install node git
git clone <your-repo-url> cipher-chat
cd cipher-chat
npm install
npm run start
```

### Linux (Ubuntu/Debian example)

1. Install Git and Node.js:

```bash
sudo apt update
sudo apt install -y git curl
curl -fsSL https://deb.nodesource.com/setup_22.x | sudo -E bash -
sudo apt install -y nodejs
```

2. Clone and run:

```bash
git clone <your-repo-url> cipher-chat
cd cipher-chat
npm install
npm run start
```


### 1.3 First-Time Setup Walkthrough

1. Launch Cipher AI.
2. Open the right panel using the `Settings` button in the top bar.

Option A - OpenRouter:

3. In `OpenRouter API Key`, paste your key.
4. Verify `OpenRouter Base URL` is `https://openrouter.ai/api/v1`.
5. Choose an OpenRouter model like `qwen/qwen3-coder-flash`.
6. Click `Save Settings`.
7. Click `Test OpenRouter` to confirm API access.

Option B - Ollama-only (no API key):

3. Enable `Use Ollama`.
4. Verify `Ollama Base URL` (usually `http://localhost:11434/v1`).
5. Click `Refresh` in `Ollama Models`.
6. Select an `ollama/...` model from the top model picker.
7. Click `Save Settings`.
8. Start a new chat with the `+` button in the left sidebar.


### 1.4 Basic Navigation (UI Tour)

- **Sidebar (left)**: chat list, new chat button, stats button.
- **Chat Header (top center)**: chat title, rename/export/system prompt buttons, summarize/raw/settings/router/mode controls.
- **Messages Area (center)**: conversation history, code blocks, summaries.
- **Composer (bottom)**: message input, templates, file/folder attach, voice input, send.
- **Right Panel**: settings and router diagnostics/MCP controls.


### 1.5 Simple Example: Your First Chat

1. Click `+` to create a new chat.
2. Type this prompt:

```text
Write a friendly 5-line introduction about Cipher AI for beginners.
```

3. Press `Enter` to send.
4. After response arrives, optionally click `Summarize` to generate bullet-point summary.
5. Optionally click `Raw` to switch between rendered markdown and plain text view.


---

## 2. Core Features and Daily Workflows

### 2.1 Chat Controls

- `Rename`: rename current chat.
- `Export`: export chat to Markdown file.
- `System Prompt`: define custom system instructions for current chat.
- `Compare`: run two models side-by-side for the same user prompt.

### 2.2 Smart Header Actions

- `Summarize`: creates concise bullet-point summary in an overlay card.
- `Raw`: toggles all messages to plain text mode for exact output inspection.
- `Settings`: open app settings panel.
- `Router`: open diagnostics/logs and MCP controls.

### 2.3 Composer Tools

- `Templates`: quick prompt templates and save current prompt as template.
- `Attach`: attach files or full folders.
- `Voice`: speech-to-text input (button appears only if browser speech API is supported).
- `Send`: submit message.

### 2.4 File and Folder Sharing

- Single file attach supports text and common image formats.
- Folder attach now creates one bundled archive-style attachment (zip-style name) so the UI does not flood with hundreds of pills.
- Large/irrelevant directories like `node_modules`, `.git`, `dist` are skipped in folder bundling.

### 2.5 Code Assistance Features

- Code blocks include `Copy`.
- `Run` appears for `html`, `javascript`, and `js` blocks.
- HTML runs in sandboxed preview modal.
- JavaScript runs in renderer sandbox with captured `console.log` output below the block.

### 2.6 Useful Shortcuts

| Shortcut | Action |
|---|---|
| `Enter` | Send message |
| `Shift + Enter` | New line in composer |
| `Ctrl + N` | New chat |
| `Ctrl + ,` | Open settings panel |
| `Ctrl + Shift + R` | Open router panel |
| `Ctrl + Shift + C` | Append selected text into composer |
| `Esc` | Close open panel/modal/dropdown |


---

## 3. Advanced Configuration and Power User Setup

### 3.1 Model Routing Strategy

Use Settings to define:

- `Default Model` for normal chats.
- Additional available models for quick switching.
- Optional Ollama local models (`ollama/...`) for local execution.

### 3.2 OpenRouter and Ollama

- **OpenRouter**: requires API key and internet.
- **Ollama**: local model serving, base URL usually `http://localhost:11434/v1`.
- You can keep both enabled and switch models from the model selector.
- If `Use Ollama` is enabled and API key is empty, choose an `ollama/...` model to chat without OpenRouter key.
- `Summarize`, auto-title, voice transcription, and `Test OpenRouter` still require OpenRouter API access.

### 3.3 MCP Server Integration (Tooling)

Cipher AI supports MCP server registration in Router panel:

1. Add server `Name`, `Command`, and `Args` (JSON array).
2. Start/stop server from list.
3. Select available tools for prompt runs.
4. Check MCP logs directly in app.

Example args:

```json
["-y", "@modelcontextprotocol/server-filesystem", "C:/"]
```

### 3.4 Data and Storage Paths

Cipher AI stores app data under Electron user data directory in a `cipher-chat` folder.

Important files include:

- Chat history JSON
- Settings JSON
- Custom templates and model configuration

### 3.5 Session Utilities

- `Stats` dashboard shows total chats/messages/tokens/model usage.
- Chat title auto-generation runs after first assistant reply in a new chat.
- Summary overlay is separate from chat messages and can be dismissed.


---

## 4. Troubleshooting, Recovery, and FAQ

### 4.1 App Does Not Launch (`app.whenReady` error)

Cause: `ELECTRON_RUN_AS_NODE=1` is set in your shell.

Fix (PowerShell):

```powershell
Remove-Item Env:ELECTRON_RUN_AS_NODE -ErrorAction SilentlyContinue
$env:ELECTRON_RUN_AS_NODE = $null
npm.cmd run start
```

### 4.2 `npm` Blocked by PowerShell Execution Policy

Use:

```powershell
npm.cmd run build
npm.cmd run start
```

### 4.3 Voice Button Missing

Cipher AI hides mic button if speech recognition API is unavailable in your Electron runtime. This is expected behavior.

### 4.4 Summary/Title Generation Fails

Check:

1. API key is valid and saved.
2. Base URL is correct.
3. Internet access is available.
4. Chosen model is an OpenRouter model (not offline/local-only without proper backend).

### 4.5 Large Folder Attachment Feels Slow

Use practical repo roots, and avoid selecting huge monorepo roots when unnecessary. Folder bundling has limits and skips common heavy folders to stay responsive.

### 4.6 OpenRouter Test Fails

1. Open `Settings`.
2. Verify key and base URL.
3. Click `Test OpenRouter`.
4. If needed, try a different model from the model list.

If you only use Ollama local models, you can skip this test.

### 4.7 How Do I Reset Cipher AI Data?

1. Close the app.
2. Back up your data directory.
3. Remove `cipher-chat` app data folder.
4. Relaunch and reconfigure settings.

### 4.8 Quick Health Checklist

- Build succeeds: `npm run build`
- App starts without startup errors
- Settings save works
- Test OpenRouter passes (only needed when using OpenRouter)
- One chat roundtrip succeeds


---

## Appendix: Recommended First 10 Minutes

1. Start app.
2. Either add OpenRouter API key or enable Ollama local mode.
3. Save settings and test OpenRouter (skip if Ollama-only).
4. Create first chat.
5. Try `Summarize`, `Raw`, and `Compare`.
6. Attach one file.
7. Attach one folder (single bundle behavior).
8. Run one JavaScript code block.
9. Open stats dashboard.
10. Export chat as Markdown.

