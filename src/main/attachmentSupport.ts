import { BrowserWindow, dialog } from "electron";
import { readFile, readdir, stat } from "node:fs/promises";
import { basename, extname, join, relative } from "node:path";
import type { AttachmentPayload } from "../shared/types";

type ClaudeInputTextBlock = {
  type: "text";
  text: string;
};

type ClaudeInputImageBlock = {
  type: "image";
  source: {
    type: "base64";
    media_type: "image/jpeg" | "image/png" | "image/gif" | "image/webp";
    data: string;
  };
};

export type ClaudeMessageContent = string | Array<ClaudeInputTextBlock | ClaudeInputImageBlock>;

const TEXT_EXTENSIONS = new Set([".txt", ".md", ".js", ".ts", ".py", ".json", ".html", ".css", ".cpp", ".c", ".rs", ".go"]);
const IMAGE_MIME_BY_EXTENSION: Record<string, string> = {
  ".png": "image/png",
  ".jpg": "image/jpeg",
  ".jpeg": "image/jpeg",
  ".webp": "image/webp",
  ".gif": "image/gif",
  ".bmp": "image/bmp",
  ".svg": "image/svg+xml",
  ".ico": "image/x-icon"
};
const MAX_FOLDER_ATTACHMENTS = 500;
const MAX_FOLDER_BUNDLE_FILES = 220;
const MAX_FOLDER_BUNDLE_CHARS = 900_000;
const MAX_FOLDER_FILE_CHARS = 60_000;
const MAX_TEXT_ATTACHMENT_BYTES = 250_000;
const MAX_IMAGE_ATTACHMENT_BYTES = 8_000_000;
const MAX_FOLDER_SCAN_ENTRIES = 5000;
const MAX_CLAUDE_ATTACHMENTS = 24;
const MAX_CLAUDE_TEXT_ATTACHMENT_CHARS = 16_000;
const MAX_CLAUDE_TOTAL_ATTACHMENT_CHARS = 90_000;
const MAX_CLAUDE_IMAGE_ATTACHMENTS = 10;
const SKIPPED_FOLDER_NAMES = new Set([
  "node_modules",
  ".git",
  "dist",
  "build",
  "coverage",
  ".next",
  ".turbo",
  ".cache",
  ".idea",
  ".vscode"
]);

interface FolderTextFile {
  absPath: string;
  relPath: string;
}

function formatPromptPath(input: string): string {
  return input.replace(/\\/g, "/");
}

function shouldSkipFolderEntry(name: string): boolean {
  const lower = name.toLowerCase();
  return SKIPPED_FOLDER_NAMES.has(lower) || name.startsWith(".");
}

function isProbablyTextBuffer(buffer: Buffer): boolean {
  if (buffer.length === 0) return true;
  const sampleSize = Math.min(buffer.length, 4096);
  let controlCount = 0;
  for (let i = 0; i < sampleSize; i += 1) {
    const byte = buffer[i];
    if (byte === 0) return false;
    if (byte < 7 || (byte > 14 && byte < 32)) controlCount += 1;
  }
  return controlCount / sampleSize < 0.2;
}

function parseDataUrlImage(dataUrl: string): { mediaType: string; data: string } | null {
  const match = /^data:([^;]+);base64,(.+)$/i.exec((dataUrl ?? "").trim());
  if (!match) return null;
  const mediaType = (match[1] ?? "").trim().toLowerCase();
  const data = (match[2] ?? "").trim();
  if (!mediaType || !data) return null;
  return { mediaType, data };
}

function toClaudeImageMediaType(mediaType: string): ClaudeInputImageBlock["source"]["media_type"] | null {
  if (mediaType === "image/png") return "image/png";
  if (mediaType === "image/jpeg" || mediaType === "image/jpg") return "image/jpeg";
  if (mediaType === "image/gif") return "image/gif";
  if (mediaType === "image/webp") return "image/webp";
  return null;
}

