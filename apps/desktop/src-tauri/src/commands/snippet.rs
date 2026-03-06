use crate::{repo::snippet_repo, state::AppState};

#[tauri::command]
pub fn snippet_create(
    state: tauri::State<'_, AppState>,
    project_id: String,
    name: String,
    scope: String,
    content: String,
    tags: Vec<String>,
) -> Result<crate::models::Snippet, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    snippet_repo::create(&conn, &project_id, &name, &scope, &content, &tags)
        .map_err(|e| e.to_string())
}

#[tauri::command]
pub fn snippet_list(
    state: tauri::State<'_, AppState>,
    project_id: String,
) -> Result<Vec<crate::models::Snippet>, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    snippet_repo::list(&conn, &project_id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn snippet_update(
    state: tauri::State<'_, AppState>,
    id: String,
    name: String,
    scope: String,
    content: String,
    tags: Vec<String>,
) -> Result<crate::models::Snippet, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    snippet_repo::update(&conn, &id, &name, &scope, &content, &tags).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn snippet_delete(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    snippet_repo::delete(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn snippet_insert_preview(
    state: tauri::State<'_, AppState>,
    project_id: String,
    editor_text: String,
    free_segments: Vec<String>,
) -> Result<String, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    let prefixes = snippet_repo::list_by_scope(&conn, &project_id, "prefix").map_err(|e| e.to_string())?;
    let suffixes = snippet_repo::list_by_scope(&conn, &project_id, "suffix").map_err(|e| e.to_string())?;

    let mut final_text = String::new();

    if !prefixes.is_empty() {
        let joined = prefixes
            .iter()
            .map(|s| s.content.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        final_text.push_str(&joined);
        final_text.push_str(", ");
    }

    if !free_segments.is_empty() {
        final_text.push_str(&free_segments.join(", "));
        final_text.push_str(", ");
    }

    final_text.push_str(&editor_text);

    if !suffixes.is_empty() {
        let joined = suffixes
            .iter()
            .map(|s| s.content.as_str())
            .collect::<Vec<_>>()
            .join(", ");
        final_text.push_str(", ");
        final_text.push_str(&joined);
    }

    Ok(final_text)
}
