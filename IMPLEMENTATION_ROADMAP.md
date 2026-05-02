# Cipher Ai Implementation Roadmap

Last updated: 2026-04-15

## Purpose

This file is a recall note for future sessions in case work gets interrupted.

## Top 3 Priority Features

### 1) Multi-Provider Support

Add support for:
- OpenRouter
- Ollama
- NVIDIA

Why first:
- Highest ROI
- Improves model choice, cost control, and reliability
- Fits the current app structure best

Main work areas:
- `src/renderer/app.ts`
- `src/renderer/index.html`
- `src/main/services/ccrService.ts`
- `src/main/chatRuntimeSupport.ts`
- `src/shared/types.ts`

Expected tasks:
- Add a new `nvidia` provider mode
- Make API key validation provider-aware
- Make base URL handling provider-aware
- Allow NVIDIA chat models in cloud routing
- Keep Ollama local flow unchanged

### 2) Better Agent Routing

Goal:
- Route tasks to the best model automatically

Why second:
- Makes the agent feel smarter without changing the core UX too much
- Builds on top of multi-provider support

Main work areas:
- `src/main/services/agentTaskRunner.ts`
- `src/shared/modelCatalog.ts`
- `src/renderer/app.ts`

Expected tasks:
- Prefer long-context models for planning
- Prefer coder models for implementation and repair
- Prefer vision-capable models when image input exists
- Improve route health and fallback behavior

### 3) Image Generation

Goal:
- Add image generation as a first-class feature inside the app

Why third:
- Valuable feature, but not as important as provider support and routing
- Needs dedicated UI and API flow

Recommended order:
- Hosted image generation first
- Local image generation later

Main work areas:
- `src/renderer/app.ts`
- `src/renderer/index.html`
- `src/main/services/`
- `src/shared/types.ts`

Expected tasks:
- Add a `Generate Image` action/button
- Create a dedicated image-generation service
- Render generated images in chat/workspace
- Add save/export support
- Later: support local backends or downloadable image models

## Recommended Build Order

### Phase 1 - NVIDIA Chat Provider
- Add NVIDIA provider mode
- Remove OpenRouter-only key assumptions
- Support NVIDIA base URL and model selection
- Verify normal chat works

### Phase 2 - Agent Routing Upgrade
- Update route scoring and model selection
- Use provider/model capability hints
- Improve fallback behavior

### Phase 3 - Image Generation
- Add hosted image generation
- Add image output rendering
- Add local image-gen support later if needed

## Resume Checklist

When resuming work, continue in this order:

1. Finish `Phase 1 - NVIDIA Chat Provider`
2. Then do `Phase 2 - Agent Routing Upgrade`
3. Then do `Phase 3 - Image Generation`

## Resume Prompt

If a future session needs context, use this summary:

> Resume Cipher Ai roadmap from `IMPLEMENTATION_ROADMAP.md`. Start with Phase 1: add NVIDIA as a cloud provider, make API key/base URL handling provider-aware, then continue to agent routing improvements and image generation.
