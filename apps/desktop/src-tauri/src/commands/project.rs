use crate::{
    error::{AppError, AppResult},
    models::{ProjectClearSummary, ProjectExportResult},
    repo::{output_repo, prompt_repo, project_repo, reference_repo},
    state::AppState,
};
use chrono::Utc;
use serde::Serialize;
use std::{
    collections::HashSet,
    fs,
    path::{Path, PathBuf},
};

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportManifest {
    exported_at: String,
    project: ExportProjectManifest,
    prompts: Vec<ExportPromptManifest>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportProjectManifest {
    id: String,
    name: String,
    global_suffix: String,
    custom_tags: Vec<String>,
}

#[derive(Debug, Serialize)]
#[serde(rename_all = "camelCase")]
struct ExportPromptManifest {
    id: String,
    title: String,
    folder_name: String,
    file_name: String,
    current_version_id: Option<String>,
    tags: Vec<String>,
    reference_files: Vec<String>,
    output_files: Vec<String>,
}

#[tauri::command]
pub fn project_create(
    state: tauri::State<'_, AppState>,
    name: String,
) -> Result<crate::models::Project, String> {
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
pub fn project_set_custom_tags(
    state: tauri::State<'_, AppState>,
    id: String,
    tags: Vec<String>,
) -> Result<crate::models::Project, String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    project_repo::set_custom_tags(&conn, &id, &tags).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn project_delete(state: tauri::State<'_, AppState>, id: String) -> Result<(), String> {
    let conn = state.db.lock().map_err(|e| e.to_string())?;
    project_repo::delete(&conn, &id).map_err(|e| e.to_string())
}

#[tauri::command]
pub fn project_clear_all(
    state: tauri::State<'_, AppState>,
) -> Result<ProjectClearSummary, String> {
    let (deleted_project_count, deleted_prompt_count, deleted_reference_count, deleted_output_count, asset_paths) = {
        let conn = state.db.lock().map_err(|e| e.to_string())?;

        let deleted_project_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM projects", [], |row| row.get(0))
                .map_err(|e| e.to_string())?;
        let deleted_prompt_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM prompts", [], |row| row.get(0))
                .map_err(|e| e.to_string())?;
        let deleted_reference_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM reference_assets", [], |row| row.get(0))
                .map_err(|e| e.to_string())?;
        let deleted_output_count: i64 =
            conn.query_row("SELECT COUNT(*) FROM outputs", [], |row| row.get(0))
                .map_err(|e| e.to_string())?;

        let reference_paths = collect_text_column(&conn, "SELECT stored_path FROM reference_assets")
            .map_err(|e| e.to_string())?;
        let output_paths = collect_text_column(&conn, "SELECT stored_path FROM outputs")
            .map_err(|e| e.to_string())?;

        conn.execute("DELETE FROM projects", [])
            .map_err(|e| e.to_string())?;

        (
            deleted_project_count,
            deleted_prompt_count,
            deleted_reference_count,
            deleted_output_count,
            reference_paths.into_iter().chain(output_paths).collect::<Vec<_>>(),
        )
    };

    let removed_asset_file_count = remove_asset_files(asset_paths) as i64;

    Ok(ProjectClearSummary {
        deleted_project_count,
        deleted_prompt_count,
        deleted_reference_count,
        deleted_output_count,
        removed_asset_file_count,
    })
}

#[tauri::command]
pub fn project_export_bundle(
    state: tauri::State<'_, AppState>,
    project_id: String,
    destination_dir: String,
    prompt_ids: Option<Vec<String>>,
) -> Result<ProjectExportResult, String> {
    export_bundle_impl(&state, &project_id, &destination_dir, prompt_ids).map_err(|e| e.to_string())
}

fn export_bundle_impl(
    state: &tauri::State<'_, AppState>,
    project_id: &str,
    destination_dir: &str,
    prompt_ids: Option<Vec<String>>,
) -> AppResult<ProjectExportResult> {
    let destination_root = PathBuf::from(destination_dir);
    if destination_root.as_os_str().is_empty() {
        return Err(AppError::BadRequest("Choose an export destination first.".to_string()));
    }
    fs::create_dir_all(&destination_root)?;

    let (project, selected_prompts, references, outputs) = {
        let conn = state.db.lock().map_err(|e| AppError::BadRequest(e.to_string()))?;
        let project = project_repo::get(&conn, project_id)?;
        let all_prompts = prompt_repo::list_by_project(&conn, project_id)?;
        let selected_prompts = filter_export_prompts(all_prompts, prompt_ids)?;
        let references = reference_repo::list(&conn, project_id, None, None)?;
        let outputs = output_repo::list_by_project(&conn, project_id)?;
        (project, selected_prompts, references, outputs)
    };

    let bundle_dir = destination_root.join(format!(
        "{}__{}",
        slugify(&project.name),
        Utc::now().format("%Y%m%d_%H%M%S")
    ));
    let prompts_dir = bundle_dir.join("prompts");
    fs::create_dir_all(&prompts_dir)?;

    let mut manifest_prompts = Vec::new();
    let mut exported_reference_count = 0_i64;
    let mut exported_output_count = 0_i64;

    for (index, prompt) in selected_prompts.iter().enumerate() {
        let prompt_folder_name = format!("{:02}_{}", index + 1, slugify(&prompt.title));
        let prompt_dir = prompts_dir.join(&prompt_folder_name);
        fs::create_dir_all(&prompt_dir)?;

        let prompt_file_name = "prompt.txt".to_string();
        fs::write(prompt_dir.join(&prompt_file_name), prompt.current_draft.as_bytes())?;

        let prompt_references = references
            .iter()
            .filter(|asset| asset.prompt_id.as_deref() == Some(prompt.id.as_str()))
            .collect::<Vec<_>>();
        let prompt_outputs = outputs
            .iter()
            .filter(|output| output.prompt_id.as_deref() == Some(prompt.id.as_str()))
            .collect::<Vec<_>>();

        let reference_files = export_media_group(
            prompt_dir.join("references"),
            &prompt_references
                .iter()
                .map(|asset| (asset.source_path.as_str(), asset.stored_path.as_str(), "reference"))
                .collect::<Vec<_>>(),
        )?;
        let output_files = export_media_group(
            prompt_dir.join("outputs"),
            &prompt_outputs
                .iter()
                .map(|output| (output.source_path.as_str(), output.stored_path.as_str(), "output"))
                .collect::<Vec<_>>(),
        )?;

        exported_reference_count += reference_files.len() as i64;
        exported_output_count += output_files.len() as i64;

        let prompt_manifest = ExportPromptManifest {
            id: prompt.id.clone(),
            title: prompt.title.clone(),
            folder_name: prompt_folder_name.clone(),
            file_name: prompt_file_name.clone(),
            current_version_id: prompt.current_version_id.clone(),
            tags: prompt.tags.clone(),
            reference_files,
            output_files,
        };

        fs::write(
            prompt_dir.join("prompt.json"),
            serde_json::to_vec_pretty(&prompt_manifest)?,
        )?;

        manifest_prompts.push(prompt_manifest);
    }

    let manifest = ExportManifest {
        exported_at: Utc::now().to_rfc3339(),
        project: ExportProjectManifest {
            id: project.id,
            name: project.name.clone(),
            global_suffix: project.global_suffix,
            custom_tags: project.custom_tags,
        },
        prompts: manifest_prompts,
    };

    fs::write(
        bundle_dir.join("manifest.json"),
        serde_json::to_vec_pretty(&manifest)?,
    )?;

    Ok(ProjectExportResult {
        bundle_path: bundle_dir.to_string_lossy().to_string(),
        project_name: project.name,
        prompt_count: selected_prompts.len() as i64,
        reference_count: exported_reference_count,
        output_count: exported_output_count,
    })
}

fn collect_text_column(conn: &rusqlite::Connection, sql: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(sql)?;
    let rows = stmt.query_map([], |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn remove_asset_files(paths: Vec<String>) -> usize {
    let mut removed = 0_usize;
    for path in paths {
        let file_path = PathBuf::from(path);
        if file_path.exists() && fs::remove_file(&file_path).is_ok() {
            removed += 1;
        }
    }
    removed
}

fn filter_export_prompts(
    all_prompts: Vec<crate::models::Prompt>,
    prompt_ids: Option<Vec<String>>,
) -> AppResult<Vec<crate::models::Prompt>> {
    match prompt_ids {
        Some(ids) => {
            let id_set = ids.into_iter().collect::<HashSet<_>>();
            let filtered = all_prompts
                .into_iter()
                .filter(|prompt| id_set.contains(&prompt.id))
                .collect::<Vec<_>>();
            if filtered.is_empty() {
                return Err(AppError::BadRequest(
                    "Select at least one prompt to export.".to_string(),
                ));
            }
            Ok(filtered)
        }
        None => {
            if all_prompts.is_empty() {
                return Err(AppError::BadRequest(
                    "This project does not have any prompts to export.".to_string(),
                ));
            }
            Ok(all_prompts)
        }
    }
}

fn export_media_group(
    target_dir: PathBuf,
    items: &[(&str, &str, &str)],
) -> AppResult<Vec<String>> {
    if items.is_empty() {
        return Ok(Vec::new());
    }

    fs::create_dir_all(&target_dir)?;
    let mut exported_files = Vec::new();
    for (index, (source_path, stored_path, fallback_prefix)) in items.iter().enumerate() {
        let stored = Path::new(stored_path);
        if !stored.exists() {
            continue;
        }
        let file_name = numbered_asset_name(index + 1, source_path, stored, fallback_prefix);
        fs::copy(stored, target_dir.join(&file_name))?;
        exported_files.push(file_name);
    }
    Ok(exported_files)
}

fn numbered_asset_name(index: usize, source_path: &str, stored_path: &Path, fallback_prefix: &str) -> String {
    let source = Path::new(source_path);
    let stem = source
        .file_stem()
        .or_else(|| stored_path.file_stem())
        .and_then(|value| value.to_str())
        .map(slugify)
        .filter(|value| !value.is_empty())
        .unwrap_or_else(|| fallback_prefix.to_string());
    let ext = stored_path
        .extension()
        .and_then(|value| value.to_str())
        .filter(|value| !value.is_empty())
        .map(|value| format!(".{value}"))
        .unwrap_or_default();
    format!("{index:02}_{stem}{ext}")
}

fn slugify(input: &str) -> String {
    let mut slug = String::new();
    let mut previous_dash = false;

    for ch in input.chars() {
        let is_word = ch.is_ascii_alphanumeric();
        if is_word {
            slug.push(ch.to_ascii_lowercase());
            previous_dash = false;
        } else if !previous_dash {
            slug.push('-');
            previous_dash = true;
        }
    }

    let slug = slug.trim_matches('-').to_string();
    if slug.is_empty() {
        "untitled".to_string()
    } else {
        slug
    }
}
