# Prompt Toolkit

A desktop app for AI artists to write, organize, version, and reuse prompts — for any image model.

**Local-first · Open source · Model-agnostic · No subscriptions**

---

## What Is This?

Most AI image platforms — Midjourney, Leonardo, Comfy, SD frontends — give you a text input and a generation history. A few now include prompt suggestion tools or AI-assisted fill. None of them treat your prompts as something worth managing long-term.

Prompt Toolkit is a standalone desktop app that fills that gap. It's a dedicated prompt workspace: version control for every prompt you write, a reusable fragment library organized by creative category, output attribution that links your generated images back to the exact text that produced them, and AI tools for generating and refining prompts from scratch.

Because it's separate from any specific platform, your library works everywhere. You write here, copy out, generate on whichever tool you're using today.

All data is local — SQLite on your machine. No account, no subscription, no platform lock-in.

---

## The Problem It Solves

**AI image platforms manage generations. Nobody manages prompts.**

Midjourney keeps a feed of your outputs. Leonardo has a history panel. Some platforms now have prompt assistants that autocomplete or suggest terms. These solve the generation side of the workflow. They don't solve the prompt side.

The questions that actually matter when you're doing serious creative work:

- *What exact text produced that image three months ago?*
- *I revised this prompt four times last week — which version actually worked better, and what changed?*
- *I've written "cinematic lighting, shallow depth of field, 35mm film grain" in twenty different prompts across five different tools. Where's the best version of that phrase, and why am I retyping it from memory every time?*
- *I'm starting a new character project with the same visual style as a previous one. How do I carry over what worked?*

Generation history is not version control. A feed of outputs is not an organized library. Platform-specific prompt suggestions don't survive the moment you switch tools.

The underlying problem: **prompt quality compounds over time — but only if you can learn from your history.** If your best work is buried in a Discord feed or spread across three platform dashboards, it's effectively lost. You rebuild from scratch on every project.

Prompt Toolkit is built on a different assumption: your prompts are the creative asset. They deserve the same rigor as any other professional text you produce.

- **Version history with diff** — every commit saved with a timestamp, every change visible line by line
- **Snippet library** — tested phrases and blocks organized by scope and tag, searchable and insertable across all your projects
- **Output attribution** — drop a generated image and the app finds which prompt version most likely produced it; confirm and it's permanently linked
- **Image and moodboard analysis** — reverse-engineer any image into structured prompt components across camera, lighting, color, texture, and mood
- **Model-agnostic** — the same library and workflow regardless of whether you're on Midjourney today, Flux tomorrow, or running local models

---

## Features

### Project and Prompt Management

Organize prompts into projects — one per campaign, character, style, or whatever makes sense for how you work. Inside each project, create as many individual prompts as you need. Rename them inline by clicking the name. Star the ones worth pinning to the top.

The main editor is Monaco (the same engine as VS Code). Your prompt is plain text — no required fields, no rigid structure.

### Version Control

Every time you click **Commit**, a version is saved with a timestamp. Open the **Versions** panel to see the full history. Click **Diff** on any version to see exactly what changed versus the previous one, as a unified diff. Click **Restore** to roll back the current draft to any earlier version.

### Snippet Library

A snippet is any prompt fragment you want to reuse — a phrase, a sentence, or a multi-line block. Each snippet has:
- A **scope**: `prefix` (used at the start of a prompt), `suffix` (used at the end), or `free` (insert anywhere)
- **Tags** from the shared taxonomy
- **Full-text search** across name, content, and tags

Find a snippet, click **Insert**, and it goes into the editor at the cursor position. Drag tag chips directly into the editor or into the Prompt Generator dimension fields.

### Tag Taxonomy

A shared tag system with built-in creative dimensions: Subject/Action, Camera/Lens, Lighting, Color Palette, Material/Texture, Composition, Style/Mood. Each category can be expanded or collapsed.

You can add your own tags to any category, create entirely new custom categories, and delete custom ones. Tags can be "pinned" to a specific project so they show up first when you filter by current project. The taxonomy is global — the same tags appear consistently in Snippets, References, and the Prompt Generator.

### Reference Images

Import images or videos as reference assets (style references, character sheets, pose guides, mood images, etc.). For each reference you can:
- Add and edit tags using the built-in tag set or your own
- Link it to the current prompt so you remember which references you were working from
- Filter the full reference list by tag or by "current prompt only"
- Click any thumbnail to open a full-size lightbox view

### Output Attribution

When you generate an image and want to save it, drop it into the **Outputs** panel (or click to pick the file). The app imports a copy and runs AI analysis to find which prompt in the project most likely produced it — matching against the content of your prompt versions. It shows you ranked candidates with confidence scores and reasons. Confirm the match, and that image is permanently linked to that prompt version. You can also link outputs to prompts manually.

Outputs linked to the current prompt are shown at the top of the panel. Unlinked outputs appear in a separate section with a dropdown to assign them.

### Prompt Generator

Open the **Prompt Generator** tool (icon in the right activity bar). Describe what you want in the brief field. Optionally fill in specific dimension fields (subject, camera, lighting, color, texture, composition, mood) for the parts you care about most. Tag chips from your library can be dragged directly into any dimension field. Click **Generate** and the AI produces a complete prompt. Send it to the editor and keep editing from there.

