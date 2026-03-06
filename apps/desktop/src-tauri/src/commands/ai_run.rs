use crate::{repo::ai_run_repo, state::AppState};

#[tauri::command]
pub fn ai_run_history_list(
    state: tauri::State<'_, AppState>,
    project_id: String,
    run_type: Option<String>,
) -> Result<Vec<crate::models::AIRunHistoryEntry>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    ai_run_repo::list(&conn, &project_id, run_type.as_deref(), 50).map_err(|e| e.to_string())
}
