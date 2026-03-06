use crate::{repo::project_repo, state::AppState};

#[tauri::command]
pub fn project_create(state: tauri::State<'_, AppState>, name: String) -> Result<crate::models::Project, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    project_repo::create(&conn, &name).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn project_list(state: tauri::State<'_, AppState>) -> Result<Vec<crate::models::Project>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    project_repo::list(&conn).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn project_update(
    state: tauri::State<'_, AppState>,
    id: String,
    name: String,
    global_suffix: String,
) -> Result<crate::models::Project, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    project_repo::update(&conn, &id, &name, &global_suffix).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn project_delete(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    project_repo::delete(&conn, &id).map_err(|e| e.to_string())
}