The generator can be "bound" to a line in the editor — type in that line and the brief field syncs automatically, so you can iterate directly from within the editor.

### AI Rewrite

Select any text in the editor and a floating bubble appears. Submit it for a rewrite and get three candidates:
- **Conservative** — small, targeted adjustments
- **Balanced** — meaningful improvements while keeping your intent
- **Aggressive** — significant rework

Each candidate shows a diff of the proposed changes. Click **Apply** to replace the selected text with that version.

### Image Analyzer

Open the **Image Analyzer** tool. Drop an image or click to pick one. The AI analyzes it across all creative dimensions and returns structured results: Subject/Action, Camera/Lens, Lighting, Color Palette, Material/Texture, Composition, Style/Mood. Each dimension has a core description and an expanded detail view.

Results can be:
- Sent individually to the main editor
- Saved as snippets (one dimension at a time, or all checked dimensions at once)

### Moodboard Analyzer

Open the **Moodboard** tool. Drop multiple images (or add them one by one). The AI looks at all of them and identifies a shared style — what they have in common aesthetically. You can edit the result before saving. Save it as a suffix snippet, or set it as the **global suffix** for the entire current project (automatically appended to every prompt in that project).

### AI Provider Management

Open **AI Settings** (icon in the right activity bar). Connect your own AI backends:

| Provider | What it's for |
|----------|--------------|
| **Anthropic** | Claude models — text generation, rewrite, prompt generation |
| **OpenAI** | GPT models — same use cases |
| **Google Gemini** | Gemini models — text and vision |
| **Local / Custom** | Ollama, LM Studio, or any OpenAI-compatible endpoint on your machine |

For each provider you enter an API key (or base URL for local models), the app fetches the model list, and you pick a model. Test the connection before saving. Set separate defaults for **Text** tasks (rewrite, generate) and **VLM** tasks (image analysis, attribution) — these can be different providers.

### Light and Dark Mode

Toggle between light and dark themes using the button at the bottom of the left panel. The preference is saved and applied immediately on next launch.

---

## How to Use It — A Typical Workflow

1. **Create a project** in the left panel for whatever you're working on
2. **Create a prompt** inside the project and write your starting text
3. **Commit** when you have a version worth keeping
4. **Copy** the prompt text and paste it into your image generation tool
5. If the result is good, **drop the image** into the Outputs panel and confirm the attribution
6. If you want to refine, come back, **edit the prompt**, commit again, and repeat
7. As you work, **save reusable fragments** as snippets so you can pull them into future prompts

Over time you build a library of tested prompt components. The version history shows you exactly how your thinking evolved on any given prompt.

---

## Interface Layout

```
┌──────────────┬────────────────────────────────┬───┬──────────────┐
│  Left Panel  │         Center Editor          │   │ Right Panel  │
│              │                                │   │              │
│  Projects    │  (or: Prompt Generator,        │ ← │  Versions    │
│  Prompts     │   Image Analyzer,              │   │  Snippets    │
│              │   Moodboard,                   │   │  References  │
│              │   AI Settings)                 │   │  Outputs     │
└──────────────┴────────────────────────────────┴───┴──────────────┘
```

The left panel and right panel are resizable by dragging the dividers. The right panel is opened and closed by the icon bar on the far right edge.

---

## Setup and Installation

### Requirements

- **Windows** (current release target)
- **Node.js 22 LTS**
- **pnpm 10+**
- **Rust stable** — install from [rustup.rs](https://rustup.rs)

### Run from source

```bash
git clone <repo-url>
cd PromptToolKit

corepack enable
corepack pnpm install
corepack pnpm tauri:dev
```

The app opens as a native desktop window.

### Build for distribution

```bash
corepack pnpm tauri:build
```

### Other dev commands

```bash
pnpm dev          # frontend only (no Tauri window)
pnpm build        # frontend build
pnpm lint         # TypeScript type check
```

---

## Common Questions

**Does it work without an AI provider?**
Yes. Project management, prompt editing, version history, snippets, references, and output linking all work without any AI configured. You only need an API key for: Prompt Generator, AI Rewrite, Image Analyzer, Moodboard Analyzer, and Output auto-attribution.

**Which image models does it work with?**
All of them. Prompt Toolkit is model-agnostic — it stores and manages text. Paste the prompt wherever you generate images.

**Where is my data stored?**
A SQLite database and an assets folder on your local machine. Nothing is sent anywhere unless you explicitly use an AI feature, and even then only the content of that specific request goes to the provider you configured.

**Can I use a local model instead of paying for an API?**
Yes. Add a "Local / Custom" provider and set the base URL of your local server (e.g. `http://localhost:11434` for Ollama). The app loads whatever models are installed.

**Can I use different AI models for text vs. image analysis?**
Yes. You set a default **Text** provider and a default **VLM** (vision-language model) provider separately. The right tool for each job.

---

## Tech Stack

| Layer | Technology |
|-------|-----------|
| Desktop runtime | Tauri 2 + Rust |
| Frontend | React 19 + TypeScript + Vite |
| Editor | Monaco Editor |
| State management | Zustand + TanStack Query |
| Database | SQLite (WAL mode) via Drizzle ORM |
| Styling | CSS custom properties — full light/dark theme |

---

## License

Open source. See `LICENSE` for details.
