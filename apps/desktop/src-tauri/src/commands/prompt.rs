use crate::{
    ai::{client as ai_client, prompts as ai_prompts},
    models::DiffResult,
    models::{PromptGenerateResult, PromptRewriteResult},
    repo::{ai_repo, ai_run_repo, prompt_repo},
    state::AppState,
};
use similar::TextDiff;
use std::collections::HashMap;
use std::time::Instant;

#[tauri::command]
pub fn prompt_create(
    state: tauri::State<'_, AppState>,
    project_id: String,
    title: String,
    draft: String,
) -> Result<crate::models::Prompt, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    prompt_repo::create(&conn, &project_id, &title, &draft).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prompt_list_by_project(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<crate::models::Prompt>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    prompt_repo::list_by_project(&conn, &project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prompt_update_title(
    state: tauri::State<'_, AppState>,
    prompt_id: String,
    title: String,
) -> Result<crate::models::Prompt, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    prompt_repo::update_title(&conn, &prompt_id, &title).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prompt_delete(
    state: tauri::State<'_, AppState>,
    prompt_id: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    prompt_repo::delete(&conn, &prompt_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prompt_set_tags(
    state: tauri::State<'_, AppState>,
    prompt_id: String,
    tags: Vec<String>,
) -> Result<crate::models::Prompt, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    prompt_repo::set_tags(&conn, &prompt_id, &tags).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prompt_toggle_star(
    state: tauri::State<'_, AppState>,
    prompt_id: String,
) -> Result<crate::models::Prompt, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    prompt_repo::toggle_star(&conn, &prompt_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prompt_save_draft(
    state: tauri::State<'_, AppState>,
    prompt_id: String,
    draft: String,
) -> Result<crate::models::Prompt, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    prompt_repo::save_draft(&conn, &prompt_id, &draft).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prompt_commit_version(
    state: tauri::State<'_, AppState>,
    prompt_id: String,
    raw_text: String,
    commit_message: Option<String>,
    operator: String,
) -> Result<crate::models::PromptVersion, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    prompt_repo::commit_version(
        &conn,
        &prompt_id,
        &raw_text,
        commit_message.as_deref(),
        &operator,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prompt_list_versions(
    state: tauri::State<'_, AppState>,
    prompt_id: String,
) -> Result<Vec<crate::models::PromptVersion>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    prompt_repo::list_versions(&conn, &prompt_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prompt_restore_version(
    state: tauri::State<'_, AppState>,
    prompt_id: String,
    version_id: String,
) -> Result<crate::models::Prompt, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    prompt_repo::restore_version(&conn, &prompt_id, &version_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn prompt_diff_versions(
    state: tauri::State<'_, AppState>,
    from_version_id: String,
    to_version_id: String,
) -> Result<DiffResult, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let left = prompt_repo::get_version_text(&conn, &from_version_id).map_err(|e| e.to_string())?;
    let right = prompt_repo::get_version_text(&conn, &to_version_id).map_err(|e| e.to_string())?;
    let diff = TextDiff::from_lines(&left, &right);
    let mut added = 0_i64;
    let mut removed = 0_i64;
    for op in diff.ops() {
        for change in diff.iter_changes(op) {
            match change.tag() {
                similar::ChangeTag::Insert => added += 1,
                similar::ChangeTag::Delete => removed += 1,
                similar::ChangeTag::Equal => {}
            }
        }
    }
    let unified = diff
        .unified_diff()
        .header("from", "to")
        .to_string();
    Ok(DiffResult {
        from_version_id,
        to_version_id,
        unified,
        added,
        removed,
    })
}

#[tauri::command]
pub async fn prompt_generate_from_brief(
    state: tauri::State<'_, AppState>,
    project_id: String,
    brief: String,
    // Optional dimension hints: key = dimension name, value = user text or None if skipped.
    dimensions: Option<HashMap<String, Option<String>>>,
    provider_id_override: Option<String>,
    prompt_id: Option<String>,
) -> Result<PromptGenerateResult, String> {
    let (provider, api_key) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let provider = ai_repo::resolve_effective_provider(&conn, provider_id_override.as_deref())
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "no available AI provider; configure one in AISettings".to_string())?;
        if !provider.enabled {
            return Err("selected provider is disabled".to_string());
        }
        let key_name = ai_repo::secret_key_name(&conn, &provider.secret_ref_id).map_err(|e| e.to_string())?;
        let entry = keyring::Entry::new("PromptToolkit", &key_name).map_err(|e| e.to_string())?;
        let api_key = entry.get_password().map_err(|e| e.to_string())?;
        (provider, api_key)
    };

    let dims = dimensions.unwrap_or_default();
    let (system_prompt, user_prompt) = ai_prompts::build_generate_prompts(&brief, &dims);
    let started = Instant::now();
    let generated_result =
        ai_client::generate_text(&provider, &api_key, &system_prompt, &user_prompt).await;
    let latency_ms = started.elapsed().as_millis() as i64;

    let input_json = serde_json::json!({
        "brief": brief,
        "dimensions": dims,
        "providerIdOverride": provider_id_override,
    })
    .to_string();

    match generated_result {
        Ok(generated_text) => {
            let output_json = serde_json::json!({
                "generatedText": &generated_text
            })
            .to_string();

            let run_id = {
                let conn = state.db.lock().map_err(|e| e.to_string())?;
                ai_run_repo::insert(
                    &conn,
                    ai_run_repo::InsertAiRunInput {
                        project_id: &project_id,
                        prompt_id: prompt_id.as_deref(),
                        run_type: "generate",
                        provider_id: &provider.id,
                        model: &provider.model,
                        input_json: &input_json,
                        output_json: Some(&output_json),
                        status: "ok",
                        error_message: None,
                        latency_ms,
                    },
                )
                .map_err(|e| e.to_string())?
            };

            Ok(PromptGenerateResult {
                generated_text,
                provider_id: provider.id,
                model: provider.model,
                latency_ms,
                run_id,
            })
        }
        Err(err) => {
            let error_message = err.to_string();
            {
                let conn = state.db.lock().map_err(|e| e.to_string())?;
                let _ = ai_run_repo::insert(
                    &conn,
                    ai_run_repo::InsertAiRunInput {
                        project_id: &project_id,
                        prompt_id: prompt_id.as_deref(),
                        run_type: "generate",
                        provider_id: &provider.id,
                        model: &provider.model,
                        input_json: &input_json,
                        output_json: None,
                        status: "error",
                        error_message: Some(&error_message),
                        latency_ms,
                    },
                );
            }
            Err(error_message)
        }
    }
}

#[tauri::command]
pub async fn prompt_rewrite_candidates(
    state: tauri::State<'_, AppState>,
    project_id: String,
    prompt_text: String,
    // If Some, only the selected portion is rewritten; the full prompt provides context.
    selection_text: Option<String>,
    instruction: String,
    preserve_voice: bool,
    provider_id_override: Option<String>,
    prompt_id: Option<String>,
) -> Result<PromptRewriteResult, String> {
    let (provider, api_key) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        let provider = ai_repo::resolve_effective_provider(&conn, provider_id_override.as_deref())
            .map_err(|e| e.to_string())?
            .ok_or_else(|| "no available AI provider; configure one in AISettings".to_string())?;
        if !provider.enabled {
            return Err("selected provider is disabled".to_string());
        }
        let key_name = ai_repo::secret_key_name(&conn, &provider.secret_ref_id).map_err(|e| e.to_string())?;
        let entry = keyring::Entry::new("PromptToolkit", &key_name).map_err(|e| e.to_string())?;
        let api_key = entry.get_password().map_err(|e| e.to_string())?;
        (provider, api_key)
    };

    let (system_prompt, user_prompt) = ai_prompts::build_rewrite_prompts(
        &prompt_text,
        selection_text.as_deref(),
        &instruction,
        preserve_voice,
    );
    let started = Instant::now();
    let model_result = ai_client::generate_text(&provider, &api_key, &system_prompt, &user_prompt).await;
    let latency_ms = started.elapsed().as_millis() as i64;

    // Diff is computed against the portion being rewritten (selection or full prompt).
    let diff_base = selection_text.as_deref().unwrap_or(&prompt_text);

    let input_json = serde_json::json!({
        "promptText": prompt_text,
        "selectionText": selection_text,
        "instruction": instruction,
        "preserveVoice": preserve_voice,
        "providerIdOverride": provider_id_override,
    })
    .to_string();

    match model_result {
        Ok(model_text) => {
            let candidates = ai_prompts::parse_rewrite_candidates(&model_text, diff_base)
                .map_err(|e| e.to_string())?;
            let output_json = serde_json::json!({
                "rawModelText": &model_text,
                "candidates": &candidates,
            })
            .to_string();
            let run_id = {
                let conn = state.db.lock().map_err(|e| e.to_string())?;
                ai_run_repo::insert(
                    &conn,
                    ai_run_repo::InsertAiRunInput {
                        project_id: &project_id,
                        prompt_id: prompt_id.as_deref(),
                        run_type: "rewrite",
                        provider_id: &provider.id,
                        model: &provider.model,
                        input_json: &input_json,
                        output_json: Some(&output_json),
                        status: "ok",
                        error_message: None,
                        latency_ms,
                    },
                )
                .map_err(|e| e.to_string())?
            };
            Ok(PromptRewriteResult {
                candidates,
                provider_id: provider.id,
                model: provider.model,
                latency_ms,
                run_id,
            })
        }
        Err(err) => {
            let error_message = err.to_string();
            {
                let conn = state.db.lock().map_err(|e| e.to_string())?;
                let _ = ai_run_repo::insert(
                    &conn,
                    ai_run_repo::InsertAiRunInput {
                        project_id: &project_id,
                        prompt_id: prompt_id.as_deref(),
                        run_type: "rewrite",
                        provider_id: &provider.id,
                        model: &provider.model,
                        input_json: &input_json,
                        output_json: None,
                        status: "error",
                        error_message: Some(&error_message),
                        latency_ms,
                    },
                );
            }
            Err(error_message)
        }
    }
}
