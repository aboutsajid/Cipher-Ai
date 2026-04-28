export interface BufferedLogSink {
  append: (chunk: string) => Promise<void>;
  appendSync?: (chunk: string) => void;
}

export interface BufferedLogWriter {
  appendLine: (line: string) => void;
  flush: () => Promise<void>;
  flushSync: () => void;
}

const REDACTION_PLACEHOLDER = "[REDACTED]";

export function redactDebugLogText(input: string): string {
  let redacted = input;

  redacted = redacted.replace(
    /(["']?(?:api[_-]?key|access[_-]?token|refresh[_-]?token|authorization|token)["']?\s*[:=]\s*["'])([^"']{6,})(["'])/gi,
    `$1${REDACTION_PLACEHOLDER}$3`
  );
  redacted = redacted.replace(
    /((?:^|\s)(?:OPENAI_API_KEY|ANTHROPIC_API_KEY|NVIDIA_API_KEY|API_KEY)\s*=\s*)(\S+)/gi,
    `$1${REDACTION_PLACEHOLDER}`
  );
  redacted = redacted.replace(
    /(\bauthorization\s*:\s*bearer\s+)([^\s"']+)/gi,
    `$1${REDACTION_PLACEHOLDER}`
  );
  redacted = redacted.replace(
    /([?&](?:api[_-]?key|token|access[_-]?token)=)([^&\s]+)/gi,
    `$1${REDACTION_PLACEHOLDER}`
  );
  redacted = redacted.replace(/\bsk-or-v1-[A-Za-z0-9_-]{10,}\b/g, REDACTION_PLACEHOLDER);
  redacted = redacted.replace(/\bsk-[A-Za-z0-9_-]{10,}\b/g, REDACTION_PLACEHOLDER);
  return redacted;
}

export function createBufferedLogWriter(
  sink: BufferedLogSink,
  options: { flushIntervalMs?: number; flushLineThreshold?: number } = {}
): BufferedLogWriter {
  const flushIntervalMs = Math.max(10, options.flushIntervalMs ?? 120);
  const flushLineThreshold = Math.max(1, options.flushLineThreshold ?? 40);
  const pendingLines: string[] = [];
  let flushTimer: ReturnType<typeof setTimeout> | null = null;
  let writeChain = Promise.resolve();

  const clearFlushTimer = (): void => {
    if (!flushTimer) return;
    clearTimeout(flushTimer);
    flushTimer = null;
  };

  const scheduleFlush = (): void => {
    if (flushTimer) return;
    flushTimer = setTimeout(() => {
      void flush();
    }, flushIntervalMs);
    if (typeof (flushTimer as { unref?: () => void }).unref === "function") {
      (flushTimer as { unref: () => void }).unref();
    }
  };

  const flush = async (): Promise<void> => {
    clearFlushTimer();
    if (pendingLines.length === 0) {
      await writeChain;
      return;
    }
    const chunk = pendingLines.join("");
    pendingLines.length = 0;
    writeChain = writeChain.then(async () => {
      try {
        await sink.append(chunk);
      } catch {
        // Best-effort logging only.
      }
    });
    await writeChain;
  };

  const flushSync = (): void => {
    clearFlushTimer();
    if (pendingLines.length === 0) return;
    if (!sink.appendSync) {
      pendingLines.length = 0;
      return;
    }
    const chunk = pendingLines.join("");
    pendingLines.length = 0;
    try {
      sink.appendSync(chunk);
    } catch {
      // Best-effort logging only.
    }
  };

  const appendLine = (line: string): void => {
    pendingLines.push(line);
    if (pendingLines.length >= flushLineThreshold) {
      void flush();
      return;
    }
    scheduleFlush();
  };

  return {
    appendLine,
    flush,
    flushSync
  };
}