function buildClaudePromptWithAttachments(prompt: string, attachments: AttachmentPayload[], enabledTools: string[] = []): string {
  if (attachments.length === 0) return prompt;

  const sections: string[] = [];
  let included = 0;
  let trimmed = 0;
  let skipped = 0;
  let usedTextChars = 0;
  const limited = attachments.slice(0, MAX_CLAUDE_ATTACHMENTS);
  const editablePaths = limited
    .filter((attachment) => attachment.type === "text" && attachment.sourcePath)
    .map((attachment) => attachment.sourcePath!.trim())
    .filter(Boolean);
  const writableRoots = limited
    .map((attachment) => attachment.writableRoot?.trim() ?? "")
    .filter(Boolean);

  for (const attachment of limited) {
    const label = formatPromptPath(attachment.name);
    if (attachment.type === "image") {
      included += 1;
      const locationHint = attachment.sourcePath
        ? `Image file path: ${attachment.sourcePath}`
        : "[Binary image payload omitted in Claude mode to keep responses fast.]";
      sections.push("", `--- IMAGE: ${label} (${attachment.mimeType ?? "image"}) ---`, locationHint);
      continue;
    }

    const remaining = MAX_CLAUDE_TOTAL_ATTACHMENT_CHARS - usedTextChars;
    if (remaining <= 0) {
      skipped += 1;
      continue;
    }

    const perFileLimit = Math.min(MAX_CLAUDE_TEXT_ATTACHMENT_CHARS, remaining);
    let body = attachment.content;
    if (body.length > perFileLimit) {
      body = body.slice(0, perFileLimit);
      trimmed += 1;
    }
    usedTextChars += body.length;
    included += 1;

    sections.push("", attachment.writableRoot ? `--- WRITABLE ROOT: ${label} ---` : `--- FILE: ${label} ---`, body);
    if (attachment.sourcePath) {
      sections.push(`Source path: ${attachment.sourcePath}`);
    }
    if (attachment.writableRoot) {
      sections.push(`Writable root: ${attachment.writableRoot}`);
    }
    if (body.length < attachment.content.length) {
      sections.push("[File truncated for speed.]");
    }
  }

  if (attachments.length > limited.length) {
    skipped += attachments.length - limited.length;
  }

  const header = [
    prompt,
    "",
    "[Attached context follows. Large content is trimmed in Claude mode for faster responses.]",
    `Attachment summary: included ${included}/${attachments.length}, trimmed ${trimmed}, skipped ${skipped}.`
  ];

  if (editablePaths.length > 0) {
    header.push(
      "",
      "[Editable files]",
      "These attached files correspond to exact workspace paths. Reference these exact paths when proposing or describing changes:",
      ...editablePaths.map((path) => `- ${path}`)
    );
  }

  if (writableRoots.length > 0) {
    header.push(
      "",
      "[Writable roots]",
      "New files may be proposed only inside these explicitly selected folder roots:",
      ...writableRoots.map((path) => `- ${path}`)
    );
  }

  if (enabledTools.length > 0) {
    header.push(
      "",
      "[Enabled tools]",
      `The following tools are enabled for this task: ${enabledTools.join(", ")}.`,
      "Use a tool only if it is actually available in your current runtime, and do not claim file changes unless they were truly applied."
    );
  }

  if (sections.length === 0) {
    header.push("No attachment content included because size limits were reached.");
  }

  return [...header, ...sections].join("\n");
}

async function collectFolderTextFiles(rootDir: string): Promise<{
  files: FolderTextFile[];
  skippedEntries: number;
  skippedDirs: number;
  truncatedScan: boolean;
}> {
  const files: FolderTextFile[] = [];
  let skippedEntries = 0;
  let skippedDirs = 0;
  let scannedEntries = 0;
  let truncatedScan = false;
  const queue = [rootDir];

  while (queue.length > 0) {
    const currentDir = queue.shift()!;
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = await readdir(currentDir, { withFileTypes: true }) as Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    } catch {
      skippedDirs += 1;
      continue;
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));

    for (const entry of entries) {
      scannedEntries += 1;
      if (scannedEntries > MAX_FOLDER_SCAN_ENTRIES) {
        truncatedScan = true;
        break;
      }

      const fullPath = join(currentDir, entry.name);

      if (entry.isDirectory()) {
        if (shouldSkipFolderEntry(entry.name)) {
          skippedDirs += 1;
          continue;
        }
        queue.push(fullPath);
        continue;
      }

      if (!entry.isFile()) {
        skippedEntries += 1;
        continue;
      }

      if (entry.name.startsWith(".")) {
        skippedEntries += 1;
        continue;
      }

      const extension = extname(entry.name).toLowerCase();
      if (!TEXT_EXTENSIONS.has(extension)) {
        skippedEntries += 1;
        continue;
      }

      let fileStat;
      try {
        fileStat = await stat(fullPath);
      } catch {
        skippedEntries += 1;
        continue;
      }

      if (fileStat.size > MAX_TEXT_ATTACHMENT_BYTES) {
        skippedEntries += 1;
        continue;
      }

      const relPath = formatPromptPath(relative(rootDir, fullPath));
      files.push({ absPath: fullPath, relPath });
      if (files.length >= MAX_FOLDER_BUNDLE_FILES) {
        truncatedScan = true;
        break;
      }
    }

    if (truncatedScan) break;
  }

  return { files, skippedEntries, skippedDirs, truncatedScan };
}

