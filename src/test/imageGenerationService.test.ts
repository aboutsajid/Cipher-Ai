import test from "node:test";
import assert from "node:assert/strict";
import { EventEmitter } from "node:events";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { ImageGenerationService } from "../main/services/imageGenerationService";
import { GeneratedImagesStore } from "../main/services/generatedImagesStore";
import type { Settings } from "../shared/types";

function createSettings(overrides: Partial<Settings> = {}) {
  const inferredCloudProvider = overrides.cloudProvider
    ?? ((overrides.baseUrl ?? "https://openrouter.ai/api/v1").includes("nvidia.com") ? "nvidia" : "openrouter");
  const settings: Settings = {
    apiKey: "sk-or-v1-secret",
    baseUrl: "https://openrouter.ai/api/v1",
    cloudProvider: inferredCloudProvider,
    imageProvider: overrides.imageProvider ?? inferredCloudProvider,
    defaultModel: "qwen/qwen3-coder-next",
    routerPort: 3456,
    models: ["qwen/qwen3-coder-next"],
    customTemplates: [],
    ollamaEnabled: false,
    ollamaBaseUrl: "http://localhost:11434/v1",
    ollamaModels: [],
    comfyuiBaseUrl: "http://127.0.0.1:8000",
    localVoiceEnabled: false,
    localVoiceModel: "base",
    mcpServers: [],
    routing: {
      default: "qwen/qwen3-coder-next",
      think: "deepseek/deepseek-v3.2",
      longContext: "google/gemini-2.5-flash-lite-preview-09-2025"
    },
    ...overrides
  };
  return { get: () => settings };
}

function createRuntime(fetchImpl: typeof fetch, overrides: Record<string, unknown> = {}): never {
  return {
    fetch: fetchImpl,
    spawn: () => {
      throw new Error("spawn should not be used in this test");
    },
    createWriteStream: () => {
      throw new Error("createWriteStream should not be used in this test");
    },
    access: async () => undefined,
    mkdir: async () => undefined,
    writeFile: async () => undefined,
    sleep: async () => undefined,
    ...overrides
  } as never;
}

test("ImageGenerationService rejects generation when no provider API key is configured", async () => {
  const service = new ImageGenerationService(createSettings({
    apiKey: ""
  }) as never);

  await assert.rejects(
    () => service.generate({ prompt: "A skyline at sunset" }),
    /No API key set/i
  );
});

test("ImageGenerationService parses generated image assets from chat completions", async () => {
  const service = new ImageGenerationService(
    createSettings() as never,
    undefined,
    createRuntime(async (_input, init) => {
      const headers = init?.headers as Record<string, string>;
      assert.equal(headers["Authorization"], "Bearer sk-or-v1-secret");
      return Response.json({
        choices: [
          {
            message: {
              content: "Here is your image.",
              images: [
                {
                  image_url: {
                    url: "data:image/png;base64,YWJj"
                  }
                }
              ]
            }
          }
        ]
      });
    })
  );

  const result = await service.generate({
    prompt: "A cinematic desert highway",
    model: "google/gemini-2.5-flash-image",
    aspectRatio: "16:9"
  });

  assert.equal(result.model, "google/gemini-2.5-flash-image");
  assert.equal(result.aspectRatio, "16:9");
  assert.equal(result.text, "Here is your image.");
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0]?.mimeType, "image/png");
  assert.equal(result.images[0]?.dataUrl, "data:image/png;base64,YWJj");
});

