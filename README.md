# Cipher AI

Cipher AI is an Electron desktop workspace for AI chat, coding assistance, model comparison, and prompt workflows.
Cipher AI is a free, no-subscription desktop AI workspace for OpenRouter and Ollama with privacy-first defaults.

Version: `1.0.0`

## Features

- Free forever, no subscription
- No telemetry, privacy-first desktop experience
- OpenRouter and Ollama model support
- Ollama-only mode (no OpenRouter API key required)
- Multi-chat workspace with rename and export
- Router and compare mode workflows
- Prompt templates and system prompt controls
- File and folder attachments with smart bundling
- Fast model switching for quick iteration
- Markdown rendering with code block copy/run actions
- Voice-to-text support will be available in an upcoming feature update.
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

Cipher AI does not bundle any API key. On first launch, open `Settings`, paste your own OpenRouter key, and click `Save Settings`.

## Ollama-Only Mode (No API Key)

You can use Cipher AI without an OpenRouter key if you want local-only chat with Ollama:

1. In `Settings`, enable `Use Ollama`.
2. Set `Ollama Base URL` (default: `http://localhost:11434/v1`).
3. Click `Refresh` under `Ollama Models`.
4. Select an `ollama/...` model in the top model picker.
5. Click `Save Settings`.

Note:
- `Test OpenRouter` and voice transcription still use OpenRouter.
- `Summarize` and auto-title work in Ollama-only mode as well.

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

