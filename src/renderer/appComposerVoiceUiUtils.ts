async function addClipboardImages(files: File[]): Promise<void> {
  if (files.length === 0) return;

  const attachments: AttachmentPayload[] = [];
  for (const file of files) {
    const mimeType = (file.type || "image/png").toLowerCase();
    if (!mimeType.startsWith("image/")) continue;

    try {
      const dataUrl = await fileToDataUrl(file);
      const ext = imageExtensionFromMime(mimeType);
      const fallbackName = `screenshot-${Date.now()}.${ext}`;
      attachments.push({
        name: (file.name || "").trim() || fallbackName,
        type: "image",
        mimeType,
        content: dataUrl
      });
    } catch {
      // Skip invalid clipboard item.
    }
  }

  if (attachments.length === 0) {
    showToast("Clipboard image read failed.", 2200);
    return;
  }

  activeAttachments = mergeAttachments(attachments);
  renderComposerAttachments();

  const input = $("composer-input") as HTMLTextAreaElement;
  input.focus();
  showToast(`${attachments.length} screenshot attached.`, 1800);
}

function setupComposer() {
  const input = $("composer-input") as HTMLTextAreaElement;
  input.removeAttribute("readonly");
  input.removeAttribute("disabled");
  const composerInner = input.closest(".composer-inner") as HTMLElement | null;
  composerInner?.addEventListener("click", () => input.focus());

  const resizeComposer = () => {
    input.style.height = "auto";
    input.style.height = `${Math.min(input.scrollHeight, 88)}px`;
    input.style.overflowY = input.scrollHeight > 88 ? "auto" : "hidden";
  };

  input.addEventListener("input", () => {
    resizeComposer();
    if (currentInteractionMode === "agent") {
      syncComposerAgentPrompts("composer");
    }
  });
  resizeComposer();
  input.addEventListener("keydown", (e: KeyboardEvent) => {
    if (e.key === "Enter" && !e.shiftKey) {
      e.preventDefault();
      sendMessage();
    }
  });
  document.addEventListener("paste", (event: ClipboardEvent) => {
    const items = Array.from(event.clipboardData?.items ?? []);
    const imageFiles = items
      .filter((item) => item.kind === "file" && item.type.toLowerCase().startsWith("image/"))
      .map((item) => item.getAsFile())
      .filter((file): file is File => Boolean(file));

    if (imageFiles.length === 0) return;
    event.preventDefault();
    void addClipboardImages(imageFiles);
  });
}

function encodePcm16Wav(chunks: Float32Array[], sampleRate: number): Uint8Array {
  let sampleCount = 0;
  for (const chunk of chunks) sampleCount += chunk.length;

  const bytesPerSample = 2;
  const dataSize = sampleCount * bytesPerSample;
  const buffer = new ArrayBuffer(44 + dataSize);
  const view = new DataView(buffer);

  const writeString = (offset: number, value: string) => {
    for (let i = 0; i < value.length; i += 1) {
      view.setUint8(offset + i, value.charCodeAt(i));
    }
  };

  writeString(0, "RIFF");
  view.setUint32(4, 36 + dataSize, true);
  writeString(8, "WAVE");
  writeString(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * bytesPerSample, true);
  view.setUint16(32, bytesPerSample, true);
  view.setUint16(34, 16, true);
  writeString(36, "data");
  view.setUint32(40, dataSize, true);

  let offset = 44;
  for (const chunk of chunks) {
    for (let i = 0; i < chunk.length; i += 1) {
      const sample = Math.max(-1, Math.min(1, chunk[i]));
      const int = sample < 0 ? sample * 0x8000 : sample * 0x7fff;
      view.setInt16(offset, int, true);
      offset += 2;
    }
  }

  return new Uint8Array(buffer);
}

