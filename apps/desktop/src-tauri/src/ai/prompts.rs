use crate::{error::AppResult, models::RewriteCandidate, repo::id};
use similar::TextDiff;

const GENERATE_SYSTEM_PROMPT: &str = "You are a prompt engineer for image generation. Convert user brief into one concise, high-quality natural-language prompt. Avoid boilerplate hype words and keep semantic clarity.";

/// `dimensions`: key = dimension name (e.g. "lighting"), value = Some(text) if user provided,
/// None if user skipped (AI may be generic for that dimension).
pub fn build_generate_prompts(
    brief: &str,
    dimensions: &std::collections::HashMap<String, Option<String>>,
) -> (String, String) {
    let mut specified = String::new();
    for (dim, val) in dimensions {
        if let Some(v) = val {
            if !v.trim().is_empty() {
                specified.push_str(&format!("- {dim}: {v}\n"));
            }
        }
    }

    let user = if specified.is_empty() {
        format!("User brief:\n{brief}\n\nReturn only the final prompt text.")
    } else {
        format!(
            "User brief:\n{brief}\n\nDimensions the user specified (strictly follow these):\n{specified}\nReturn only the final prompt text as natural language."
        )
    };

    (GENERATE_SYSTEM_PROMPT.to_string(), user)
}

/// `selection_text`: if Some, only rewrite the selected portion (using `prompt_text` as context).
/// If None, rewrite the entire `prompt_text`.
pub fn build_rewrite_prompts(
    prompt_text: &str,
    selection_text: Option<&str>,
    instruction: &str,
    preserve_voice: bool,
) -> (String, String) {
    let mode = if preserve_voice {
        "Preserve voice: keep sentence rhythm and original style. Do minimal edits."
    } else {
        "Enhance mode: may reorganize and enrich wording while keeping intent."
    };
    let system = "You are a prompt rewriting assistant. Return strict JSON only.";

    let user = match selection_text {
        Some(sel) => format!(
            "Full prompt context (read-only, do NOT rewrite):\n{prompt_text}\n\nSelected text to rewrite:\n{sel}\n\nInstruction:\n{instruction}\n\n{mode}\n\nReturn JSON with the 3 rewritten versions of the SELECTED TEXT only:\n{{\"candidates\":[{{\"level\":\"conservative\",\"text\":\"...\"}},{{\"level\":\"balanced\",\"text\":\"...\"}},{{\"level\":\"aggressive\",\"text\":\"...\"}}]}}\nNo markdown, no extra keys."
        ),
        None => format!(
            "Prompt to rewrite:\n{prompt_text}\n\nInstruction:\n{instruction}\n\n{mode}\n\nReturn JSON schema exactly:\n{{\"candidates\":[{{\"level\":\"conservative\",\"text\":\"...\"}},{{\"level\":\"balanced\",\"text\":\"...\"}},{{\"level\":\"aggressive\",\"text\":\"...\"}}]}}\nNo markdown, no extra keys."
        ),
    };
    (system.to_string(), user)
}

pub fn parse_rewrite_candidates(raw: &str, original: &str) -> AppResult<Vec<RewriteCandidate>> {
    let parsed_value = serde_json::from_str::<serde_json::Value>(raw)
        .or_else(|_| serde_json::from_str::<serde_json::Value>(&extract_json_block(raw).unwrap_or_default()))
        .map_err(|e| crate::error::AppError::BadRequest(format!("rewrite JSON parse failed: {e}")))?;

    let candidates = parsed_value
        .get("candidates")
        .and_then(|v| v.as_array())
        .ok_or_else(|| crate::error::AppError::BadRequest("missing candidates array".to_string()))?;

    let mut out = Vec::<RewriteCandidate>::new();
    for item in candidates {
        let level = item
            .get("level")
            .and_then(|v| v.as_str())
            .unwrap_or("balanced")
            .to_string();
        let text = item
            .get("text")
            .and_then(|v| v.as_str())
            .unwrap_or("")
            .to_string();
        if text.trim().is_empty() {
            continue;
        }
        let unified_diff = TextDiff::from_lines(original, &text)
            .unified_diff()
            .header("original", level.as_str())
            .to_string();
        out.push(RewriteCandidate {
            id: id(),
            level,
            text,
            unified_diff,
        });
    }

    let required = ["conservative", "balanced", "aggressive"];
    for target in required {
        if out.iter().any(|c| c.level == target) {
            continue;
        }
        let fallback_text = out
            .first()
            .map(|c| c.text.clone())
            .unwrap_or_else(|| original.to_string());
        let unified_diff = TextDiff::from_lines(original, &fallback_text)
            .unified_diff()
            .header("original", target)
            .to_string();
        out.push(RewriteCandidate {
            id: id(),
            level: target.to_string(),
            text: fallback_text,
            unified_diff,
        });
    }

    out.sort_by(|a, b| {
        let rank = |lvl: &str| match lvl {
            "conservative" => 0,
            "balanced" => 1,
            "aggressive" => 2,
            _ => 9,
        };
        rank(&a.level).cmp(&rank(&b.level))
    });
    out.truncate(3);
    Ok(out)
}

fn extract_json_block(raw: &str) -> Option<String> {
    if let Some(start) = raw.find("```json") {
        let remain = &raw[start + "```json".len()..];
        let end = remain.find("```")?;
        return Some(remain[..end].trim().to_string());
    }
    if let Some(start) = raw.find('{') {
        let end = raw.rfind('}')?;
        if end > start {
            return Some(raw[start..=end].to_string());
        }
    }
    None
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn parse_candidates_from_plain_json() {
        let raw = r#"{"candidates":[{"level":"conservative","text":"a"},{"level":"balanced","text":"b"},{"level":"aggressive","text":"c"}]}"#;
        let parsed = parse_rewrite_candidates(raw, "orig").unwrap();
        assert_eq!(parsed.len(), 3);
        assert_eq!(parsed[0].level, "conservative");
    }

    #[test]
    fn parse_candidates_from_markdown_json_block() {
        let raw = "```json\n{\"candidates\":[{\"level\":\"balanced\",\"text\":\"b\"}]}\n```";
        let parsed = parse_rewrite_candidates(raw, "orig").unwrap();
        assert_eq!(parsed.len(), 3);
    }
}
