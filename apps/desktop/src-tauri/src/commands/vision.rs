use crate::{
    models::{AIProvider, ImageDimensionResult, MoodboardResult, ProviderKind},
    repo::ai_repo,
    state::AppState,
};
use base64::{engine::general_purpose::STANDARD as B64, Engine};
use reqwest::Client;
use serde_json::{json, Value};
use std::path::Path;
use std::time::Duration;

fn trim_right_slash(s: &str) -> String {
    s.trim_end_matches('/').to_string()
}

fn mime_type_for_path(path: &str) -> &'static str {
    let ext = Path::new(path)
        .extension()
        .and_then(|e| e.to_str())
        .unwrap_or("")
        .to_ascii_lowercase();
    match ext.as_str() {
        "png" => "image/png",
        "webp" => "image/webp",
        "gif" => "image/gif",
        _ => "image/jpeg",
    }
}

fn load_image_b64(path: &str) -> Result<String, String> {
    let bytes = std::fs::read(path).map_err(|e| format!("failed to read {}: {}", path, e))?;
    Ok(B64.encode(&bytes))
}

fn resolve_provider_and_key(
    state: &AppState,
    provider_id_override: Option<&str>,
) -> Result<(AIProvider, String), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let provider = ai_repo::resolve_effective_vlm_provider(&conn, provider_id_override)
        .map_err(|e| e.to_string())?
        .ok_or_else(|| "no available AI provider; configure one in AISettings".to_string())?;
    if !provider.enabled {
        return Err("selected provider is disabled".to_string());
    }
    let key_name =
        ai_repo::secret_key_name(&conn, &provider.secret_ref_id).map_err(|e| e.to_string())?;
    let entry =
        keyring::Entry::new("PromptToolkit", &key_name).map_err(|e| e.to_string())?;
    let api_key = entry.get_password().map_err(|e| e.to_string())?;
    Ok((provider, api_key))
}

async fn vision_generate(
    provider: &AIProvider,
    api_key: &str,
    system_prompt: &str,
    text_prompt: &str,
    images: &[(String, String)], // (base64_data, mime_type)
) -> Result<String, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(120))
        .build()
        .map_err(|e| e.to_string())?;
    match provider.kind {
        ProviderKind::Openai | ProviderKind::OpenaiCompatible => {
            vision_openai(
                &client,
                &provider.base_url,
                api_key,
                &provider.model,
                system_prompt,
                text_prompt,
                images,
            )
            .await
        }
        ProviderKind::Anthropic => {
            vision_anthropic(
                &client,
                &provider.base_url,
                api_key,
                &provider.model,
                system_prompt,
                text_prompt,
                images,
            )
            .await
        }
        ProviderKind::Gemini => {
            vision_gemini(
                &client,
                &provider.base_url,
                api_key,
                &provider.model,
                text_prompt,
                images,
            )
            .await
        }
    }
}

async fn vision_openai(
    client: &Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    system: &str,
    text: &str,
    images: &[(String, String)],
) -> Result<String, String> {
    let mut content: Vec<Value> = images
        .iter()
        .map(|(data, mime)| {
            json!({
                "type": "image_url",
                "image_url": {"url": format!("data:{};base64,{}", mime, data)}
            })
        })
        .collect();
    content.push(json!({"type": "text", "text": text}));

    let payload = json!({
        "model": model,
        "max_tokens": 2048,
        "messages": [
            {"role": "system", "content": system},
            {"role": "user", "content": content}
        ]
    });

    let url = format!("{}/v1/chat/completions", trim_right_slash(base_url));
    let resp = client
        .post(&url)
        .bearer_auth(api_key)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("OpenAI vision HTTP {}: {}", status, body));
    }
    let v: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    v["choices"][0]["message"]["content"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("unexpected OpenAI vision response: {}", body))
}

async fn vision_anthropic(
    client: &Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    system: &str,
    text: &str,
    images: &[(String, String)],
) -> Result<String, String> {
    let mut content: Vec<Value> = images
        .iter()
        .map(|(data, mime)| {
            json!({
                "type": "image",
                "source": {"type": "base64", "media_type": mime, "data": data}
            })
        })
        .collect();
    content.push(json!({"type": "text", "text": text}));

    let payload = json!({
        "model": model,
        "max_tokens": 2048,
        "system": system,
        "messages": [{"role": "user", "content": content}]
    });

    let url = format!("{}/v1/messages", trim_right_slash(base_url));
    let resp = client
        .post(&url)
        .header("x-api-key", api_key)
        .header("anthropic-version", "2023-06-01")
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Anthropic vision HTTP {}: {}", status, body));
    }
    let v: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    v["content"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("unexpected Anthropic vision response: {}", body))
}

