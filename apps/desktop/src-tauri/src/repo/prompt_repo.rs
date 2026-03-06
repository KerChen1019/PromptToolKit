use crate::{
    error::AppResult,
    models::{Prompt, PromptVersion},
    repo::{id, now},
};
use rusqlite::{params, Connection};

fn parse_tags(json: String) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(&json).unwrap_or_default()
}

pub fn create(conn: &Connection, project_id: &str, title: &str, draft: &str) -> AppResult<Prompt> {
    let item = Prompt {
        id: id(),
        project_id: project_id.to_string(),
        title: title.to_string(),
        current_draft: draft.to_string(),
        current_version_id: None,
        starred: false,
        tags: vec![],
        created_at: now(),
        updated_at: now(),
    };
    conn.execute(
        "INSERT INTO prompts(id, project_id, title, current_draft, current_version_id, starred, tags_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            item.id,
            item.project_id,
            item.title,
            item.current_draft,
            item.current_version_id,
            item.starred as i64,
            "[]",
            item.created_at,
            item.updated_at
        ],
    )?;
    Ok(item)
}

pub fn list_by_project(conn: &Connection, project_id: &str) -> AppResult<Vec<Prompt>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, title, current_draft, current_version_id, starred, tags_json, created_at, updated_at
         FROM prompts
         WHERE project_id = ?1
         ORDER BY starred DESC, updated_at DESC",
    )?;
    let rows = stmt.query_map([project_id], |row| {
        Ok(Prompt {
            id: row.get(0)?,
            project_id: row.get(1)?,
            title: row.get(2)?,
            current_draft: row.get(3)?,
            current_version_id: row.get(4)?,
            starred: row.get::<_, i64>(5)? != 0,
            tags: parse_tags(row.get::<_, String>(6)?),
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn update_title(conn: &Connection, prompt_id: &str, title: &str) -> AppResult<Prompt> {
    let updated_at = now();
    conn.execute(
        "UPDATE prompts SET title = ?2, updated_at = ?3 WHERE id = ?1",
        params![prompt_id, title, updated_at],
    )?;
    get(conn, prompt_id)
}

pub fn save_draft(conn: &Connection, prompt_id: &str, draft: &str) -> AppResult<Prompt> {
    let updated_at = now();
    conn.execute(
        "UPDATE prompts SET current_draft = ?2, updated_at = ?3 WHERE id = ?1",
        params![prompt_id, draft, updated_at],
    )?;
    get(conn, prompt_id)
}

pub fn toggle_star(conn: &Connection, prompt_id: &str) -> AppResult<Prompt> {
    conn.execute(
        "UPDATE prompts SET starred = CASE WHEN starred = 0 THEN 1 ELSE 0 END WHERE id = ?1",
        [prompt_id],
    )?;
    get(conn, prompt_id)
}

pub fn delete(conn: &Connection, prompt_id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM prompts WHERE id = ?1", [prompt_id])?;
    Ok(())
}

pub fn set_tags(conn: &Connection, prompt_id: &str, tags: &[String]) -> AppResult<Prompt> {
    let tags_json = serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "UPDATE prompts SET tags_json = ?2, updated_at = ?3 WHERE id = ?1",
        params![prompt_id, tags_json, now()],
    )?;
    get(conn, prompt_id)
}

pub fn commit_version(
    conn: &Connection,
    prompt_id: &str,
    raw_text: &str,
    commit_message: Option<&str>,
    operator: &str,
) -> AppResult<PromptVersion> {
    let version = PromptVersion {
        id: id(),
        prompt_id: prompt_id.to_string(),
        raw_text: raw_text.to_string(),
        commit_message: commit_message.map(std::string::ToString::to_string),
        operator: operator.to_string(),
        created_at: now(),
    };
    conn.execute(
        "INSERT INTO prompt_versions(id, prompt_id, raw_text, commit_message, operator, created_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            version.id,
            version.prompt_id,
            version.raw_text,
            version.commit_message,
            version.operator,
            version.created_at
        ],
    )?;
    conn.execute(
        "UPDATE prompts
         SET current_draft = ?2, current_version_id = ?3, updated_at = ?4
         WHERE id = ?1",
        params![prompt_id, raw_text, version.id, now()],
    )?;
    Ok(version)
}

pub fn list_versions(conn: &Connection, prompt_id: &str) -> AppResult<Vec<PromptVersion>> {
    let mut stmt = conn.prepare(
        "SELECT id, prompt_id, raw_text, commit_message, operator, created_at
         FROM prompt_versions
         WHERE prompt_id = ?1
         ORDER BY created_at DESC",
    )?;
    let rows = stmt.query_map([prompt_id], |row| {
        Ok(PromptVersion {
            id: row.get(0)?,
            prompt_id: row.get(1)?,
            raw_text: row.get(2)?,
            commit_message: row.get(3)?,
            operator: row.get(4)?,
            created_at: row.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get_version_text(conn: &Connection, version_id: &str) -> AppResult<String> {
    let raw_text = conn.query_row(
        "SELECT raw_text FROM prompt_versions WHERE id = ?1",
        [version_id],
        |row| row.get(0),
    )?;
    Ok(raw_text)
}

pub fn restore_version(conn: &Connection, prompt_id: &str, version_id: &str) -> AppResult<Prompt> {
    let raw_text = get_version_text(conn, version_id)?;
    conn.execute(
        "UPDATE prompts
         SET current_draft = ?2, current_version_id = ?3, updated_at = ?4
         WHERE id = ?1",
        params![prompt_id, raw_text, version_id, now()],
    )?;
    get(conn, prompt_id)
}

pub fn get(conn: &Connection, prompt_id: &str) -> AppResult<Prompt> {
    let item = conn.query_row(
        "SELECT id, project_id, title, current_draft, current_version_id, starred, tags_json, created_at, updated_at
         FROM prompts WHERE id = ?1",
        [prompt_id],
        |row| {
            Ok(Prompt {
                id: row.get(0)?,
                project_id: row.get(1)?,
                title: row.get(2)?,
                current_draft: row.get(3)?,
                current_version_id: row.get(4)?,
                starred: row.get::<_, i64>(5)? != 0,
                tags: parse_tags(row.get::<_, String>(6)?),
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    )?;
    Ok(item)
}
