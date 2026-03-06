use crate::{
    clipboard,
    repo::{id, now},
    state::AppState,
};
use rusqlite::params;

#[tauri::command]
pub fn clipboard_copy_with_payload(
    state: tauri::State<'_, AppState>,
    project_id: String,
    prompt_id: String,
    prompt_version_id: String,
    prompt_text: String,
) -> Result<String, String> {
    let payload = clipboard::new_payload(&project_id, &prompt_id, &prompt_version_id);
    let encoded_text = clipboard::append_payload(&prompt_text, &payload).map_err(|e| e.to_string())?;
    clipboard::write_system_clipboard(&encoded_text).map_err(|e| e.to_string())?;

    let conn = state.db.lock().map_err(|e| e.to_string())?;
    conn.execute(
        "INSERT INTO copy_events(id, project_id, prompt_id, prompt_version_id, copied_at, payload_json, plain_text)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
        params![
            id(),
            project_id,
            prompt_id,
            prompt_version_id,
            now(),
            serde_json::to_string(&payload).map_err(|e| e.to_string())?,
            prompt_text
        ],
    )
    .map_err(|e| e.to_string())?;

    Ok(encoded_text)
}
