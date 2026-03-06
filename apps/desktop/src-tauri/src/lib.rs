mod ai;
mod assets;
mod attribution;
mod clipboard;
mod commands;
mod db;
mod error;
mod models;
mod repo;
mod state;

use state::AppState;
use std::sync::{Arc, Mutex};
use tauri::Manager;

pub fn run() {
    tauri::Builder::default()
        .setup(|app| {
            let (conn, asset_dir) = db::init_connection(&app.handle())
                .map_err(|e| -> Box<dyn std::error::Error> { Box::new(e) })?;
            app.manage(AppState {
                db: Arc::new(Mutex::new(conn)),
                asset_dir,
            });
            Ok(())
        })
        .plugin(tauri_plugin_dialog::init())
        .invoke_handler(tauri::generate_handler![
            commands::project::project_create,
            commands::project::project_list,
            commands::project::project_update,
            commands::project::project_set_custom_tags,
            commands::project::project_delete,
            commands::project::project_clear_all,
            commands::project::project_export_bundle,
            commands::prompt::prompt_update_title,
            commands::prompt::prompt_create,
            commands::prompt::prompt_delete,
            commands::prompt::prompt_set_tags,
            commands::prompt::prompt_list_by_project,
            commands::prompt::prompt_toggle_star,
            commands::prompt::prompt_save_draft,
            commands::prompt::prompt_commit_version,
            commands::prompt::prompt_list_versions,
            commands::prompt::prompt_restore_version,
            commands::prompt::prompt_diff_versions,
            commands::prompt::prompt_generate_from_brief,
            commands::prompt::prompt_rewrite_candidates,
            commands::snippet::snippet_create,
            commands::snippet::snippet_list,
            commands::snippet::snippet_update,
            commands::snippet::snippet_delete,
            commands::snippet::snippet_insert_preview,
            commands::reference::reference_import,
            commands::reference::reference_list,
            commands::reference::reference_tag,
            commands::reference::reference_link_to_prompt_version,
            commands::reference::reference_link_to_prompt,
            commands::reference::reference_delete,
            commands::clipboard_cmd::clipboard_copy_with_payload,
            commands::output::output_paste_import_and_auto_attribution,
            commands::output::output_confirm_attribution,
            commands::output::output_list_by_project,
            commands::output::output_link_to_prompt,
            commands::output::output_delete,
            commands::ai_provider::ai_provider_create,
            commands::ai_provider::ai_provider_list,
            commands::ai_provider::ai_default_provider_get,
            commands::ai_provider::ai_default_provider_set,
            commands::ai_provider::ai_provider_update,
            commands::ai_provider::ai_provider_delete,
            commands::ai_provider::ai_provider_test_connection,
            commands::ai_provider::ai_default_vlm_provider_get,
            commands::ai_provider::ai_default_vlm_provider_set,
            commands::ai_provider::app_setting_get,
            commands::ai_provider::app_setting_set,
            commands::ai_run::ai_run_history_list,
            commands::vision::image_analyze,
            commands::vision::moodboard_analyze,
            commands::vision::ai_provider_fetch_models,
        ])
        .run(tauri::generate_context!())
        .expect("error while running Prompt Toolkit");
}