async fn vision_gemini(
    client: &Client,
    base_url: &str,
    api_key: &str,
    model: &str,
    text: &str,
    images: &[(String, String)],
) -> Result<String, String> {
    let mut parts: Vec<Value> = images
        .iter()
        .map(|(data, mime)| {
            json!({"inline_data": {"mime_type": mime, "data": data}})
        })
        .collect();
    parts.push(json!({"text": text}));

    let payload = json!({"contents": [{"parts": parts}]});
    let url = format!(
        "{}/v1beta/models/{}:generateContent?key={}",
        trim_right_slash(base_url),
        model,
        api_key
    );
    let resp = client
        .post(&url)
        .json(&payload)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("Gemini vision HTTP {}: {}", status, body));
    }
    let v: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    v["candidates"][0]["content"]["parts"][0]["text"]
        .as_str()
        .map(|s| s.to_string())
        .ok_or_else(|| format!("unexpected Gemini vision response: {}", body))
}

fn strip_json_fences(text: &str) -> &str {
    text.trim()
        .trim_start_matches("```json")
        .trim_start_matches("```")
        .trim_end_matches("```")
        .trim()
}

const IMAGE_ANALYZE_SYSTEM: &str =
    "You are an expert at reverse-engineering AI image generation prompts from visual analysis. \
     Be precise and concise. Never include filler words like masterpiece, best quality, highly detailed.";

const IMAGE_ANALYZE_USER: &str =
    "Analyze this image for AI image generation prompt engineering. Identify each visual dimension present.\n\n\
     Return a JSON array (no markdown, just the array) where each object has:\n\
     - \"dimension\": one of [\"Camera/Lens\", \"Lighting\", \"Style/Mood\", \"Material/Texture\", \
       \"Composition\", \"Color Palette\", \"Subject/Action\", \"VFX/Effects\"]\n\
     - \"core\": concise prompt-ready description (avoid filler words)\n\
     - \"detail\": expanded note for deeper context (can be empty string)\n\
     - \"confidence\": \"high\", \"medium\", or \"low\"\n\n\
     Only include dimensions clearly visible in the image. Low confidence = inferred/uncertain.";

fn parse_dimension_results(text: &str) -> Result<Vec<ImageDimensionResult>, String> {
    let cleaned = strip_json_fences(text);
    let arr: Vec<Value> = serde_json::from_str(cleaned)
        .map_err(|e| format!("failed to parse dimension JSON: {} — raw: {}", e, cleaned))?;
    let mut results = Vec::new();
    for item in arr {
        results.push(ImageDimensionResult {
            dimension: item["dimension"].as_str().unwrap_or("Unknown").to_string(),
            core: item["core"].as_str().unwrap_or("").to_string(),
            detail: item["detail"].as_str().unwrap_or("").to_string(),
            confidence: item["confidence"].as_str().unwrap_or("medium").to_string(),
        });
    }
    Ok(results)
}

#[tauri::command]
pub async fn image_analyze(
    state: tauri::State<'_, AppState>,
    image_path: String,
    provider_id_override: Option<String>,
) -> Result<Vec<ImageDimensionResult>, String> {
    let (provider, api_key) =
        resolve_provider_and_key(&state, provider_id_override.as_deref())?;
    let b64 = load_image_b64(&image_path)?;
    let mime = mime_type_for_path(&image_path).to_string();
    let images = vec![(b64, mime)];
    let response =
        vision_generate(&provider, &api_key, IMAGE_ANALYZE_SYSTEM, IMAGE_ANALYZE_USER, &images)
            .await?;
    parse_dimension_results(&response)
}

const MOODBOARD_SYSTEM: &str =
    "You are an expert at analyzing visual aesthetics and extracting common style elements \
     from collections of images for AI image generation.";

fn build_moodboard_prompt(image_count: usize) -> String {
    format!(
        "Analyze these {} images as a moodboard for AI image generation.\n\n\
         Identify the visual style, aesthetic, and atmosphere that runs through most or all images.\n\
         Also note significant variations or contrasts between images.\n\n\
         Return JSON (no markdown) with exactly two fields:\n\
         - \"common_style\": a concise, prompt-ready description of the shared aesthetic \
           (avoid filler words like masterpiece, best quality)\n\
         - \"variations\": brief notes on notable differences between images\n\n\
         Example: {{\"common_style\": \"cinematic, warm golden hour, film grain, shallow depth of field\", \
         \"variations\": \"some images are close-up portraits, others are wide landscape shots\"}}",
        image_count
    )
}

