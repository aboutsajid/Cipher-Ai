# Cipher AI

Cipher AI is an Electron desktop workspace for AI chat, coding assistance, model comparison, and prompt workflows.

Version: `1.0.0`

## Features

- Multi-chat interface with export and rename
- OpenRouter and Ollama model support
- Prompt templates and system prompt controls
- File and folder attachments with smart bundling
- Markdown rendering with code block copy/run actions
- Voice-to-text input support (when available)
- Router diagnostics and MCP server controls

## Requirements

- Node.js 22 LTS
- npm 10+
- Windows 10/11, macOS 12+, or modern Linux distro

## Quick Start

```bash
git clone <your-repo-url> cipher-chat
cd cipher-chat
npm install
npm run build
```

Run the app:

- Windows PowerShell:

```powershell
npm.cmd run start
```

- macOS/Linux:

```bash
npm run start
```

## OpenRouter API Key

Cipher AI does not bundle any API key. On first launch, open `Settings`, paste your own OpenRouter key (`sk-or-v1-...`), and click `Save Settings`.

## Ollama-Only Mode (No API Key)

You can use Cipher AI without an OpenRouter key if you want local-only chat with Ollama:

1. In `Settings`, enable `Use Ollama`.
2. Set `Ollama Base URL` (default: `http://localhost:11434/v1`).
3. Click `Refresh` under `Ollama Models`.
4. Select an `ollama/...` model in the top model picker.
5. Click `Save Settings`.

Note:
- `Summarize`, auto-title generation, voice transcription, and `Test OpenRouter` still use OpenRouter.

## Development Scripts

- `npm run build` - Compile TypeScript and copy renderer assets
- `npm run start` - Build and launch Electron
- `npm run dev` - Alias of start flow
- `npm run pack:win` - Build Windows installer (`Cipher-Ai-Setup-<version>.exe`)

## Project Structure

```text
src/main      Electron main process + IPC handlers
src/preload   Secure preload bridge
src/renderer  UI (HTML/CSS/TS)
src/shared    Shared types
docs          Product documentation
scripts       Build and launch helpers
```

## Documentation

Full usage and setup guide: `docs/CIPHER_AI_DOCUMENTATION.md`

## License

MIT - see `LICENSE`.

