const { app, BrowserWindow } = require("electron");
const { appendFile, mkdtemp, mkdir, rm, writeFile } = require("node:fs/promises");
const { createServer } = require("node:http");
const { tmpdir } = require("node:os");
const { join } = require("node:path");
const SEED_IMAGE_BASE64 = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMB/axzfo8AAAAASUVORK5CYII=";

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

async function appendSmokeTrace(root, step, detail) {
  await mkdir(join(root, "tmp"), { recursive: true });
  const payload = `${new Date().toISOString()} ${step}${detail ? ` ${detail}` : ""}\n`;
  await appendFile(join(root, "tmp", "chat-isolation-trace.log"), payload, "utf8");
  process.stdout.write(`[chat-isolation] ${step}${detail ? ` ${detail}` : ""}\n`);
}

async function createMockOllamaServer(models) {
  const server = createServer((request, response) => {
    if (request.method === "GET" && request.url === "/api/tags") {
      response.writeHead(200, { "content-type": "application/json" });
      response.end(JSON.stringify({ models: models.map((name) => ({ name })) }));
      return;
    }

    response.writeHead(404, { "content-type": "application/json" });
    response.end(JSON.stringify({ error: "not found" }));
  });

  await new Promise((resolve, reject) => {
    server.once("error", reject);
    server.listen(0, "127.0.0.1", resolve);
  });

  const address = server.address();
  if (!address || typeof address === "string") {
    throw new Error("Mock Ollama server did not expose a TCP port.");
  }

  return {
    server,
    baseUrl: `http://127.0.0.1:${address.port}/v1`
  };
}

async function closeServer(server) {
  await new Promise((resolve) => {
    server.close(() => resolve());
  });
}

async function seedImageHistory(userDataPath) {
  const root = join(userDataPath, "cipher-workspace", "generated-images");
  const assetsDir = join(root, "assets");
  await mkdir(assetsDir, { recursive: true });

  const firstAsset = "img-seed-zebra.png";
  const secondAsset = "img-seed-alpha.png";
  const bytes = Buffer.from(SEED_IMAGE_BASE64, "base64");
  await writeFile(join(assetsDir, firstAsset), bytes);
  await writeFile(join(assetsDir, secondAsset), bytes);

  const history = [
    {
      id: "img-seed-zebra",
      generationId: "imggen-seed-zebra",
      prompt: "zebra neon skyline",
      model: "sd_xl_base_1.0.safetensors",
      aspectRatio: "1:1",
      text: "seed zebra",
      mimeType: "image/png",
      assetFileName: firstAsset,
      createdAt: "2026-04-03T10:00:00.000Z",
      updatedAt: "2026-04-03T10:00:00.000Z",
      saveCount: 0
    },
    {
      id: "img-seed-alpha",
      generationId: "imggen-seed-alpha",
      prompt: "alpha beach sunrise",
      model: "sd_xl_base_1.0.safetensors",
      aspectRatio: "1:1",
      text: "seed alpha",
      mimeType: "image/png",
      assetFileName: secondAsset,
      createdAt: "2026-04-01T10:00:00.000Z",
      updatedAt: "2026-04-01T10:00:00.000Z",
      saveCount: 0
    }
  ];

  await writeFile(join(root, "history.json"), JSON.stringify({ history }, null, 2), "utf8");
}

