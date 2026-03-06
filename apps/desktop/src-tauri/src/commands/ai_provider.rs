use crate::{
    models::{ConnectionTestResult, ProviderKind},
    repo::ai_repo,
    state::AppState,
};
use chrono::Utc;
use std::time::Instant;

#[tauri::command]
pub fn ai_provider_create(
    state: tauri::State<'_, AppState>,
    name: String,
    kind: ProviderKind,
    base_url: String,
    model: String,
    enabled: bool,
    api_key: String,
) -> Result<crate::models::AIProvider, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let secret_ref_id =
        ai_repo::insert_secret_ref(&conn, &format!("ptk_ai_{}", Utc::now().timestamp_millis()))
            .map_err(|e| e.to_string())?;
    let key_name = ai_repo::secret_key_name(&conn, &secret_ref_id).map_err(|e| e.to_string())?;
    let entry = keyring::Entry::new("PromptToolkit", &key_name).map_err(|e| e.to_string())?;
    entry.set_password(&api_key).map_err(|e| e.to_string())?;
    ai_repo::create(
        &conn,
        &name,
        kind,
        &base_url,
        &model,
        enabled,
        &secret_ref_id,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_provider_list(state: tauri::State<'_, AppState>) -> Result<Vec<crate::models::AIProvider>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    ai_repo::list(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_default_provider_get(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    ai_repo::get_default_provider_id(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_default_provider_set(
    state: tauri::State<'_, AppState>,
    provider_id: Option<String>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    if let Some(ref provider_id) = provider_id {
        let provider = ai_repo::get(&conn, provider_id).map_err(|e| e.to_string())?;
        if !provider.enabled {
            return Err("default provider must be enabled".to_string());
        }
    }
    ai_repo::set_default_provider_id(&conn, provider_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_default_vlm_provider_get(state: tauri::State<'_, AppState>) -> Result<Option<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    ai_repo::get_default_vlm_provider_id(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_default_vlm_provider_set(
    state: tauri::State<'_, AppState>,
    provider_id: Option<String>,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    if let Some(ref provider_id) = provider_id {
        let provider = ai_repo::get(&conn, provider_id).map_err(|e| e.to_string())?;
        if !provider.enabled {
            return Err("default VLM provider must be enabled".to_string());
        }
    }
    ai_repo::set_default_vlm_provider_id(&conn, provider_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn app_setting_get(state: tauri::State<'_, AppState>, key: String) -> Result<Option<String>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    ai_repo::get_app_setting(&conn, &key).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn app_setting_set(state: tauri::State<'_, AppState>, key: String, value: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    ai_repo::set_app_setting(&conn, &key, &value).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_provider_update(
    state: tauri::State<'_, AppState>,
    id: String,
    name: String,
    kind: ProviderKind,
    base_url: String,
    model: String,
    enabled: bool,
    api_key: Option<String>,
) -> Result<crate::models::AIProvider, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    if let Some(api_key) = api_key.as_ref() {
        let provider = ai_repo::get(&conn, &id).map_err(|e| e.to_string())?;
        let key_name = ai_repo::secret_key_name(&conn, &provider.secret_ref_id).map_err(|e| e.to_string())?;
        let entry = keyring::Entry::new("PromptToolkit", &key_name).map_err(|e| e.to_string())?;
        entry.set_password(api_key).map_err(|e| e.to_string())?;
    }
    ai_repo::update(
        &conn,
        &id,
        &name,
        kind,
        &base_url,
        &model,
        enabled,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn ai_provider_delete(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let provider = ai_repo::get(&conn, &id).map_err(|e| e.to_string())?;
    let key_name = ai_repo::secret_key_name(&conn, &provider.secret_ref_id).map_err(|e| e.to_string())?;
    let entry = keyring::Entry::new("PromptToolkit", &key_name).map_err(|e| e.to_string())?;
    let _ = entry.delete_credential();
    ai_repo::delete(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub async fn ai_provider_test_connection(
    state: tauri::State<'_, AppState>,
    id: String,
) -> Result<ConnectionTestResult, String> {
    let provider = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        ai_repo::get(&conn, &id).map_err(|e| e.to_string())?
    };
    let key_name = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        ai_repo::secret_key_name(&conn, &provider.secret_ref_id).map_err(|e| e.to_string())?
    };
    let entry = keyring::Entry::new("PromptToolkit", &key_name).map_err(|e| e.to_string())?;
    let api_key = entry.get_password().map_err(|e| e.to_string())?;

    let client = reqwest::Client::new();
    let start = Instant::now();
    let response = match provider.kind {
        ProviderKind::Openai | ProviderKind::OpenaiCompatible => {
            let url = format!("{}/v1/models", trim_right_slash(&provider.base_url));
            client.get(url).bearer_auth(api_key).send().await
        }
        ProviderKind::Anthropic => {
            let url = format!("{}/v1/models", trim_right_slash(&provider.base_url));
            client
                .get(url)
                .header("x-api-key", api_key)
                .header("anthropic-version", "2023-06-01")
                .send()
                .await
        }
        ProviderKind::Gemini => {
            let url = format!(
                "{}/v1beta/models?key={}",
                trim_right_slash(&provider.base_url),
                api_key
            );
            client.get(url).send().await
        }
    };

    match response {
        Ok(resp) => Ok(ConnectionTestResult {
            ok: resp.status().is_success(),
            latency_ms: start.elapsed().as_millis() as i64,
            message: format!("HTTP {}", resp.status()),
        }),
        Err(err) => Ok(ConnectionTestResult {
            ok: false,
            latency_ms: start.elapsed().as_millis() as i64,
            message: err.to_string(),
        }),
    }
}

fn trim_right_slash(input: &str) -> String {
    input.trim_end_matches('/').to_string()
}
