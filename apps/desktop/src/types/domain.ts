export type Scope = "prefix" | "suffix" | "free";

export interface Project {
  id: string;
  name: string;
  globalSuffix: string;
  createdAt: string;
  updatedAt: string;
}

export interface Prompt {
  id: string;
  projectId: string;
  title: string;
  currentDraft: string;
  currentVersionId: string | null;
  starred: boolean;
  createdAt: string;
  updatedAt: string;
}

export interface PromptVersion {
  id: string;
  promptId: string;
  rawText: string;
  commitMessage: string | null;
  operator: string;
  createdAt: string;
}

export interface DiffResult {
  fromVersionId: string;
  toVersionId: string;
  unified: string;
  added: number;
  removed: number;
}

export interface Snippet {
  id: string;
  projectId: string;
  name: string;
  scope: Scope;
  content: string;
  tags: string[];
  createdAt: string;
  updatedAt: string;
}

export interface ReferenceAsset {
  id: string;
  projectId: string;
  sourcePath: string;
  storedPath: string;
  fileHash: string;
  width: number | null;
  height: number | null;
  tags: string[];
  linkedPromptVersionId: string | null;
  createdAt: string;
}

export interface CopyPayloadV1 {
  schema: "ptk.copy.v1";
  projectId: string;
  promptId: string;
  promptVersionId: string;
  copiedAt: string;
  nonce: string;
}

export interface AttributionCandidate {
  attributionId: string;
  promptVersionId: string;
  score: number;
  reason: string;
  confirmed: boolean;
}

export interface OutputAttributionResponse {
  outputId: string;
  outputPath: string;
  candidates: AttributionCandidate[];
}

export type ProviderKind =
  | "openai_compatible"
  | "openai"
  | "anthropic"
  | "gemini";

export interface AIProvider {
  id: string;
  name: string;
  kind: ProviderKind;
  baseUrl: string;
  model: string;
  enabled: boolean;
  secretRefId: string;
  createdAt: string;
  updatedAt: string;
}

export interface ConnectionTestResult {
  ok: boolean;
  latencyMs: number;
  message: string;
}

export interface PromptGenerateInput {
  projectId: string;
  brief: string;
  /** Dimension hints from the guided UI. Value is user text or null if skipped. */
  dimensions?: Record<string, string | null>;
  providerIdOverride?: string | null;
  promptId?: string | null;
}

export interface PromptGenerateResult {
  generatedText: string;
  providerId: string;
  model: string;
  latencyMs: number;
  runId: string;
}

export interface RewriteCandidate {
  id: string;
  level: "conservative" | "balanced" | "aggressive" | string;
  text: string;
  unifiedDiff: string;
}

export interface PromptRewriteInput {
  projectId: string;
  promptText: string;
  /** If set, only rewrite this selection; fullPromptText provides context. */
  selectionText?: string | null;
  instruction: string;
  preserveVoice: boolean;
  providerIdOverride?: string | null;
  promptId?: string | null;
}

export interface PromptRewriteResult {
  candidates: RewriteCandidate[];
  providerId: string;
  model: string;
  latencyMs: number;
  runId: string;
}

export interface ImageDimensionResult {
  dimension: string;
  core: string;
  detail: string;
  confidence: "high" | "medium" | "low" | string;
}

export interface MoodboardResult {
  commonStyle: string;
  variations: string;
}

export interface AIRunHistoryEntry {
  id: string;
  projectId: string;
  promptId: string | null;
  runType: "generate" | "rewrite" | string;
  providerId: string;
  model: string;
  status: "ok" | "error" | string;
  errorMessage: string | null;
  latencyMs: number;
  createdAt: string;
}