test("ImageGenerationService stores generated image history ids when a history store is available", async () => {
  const dir = await mkdtemp(join(tmpdir(), "cipher-image-service-test-"));
  const historyStore = new GeneratedImagesStore(dir);
  await historyStore.init();
  const service = new ImageGenerationService(
    createSettings() as never,
    historyStore,
    createRuntime(async () => Response.json({
      choices: [
        {
          message: {
            content: "Stored image.",
            images: [
              {
                image_url: {
                  url: "data:image/png;base64,YWJj"
                }
              }
            ]
          }
        }
      ]
    }))
  );

  try {
    const result = await service.generate({ prompt: "A neon alley" });
    assert.equal(typeof result.images[0]?.id, "string");
    assert.ok(result.images[0]?.id);

    const history = await service.listHistory();
    assert.equal(history.length, 1);
    assert.equal(history[0]?.id, result.images[0]?.id);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("ImageGenerationService sends NVIDIA image-generation requests to the hosted genai endpoint", async () => {
  const service = new ImageGenerationService(createSettings({
    baseUrl: "https://integrate.api.nvidia.com/v1",
    cloudProvider: "nvidia",
    apiKey: "nvapi-secret"
  }) as never, undefined, createRuntime(async (input, init) => {
    assert.equal(input, "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell");
    const headers = init?.headers as Record<string, string>;
    assert.equal(headers["Authorization"], "Bearer nvapi-secret");
    const body = JSON.parse(String(init?.body ?? "{}")) as {
      prompt?: string;
      width?: number;
      height?: number;
      steps?: number;
      cfg_scale?: number;
    };
    assert.equal(body.prompt, "A watercolor fox");
    assert.equal(body.width, 1344);
    assert.equal(body.height, 768);
    assert.equal(body.steps, 4);
    assert.equal(body.cfg_scale, 0);
    return Response.json({
      artifacts: [
        {
          base64: "YWJj",
          mime_type: "image/png"
        }
      ]
    });
  }));

  const result = await service.generate({
    prompt: "A watercolor fox",
    aspectRatio: "16:9"
  });

  assert.equal(result.model, "black-forest-labs/flux.1-schnell");
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0]?.dataUrl, "data:image/png;base64,YWJj");
  assert.match(result.text, /NVIDIA/i);
});

test("ImageGenerationService maps the new 2:1 aspect ratio to NVIDIA dimensions", async () => {
  const service = new ImageGenerationService(createSettings({
    baseUrl: "https://integrate.api.nvidia.com/v1",
    cloudProvider: "nvidia",
    apiKey: "nvapi-secret"
  }) as never, undefined, createRuntime(async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { width?: number; height?: number };
    assert.equal(body.width, 1408);
    assert.equal(body.height, 704);
    return Response.json({
      artifacts: [
        {
          base64: "YWJj",
          mime_type: "image/png"
        }
      ]
    });
  }));

  const result = await service.generate({
    prompt: "A panoramic city skyline",
    aspectRatio: "2:1"
  });

  assert.equal(result.aspectRatio, "2:1");
  assert.equal(result.images.length, 1);
});

test("ImageGenerationService normalizes stale non-NVIDIA image models to the NVIDIA default endpoint", async () => {
  const service = new ImageGenerationService(createSettings({
    baseUrl: "https://integrate.api.nvidia.com/v1",
    cloudProvider: "nvidia",
    apiKey: "nvapi-secret"
  }) as never, undefined, createRuntime(async (input, init) => {
    assert.equal(input, "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell");
    const body = JSON.parse(String(init?.body ?? "{}")) as { steps?: number; cfg_scale?: number };
    assert.equal(body.steps, 4);
    assert.equal(body.cfg_scale, 0);
    return Response.json({
      artifacts: [
        {
          base64: "YWJj",
          mime_type: "image/png"
        }
      ]
    });
  }));

  const result = await service.generate({
    prompt: "A cat",
    model: "google/gemini-2.5-flash-image",
    aspectRatio: "1:1"
  });

  assert.equal(result.model, "black-forest-labs/flux.1-schnell");
  assert.match(result.text, /flux\.1-schnell/i);
});

test("ImageGenerationService normalizes the legacy NVIDIA schnell alias to the current model id", async () => {
  const service = new ImageGenerationService(createSettings({
    baseUrl: "https://integrate.api.nvidia.com/v1",
    cloudProvider: "nvidia",
    apiKey: "nvapi-secret"
  }) as never, undefined, createRuntime(async (input) => {
    assert.equal(input, "https://ai.api.nvidia.com/v1/genai/black-forest-labs/flux.1-schnell");
    return Response.json({
      artifacts: [
        {
          base64: "YWJj",
          mime_type: "image/png"
        }
      ]
    });
  }));

  const result = await service.generate({
    prompt: "A cat",
    model: "black-forest-labs/flux_1-schnell",
    aspectRatio: "1:1"
  });

  assert.equal(result.model, "black-forest-labs/flux.1-schnell");
});

