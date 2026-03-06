use crate::{assets, repo::reference_repo, state::AppState};

#[tauri::command]
pub fn reference_import(
    state: tauri::State<'_, AppState>,
    project_id: String,
    source_path: String,
) -> Result<crate::models::ReferenceAsset, String> {
    let (stored_path, hash) =
        assets::import_asset(&state.asset_dir, &source_path, "references").map_err(|e| e.to_string())?;
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reference_repo::insert_asset(
        &conn,
        &project_id,
        &source_path,
        &stored_path.to_string_lossy(),
        &hash,
        None,
        None,
    )
    .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reference_list(
    state: tauri::State<'_, AppState>,
    project_id: String,
    tag_filter: Option<String>,
    prompt_id_filter: Option<String>,
) -> Result<Vec<crate::models::ReferenceAsset>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reference_repo::list(&conn, &project_id, tag_filter.as_deref(), prompt_id_filter.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reference_tag(
    state: tauri::State<'_, AppState>,
    asset_id: String,
    tags: Vec<String>,
) -> Result<crate::models::ReferenceAsset, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reference_repo::set_tags(&conn, &asset_id, &tags).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reference_link_to_prompt_version(
    state: tauri::State<'_, AppState>,
    asset_id: String,
    prompt_version_id: String,
) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reference_repo::link_to_prompt_version(&conn, &asset_id, &prompt_version_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reference_link_to_prompt(
    state: tauri::State<'_, AppState>,
    asset_id: String,
    prompt_id: Option<String>,
) -> Result<crate::models::ReferenceAsset, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    reference_repo::link_to_prompt(&conn, &asset_id, prompt_id.as_deref()).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn reference_delete(
    state: tauri::State<'_, AppState>,
    asset_id: String,
) -> Result<(), String> {
    let stored_path = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;
        reference_repo::delete(&conn, &asset_id).map_err(|e| e.to_string())?
    };
    let path = std::path::PathBuf::from(stored_path);
    if path.exists() {
        std::fs::remove_file(&path).map_err(|e| e.to_string())?;
    }
    Ok(())
}