(async () => {
  const root = join(__dirname, "..");
  const tempRoot = await mkdtemp(join(tmpdir(), "cipher-chat-isolation-"));
  const userDataPath = join(tempRoot, "userData");
  const workspacePath = join(tempRoot, "workspace");
  let mockOllama = null;
  let finalized = false;

  process.env.CIPHER_WORKSPACE_ROOT = workspacePath;
  process.env.CIPHER_USER_DATA_PATH = userDataPath;
  process.env.CIPHER_DISABLE_SINGLE_INSTANCE = "1";

  try {
    await appendSmokeTrace(root, "starting", tempRoot);
    await seedImageHistory(userDataPath);
    await appendSmokeTrace(root, "seed-image-history");
    await writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "starting" }, null, 2));
    await app.whenReady();
    await appendSmokeTrace(root, "app-ready");
    await writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "app-ready" }, null, 2));
    require(join(root, "dist", "main", "main.js"));
    await appendSmokeTrace(root, "main-required");
    await writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "main-required" }, null, 2));

    const windowRef = await waitForWindow();
    await appendSmokeTrace(root, "window-found");
    windowRef.once("closed", () => {
      if (!finalized) {
        void appendSmokeTrace(root, "window-closed");
        void writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "window-closed" }, null, 2));
      }
    });
    windowRef.webContents.on("console-message", (_event, level, message, line, sourceId) => {
      void appendSmokeTrace(root, "console-message", JSON.stringify({ level, sourceId, line, message }));
    });
    windowRef.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedURL, isMainFrame) => {
      void appendSmokeTrace(root, "did-fail-load", JSON.stringify({ errorCode, errorDescription, validatedURL, isMainFrame }));
      void writeSmokeArtifact(root, "chat-isolation-error.txt", `did-fail-load: ${JSON.stringify({ errorCode, errorDescription, validatedURL, isMainFrame })}\n`);
    });
    windowRef.webContents.on("did-finish-load", () => {
      void appendSmokeTrace(root, "did-finish-load");
    });
    windowRef.webContents.on("render-process-gone", (_event, details) => {
      void appendSmokeTrace(root, "render-process-gone", JSON.stringify(details));
      void writeSmokeArtifact(root, "chat-isolation-error.txt", `render-process-gone: ${JSON.stringify(details)}\n`);
    });
    windowRef.webContents.on("destroyed", () => {
      if (!finalized) {
        void appendSmokeTrace(root, "webcontents-destroyed");
        void writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "webcontents-destroyed" }, null, 2));
      }
    });
    await writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "window-ready" }, null, 2));
    await appendSmokeTrace(root, "window-ready");
    await waitForPageReady(windowRef);
    await writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "page-ready" }, null, 2));
    await appendSmokeTrace(root, "page-ready");
    mockOllama = await createMockOllamaServer(["qwen2.5-coder:14b"]);
    await appendSmokeTrace(root, "mock-ollama-ready", mockOllama.baseUrl);
    await writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "scenario-starting" }, null, 2));
    await appendSmokeTrace(root, "scenario-starting");

    const result = await windowRef.webContents.executeJavaScript(`
      (async () => {
        const OPENROUTER_MODEL = "qwen/qwen3.6-plus";
        const NVIDIA_MODEL = "meta/llama-3.3-70b-instruct";
        const OLLAMA_MODEL = "ollama/qwen2.5-coder:14b";
        const CLAUDE_MODEL = "claude/minimax-m2.5:cloud";
        const MOCK_OLLAMA_BASE_URL = ${JSON.stringify(mockOllama.baseUrl)};
        const unique = Date.now();
        window.__chatIsolationErrors = [];
        window.addEventListener("unhandledrejection", (event) => {
          window.__chatIsolationErrors.push(event.reason instanceof Error ? event.reason.stack ?? event.reason.message : String(event.reason));
        });
        window.addEventListener("error", (event) => {
          window.__chatIsolationErrors.push(event.error instanceof Error ? event.error.stack ?? event.error.message : event.message);
        });

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
          const optionValues = Array.from(select.options).map((option) => option.value);
          assert(
            optionValues.includes(value),
            "Select option " + value + " was not available in " + selector + ". Available: " + optionValues.join(", ")
          );
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
        const describeChatUi = async () => {
          const summaries = await listChats().catch((error) => [{ error: error instanceof Error ? error.message : String(error) }]);
          return JSON.stringify({
            title: text("#chat-title-display"),
            activeSidebarTitle: document.querySelector(".chat-item.active .chat-item-title")?.textContent ?? "",
            quickClaudeActive: requireElement("#quick-claude-btn").classList.contains("active"),
            providerOpenRouterActive: requireElement("#chat-provider-openrouter-btn").classList.contains("active"),
            providerNvidiaActive: requireElement("#chat-provider-nvidia-btn").classList.contains("active"),
            providerOllamaActive: requireElement("#chat-provider-ollama-btn").classList.contains("active"),
            errors: window.__chatIsolationErrors,
            sidebarTitles: Array.from(document.querySelectorAll(".chat-item-title")).map((item) => item.textContent ?? "").slice(0, 8),
            summaries: Array.isArray(summaries)
              ? summaries.map((chat) => ({ id: chat.id, title: chat.title, messageCount: chat.messageCount })).slice(0, 8)
              : summaries
          });
        };
        const getNewestChat = async () => {
          const chats = await listChats();
          const newest = chats[0];
          if (!newest) throw new Error("Expected at least one persisted chat.");
          const chat = await window.api.chat.get(newest.id);
          if (!chat) throw new Error("Newest chat could not be loaded.");
          return chat;
        };
        const assertChatContext = (chat, provider, selectedModel, label) => {
          const contextJson = JSON.stringify(chat.context ?? null);
          assert(chat.context?.provider === provider, label + " did not retain " + provider + " provider context. Actual: " + contextJson);
          assert(chat.context?.selectedModel === selectedModel, label + " did not retain selected model " + selectedModel + ". Actual: " + contextJson);
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
          try {
            await waitFor(() => text("#chat-title-display") === title, 8000, "Timed out loading chat: " + title);
          } catch (error) {
            throw new Error((error instanceof Error ? error.message : String(error)) + ". UI: " + await describeChatUi());
          }
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
        const imageCardPrompts = () => Array.from(
          document.querySelectorAll("#image-studio-history-list .image-history-entry .image-history-prompt")
        )
          .map((item) => (item.textContent ?? "").trim())
          .filter(Boolean);
        const runImageModeChecks = async () => {
          click("#generate-image-btn");
          await waitFor(
            () => getComputedStyle(requireElement("#image-studio")).display !== "none",
            8000,
            "Image mode did not open."
          );
          await waitFor(
            () => imageCardPrompts().length >= 2,
            8000,
            "Seeded image history did not render in Image mode."
          );

          assert(Boolean(document.getElementById("image-studio-search-input")), "Image mode search input is missing.");
          assert(Boolean(document.getElementById("image-studio-sort-select")), "Image mode sort select is missing.");

          dispatchInput("#image-studio-search-input", "alpha");
          await waitFor(() => {
            const prompts = imageCardPrompts();
            return prompts.length === 1 && /alpha/i.test(prompts[0] ?? "");
          }, 5000, "Image search did not narrow the gallery.");

          dispatchInput("#image-studio-search-input", "");
          await waitFor(
            () => imageCardPrompts().length >= 2,
            5000,
            "Clearing image search did not restore the gallery."
          );

          dispatchSelect("#image-studio-sort-select", "oldest");
          await waitFor(
            () => /^alpha/i.test(imageCardPrompts()[0] ?? ""),
            5000,
            "Oldest sort did not move the oldest seed to the first position."
          );

          dispatchSelect("#image-studio-sort-select", "newest");
          await waitFor(
            () => /^zebra/i.test(imageCardPrompts()[0] ?? ""),
            5000,
            "Newest sort did not move the newest seed to the first position."
          );

          const reuseButton = document.querySelector("#image-studio-history-list .image-history-reuse-btn");
          if (!(reuseButton instanceof HTMLElement)) {
            throw new Error("Image gallery card is missing the Reuse Prompt button.");
          }
          reuseButton.click();
          const promptInput = requireElement("#image-studio-prompt-input");
          const expectedPrompt = imageCardPrompts()[0] ?? "";
          assert(promptInput.value.trim() === expectedPrompt, "Reuse Prompt did not populate the image prompt input.");

          const originalConfirm = window.confirm;
          let confirmCalls = 0;
          try {
            window.confirm = () => {
              confirmCalls += 1;
              return false;
            };
            const beforeCancelCount = imageCardPrompts().length;
            const deleteButton = document.querySelector("#image-studio-history-list .image-history-delete-btn");
            if (!(deleteButton instanceof HTMLElement)) {
              throw new Error("Image gallery card is missing the Delete button.");
            }
            deleteButton.click();
            await wait(150);
            assert(confirmCalls === 1, "Image delete did not ask for confirmation.");
            assert(imageCardPrompts().length === beforeCancelCount, "Canceling delete should keep gallery size unchanged.");

            window.confirm = () => {
              confirmCalls += 1;
              return true;
            };
            deleteButton.click();
            await waitFor(
              () => imageCardPrompts().length === beforeCancelCount - 1,
              8000,
              "Confirmed image delete did not remove the selected card."
            );
            assert(confirmCalls >= 2, "Image delete confirm path was not exercised.");
          } finally {
            window.confirm = originalConfirm;
          }

          return {
            remainingCards: imageCardPrompts().length
          };
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
          ollamaBaseUrl: MOCK_OLLAMA_BASE_URL,
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
        assertChatContext(nvidiaChat, "nvidia", NVIDIA_MODEL, "New persisted chat after NVIDIA send");

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
        assertChatContext(ollamaChat, "ollama", OLLAMA_MODEL, "New persisted chat after Ollama send");

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
        assertChatContext(openrouterChat, "openrouter", OPENROUTER_MODEL, "New persisted chat after leaving Claude");
        const imageMode = await runImageModeChecks();

        return {
          ok: true,
          openrouterTitle,
          claudeTitle,
          nvidiaChatId: nvidiaChat.id,
          ollamaChatId: ollamaChat.id,
          openrouterChatId: openrouterChat.id,
          finalChatCount: (await listChats()).length,
          imageMode
        };
      })();
    `, true);

    const serialized = `${JSON.stringify(result)}\n`;
    finalized = true;
    await writeSmokeArtifact(root, "chat-isolation-result.json", JSON.stringify({ step: "completed", result }, null, 2));
    await appendSmokeTrace(root, "completed", JSON.stringify(result));
    process.stdout.write(serialized);
  } finally {
    await appendSmokeTrace(root, "cleanup-start", `finalized=${finalized}`);
    app.removeAllListeners("window-all-closed");
    for (const windowRef of BrowserWindow.getAllWindows()) {
      if (!windowRef.isDestroyed()) windowRef.destroy();
    }
    if (mockOllama) {
      await closeServer(mockOllama.server).catch(() => {});
      mockOllama = null;
    }
    await rm(tempRoot, { recursive: true, force: true }).catch(() => {});
    await appendSmokeTrace(root, "cleanup-complete");
  }
})()
  .then(() => {
    app.quit();
  })
  .catch(async (error) => {
  const root = join(__dirname, "..");
  const message = error instanceof Error ? error.stack ?? error.message : String(error);
  await appendSmokeTrace(root, "error", JSON.stringify(message)).catch(() => {});
  await writeSmokeArtifact(root, "chat-isolation-error.txt", `${message}\n`).catch(() => {});
  process.stderr.write(`${message}\n`);
  process.exitCode = 1;
  app.quit();
});
