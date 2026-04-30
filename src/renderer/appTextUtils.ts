function formatUiTime(value: string): string {
  const parsed = Date.parse(value ?? "");
  if (!Number.isFinite(parsed)) return "";
  return new Date(parsed).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" });
}

function compactModelName(model: string): string {
  const normalized = model.startsWith("ollama/") ? model.slice("ollama/".length) : model;
  const short = normalized.split("/").pop() ?? normalized;
  return short.replace(/-instruct$/i, "");
}

function stripAnsi(value: string): string {
  return value.replace(/\u001b\[[0-9;]*m/g, "");
}

function escHtml(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
}

function sanitizeDownloadName(value: string): string {
  const compact = (value ?? "").trim().replace(/[<>:"/\\|?*\x00-\x1F]+/g, "-");
  return compact.replace(/\s+/g, "-").replace(/-+/g, "-").replace(/^-|-$/g, "") || "cipher-generated-image";
}

function renderMarkdown(text: string): string {
  if (!text) return "";

  const codeBlocks: string[] = [];
  const imageBlocks: string[] = [];
  const placeholderPrefix = "__CODE_BLOCK_";
  const imagePlaceholderPrefix = "__IMAGE_BLOCK_";

  const withCodePlaceholders = text.replace(/```(\w*)\n([\s\S]*?)```/g, (_m, lang, code) => {
    const normalizedLang = (lang ?? "").trim().toLowerCase();
    const langAttr = normalizedLang ? ` class="language-${escHtml(normalizedLang)}"` : "";
    const runnable = normalizedLang === "html" || normalizedLang === "javascript" || normalizedLang === "js";
    const runBtn = runnable ? '<button class="run-btn" type="button">Run</button>' : "";
    codeBlocks.push(`<div class="code-block" data-lang="${escHtml(normalizedLang)}"><div class="code-actions"><button class="copy-btn" type="button">Copy</button>${runBtn}</div><pre><code${langAttr}>${escHtml(code.trim())}</code></pre></div>`);
    return `${placeholderPrefix}${codeBlocks.length - 1}__`;
  });

  const withPlaceholders = withCodePlaceholders.replace(/!\[([^\]]*)\]\((data:image\/[^)]+)\)/g, (_m, alt, url) => {
    const label = (alt ?? "").trim() || "Generated image";
    const encodedUrl = escHtml(url);
    const suggestedName = sanitizeDownloadName(label);
    imageBlocks.push(
      `<figure class="message-image-card"><img class="message-image" src="${encodedUrl}" alt="${escHtml(label)}" loading="lazy" /><figcaption><span>${escHtml(label)}</span><button class="message-image-save-btn" type="button" data-image-name="${escHtml(suggestedName)}">Save image</button></figcaption></figure>`
    );
    return `${imagePlaceholderPrefix}${imageBlocks.length - 1}__`;
  });

  const escaped = escHtml(withPlaceholders)
    .replace(/`([^`]+)`/g, (_m, c) => `<code>${c}</code>`)
    .replace(/\*\*(.+?)\*\*/g, "<strong>$1</strong>")
    .replace(/^### (.+)$/gm, "<h3>$1</h3>")
    .replace(/^## (.+)$/gm, "<h2>$1</h2>")
    .replace(/^# (.+)$/gm, "<h1>$1</h1>")
    .replace(/\n/g, "<br>");

  return escaped
    .replace(/__CODE_BLOCK_(\d+)__/g, (_m, index) => codeBlocks[Number(index)] ?? "")
    .replace(/__IMAGE_BLOCK_(\d+)__/g, (_m, index) => imageBlocks[Number(index)] ?? "");
}

function formatConsoleValue(value: unknown): string {
  if (typeof value === "string") return value;
  try {
    return JSON.stringify(value);
  } catch {
    return String(value);
  }
}