async function buildFolderBundleAttachment(folderPath: string): Promise<AttachmentPayload> {
  const folderName = basename(folderPath) || "folder";
  const archiveName = `${folderName}.zip`;
  const collected = await collectFolderTextFiles(folderPath);
  const sections: string[] = [];
  let usedChars = 0;
  let includedFiles = 0;
  let truncatedFiles = 0;

  for (const file of collected.files) {
    let raw = "";
    try {
      raw = await readFile(file.absPath, "utf8");
    } catch {
      continue;
    }

    if (raw.length > MAX_FOLDER_FILE_CHARS) {
      raw = raw.slice(0, MAX_FOLDER_FILE_CHARS);
      truncatedFiles += 1;
    }

    const section = `\n\n--- FILE: ${file.relPath} ---\n${raw}`;
    if (usedChars + section.length > MAX_FOLDER_BUNDLE_CHARS) break;
    sections.push(section);
    usedChars += section.length;
    includedFiles += 1;
  }

  const truncatedByContent = includedFiles < collected.files.length;
  const header = [
    `[Folder Archive: ${archiveName}]`,
    `Source Folder: ${folderName}`,
    `Included Text Files: ${includedFiles}`,
    `Files Truncated (per-file limit): ${truncatedFiles}`,
    `Skipped Entries: ${collected.skippedEntries}`,
    `Skipped Directories: ${collected.skippedDirs}`,
    `Archive Truncated: ${collected.truncatedScan || truncatedByContent ? "yes" : "no"}`,
    "",
    "Bundled File Contents:"
  ].join("\n");

  return {
    name: archiveName,
    type: "text",
    content: header + sections.join("")
  };
}

async function buildMultiSelectionBundleAttachment(selectedPaths: string[]): Promise<AttachmentPayload> {
  const archiveName = "selection.zip";
  const sections: string[] = [];
  const imageEntries: string[] = [];
  let usedChars = 0;
  let includedTextEntries = 0;
  let truncatedEntries = 0;

  for (const selectedPath of selectedPaths) {
    let collected: AttachmentPayload[] = [];
    try {
      collected = await collectAttachmentPayloads(selectedPath);
    } catch {
      continue;
    }

    for (const attachment of collected) {
      if (attachment.type === "image") {
        imageEntries.push(attachment.name);
        continue;
      }

      let sectionBody = attachment.content;
      if (sectionBody.length > MAX_FOLDER_FILE_CHARS) {
        sectionBody = sectionBody.slice(0, MAX_FOLDER_FILE_CHARS);
        truncatedEntries += 1;
      }

      const section = `\n\n--- ITEM: ${formatPromptPath(attachment.name)} ---\n${sectionBody}`;
      if (usedChars + section.length > MAX_FOLDER_BUNDLE_CHARS) {
        truncatedEntries += 1;
        continue;
      }
      sections.push(section);
      usedChars += section.length;
      includedTextEntries += 1;
    }
  }

  const header = [
    `[Selection Archive: ${archiveName}]`,
    `Selected Items: ${selectedPaths.length}`,
    `Included Text Entries: ${includedTextEntries}`,
    `Image Entries Listed: ${imageEntries.length}`,
    `Entries Truncated/Skipped by limits: ${truncatedEntries}`,
    "",
    imageEntries.length > 0 ? `Images: ${imageEntries.join(", ")}` : "Images: none",
    "",
    "Bundled File Contents:"
  ].join("\n");

  return {
    name: archiveName,
    type: "text",
    content: header + sections.join("")
  };
}

