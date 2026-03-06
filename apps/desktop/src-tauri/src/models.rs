use serde::{Deserialize, Serialize};

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Project {
    pub id: String,
    pub name: String,
    pub global_suffix: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Prompt {
    pub id: String,
    pub project_id: String,
    pub title: String,
    pub current_draft: String,
    pub current_version_id: Option<String>,
    pub starred: bool,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PromptVersion {
    pub id: String,
    pub prompt_id: String,
    pub raw_text: String,
    pub commit_message: Option<String>,
    pub operator: String,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DiffResult {
    pub from_version_id: String,
    pub to_version_id: String,
    pub unified: String,
    pub added: i64,
    pub removed: i64,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct Snippet {
    pub id: String,
    pub project_id: String,
    pub name: String,
    pub scope: String,
    pub content: String,
    pub tags: Vec<String>,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReferenceAsset {
    pub id: String,
    pub project_id: String,
    pub source_path: String,
    pub stored_path: String,
    pub file_hash: String,
    pub width: Option<i64>,
    pub height: Option<i64>,
    pub tags: Vec<String>,
    pub linked_prompt_version_id: Option<String>,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct CopyPayloadV1 {
    pub schema: String,
    pub project_id: String,
    pub prompt_id: String,
    pub prompt_version_id: String,
    pub copied_at: String,
    pub nonce: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AttributionCandidate {
    pub attribution_id: String,
    pub prompt_version_id: String,
    pub score: i64,
    pub reason: String,
    pub confirmed: bool,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct OutputAttributionResponse {
    pub output_id: String,
    pub output_path: String,
    pub candidates: Vec<AttributionCandidate>,
}

#[derive(Debug, Serialize, Deserialize, Clone, PartialEq)]
#[serde(rename_all = "snake_case")]
pub enum ProviderKind {
    OpenaiCompatible,
    Openai,
    Anthropic,
    Gemini,
}

impl ProviderKind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Self::OpenaiCompatible => "openai_compatible",
            Self::Openai => "openai",
            Self::Anthropic => "anthropic",
            Self::Gemini => "gemini",
        }
    }
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PromptGenerateResult {
    pub generated_text: String,
    pub provider_id: String,
    pub model: String,
    pub latency_ms: i64,
    pub run_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct RewriteCandidate {
    pub id: String,
    pub level: String,
    pub text: String,
    pub unified_diff: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PromptRewriteResult {
    pub candidates: Vec<RewriteCandidate>,
    pub provider_id: String,
    pub model: String,
    pub latency_ms: i64,
    pub run_id: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AIRunHistoryEntry {
    pub id: String,
    pub project_id: String,
    pub prompt_id: Option<String>,
    pub run_type: String,
    pub provider_id: String,
    pub model: String,
    pub status: String,
    pub error_message: Option<String>,
    pub latency_ms: i64,
    pub created_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct AIProvider {
    pub id: String,
    pub name: String,
    pub kind: ProviderKind,
    pub base_url: String,
    pub model: String,
    pub enabled: bool,
    pub secret_ref_id: String,
    pub created_at: String,
    pub updated_at: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ConnectionTestResult {
    pub ok: bool,
    pub latency_ms: i64,
    pub message: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ImageDimensionResult {
    pub dimension: String,
    pub core: String,
    pub detail: String,
    pub confidence: String,
}

#[derive(Debug, Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct MoodboardResult {
    pub common_style: String,
    pub variations: String,
}
