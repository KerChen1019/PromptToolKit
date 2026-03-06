# Prompt Toolkit

Open-source prompt engineering and prompt asset management for AI artists and creative teams.

Prompt Toolkit does not try to replace image models. It turns prompts from one-off input text into reusable, versioned creative assets.

## What It Is

Prompt Toolkit is a local-first desktop application for creating, editing, versioning, reusing, and attributing prompts.

- Model-agnostic and platform-agnostic
- Natural-language-first workflow (not rigid form-only authoring)
- Focused on prompt quality, iteration, reuse, and traceability

## Problems It Solves

- Repetitive writing of style/camera/lighting fragments
- Version chaos (`final_v3_final2` style files with no real change history)
- Poor reuse of high-value prompt fragments and references
- Broken attribution when results are produced outside the app
- Slow comparison loops without stable diff and rollback workflows

## Why Use It

- Faster creative iteration through snippet reuse and structured prompt management
- Higher quality edits through version history, diff, and restore
- Better traceability through copy payload + pasteback attribution
- Full provider freedom with user-managed AI backends

## Feature Set (Current Implementation)

### 1. Prompt Project Management + Prompt Generator

#### 1.1 Project and Prompt Management

- Project CRUD: create, list, update, delete
- Prompt CRUD flow: create, save draft, commit version, restore version
- Left navigation tree grouped by project
- Prompt starring + "starred only" filter
- Monaco-based central editor

#### 1.2 Tag System (User-Defined + Canonical)

- Users can define custom tags freely
- Canonical cross-module tags are supported for consistent retrieval:
  - `subject-action`
  - `camera-lens`
  - `lighting`
  - `color-palette`
  - `material-texture`
  - `composition`
  - `style-mood`
- Snippets panel supports tag filtering and keyword search

#### 1.3 Prompt Generator Logic

- Step 1: free-form brief input
- Step 2: optional dimensions (subject/action, camera/lens, lighting, color, material/texture, composition, style/mood)
- Drag-and-drop interaction:
  - Drag tags from the right-side tag rail (Snippets panel)
  - Drop onto any dimension field in Prompt Generator
  - Matching snippet contents are injected into the target dimension field
- AI-generated final prompt output
- `Send to Editor` writes generated text back into the main editor

### 2. Image Analysis Features

#### 2.1 Single-Image Reverse Engineering

- Drag/drop or pick one image for analysis
- Structured outputs per dimension (e.g. Subject/Action, Camera/Lens, Lighting, Color Palette, Material/Texture, Composition, Style/Mood)
- Each dimension returns:
  - `core`
  - `detail`
  - `confidence`
- Results can be:
  - inserted into the editor
  - saved to snippets (single-dimension or batch)

#### 2.2 Moodboard Multi-Image Analysis

- Import multiple images (drag/drop or file picker)
- Returns:
  - `common style`
  - `variations`
- Output can be:
  - saved as a `suffix` snippet
  - set as project-level global suffix

#### 2.3 Tag Assignment and Custom Authoring

- Users can assign, edit, and extend tags
- Reference assets support editable tags and tag-based filtering
- Snippets support tag-based classification, search, and drag reuse

#### 2.4 Related Implemented Capabilities

- Prompt Rewrite:
  - full-text or selection rewrite
  - 3 candidates (`conservative`, `balanced`, `aggressive`)
  - unified diff preview
  - manual apply
- Version control:
  - version list
  - diff
  - restore
- Copy/pasteback attribution:
  - hidden payload on copy
  - attribution candidates on output import
  - explicit confirmation flow
- AI Provider management:
  - OpenAI-compatible / OpenAI / Anthropic / Gemini
  - connection tests
  - default provider
  - run history tracking

## Market Context: Character Consistency Technology Status

Character consistency is still a core challenge in AI image generation. As of early 2026, model capabilities have improved, but key gaps remain.

Progress already visible:

- Qwen Image Edit 2511: relatively stable facial identity in single-portrait edits
- Nano Banana (Gemini 2.5 Flash): supports up to 14 inputs and 5-person consistency
- Midjourney `--cref`: reference-image-based character consistency

Still unresolved in practice:

- Fine-detail consistency (freckles, tattoos, logos) across scenes
- Identity drift in multi-character compositions
- Long-sequence drift (often noticeable after ~8-12 frames)
- Significant instability under extreme pose and camera-angle shifts

Why this matters for Prompt Toolkit:

- The harder consistency is, the more prompt discipline matters
- Well-maintained prompt text is still a primary control layer against drift
- Prompt Toolkit complements model improvements by making prompt workflows systematic and repeatable

---

## Getting Started

### Requirements

- Node.js 22 LTS
- pnpm 10+
- Rust stable (for Tauri desktop runtime)
- Windows (current release target)

### Install and Run

```bash
corepack enable
corepack pnpm install
corepack pnpm tauri:dev
```

### Quick Checks

```bash
corepack pnpm lint
corepack pnpm build
```

---

## Tech Stack

- Tauri 2 + Rust
- React + TypeScript + Vite
- Zustand + TanStack Query
- Monaco Editor + Monaco Diff
- SQLite (WAL)

---

## Workspace Scripts

From root `package.json`:

- `pnpm dev` - run frontend dev server
- `pnpm tauri:dev` - run desktop app in dev mode
- `pnpm build` - frontend build
- `pnpm tauri:build` - desktop package build
- `pnpm lint` - TypeScript type check
- `pnpm test` - test entrypoint (frontend test suite not fully wired yet)

---

## Public Tauri Commands

- `project.create/list/update/delete`
- `prompt.create/listByProject/toggleStar/saveDraft/commitVersion/listVersions/restoreVersion/diffVersions`
- `prompt.generateFromBrief/rewriteCandidates`
- `snippet.create/list/update/delete/insertPreview`
- `reference.import/list/tag/linkToPromptVersion`
- `clipboard.copyWithPayload`
- `output.pasteImportAndAutoAttribution/confirmAttribution`
- `ai.provider.create/list/update/delete/testConnection`
- `ai.defaultProvider.get/set`
- `aiRun.history.list`
- `vision.imageAnalyze/moodboardAnalyze/providerFetchModels`