async function collectAttachmentPayloads(targetPath: string, rootDir?: string): Promise<AttachmentPayload[]> {
  const info = await stat(targetPath);

  if (info.isDirectory()) {
    const folderRoot = rootDir ?? targetPath;
    let entries: Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    try {
      entries = await readdir(targetPath, { withFileTypes: true }) as Array<{ name: string; isDirectory: () => boolean; isFile: () => boolean }>;
    } catch {
      return [];
    }

    entries.sort((a, b) => a.name.localeCompare(b.name));
    const payloads: AttachmentPayload[] = [];
    for (const entry of entries) {
      if (entry.isDirectory() && shouldSkipFolderEntry(entry.name)) continue;
      if (entry.isFile() && entry.name.startsWith(".")) continue;

      const childPath = join(targetPath, entry.name);
      try {
        const collected = await collectAttachmentPayloads(childPath, folderRoot);
        payloads.push(...collected);
      } catch {
        // Skip unreadable child entries.
      }
      if (payloads.length >= MAX_FOLDER_ATTACHMENTS) break;
    }

    return payloads.slice(0, MAX_FOLDER_ATTACHMENTS);
  }

  if (!info.isFile()) return [];

  const relName = rootDir ? formatPromptPath(relative(rootDir, targetPath)) : basename(targetPath);
  const name = relName || basename(targetPath);
  const extension = extname(targetPath).toLowerCase();
  const imageMime = IMAGE_MIME_BY_EXTENSION[extension];
  const maxBytes = imageMime ? MAX_IMAGE_ATTACHMENT_BYTES : MAX_TEXT_ATTACHMENT_BYTES;

  if (info.size > maxBytes) return [];

  const buffer = await readFile(targetPath);
  if (!imageMime) {
    const hasKnownTextExtension = TEXT_EXTENSIONS.has(extension);
    if (!hasKnownTextExtension && !isProbablyTextBuffer(buffer)) {
      return [];
    }

    let content = buffer.toString("utf8");
    if (content.length > MAX_FOLDER_FILE_CHARS) {
      content = content.slice(0, MAX_FOLDER_FILE_CHARS);
    }
    return [{ name, type: "text", content, sourcePath: targetPath }];
  }

  const base64 = buffer.toString("base64");
  return [{
    name,
    type: "image",
    mimeType: imageMime,
    content: `data:${imageMime};base64,${base64}`,
    sourcePath: targetPath
  }];
}

async function pickAttachmentPaths(mainWindow: BrowserWindow): Promise<string[]> {
  const filters = [
    { name: "All Files", extensions: ["*"] },
    { name: "Text Files", extensions: ["txt", "md", "js", "ts", "py", "json", "html", "css", "cpp", "c", "rs", "go"] },
    { name: "Images", extensions: ["png", "jpg", "jpeg", "webp", "gif", "bmp", "svg", "ico"] }
  ];

  if (process.platform === "win32" || process.platform === "linux") {
    const choice = await dialog.showMessageBox(mainWindow, {
      type: "question",
      buttons: ["Files", "Folder", "Cancel"],
      defaultId: 0,
      cancelId: 2,
      noLink: true,
      message: "Attach files or a folder?",
      detail: "On this platform, file and folder pickers are separate."
    });

    if (choice.response === 2) return [];

    if (choice.response === 1) {
      const folderPick = await dialog.showOpenDialog(mainWindow, {
        title: "Attach folder",
        properties: ["openDirectory", "multiSelections"]
      });
      if (folderPick.canceled || folderPick.filePaths.length === 0) return [];
      return folderPick.filePaths;
    }

    const filePick = await dialog.showOpenDialog(mainWindow, {
      title: "Attach files",
      properties: ["openFile", "multiSelections"],
      filters
    });
    if (filePick.canceled || filePick.filePaths.length === 0) return [];
    return filePick.filePaths;
  }

  const open = await dialog.showOpenDialog(mainWindow, {
    title: "Attach files",
    properties: ["openFile", "openDirectory", "multiSelections"],
    filters
  });
  if (open.canceled || open.filePaths.length === 0) return [];
  return open.filePaths;
}

export function normalizeAttachments(raw: AttachmentPayload[] | undefined): AttachmentPayload[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item): AttachmentPayload => ({
      name: (item?.name ?? "").trim(),
      type: item?.type === "image" ? "image" : "text",
      content: item?.content ?? "",
      mimeType: item?.mimeType,
      sourcePath: typeof item?.sourcePath === "string" ? item.sourcePath.trim() : undefined,
      writableRoot: typeof item?.writableRoot === "string" ? item.writableRoot.trim() : undefined
    }))
    .filter((item) => item.name && item.content);
}

