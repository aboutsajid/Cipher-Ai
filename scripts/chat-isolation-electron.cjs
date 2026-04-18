const { app, BrowserWindow } = require("electron");
const { mkdtemp, mkdir, rm, writeFile } = require("node:fs/promises");
const { tmpdir } = require("node:os");
const { join } = require("node:path");

function delay(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function waitForWindow(timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    const win = BrowserWindow.getAllWindows().find((candidate) => !candidate.isDestroyed());
    if (win) return win;
    await delay(100);
  }
  throw new Error("Timed out waiting for the Cipher Workspace window.");
}

async function waitForPageReady(windowRef, timeoutMs = 20000) {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    if (!windowRef.webContents.isLoading()) {
      const ready = await windowRef.webContents.executeJavaScript(`
        (() => Boolean(
          window.api
          && document.getElementById("chat-title-display")
          && document.getElementById("model-select")
          && document.getElementById("send-btn")
        ))();
      `, true);
      if (ready) return;
    }
    await delay(100);
  }
  throw new Error("Timed out waiting for the renderer to finish initializing.");
}

async function writeSmokeArtifact(root, filename, payload) {
  await mkdir(join(root, "tmp"), { recursive: true });
  await writeFile(join(root, "tmp", filename), payload, "utf8");
}

(async () => {
  const root = join(__dirname, "..");
  const tempRoot = await mkdtemp(join(tmpdir(), "cipher-chat-isolation-"));
  const userDataPath = join(tempRoot, "userData");
  const workspacePath = join(tempRoot, "workspace");
  let finalized = false;

  process.env.CIPHER_WORKSPACE_ROOT = workspacePath;
  process.env.CIPHER_USER_DATA_PATH = userDataPath;
  process.env.CIPHER_DISABLE_SINGLE_INSTANCE = "1";

  try {
    await writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "starting" }, null, 2));
    await app.whenReady();
    await writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "app-ready" }, null, 2));
    require(join(root, "dist", "main", "main.js"));
    await writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "main-required" }, null, 2));

    const windowRef = await waitForWindow();
    windowRef.once("closed", () => {
      if (!finalized) {
        void writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "window-closed" }, null, 2));
      }
    });
    windowRef.webContents.on("render-process-gone", (_event, details) => {
      void writeSmokeArtifact(root, "chat-isolation-error.txt", `render-process-gone: ${JSON.stringify(details)}\n`);
    });
    windowRef.webContents.on("destroyed", () => {
      if (!finalized) {
        void writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "webcontents-destroyed" }, null, 2));
      }
    });
    await writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "window-ready" }, null, 2));
    await waitForPageReady(windowRef);
    await writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "page-ready" }, null, 2));
    await writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "scenario-starting" }, null, 2));

    const result = await windowRef.webContents.executeJavaScript(`
      (async () => {
        const OPENROUTER_MODEL = "openai/gpt-4.1-mini";
        const NVIDIA_MODEL = "meta/llama-3.1-70b-instruct";
        const OLLAMA_MODEL = "ollama/qwen2.5-coder:14b";
        const CLAUDE_MODEL = "claude/minimax-m2.5:cloud";
        const unique = Date.now();

        const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));
        const text = (selector) => (document.querySelector(selector)?.textContent ?? "").trim();
        const requireElement = (selector) => {
          const element = document.querySelector(selector);
          if (!element) throw new Error("Missing required element: " + selector);
          return element;
        };
        const assert = (condition, message) => {
          if (!condition) throw new Error(message);
        };
        const waitFor = async (predicate, timeoutMs, message) => {
          const started = Date.now();
          while (Date.now() - started < timeoutMs) {
            if (await predicate()) return;
            await wait(100);
          }
          throw new Error(message);
        };
        const dispatchInput = (selector, value) => {
          const input = requireElement(selector);
          input.value = value;
          input.dispatchEvent(new Event("input", { bubbles: true }));
          input.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const dispatchSelect = (selector, value) => {
          const select = requireElement(selector);
          select.value = value;
          select.dispatchEvent(new Event("input", { bubbles: true }));
          select.dispatchEvent(new Event("change", { bubbles: true }));
        };
        const click = (selector) => {
          requireElement(selector).click();
        };
        const makeMessage = (role, content, model) => ({
          id: "msg-" + Math.random().toString(36).slice(2),
          role,
          content,
          createdAt: new Date().toISOString(),
          ...(model ? { model } : {})
        });
        const listChats = () => window.api.chat.list();
        const getNewestChat = async () => {
          const chats = await listChats();
          const newest = chats[0];
          if (!newest) throw new Error("Expected at least one persisted chat.");
          const chat = await window.api.chat.get(newest.id);
          if (!chat) throw new Error("Newest chat could not be loaded.");
          return chat;
        };
        const waitForIdle = async () => {
          await waitFor(() => {
            const sendBtn = requireElement("#send-btn");
            const stopBtn = requireElement("#stop-btn");
            return !sendBtn.hasAttribute("disabled") && getComputedStyle(stopBtn).display === "none";
          }, 10000, "Timed out waiting for the composer to become idle again.");
        };
        const clickChatByTitle = async (title) => {
          await waitFor(
            () => Array.from(document.querySelectorAll(".chat-item")).some((item) => (item.textContent ?? "").includes(title)),
            8000,
            "Chat item not rendered: " + title
          );
          const item = Array.from(document.querySelectorAll(".chat-item")).find((candidate) => (candidate.textContent ?? "").includes(title));
          if (!(item instanceof HTMLElement)) throw new Error("Chat item missing after render: " + title);
          item.click();
          await waitFor(() => text("#chat-title-display") === title, 8000, "Timed out loading chat: " + title);
          await wait(150);
        };
        const seedChat = async (title, context, messages) => {
          const chat = await window.api.chat.create(context);
          for (const message of messages) {
            await window.api.chat.appendMessage(chat.id, message);
          }
          await window.api.chat.rename(chat.id, title);
          return chat.id;
        };

        await window.api.settings.save({
          apiKey: "test-key",
          baseUrl: "http://127.0.0.1:9/v1",
          cloudProvider: "openrouter",
          defaultModel: OPENROUTER_MODEL,
          routerPort: 3456,
          models: [OPENROUTER_MODEL, NVIDIA_MODEL],
          customTemplates: [],
          ollamaEnabled: false,
          ollamaBaseUrl: "http://127.0.0.1:9/v1",
          ollamaModels: ["qwen2.5-coder:14b"],
          localVoiceEnabled: false,
          localVoiceModel: "base",
          mcpServers: [],
          routing: {
            default: OPENROUTER_MODEL,
            think: OPENROUTER_MODEL,
            longContext: OPENROUTER_MODEL
          }
        });

        await waitFor(() => {
          const modelSelect = requireElement("#model-select");
          return modelSelect.options.length >= 2;
        }, 8000, "Model select did not populate after saving settings.");

        const openrouterTitle = "OpenRouter Seed " + unique;
        const claudeTitle = "Claude Seed " + unique;

        await seedChat(openrouterTitle, {
          provider: "openrouter",
          selectedModel: OPENROUTER_MODEL
        }, [
          makeMessage("user", "OpenRouter context seed."),
          makeMessage("assistant", "OpenRouter reply seed.", OPENROUTER_MODEL)
        ]);

        await seedChat(claudeTitle, {
          provider: "claude",
          selectedModel: CLAUDE_MODEL
        }, [
          makeMessage("user", "Claude context seed."),
          makeMessage("assistant", "Claude reply seed.", CLAUDE_MODEL)
        ]);

        await clickChatByTitle(openrouterTitle);
        assert(requireElement("#chat-provider-openrouter-btn").classList.contains("active"), "OpenRouter chat did not restore the OpenRouter provider.");
        assert(requireElement("#model-select").value === OPENROUTER_MODEL, "OpenRouter chat did not restore the expected model.");

        const countBeforeNvidiaDraft = (await listChats()).length;
        click("#chat-provider-nvidia-btn");
        await waitFor(
          () => text("#chat-title-display") === "" && requireElement("#chat-provider-nvidia-btn").classList.contains("active"),
          8000,
          "Switching to NVIDIA did not open a fresh draft chat."
        );
        assert((await listChats()).length === countBeforeNvidiaDraft, "Switching to NVIDIA created a persisted chat before send.");
        dispatchSelect("#model-select", NVIDIA_MODEL);
        await window.api.settings.save({ cloudProvider: "nvidia", baseUrl: "http://127.0.0.1:9/v1" });
        await wait(150);
        dispatchInput("#composer-input", "NVIDIA isolation verification");
        click("#send-btn");
        await waitFor(
          async () => (await listChats()).length === countBeforeNvidiaDraft + 1,
          8000,
          "Sending from the NVIDIA draft did not create a new persisted chat."
        );
        await waitForIdle();
        const nvidiaChat = await getNewestChat();
        assert(nvidiaChat.context?.provider === "nvidia", "New persisted chat after NVIDIA send did not retain NVIDIA provider context.");
        assert(nvidiaChat.context?.selectedModel === NVIDIA_MODEL, "New persisted chat after NVIDIA send did not retain the NVIDIA-selected model.");

        const nvidiaTitle = "NVIDIA Persisted " + unique;
        await window.api.chat.rename(nvidiaChat.id, nvidiaTitle);
        await clickChatByTitle(nvidiaTitle);

        const countBeforeOllamaDraft = (await listChats()).length;
        click("#chat-provider-ollama-btn");
        await waitFor(
          () => text("#chat-title-display") === "" && requireElement("#chat-provider-ollama-btn").classList.contains("active"),
          8000,
          "Switching to Ollama did not open a fresh draft chat."
        );
        assert((await listChats()).length === countBeforeOllamaDraft, "Switching to Ollama created a persisted chat before send.");
        dispatchSelect("#model-select", OLLAMA_MODEL);
        dispatchInput("#composer-input", "Ollama isolation verification");
        click("#send-btn");
        await waitFor(
          async () => (await listChats()).length === countBeforeOllamaDraft + 1,
          8000,
          "Sending from the Ollama draft did not create a new persisted chat."
        );
        await waitForIdle();
        const ollamaChat = await getNewestChat();
        assert(ollamaChat.context?.provider === "ollama", "New persisted chat after Ollama send did not retain Ollama provider context.");
        assert(ollamaChat.context?.selectedModel === OLLAMA_MODEL, "New persisted chat after Ollama send did not retain the Ollama-selected model.");

        await clickChatByTitle(claudeTitle);
        assert(requireElement("#quick-claude-btn").classList.contains("active"), "Claude chat did not restore Claude mode.");

        const countBeforeOpenRouterFromClaude = (await listChats()).length;
        click("#chat-provider-openrouter-btn");
        await waitFor(
          () => text("#chat-title-display") === "" && requireElement("#chat-provider-openrouter-btn").classList.contains("active"),
          8000,
          "Switching away from Claude did not open a fresh draft chat."
        );
        assert(!requireElement("#quick-claude-btn").classList.contains("active"), "Claude quick button stayed active after switching away from Claude.");
        assert((await listChats()).length === countBeforeOpenRouterFromClaude, "Switching away from Claude created a persisted chat before send.");
        dispatchSelect("#model-select", OPENROUTER_MODEL);
        await window.api.settings.save({ cloudProvider: "openrouter", baseUrl: "http://127.0.0.1:9/v1" });
        await wait(150);
        dispatchInput("#composer-input", "OpenRouter from Claude isolation verification");
        click("#send-btn");
        await waitFor(
          async () => (await listChats()).length === countBeforeOpenRouterFromClaude + 1,
          8000,
          "Sending after leaving Claude did not create a new persisted chat."
        );
        await waitForIdle();
        const openrouterChat = await getNewestChat();
        assert(openrouterChat.context?.provider === "openrouter", "New persisted chat after leaving Claude did not retain OpenRouter provider context.");
        assert(openrouterChat.context?.selectedModel === OPENROUTER_MODEL, "New persisted chat after leaving Claude did not retain the OpenRouter-selected model.");

        return {
          ok: true,
          openrouterTitle,
          claudeTitle,
          nvidiaChatId: nvidiaChat.id,
          ollamaChatId: ollamaChat.id,
          openrouterChatId: openrouterChat.id,
          finalChatCount: (await listChats()).length
        };
      })();
    `, true);

    const serialized = `${JSON.stringify(result)}\n`;
    finalized = true;
    await writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "completed", result }, null, 2));
    process.stdout.write(serialized);
  } finally {
    for (const windowRef of BrowserWindow.getAllWindows()) {
      if (!windowRef.isDestroyed()) windowRef.destroy();
    }
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    app.quit();
  }
})().catch(async (error) => {
  const root = join(__dirname, "..");
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await writeSmokeArtifact(root, "chat-isolation-error.txt", `${message}\n`).catch(() => {});
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
});
