import { invoke } from "@tauri-apps/api/core";
import type {
  AIRunHistoryEntry,
  AIProvider,
  AttributionCandidate,
  ConnectionTestResult,
  DiffResult,
  ImageDimensionResult,
  MoodboardResult,
  OutputAttributionResponse,
  Project,
  Prompt,
  PromptGenerateInput,
  PromptGenerateResult,
  PromptRewriteInput,
  PromptRewriteResult,
  PromptVersion,
  ReferenceAsset,
  Scope,
  Snippet,
} from "../types/domain";

const command = {
  project: {
    create: "project_create",
    list: "project_list",
    update: "project_update",
    delete: "project_delete",
  },
  prompt: {
    create: "prompt_create",
    toggleStar: "prompt_toggle_star",
    saveDraft: "prompt_save_draft",
    commitVersion: "prompt_commit_version",
    restoreVersion: "prompt_restore_version",
    listByProject: "prompt_list_by_project",
    listVersions: "prompt_list_versions",
    diffVersions: "prompt_diff_versions",
    generateFromBrief: "prompt_generate_from_brief",
    rewriteCandidates: "prompt_rewrite_candidates",
  },
  snippet: {
    create: "snippet_create",
    list: "snippet_list",
    update: "snippet_update",
    delete: "snippet_delete",
    insertPreview: "snippet_insert_preview",
  },
  reference: {
    import: "reference_import",
    list: "reference_list",
    tag: "reference_tag",
    linkToPromptVersion: "reference_link_to_prompt_version",
  },
  clipboard: {
    copyWithPayload: "clipboard_copy_with_payload",
  },
  output: {
    pasteImportAndAutoAttribution: "output_paste_import_and_auto_attribution",
    confirmAttribution: "output_confirm_attribution",
  },
  ai: {
    providerCreate: "ai_provider_create",
    providerList: "ai_provider_list",
    providerUpdate: "ai_provider_update",
    providerDelete: "ai_provider_delete",
    providerTestConnection: "ai_provider_test_connection",
    defaultProviderGet: "ai_default_provider_get",
    defaultProviderSet: "ai_default_provider_set",
    providerFetchModels: "ai_provider_fetch_models",
  },
  vision: {
    imageAnalyze: "image_analyze",
    moodboardAnalyze: "moodboard_analyze",
  },
  aiRun: {
    list: "ai_run_history_list",
  },
};

export async function createProject(name: string): Promise<Project> {
  return invoke<Project>(command.project.create, { name });
}

export async function listProjects(): Promise<Project[]> {
  return invoke<Project[]>(command.project.list);
}

export async function updateProject(
  id: string,
  name: string,
  globalSuffix: string,
): Promise<Project> {
  return invoke<Project>(command.project.update, { id, name, globalSuffix });
}

export async function deleteProject(id: string): Promise<void> {
  return invoke<void>(command.project.delete, { id });
}

export async function createPrompt(
  projectId: string,
  title: string,
  draft: string,
): Promise<Prompt> {
  return invoke<Prompt>(command.prompt.create, { projectId, title, draft });
}

export async function listPromptsByProject(projectId: string): Promise<Prompt[]> {
  return invoke<Prompt[]>(command.prompt.listByProject, { projectId });
}

export async function togglePromptStar(promptId: string): Promise<Prompt> {
  return invoke<Prompt>(command.prompt.toggleStar, { promptId });
}

export async function savePromptDraft(
  promptId: string,
  draft: string,
): Promise<Prompt> {
  return invoke<Prompt>(command.prompt.saveDraft, { promptId, draft });
}

export async function commitPromptVersion(
  promptId: string,
  rawText: string,
  commitMessage: string | null,
  operator: string,
): Promise<PromptVersion> {
  return invoke<PromptVersion>(command.prompt.commitVersion, {
    promptId,
    rawText,
    commitMessage,
    operator,
  });
}

export async function restorePromptVersion(
  promptId: string,
  versionId: string,
): Promise<Prompt> {
  return invoke<Prompt>(command.prompt.restoreVersion, { promptId, versionId });
}

export async function listPromptVersions(promptId: string): Promise<PromptVersion[]> {
  return invoke<PromptVersion[]>(command.prompt.listVersions, { promptId });
}

export async function diffPromptVersions(
  fromVersionId: string,
  toVersionId: string,
): Promise<DiffResult> {
  return invoke<DiffResult>(command.prompt.diffVersions, {
    fromVersionId,
    toVersionId,
  });
}

export async function createSnippet(
  projectId: string,
  name: string,
  scope: Scope,
  content: string,
  tags: string[],
): Promise<Snippet> {
  return invoke<Snippet>(command.snippet.create, {
    projectId,
    name,
    scope,
    content,
    tags,
  });
}

export async function listSnippets(projectId: string): Promise<Snippet[]> {
  return invoke<Snippet[]>(command.snippet.list, { projectId });
}

export async function updateSnippet(
  id: string,
  name: string,
  scope: Scope,
  content: string,
  tags: string[],
): Promise<Snippet> {
  return invoke<Snippet>(command.snippet.update, {
    id,
    name,
    scope,
    content,
    tags,
  });
}