export function buildClaudeMessageContent(prompt: string, attachments: AttachmentPayload[], enabledTools: string[] = []): ClaudeMessageContent {
  if (attachments.length === 0) return prompt;

  const promptWithTextAttachments = buildClaudePromptWithAttachments(
    prompt,
    attachments.filter((attachment) => attachment.type !== "image"),
    enabledTools
  );
  const blocks: Array<ClaudeInputTextBlock | ClaudeInputImageBlock> = [
    { type: "text", text: promptWithTextAttachments }
  ];

  const imageAttachments = attachments.filter((attachment) => attachment.type === "image");
  let includedImages = 0;
  const skippedImages: string[] = [];

  for (const attachment of imageAttachments) {
    if (includedImages >= MAX_CLAUDE_IMAGE_ATTACHMENTS) {
      skippedImages.push(`${attachment.name} (image limit reached)`);
      continue;
    }

    const parsed = parseDataUrlImage(attachment.content);
    const mediaType = toClaudeImageMediaType(parsed?.mediaType ?? attachment.mimeType ?? "");
    if (!parsed || !mediaType) {
      skippedImages.push(`${attachment.name} (${attachment.mimeType ?? "unsupported image"})`);
      continue;
    }

    blocks.push({
      type: "image",
      source: {
        type: "base64",
        media_type: mediaType,
        data: parsed.data
      }
    });
    includedImages += 1;
  }

  if (imageAttachments.length > 0) {
    const summaryLines = [
      "",
      `[Image attachment summary: included ${includedImages}/${imageAttachments.length}.]`
    ];
    if (skippedImages.length > 0) {
      summaryLines.push(`[Skipped images: ${skippedImages.join(", ")}]`);
    }
    blocks[0] = {
      type: "text",
      text: `${promptWithTextAttachments}${summaryLines.join("\n")}`
    };
  }

  return blocks;
}

export async function pickAttachmentPayloads(mainWindow: BrowserWindow): Promise<AttachmentPayload[]> {
  const selectedPaths = await pickAttachmentPaths(mainWindow);
  if (selectedPaths.length === 0) {
    return [];
  }

  const normalizedPaths = [...new Set(selectedPaths.map((item) => item.trim()).filter(Boolean))];
  const inspected: Array<{ path: string; isDirectory: boolean; isFile: boolean }> = [];
  for (const selectedPath of normalizedPaths) {
    try {
      const info = await stat(selectedPath);
      inspected.push({
        path: selectedPath,
        isDirectory: info.isDirectory(),
        isFile: info.isFile()
      });
    } catch {
      // Skip unreadable selections.
    }
  }

  if (inspected.length === 0) {
    return [];
  }

  const hasDirectorySelection = inspected.some((entry) => entry.isDirectory);
  if (hasDirectorySelection) {
    try {
      if (inspected.length === 1 && inspected[0].isDirectory) {
        return [await buildFolderBundleAttachment(inspected[0].path)];
      }
      return [await buildMultiSelectionBundleAttachment(inspected.map((entry) => entry.path))];
    } catch {
      return [];
    }
  }

  const payloads: AttachmentPayload[] = [];
  for (const selectedPath of inspected.map((entry) => entry.path).filter(Boolean)) {
    try {
      const collected = await collectAttachmentPayloads(selectedPath);
      payloads.push(...collected);
    } catch {
      // Skip unreadable selections.
    }
    if (payloads.length >= MAX_FOLDER_ATTACHMENTS) break;
  }

  return payloads.slice(0, MAX_FOLDER_ATTACHMENTS);
}

export async function pickWritableRootPayloads(mainWindow: BrowserWindow): Promise<AttachmentPayload[]> {
  const open = await dialog.showOpenDialog(mainWindow, {
    title: "Choose writable folder roots",
    properties: ["openDirectory", "multiSelections"]
  });
  if (open.canceled || open.filePaths.length === 0) {
    return [];
  }

  return [...new Set(open.filePaths.map((item) => item.trim()).filter(Boolean))]
    .map((folderPath) => {
      const folderName = basename(folderPath) || folderPath;
      return {
        name: `[Writable folder] ${folderName}`,
        type: "text" as const,
        content: [
          "[Writable folder root]",
          `Path: ${folderPath}`,
          "Claude may create new files or update existing text files only inside this folder when Edit & Save is used."
        ].join("\n"),
        writableRoot: folderPath
      };
    });
}