test("ImageGenerationService falls back to the OpenRouter default image model when given a NVIDIA-only image model id", async () => {
  const service = new ImageGenerationService(createSettings({
    baseUrl: "https://openrouter.ai/api/v1",
    cloudProvider: "openrouter",
    apiKey: "sk-or-v1-secret"
  }) as never, undefined, createRuntime(async (_input, init) => {
    const body = JSON.parse(String(init?.body ?? "{}")) as { model?: string };
    assert.equal(body.model, "google/gemini-2.5-flash-image");
    return Response.json({
      choices: [
        {
          message: {
            content: "Here is your image.",
            images: [
              {
                image_url: {
                  url: "data:image/png;base64,YWJj"
                }
              }
            ]
          }
        }
      ]
    });
  }));

  const result = await service.generate({
    prompt: "A cinematic desert highway",
    model: "black-forest-labs/flux.1-schnell",
    aspectRatio: "16:9"
  });

  assert.equal(result.model, "google/gemini-2.5-flash-image");
});

test("ImageGenerationService generates local images through ComfyUI without requiring a cloud API key", async () => {
  const service = new ImageGenerationService(createSettings({
    apiKey: "",
    imageProvider: "comfyui",
    comfyuiBaseUrl: "http://127.0.0.1:8000"
  }) as never, undefined, createRuntime(async (input, init) => {
    const url = String(input);
    if (url === "http://127.0.0.1:8000/system_stats") {
      return Response.json({ system: { comfyui_version: "0.3.67" } });
    }
    if (url === "http://127.0.0.1:8000/prompt") {
      const body = JSON.parse(String(init?.body ?? "{}")) as {
        prompt?: Record<string, { inputs?: Record<string, unknown> }>;
      };
      assert.equal(body.prompt?.["4"]?.inputs?.["ckpt_name"], "sd_xl_base_1.0.safetensors");
      assert.equal(body.prompt?.["5"]?.inputs?.["width"], 1024);
      assert.equal(body.prompt?.["5"]?.inputs?.["height"], 1024);
      assert.equal(body.prompt?.["6"]?.inputs?.["text"], "A studio portrait");
      return Response.json({ prompt_id: "job-123" });
    }
    if (url === "http://127.0.0.1:8000/history/job-123") {
      return Response.json({
        "job-123": {
          outputs: {
            "10": {
              images: [
                {
                  filename: "cipher_comfyui_00001_.png",
                  subfolder: "",
                  type: "output"
                }
              ]
            }
          },
          status: {
            completed: true,
            status_str: "success",
            messages: []
          }
        }
      });
    }
    if (url.startsWith("http://127.0.0.1:8000/view?")) {
      return new Response(Buffer.from("abc"), {
        headers: {
          "Content-Type": "image/png"
        }
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  }));

  const result = await service.generate({
    prompt: "A studio portrait",
    provider: "comfyui",
    model: "sd_xl_base_1.0.safetensors",
    aspectRatio: "1:1"
  });

  assert.equal(result.provider, "comfyui");
  assert.equal(result.model, "sd_xl_base_1.0.safetensors");
  assert.equal(result.images.length, 1);
  assert.equal(result.images[0]?.dataUrl, "data:image/png;base64,YWJj");
  assert.match(result.text, /ComfyUI/i);
});

test("ImageGenerationService surfaces detailed ComfyUI execution errors from history messages", async () => {
  const service = new ImageGenerationService(createSettings({
    apiKey: "",
    imageProvider: "comfyui",
    comfyuiBaseUrl: "http://127.0.0.1:8000"
  }) as never, undefined, createRuntime(async (input) => {
    const url = String(input);
    if (url === "http://127.0.0.1:8000/system_stats") {
      return Response.json({ system: { comfyui_version: "0.3.67" } });
    }
    if (url === "http://127.0.0.1:8000/prompt") {
      return Response.json({ prompt_id: "job-fail-123" });
    }
    if (url === "http://127.0.0.1:8000/history/job-fail-123") {
      return Response.json({
        "job-fail-123": {
          outputs: {},
          status: {
            completed: false,
            status_str: "error",
            messages: [
              ["execution_start", { prompt_id: "job-fail-123" }],
              ["execution_error", {
                node_id: "4",
                node_type: "CheckpointLoaderSimple",
                exception_message: "Could not find checkpoint named sd_xl_base_1.0.safetensors",
                current_inputs: {
                  ckpt_name: "sd_xl_base_1.0.safetensors"
                }
              }]
            ]
          }
        }
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  }));

  await assert.rejects(
    () => service.generate({
      prompt: "A failed local render",
      provider: "comfyui",
      model: "sd_xl_base_1.0.safetensors",
      aspectRatio: "1:1"
    }),
    /Could not find checkpoint named sd_xl_base_1\.0\.safetensors/i
  );
});

test("ImageGenerationService surfaces actionable guidance for ComfyUI stderr flush errno 22 failures", async () => {
  const service = new ImageGenerationService(createSettings({
    apiKey: "",
    imageProvider: "comfyui",
    comfyuiBaseUrl: "http://127.0.0.1:8000"
  }) as never, undefined, createRuntime(async (input) => {
    const url = String(input);
    if (url === "http://127.0.0.1:8000/system_stats") {
      return Response.json({ system: { comfyui_version: "0.3.67" } });
    }
    if (url === "http://127.0.0.1:8000/prompt") {
      return Response.json({ prompt_id: "job-fail-errno22" });
    }
    if (url === "http://127.0.0.1:8000/history/job-fail-errno22") {
      return Response.json({
        "job-fail-errno22": {
          outputs: {},
          status: {
            completed: false,
            status_str: "error",
            messages: [
              ["execution_start", { prompt_id: "job-fail-errno22" }],
              ["execution_error", {
                node_id: "8",
                node_type: "KSampler",
                exception_message: "[Errno 22] Invalid argument",
                traceback: [
                  "  File \"...\\custom_nodes\\ComfyUI-Manager\\prestartup_script.py\", line 368, in flush\n",
                  "    original_stderr.flush()\n"
                ]
              }]
            ]
          }
        }
      });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  }));

  await assert.rejects(
    () => service.generate({
      prompt: "A failed local render",
      provider: "comfyui",
      model: "sd_xl_base_1.0.safetensors",
      aspectRatio: "1:1"
    }),
    /restart ComfyUI with custom nodes disabled/i
  );
});

test("ImageGenerationService rejects truncated local ComfyUI checkpoints before workflow submission", async () => {
  let promptSubmitted = false;
  const service = new ImageGenerationService(createSettings({
    apiKey: "",
    imageProvider: "comfyui",
    comfyuiBaseUrl: "http://127.0.0.1:8000"
  }) as never, undefined, createRuntime(async (input) => {
    const url = String(input);
    if (url === "http://127.0.0.1:8000/system_stats") {
      return Response.json({ system: { comfyui_version: "0.3.67" } });
    }
    if (url === "http://127.0.0.1:8000/prompt") {
      promptSubmitted = true;
      return Response.json({ prompt_id: "job-should-not-run" });
    }
    throw new Error(`Unexpected fetch URL: ${url}`);
  }, {
    readSafetensorsHeader: async () => {
      const header = Buffer.from(
        "{\"tensor\":{\"data_offsets\":[0,6937675890]}}",
        "utf8"
      );
      return {
        fileSize: 2_643_111_038,
        headerLength: header.length,
        header
      };
    }
  }));

  await assert.rejects(
    () => service.generate({
      prompt: "A broken local checkpoint render",
      provider: "comfyui",
      model: "sd_xl_base_1.0.safetensors",
      aspectRatio: "1:1"
    }),
    /appears incomplete\/corrupt/i
  );
  assert.equal(promptSubmitted, false);
});

test("ImageGenerationService auto-starts local ComfyUI when the configured server is offline", async () => {
  let launched = false;
  const spawnCalls: Array<{ command: string; args: string[] }> = [];
  const writtenConfigs: Array<{ path: string; data: string }> = [];
  const sink = { on: () => sink, write: () => true, end: () => undefined } as never;
  const runtime = {
    fetch: async (input: string | URL, init?: RequestInit) => {
      const url = String(input);
      if (url.endsWith("/system_stats")) {
        if (!launched) throw new Error("offline");
        return Response.json({ system: { comfyui_version: "0.3.67" } });
      }
      if (url.endsWith("/prompt")) {
        const body = JSON.parse(String(init?.body ?? "{}")) as {
          prompt?: Record<string, { inputs?: Record<string, unknown> }>;
        };
        assert.equal(body.prompt?.["4"]?.inputs?.["ckpt_name"], "sd_xl_base_1.0.safetensors");
        return Response.json({ prompt_id: "job-456" });
      }
      if (url.endsWith("/history/job-456")) {
        return Response.json({
          "job-456": {
            outputs: {
              "10": {
                images: [
                  {
                    filename: "cipher_comfyui_00002_.png",
                    subfolder: "",
                    type: "output"
                  }
                ]
              }
            },
            status: {
              completed: true,
              status_str: "success",
              messages: []
            }
          }
        });
      }
      if (url.includes("/view?")) {
        return new Response(Buffer.from("xyz"), {
          headers: {
            "Content-Type": "image/png"
          }
        });
      }
      throw new Error(`Unexpected fetch URL: ${url}`);
    },
    spawn: (command: string, args: readonly string[]) => {
      spawnCalls.push({ command, args: [...args] });
      launched = true;
      const child = new EventEmitter() as EventEmitter & {
        stdout: { pipe: () => void };
        stderr: { pipe: () => void };
        unref: () => void;
      };
      child.stdout = { pipe: () => undefined };
      child.stderr = { pipe: () => undefined };
      child.unref = () => undefined;
      queueMicrotask(() => child.emit("spawn"));
      return child as never;
    },
    createWriteStream: () => sink,
    access: async () => undefined,
    mkdir: async () => undefined,
    writeFile: async (path: string, data: string) => {
      writtenConfigs.push({ path, data });
    },
    sleep: async () => undefined
  };
  const service = new ImageGenerationService(createSettings({
    apiKey: "",
    imageProvider: "comfyui",
    comfyuiBaseUrl: "http://127.0.0.1:8000"
  }) as never, undefined, runtime as never);

  const result = await service.generate({
    prompt: "A local render after auto start",
    provider: "comfyui",
    model: "sd_xl_base_1.0.safetensors",
    aspectRatio: "1:1"
  });

  assert.equal(spawnCalls.length, 1);
  assert.match(spawnCalls[0]?.command ?? "", /python\.exe$/i);
  assert.deepEqual(spawnCalls[0]?.args.slice(1, 3), ["--port", "8000"]);
  assert.ok(spawnCalls[0]?.args.includes("--disable-all-custom-nodes"));
  assert.ok(spawnCalls[0]?.args.includes("--extra-model-paths-config"));
  assert.ok(writtenConfigs.some((item) => item.path.endsWith("cipher-comfyui-extra-model-paths.yaml")));
  assert.ok(writtenConfigs.some((item) => /models\/comfyui/.test(item.data.replace(/\\/g, "/"))));
  assert.equal(result.images[0]?.dataUrl, "data:image/png;base64,eHl6");
});

test("ImageGenerationService fails clearly when no image assets are returned", async () => {
  const service = new ImageGenerationService(
    createSettings() as never,
    undefined,
    createRuntime(async () => Response.json({
      choices: [
        {
          message: {
            content: "No image generated."
          }
        }
      ]
    }))
  );

  await assert.rejects(
    () => service.generate({ prompt: "A floating city" }),
    /no generated image assets/i
  );
});