function setupVoiceInput() {
  const btn = document.getElementById("voice-btn");
  if (!(btn instanceof HTMLButtonElement)) return;
  if (!LOCAL_VOICE_SUPPORTED) {
    btn.style.display = "none";
    btn.disabled = true;
    return;
  }
  const hasMediaRecorder = typeof MediaRecorder !== "undefined";
  const canCaptureAudio = Boolean(navigator.mediaDevices?.getUserMedia);
  let pcmRecording = false;
  let pcmChunks: Float32Array[] = [];
  let pcmContext: AudioContext | null = null;
  let pcmSource: MediaStreamAudioSourceNode | null = null;
  let pcmProcessor: ScriptProcessorNode | null = null;

  const hasConfiguredVoiceTranscription = (): boolean => {
    return Boolean(settings?.localVoiceEnabled);
  };

  if (!hasMediaRecorder && !canCaptureAudio) {
    btn.style.display = "none";
    return;
  }

  const ensureMicPermission = async (): Promise<boolean> => {
    if (!navigator.mediaDevices?.getUserMedia) return true;
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      stream.getTracks().forEach((track) => track.stop());
      return true;
    } catch (err) {
      const message = err instanceof Error ? err.message : "microphone access denied";
      showToast(`Mic unavailable: ${message}`, 2800);
      return false;
    }
  };

  const appendTranscript = (text: string): void => {
    const cleaned = text.trim();
    if (!cleaned) return;
    const input = $("composer-input") as HTMLTextAreaElement;
    const existing = input.value.trim();
    input.value = existing ? `${input.value.trimEnd()}\n${cleaned}` : cleaned;
    input.dispatchEvent(new Event("input"));
    input.focus();
  };

  const stopRecorderStream = (): void => {
    voiceMediaStream?.getTracks().forEach((track) => track.stop());
    voiceMediaStream = null;
  };

  const cleanupPcmRecorder = async (): Promise<void> => {
    try {
      pcmProcessor?.disconnect();
      pcmSource?.disconnect();
      if (pcmContext && pcmContext.state !== "closed") await pcmContext.close();
    } catch {
      // noop
    }
    pcmProcessor = null;
    pcmSource = null;
    pcmContext = null;
  };

  const stopPcmRecorderMode = async (): Promise<void> => {
    if (!pcmRecording) return;
    pcmRecording = false;
    voiceRecording = false;
    btn.classList.remove("recording");

    const sampleRate = Math.max(8000, Math.floor(pcmContext?.sampleRate ?? 16000));
    stopRecorderStream();
    await cleanupPcmRecorder();

    const wavBytes = encodePcm16Wav(pcmChunks, sampleRate);
    pcmChunks = [];
    if (wavBytes.byteLength <= 44) {
      showToast("No audio captured. Try again.", 2200);
      return;
    }

    try {
      showToast("Transcribing voice...", 1800);
      const text = await window.api.chat.transcribeAudio(wavBytes, "audio/wav");
      appendTranscript(text);
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      showToast(`Transcription failed: ${message}`, 3600);
    }
  };

  const startPcmRecorderMode = async (): Promise<void> => {
    if (!canCaptureAudio) {
      showToast("Recorder mode is not available on this runtime.", 2800);
      return;
    }
    if (!hasConfiguredVoiceTranscription()) {
      showToast("Voice transcription needs a cloud API key in Settings.", 3200);
      return;
    }

    const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    voiceMediaStream = stream;
    pcmChunks = [];
    pcmContext = new AudioContext();
    pcmSource = pcmContext.createMediaStreamSource(stream);
    pcmProcessor = pcmContext.createScriptProcessor(4096, 1, 1);
    pcmProcessor.onaudioprocess = (event: AudioProcessingEvent) => {
      if (!pcmRecording) return;
      const input = event.inputBuffer.getChannelData(0);
      pcmChunks.push(new Float32Array(input));
    };
    pcmSource.connect(pcmProcessor);
    pcmProcessor.connect(pcmContext.destination);
    pcmRecording = true;
    voiceRecording = true;
    btn.classList.add("recording");
    showToast("Recording... click mic again to stop.", 1800);
  };

  const startRecorderMode = async (): Promise<void> => {
    if (!hasConfiguredVoiceTranscription()) {
      showToast("Enable local voice in Settings first.", 3200);
      return;
    }

    if (hasMediaRecorder && canCaptureAudio) {
      const stream = await navigator.mediaDevices.getUserMedia({ audio: true });
      voiceMediaStream = stream;

      const mimeCandidates = [
        "audio/webm;codecs=opus",
        "audio/webm",
        "audio/ogg;codecs=opus",
        "audio/ogg"
      ];
      const selectedMime = mimeCandidates.find((candidate) => MediaRecorder.isTypeSupported(candidate));
      voiceMediaRecorder = selectedMime ? new MediaRecorder(stream, { mimeType: selectedMime }) : new MediaRecorder(stream);
      const chunks: Blob[] = [];

      voiceMediaRecorder.onstart = () => {
        voiceRecording = true;
        btn.classList.add("recording");
        showToast("Recording... click mic again to stop.", 1800);
      };

      voiceMediaRecorder.ondataavailable = (event: BlobEvent) => {
        if (event.data && event.data.size > 0) chunks.push(event.data);
      };

      voiceMediaRecorder.onerror = () => {
        voiceRecording = false;
        btn.classList.remove("recording");
        stopRecorderStream();
        voiceMediaRecorder = null;
        showToast("Audio recorder failed.", 2800);
      };

      voiceMediaRecorder.onstop = async () => {
        voiceRecording = false;
        btn.classList.remove("recording");
        stopRecorderStream();

        const recorderMime = voiceMediaRecorder?.mimeType || selectedMime || "audio/webm";
        voiceMediaRecorder = null;
        const blob = new Blob(chunks, { type: recorderMime });
        if (blob.size === 0) {
          showToast("No audio captured. Try again.", 2200);
          return;
        }

        try {
          showToast("Transcribing voice...", 1800);
          const bytes = new Uint8Array(await blob.arrayBuffer());
          const text = await window.api.chat.transcribeAudio(bytes, blob.type || recorderMime);
          appendTranscript(text);
        } catch (err) {
          const message = err instanceof Error ? err.message : "unknown error";
          showToast(`Transcription failed: ${message}`, 3600);
        }
      };

      voiceMediaRecorder.start();
      return;
    }

    await startPcmRecorderMode();
  };

  btn.addEventListener("click", async () => {
    try {
      if (voiceRecording) {
        if (voiceMediaRecorder && voiceMediaRecorder.state !== "inactive") {
          voiceMediaRecorder.stop();
          return;
        }
        if (pcmRecording) {
          await stopPcmRecorderMode();
          return;
        }
      }

      const ok = await ensureMicPermission();
      if (!ok) return;

      voiceRecorderMode = true;
      await startRecorderMode();
    } catch (err) {
      const message = err instanceof Error ? err.message : "unknown error";
      voiceRecording = false;
      btn.classList.remove("recording");
      showToast(`Voice input failed: ${message}`, 3200);
    }
  });
}
