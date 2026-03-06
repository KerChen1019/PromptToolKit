use crate::{
    error::AppResult,
    models::{AttributionCandidate, OutputImage},
    repo::{id, now},
};
use rusqlite::{params, Connection};

#[derive(Debug, Clone)]
pub struct CopyEventLite {
    pub prompt_version_id: String,
    pub copied_at: String,
    pub reason: String,
}

pub fn insert_output(
    conn: &Connection,
    project_id: &str,
    source_path: &str,
    stored_path: &str,
    model_hint: Option<&str>,
) -> AppResult<String> {
    let output_id = id();
    conn.execute(
        "INSERT INTO outputs(id, project_id, source_path, stored_path, model_hint, prompt_id, created_at)
         VALUES(?1, ?2, ?3, ?4, ?5, NULL, ?6)",
        params![output_id, project_id, source_path, stored_path, model_hint, now()],
    )?;
    Ok(output_id)
}

pub fn list_by_project(conn: &Connection, project_id: &str) -> AppResult<Vec<OutputImage>> {
    let mut stmt = conn.prepare(
        "SELECT o.id, o.project_id, o.source_path, o.stored_path, o.model_hint, o.prompt_id, p.title, o.created_at
         FROM outputs o
         LEFT JOIN prompts p ON p.id = o.prompt_id
         WHERE o.project_id = ?1
         ORDER BY o.created_at DESC",
    )?;
    let rows = stmt.query_map([project_id], |row| {
        Ok(OutputImage {
            id: row.get(0)?,
            project_id: row.get(1)?,
            source_path: row.get(2)?,
            stored_path: row.get(3)?,
            model_hint: row.get(4)?,
            prompt_id: row.get(5)?,
            prompt_title: row.get(6)?,
            created_at: row.get(7)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn recent_copy_events(conn: &Connection, project_id: &str, limit: i64) -> AppResult<Vec<CopyEventLite>> {
    let mut stmt = conn.prepare(
        "SELECT prompt_version_id, copied_at
         FROM copy_events
         WHERE project_id = ?1
         ORDER BY copied_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![project_id, limit], |row| {
        Ok(CopyEventLite {
            prompt_version_id: row.get(0)?,
            copied_at: row.get(1)?,
            reason: "recent copy_event fallback".to_string(),
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn insert_candidates(
    conn: &Connection,
    output_id: &str,
    candidates: &[AttributionCandidate],
) -> AppResult<Vec<AttributionCandidate>> {
    for candidate in candidates {
        conn.execute(
            "INSERT INTO output_attributions(id, output_id, prompt_version_id, score, reason, confirmed, created_at)
             VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7)",
            params![
                candidate.attribution_id,
                output_id,
                candidate.prompt_version_id,
                candidate.score,
                candidate.reason,
                if candidate.confirmed { 1 } else { 0 },
                now()
            ],
        )?;
    }
    Ok(candidates.to_vec())
}

pub fn list_candidates(conn: &Connection, output_id: &str) -> AppResult<Vec<AttributionCandidate>> {
    let mut stmt = conn.prepare(
        "SELECT id, prompt_version_id, score, reason, confirmed
         FROM output_attributions
         WHERE output_id = ?1
         ORDER BY score DESC",
    )?;
    let rows = stmt.query_map([output_id], |row| {
        Ok(AttributionCandidate {
            attribution_id: row.get(0)?,
            prompt_version_id: row.get(1)?,
            score: row.get(2)?,
            reason: row.get(3)?,
            confirmed: row.get::<_, i64>(4)? == 1,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn confirm_candidate(conn: &Connection, output_id: &str, attribution_id: &str) -> AppResult<Vec<AttributionCandidate>> {
    conn.execute(
        "UPDATE output_attributions SET confirmed = 0 WHERE output_id = ?1",
        [output_id],
    )?;
    conn.execute(
        "UPDATE output_attributions SET confirmed = 1 WHERE id = ?1 AND output_id = ?2",
        params![attribution_id, output_id],
    )?;
    let prompt_id: Option<String> = conn.query_row(
        "SELECT pv.prompt_id
         FROM output_attributions oa
         JOIN prompt_versions pv ON pv.id = oa.prompt_version_id
         WHERE oa.id = ?1 AND oa.output_id = ?2",
        params![attribution_id, output_id],
        |row| row.get(0),
    )?;
    conn.execute(
        "UPDATE outputs SET prompt_id = ?2 WHERE id = ?1",
        params![output_id, prompt_id],
    )?;
    list_candidates(conn, output_id)
}

pub fn link_to_prompt(conn: &Connection, output_id: &str, prompt_id: Option<&str>) -> AppResult<OutputImage> {
    conn.execute(
        "UPDATE outputs SET prompt_id = ?2 WHERE id = ?1",
        params![output_id, prompt_id],
    )?;
    get(conn, output_id)
}

pub fn delete(conn: &Connection, output_id: &str) -> AppResult<String> {
    let stored_path: String = conn.query_row(
        "SELECT stored_path FROM outputs WHERE id = ?1",
        [output_id],
        |row| row.get(0),
    )?;
    conn.execute("DELETE FROM outputs WHERE id = ?1", [output_id])?;
    Ok(stored_path)
}

pub fn get(conn: &Connection, output_id: &str) -> AppResult<OutputImage> {
    let item = conn.query_row(
        "SELECT o.id, o.project_id, o.source_path, o.stored_path, o.model_hint, o.prompt_id, p.title, o.created_at
         FROM outputs o
         LEFT JOIN prompts p ON p.id = o.prompt_id
         WHERE o.id = ?1",
        [output_id],
        |row| {
            Ok(OutputImage {
                id: row.get(0)?,
                project_id: row.get(1)?,
                source_path: row.get(2)?,
                stored_path: row.get(3)?,
                model_hint: row.get(4)?,
                prompt_id: row.get(5)?,
                prompt_title: row.get(6)?,
                created_at: row.get(7)?,
            })
        },
    )?;
    Ok(item)
}
