const { app, BrowserWindow } = require("electron");
const {
  createBrowserSmokeResult,
  evaluateBrowserSmoke,
  requiresCapabilityInteractionProbe
} = require("../dist/shared/browserSmoke.js");

function parseArgs(argv) {
  const parsed = {
    url: "",
    workspaceKind: "generic",
    builderMode: "",
    promptRequirements: [],
    timeoutMs: 15000
  };

  for (let index = 0; index < argv.length; index += 1) {
    const value = argv[index];
    if (value === "--url") {
      parsed.url = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (value === "--workspace-kind") {
      parsed.workspaceKind = argv[index + 1] ?? parsed.workspaceKind;
      index += 1;
      continue;
    }
    if (value === "--builder-mode") {
      parsed.builderMode = argv[index + 1] ?? "";
      index += 1;
      continue;
    }
    if (value === "--prompt-requirement") {
      const requirement = (argv[index + 1] ?? "").trim();
      if (requirement) {
        parsed.promptRequirements.push(requirement);
      }
      index += 1;
      continue;
    }
    if (value === "--timeout-ms") {
      const timeoutValue = Number.parseInt(argv[index + 1] ?? "", 10);
      if (Number.isFinite(timeoutValue) && timeoutValue > 0) {
        parsed.timeoutMs = timeoutValue;
      }
      index += 1;
    }
  }

  return parsed;
}

async function collectSnapshot(windowRef) {
  return windowRef.webContents.executeJavaScript(`
    (async () => {
      const getStorageKeyCount = (storage) => {
        try {
          return storage?.length ?? 0;
        } catch {
          return 0;
        }
      };
      const countMatches = (value, patterns) => patterns.reduce((total, pattern) => {
        const matches = value.match(pattern);
        return total + (matches ? matches.length : 0);
      }, 0);
      const inputElements = () => Array.from(document.querySelectorAll("input"));
      const hasAttrValue = (element, name, fragment) => String(element?.getAttribute?.(name) ?? "").toLowerCase().includes(fragment);
      const countInputs = (predicate) => inputElements().filter((element) => predicate(element)).length;
      const collect = () => {
        const html = document.documentElement?.outerHTML ?? "";
        const text = document.body?.innerText?.trim() ?? "";
        const normalizedText = text.toLowerCase();
        const selectors = (query) => document.querySelectorAll(query).length;
        return {
          readyState: document.readyState,
          title: document.title ?? "",
          hasHtml: Boolean(document.documentElement),
          hasBody: Boolean(document.body),
          headingCount: selectors("h1, h2, h3"),
          actionCount: selectors("button, [type=\\"submit\\"], a[href^=\\"#\\"]"),
          inputCount: selectors("form, input, textarea, select"),
          collectionCount: selectors("ul, ol, table, tbody, [role=\\"list\\"], .notes-list, .records-list, .note-card, .record-row, .kanban-grid, .kanban-lane, .kanban-card, .board-column, .task-card"),
          rootCount: selectors("#root, [data-reactroot]"),
          scriptCount: document.scripts.length,
          appScriptCount: Array.from(document.scripts).filter((script) => /(^|\\\\/)app\\\\.js($|[?#])/i.test(script.src ?? "")).length,
          textLength: text.length,
          htmlLength: html.length,
          localStorageKeys: getStorageKeyCount(window.localStorage),
          sessionStorageKeys: getStorageKeyCount(window.sessionStorage),
          textareaCount: selectors("textarea"),
          selectCount: selectors("select"),
          urlInputCount: countInputs((element) => {
            const type = String(element.type ?? "").toLowerCase();
            return type === "url"
              || hasAttrValue(element, "name", "url")
              || hasAttrValue(element, "placeholder", "url")
              || hasAttrValue(element, "name", "youtube")
              || hasAttrValue(element, "placeholder", "youtube");
          }),
          searchInputCount: countInputs((element) => {
            const type = String(element.type ?? "").toLowerCase();
            return type === "search"
              || hasAttrValue(element, "name", "search")
              || hasAttrValue(element, "placeholder", "search")
              || hasAttrValue(element, "name", "filter")
              || hasAttrValue(element, "placeholder", "filter")
              || hasAttrValue(element, "name", "find")
              || hasAttrValue(element, "placeholder", "find");
          }),
          fileInputCount: countInputs((element) => String(element.type ?? "").toLowerCase() === "file"),
          passwordInputCount: countInputs((element) => String(element.type ?? "").toLowerCase() === "password"),
          summaryMarkerCount: countMatches(normalizedText, [/\bsummary\b/g, /\btakeaways?\b/g, /\bchapters?\b/g, /\bkey points?\b/g, /\binsights?\b/g, /\bbrief\b/g, /\baction items?\b/g])
            + selectors("[data-summary], [data-generated-summary], .summary, .takeaways, .chapters, .action-items"),
          transcriptMarkerCount: countMatches(normalizedText, [/\btranscript\b/g, /\bsubtitles?\b/g, /\bcaptions?\b/g])
            + selectors("[data-transcript], .transcript, .captions"),
          videoSourceMarkerCount: countMatches(normalizedText, [/\byoutube\b/g, /\bvideo url\b/g, /\bvideo link\b/g, /\byoutu\\.be\b/g, /\byoutube\\.com\b/g])
            + selectors("[data-video-source], .video-source"),
          searchMarkerCount: countMatches(normalizedText, [/\bsearch\b/g, /\bfilter\b/g, /\bfind\b/g])
            + selectors("[role='searchbox'], [data-search], [data-filter], .search, .filters"),
          persistenceMarkerCount: countMatches(normalizedText, [/\bsaved\b/g, /\bhistory\b/g, /\brecent\b/g, /\blibrary\b/g, /\bstored\b/g, /\bpersist/i])
            + selectors("[data-history], [data-saved], .history, .saved-list, .library"),
          exportActionCount: countMatches(normalizedText, [/\bcopy\b/g, /\bexport\b/g, /\bdownload\b/g, /\bshare\b/g])
            + selectors("[data-copy], [data-export], a[download], .copy-action, .export-action"),
          ingestMarkerCount: countMatches(normalizedText, [/\bimport\b/g, /\bupload\b/g, /\bpaste\b/g, /\bdrag and drop\b/g, /\bdrop zone\b/g, /\bfile picker\b/g])
            + selectors("[data-upload], [data-import], .dropzone, .drop-zone"),
          authMarkerCount: countMatches(normalizedText, [/\blogin\b/g, /\bsign in\b/g, /\bauth\b/g, /\bpassword\b/g, /\baccount\b/g])
            + selectors("[data-auth], .login, .signin, .auth"),
          settingsMarkerCount: countMatches(normalizedText, [/\bsettings\b/g, /\bpreferences\b/g, /\bconfiguration\b/g, /\bconfig\b/g])
            + selectors("[data-settings], .settings, .preferences")
        };
      };

      const started = Date.now();
      while (Date.now() - started < 2500) {
        const snapshot = collect();
        if (snapshot.textLength > 0) {
          return snapshot;
        }
        await new Promise((resolve) => setTimeout(resolve, 250));
      }
      return collect();
    })();
  `, true);
}

async function runInteractionProbe(windowRef, builderMode, promptRequirements) {
  if (!requiresCapabilityInteractionProbe(builderMode, promptRequirements)) {
    return {
      attempted: false,
      changed: false,
      details: "Interaction probe not required for this builder mode."
    };
  }

  return windowRef.webContents.executeJavaScript(`
    (async () => {
      const visible = (element) => {
        if (!element) return false;
        const style = window.getComputedStyle(element);
        if (style.display === "none" || style.visibility === "hidden") return false;
        const rect = element.getBoundingClientRect();
        return rect.width > 0 && rect.height > 0;
      };
      const storageCount = (storage) => {
        try {
          return storage?.length ?? 0;
        } catch {
          return 0;
        }
      };
      const countMatches = (value, patterns) => patterns.reduce((total, pattern) => {
        const matches = value.match(pattern);
        return total + (matches ? matches.length : 0);
      }, 0);
      const collect = () => {
        const text = document.body?.innerText?.trim() ?? "";
        const normalizedText = text.toLowerCase();
        return {
          textLength: text.length,
          collectionCount: document.querySelectorAll("ul, ol, table, tbody, [role=\\"list\\"], .notes-list, .records-list, .note-card, .record-row, .kanban-grid, .kanban-lane, .kanban-card, .board-column, .task-card").length,
          localStorageKeys: storageCount(window.localStorage),
          sessionStorageKeys: storageCount(window.sessionStorage),
          summaryMarkerCount: countMatches(normalizedText, [/\\bsummary\\b/g, /\\btakeaways?\\b/g, /\\bchapters?\\b/g, /\\bkey points?\\b/g, /\\binsights?\\b/g, /\\bbrief\\b/g, /\\baction items?\\b/g]),
          text
        };
      };

      const before = collect();
      const marker = "cipher smoke " + Date.now();
      const textFields = Array.from(document.querySelectorAll("textarea, input:not([type]), input[type='text'], input[type='search'], input[type='email'], input[type='url'], input[type='number']"))
        .filter((element) => visible(element) && !element.disabled && !element.readOnly);
      const selects = Array.from(document.querySelectorAll("select"))
        .filter((element) => visible(element) && !element.disabled);
      const buttons = Array.from(document.querySelectorAll("button, input[type='submit'], [type='submit']"))
        .filter((element) => visible(element) && !element.disabled);
      const form = textFields[0]?.form ?? buttons.find((element) => element.form)?.form ?? buttons[0]?.closest("form") ?? null;

      if (textFields.length === 0 && buttons.length === 0) {
        return {
          attempted: false,
          changed: false,
          details: "No visible editable field or action button was available."
        };
      }

      textFields.forEach((field, index) => {
        const type = (field.getAttribute("type") ?? "").toLowerCase();
        if (type === "number") {
          field.value = String(index + 1);
        } else {
          field.value = index === 0 ? marker : "cipher-" + (index + 1);
        }
        field.dispatchEvent(new Event("input", { bubbles: true }));
        field.dispatchEvent(new Event("change", { bubbles: true }));
      });

      selects.forEach((select) => {
        const options = Array.from(select.options).filter((option) => !option.disabled);
        const preferred = options.find((option) => option.value) ?? options[0];
        if (!preferred) return;
        select.value = preferred.value;
        select.dispatchEvent(new Event("input", { bubbles: true }));
        select.dispatchEvent(new Event("change", { bubbles: true }));
      });

      if (form && typeof form.requestSubmit === "function") {
        form.requestSubmit();
      } else if (buttons[0] instanceof HTMLElement) {
        buttons[0].click();
      } else if (form) {
        form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      }

      await new Promise((resolve) => setTimeout(resolve, 750));
      const after = collect();
      const typedValueVisible = after.text.toLowerCase().includes(marker.toLowerCase());
      const collectionDelta = after.collectionCount - before.collectionCount;
      const textDelta = after.textLength - before.textLength;
      const localStorageDelta = after.localStorageKeys - before.localStorageKeys;
      const sessionStorageDelta = after.sessionStorageKeys - before.sessionStorageKeys;
      const summaryMarkerDelta = after.summaryMarkerCount - before.summaryMarkerCount;
      const changed = typedValueVisible || collectionDelta > 0 || textDelta > 12 || localStorageDelta !== 0 || sessionStorageDelta !== 0 || summaryMarkerDelta > 0;

      return {
        attempted: true,
        changed,
        typedValueVisible,
        collectionDelta,
        textDelta,
        localStorageDelta,
        sessionStorageDelta,
        summaryMarkerDelta,
        details: changed
          ? "Basic stateful interaction changed the rendered page or storage."
          : "Input and submit flow completed, but no collection, text, or storage change was detected."
      };
    })();
  `, true);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.url) {
    throw new Error("Missing required --url argument.");
  }

  const pageErrors = [];
  let timeout = null;
  let settled = false;

  await app.whenReady();

  const windowRef = new BrowserWindow({
    show: false,
    width: 1280,
    height: 900,
    webPreferences: {
      sandbox: true,
      contextIsolation: true,
      nodeIntegration: false
    }
  });

  const finish = async (result) => {
    if (settled) return;
    settled = true;
    if (timeout) clearTimeout(timeout);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    if (!windowRef.isDestroyed()) {
      windowRef.close();
    }
    app.quit();
  };

  windowRef.webContents.on("console-message", (_event, level, message) => {
    if (level >= 2 || /uncaught|error|failed/i.test(message)) {
      pageErrors.push(String(message).trim());
    }
  });

  windowRef.webContents.on("render-process-gone", (_event, details) => {
    pageErrors.push(`render-process-gone:${details.reason}`);
  });

  windowRef.webContents.on("did-fail-load", (_event, errorCode, errorDescription, validatedUrl) => {
    pageErrors.push(`did-fail-load:${validatedUrl}:${errorCode}:${errorDescription}`);
  });

  timeout = setTimeout(() => {
    void finish(createBrowserSmokeResult("failed", `Browser smoke timed out after ${options.timeoutMs}ms.`));
  }, options.timeoutMs);

  try {
    await windowRef.loadURL(options.url);
    const snapshot = await collectSnapshot(windowRef);
    const interactionProbe = await runInteractionProbe(windowRef, options.builderMode, options.promptRequirements);
    const result = evaluateBrowserSmoke(
      snapshot,
      options.workspaceKind,
      options.builderMode,
      pageErrors,
      interactionProbe,
      options.promptRequirements
    );
    await finish(result);
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    await finish(createBrowserSmokeResult("failed", `Browser smoke could not load ${options.url}: ${message}`));
  }
}

main().catch((error) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stdout.write(`${JSON.stringify(createBrowserSmokeResult("failed", message))}\n`);
  process.exitCode = 1;
});