export async function deleteSnippet(id: string): Promise<void> {
  return invoke<void>(command.snippet.delete, { id });
}

export async function insertSnippetPreview(
  projectId: string,
  editorText: string,
  freeSegments: string[],
): Promise<string> {
  return invoke<string>(command.snippet.insertPreview, {
    projectId,
    editorText,
    freeSegments,
  });
}

export async function importReference(
  projectId: string,
  sourcePath: string,
): Promise<ReferenceAsset> {
  return invoke<ReferenceAsset>(command.reference.import, {
    projectId,
    sourcePath,
  });
}

export async function listReferences(
  projectId: string,
  tagFilter: string | null,
): Promise<ReferenceAsset[]> {
  return invoke<ReferenceAsset[]>(command.reference.list, {
    projectId,
    tagFilter,
  });
}

export async function tagReference(assetId: string, tags: string[]): Promise<ReferenceAsset> {
  return invoke<ReferenceAsset>(command.reference.tag, { assetId, tags });
}

export async function linkReferenceToPromptVersion(
  assetId: string,
  promptVersionId: string,
): Promise<void> {
  return invoke<void>(command.reference.linkToPromptVersion, {
    assetId,
    promptVersionId,
  });
}

export async function copyWithPayload(input: {
  projectId: string;
  promptId: string;
  promptVersionId: string;
  promptText: string;
}): Promise<string> {
  return invoke<string>(command.clipboard.copyWithPayload, input);
}

export async function pasteImportAndAutoAttribution(input: {
  projectId: string;
  sourceImagePath: string;
  clipboardText: string | null;
  modelHint: string | null;
}): Promise<OutputAttributionResponse> {
  return invoke<OutputAttributionResponse>(
    command.output.pasteImportAndAutoAttribution,
    input,
  );
}

export async function confirmAttribution(
  outputId: string,
  attributionId: string,
): Promise<AttributionCandidate[]> {
  return invoke<AttributionCandidate[]>(command.output.confirmAttribution, {
    outputId,
    attributionId,
  });
}

export async function createAIProvider(input: {
  name: string;
  kind: "openai_compatible" | "openai" | "anthropic" | "gemini";
  baseUrl: string;
  model: string;
  enabled: boolean;
  apiKey: string;
}): Promise<AIProvider> {
  return invoke<AIProvider>(command.ai.providerCreate, input);
}

export async function listAIProviders(): Promise<AIProvider[]> {
  return invoke<AIProvider[]>(command.ai.providerList);
}

export async function updateAIProvider(input: {
  id: string;
  name: string;
  kind: "openai_compatible" | "openai" | "anthropic" | "gemini";
  baseUrl: string;
  model: string;
  enabled: boolean;
  apiKey?: string | null;
}): Promise<AIProvider> {
  return invoke<AIProvider>(command.ai.providerUpdate, input);
}

export async function deleteAIProvider(id: string): Promise<void> {
  return invoke<void>(command.ai.providerDelete, { id });
}

export async function testAIProviderConnection(id: string): Promise<ConnectionTestResult> {
  return invoke<ConnectionTestResult>(command.ai.providerTestConnection, { id });
}

export async function getDefaultAIProviderId(): Promise<string | null> {
  return invoke<string | null>(command.ai.defaultProviderGet);
}

export async function setDefaultAIProviderId(
  providerId: string | null,
): Promise<void> {
  return invoke<void>(command.ai.defaultProviderSet, { providerId });
}

export async function generatePromptFromBrief(
  input: PromptGenerateInput,
): Promise<PromptGenerateResult> {
  return invoke<PromptGenerateResult>(
    command.prompt.generateFromBrief,
    input as unknown as Record<string, unknown>,
  );
}

export async function rewritePromptCandidates(
  input: PromptRewriteInput,
): Promise<PromptRewriteResult> {
  return invoke<PromptRewriteResult>(
    command.prompt.rewriteCandidates,
    input as unknown as Record<string, unknown>,
  );
}

export async function listAiRunHistory(
  projectId: string,
  runType?: "generate" | "rewrite" | null,
): Promise<AIRunHistoryEntry[]> {
  return invoke<AIRunHistoryEntry[]>(command.aiRun.list, {
    projectId,
    runType: runType ?? null,
  });
}

export async function fetchAIProviderModels(input: {
  kind: string;
  apiKey: string;
  baseUrl?: string | null;
}): Promise<string[]> {
  return invoke<string[]>(command.ai.providerFetchModels, input);
}

export async function analyzeImage(input: {
  imagePath: string;
  providerIdOverride: string | null;
}): Promise<ImageDimensionResult[]> {
  return invoke<ImageDimensionResult[]>(command.vision.imageAnalyze, input);
}

export async function analyzeMoodboard(input: {
  imagePaths: string[];
  providerIdOverride: string | null;
}): Promise<MoodboardResult> {
  return invoke<MoodboardResult>(command.vision.moodboardAnalyze, input);
}