fn parse_moodboard_result(text: &str) -> Result<MoodboardResult, String> {
    let cleaned = strip_json_fences(text);
    let v: Value = serde_json::from_str(cleaned)
        .map_err(|e| format!("failed to parse moodboard JSON: {} — raw: {}", e, cleaned))?;
    Ok(MoodboardResult {
        common_style: v["common_style"].as_str().unwrap_or("").to_string(),
        variations: v["variations"].as_str().unwrap_or("").to_string(),
    })
}

#[tauri::command]
pub async fn moodboard_analyze(
    state: tauri::State<'_, AppState>,
    image_paths: Vec<String>,
    provider_id_override: Option<String>,
) -> Result<MoodboardResult, String> {
    if image_paths.is_empty() {
        return Err("no images provided".to_string());
    }
    let (provider, api_key) =
        resolve_provider_and_key(&state, provider_id_override.as_deref())?;
    let mut images: Vec<(String, String)> = Vec::new();
    for path in &image_paths {
        let b64 = load_image_b64(path)?;
        let mime = mime_type_for_path(path).to_string();
        images.push((b64, mime));
    }
    let prompt = build_moodboard_prompt(images.len());
    let response =
        vision_generate(&provider, &api_key, MOODBOARD_SYSTEM, &prompt, &images).await?;
    parse_moodboard_result(&response)
}

async fn fetch_openai_models(base_url: &str, api_key: &str) -> Result<Vec<String>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!("{}/v1/models", trim_right_slash(base_url));
    let resp = client
        .get(&url)
        .bearer_auth(api_key)
        .send()
        .await
        .map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("fetch models HTTP {}: {}", status, body));
    }
    let v: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let ids: Vec<String> = v["data"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| m["id"].as_str().map(|s| s.to_string()))
                .collect()
        })
        .unwrap_or_default();
    Ok(ids)
}

async fn fetch_gemini_models(base_url: &str, api_key: &str) -> Result<Vec<String>, String> {
    let client = Client::builder()
        .timeout(Duration::from_secs(15))
        .build()
        .map_err(|e| e.to_string())?;
    let url = format!(
        "{}/v1beta/models?key={}",
        trim_right_slash(base_url),
        api_key
    );
    let resp = client.get(&url).send().await.map_err(|e| e.to_string())?;
    let status = resp.status();
    let body = resp.text().await.map_err(|e| e.to_string())?;
    if !status.is_success() {
        return Err(format!("fetch Gemini models HTTP {}: {}", status, body));
    }
    let v: Value = serde_json::from_str(&body).map_err(|e| e.to_string())?;
    let ids: Vec<String> = v["models"]
        .as_array()
        .map(|arr| {
            arr.iter()
                .filter_map(|m| {
                    m["name"]
                        .as_str()
                        .map(|s| s.trim_start_matches("models/").to_string())
                })
                .collect()
        })
        .unwrap_or_default();
    Ok(ids)
}

#[tauri::command]
pub async fn ai_provider_fetch_models(
    kind: String,
    api_key: String,
    base_url: Option<String>,
) -> Result<Vec<String>, String> {
    match kind.as_str() {
        "anthropic" => Ok(vec![
            "claude-opus-4-6".to_string(),
            "claude-sonnet-4-6".to_string(),
            "claude-haiku-4-5-20251001".to_string(),
            "claude-3-5-sonnet-20241022".to_string(),
            "claude-3-5-haiku-20241022".to_string(),
        ]),
        "openai" => {
            let base = base_url
                .as_deref()
                .unwrap_or("https://api.openai.com");
            fetch_openai_models(base, &api_key).await
        }
        "openai_compatible" => {
            let base = base_url.as_deref().unwrap_or("").trim_end_matches('/');
            if base.is_empty() {
                return Err("base_url is required for openai_compatible".to_string());
            }
            fetch_openai_models(base, &api_key).await
        }
        "gemini" => {
            let base = base_url
                .as_deref()
                .unwrap_or("https://generativelanguage.googleapis.com");
            fetch_gemini_models(base, &api_key).await
        }
        _ => Err(format!("unknown provider kind: {}", kind)),
    }
}
