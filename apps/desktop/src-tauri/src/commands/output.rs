use crate::{
    assets,
    attribution,
    clipboard,
    models::{OutputAttributionResponse, OutputImage},
    repo::output_repo,
    state::AppState,
};
use chrono::Utc;

#[tauri::command]
pub fn output_paste_import_and_auto_attribution(
    state: tauri::State<'_, AppState>,
    project_id: String,
    source_image_path: String,
    clipboard_text: Option<String>,
    model_hint: Option<String>,
) -> Result<OutputAttributionResponse, String> {
    let (stored_path, _hash) =
        assets::import_asset(&state.asset_dir, &source_image_path, "outputs").map_err(|e| e.to_string())?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let output_id = output_repo::insert_output(
        &conn,
        &project_id,
        &source_image_path,
        &stored_path.to_string_lossy(),
        model_hint.as_deref(),
    )
    .map_err(|e| e.to_string())?;

    let payload_prompt_version_id = clipboard_text
        .as_deref()
        .and_then(clipboard::decode_payload_from_invisible)
        .map(|p| p.prompt_version_id);

    let events = output_repo::recent_copy_events(&conn, &project_id, 20).map_err(|e| e.to_string())?;
    let candidates = attribution::rank_candidates(payload_prompt_version_id, &events, Utc::now(), 3);
    let persisted = output_repo::insert_candidates(&conn, &output_id, &candidates).map_err(|e| e.to_string())?;

    Ok(OutputAttributionResponse {
        output_id,
        output_path: stored_path.to_string_lossy().to_string(),
        candidates: persisted,
    })
}

#[tauri::command]
pub fn output_confirm_attribution(
    state: tauri::State<'_, AppState>,
    output_id: String,
    attribution_id: String,
) -> Result<Vec<crate::models::AttributionCandidate>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    output_repo::confirm_candidate(&conn, &output_id, &attribution_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn output_list_by_project(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<OutputImage>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    output_repo::list_by_project(&conn, &project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn output_link_to_prompt(
    state: tauri::State<'_, AppState>,
    output_id: String,
    prompt_id: Option<String>,
) -> Result<OutputImage, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    output_repo::link_to_prompt(&conn, &output_id, prompt_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn output_delete(
    state: tauri::State<'_, AppState>,
    output_id: String,
) -> Result<(), String> {
    let stored_path = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        output_repo::delete(&conn, &output_id).map_err(|e| e.to_string())?
    };
    let path = std::path::PathBuf::from(stored_path);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
