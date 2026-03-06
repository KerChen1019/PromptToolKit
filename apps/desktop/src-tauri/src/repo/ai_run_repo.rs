use crate::{
    error::AppResult,
    models::AIRunHistoryEntry,
    repo::{id, now},
};
use rusqlite::{params, Connection};

pub struct InsertAiRunInput<'a> {
    pub project_id: &'a str,
    pub prompt_id: Option<&'a str>,
    pub run_type: &'a str,
    pub provider_id: &'a str,
    pub model: &'a str,
    pub input_json: &'a str,
    pub output_json: Option<&'a str>,
    pub status: &'a str,
    pub error_message: Option<&'a str>,
    pub latency_ms: i64,
}

pub fn insert(conn: &Connection, input: InsertAiRunInput<'_>) -> AppResult<String> {
    let run_id = id();
    conn.execute(
        "INSERT INTO ai_runs(id, project_id, prompt_id, run_type, provider_id, model, input_json, output_json, status, error_message, latency_ms, created_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
        params![
            run_id,
            input.project_id,
            input.prompt_id,
            input.run_type,
            input.provider_id,
            input.model,
            input.input_json,
            input.output_json,
            input.status,
            input.error_message,
            input.latency_ms,
            now(),
        ],
    )?;
    Ok(run_id)
}

pub fn list(
    conn: &Connection,
    project_id: &str,
    run_type: Option<&str>,
    limit: i64,
) -> AppResult<Vec<AIRunHistoryEntry>> {
    if let Some(run_type) = run_type {
        let mut stmt = conn.prepare(
            "SELECT id, project_id, prompt_id, run_type, provider_id, model, status, error_message, latency_ms, created_at
             FROM ai_runs
             WHERE project_id = ?1 AND run_type = ?2
             ORDER BY created_at DESC
             LIMIT ?3",
        )?;
        let rows = stmt.query_map(params![project_id, run_type, limit], map_row)?;
        return Ok(rows.collect::<Result<Vec<_>, _>>()?);
    }

    let mut stmt = conn.prepare(
        "SELECT id, project_id, prompt_id, run_type, provider_id, model, status, error_message, latency_ms, created_at
         FROM ai_runs
         WHERE project_id = ?1
         ORDER BY created_at DESC
         LIMIT ?2",
    )?;
    let rows = stmt.query_map(params![project_id, limit], map_row)?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

fn map_row(row: &rusqlite::Row<'_>) -> Result<AIRunHistoryEntry, rusqlite::Error> {
    Ok(AIRunHistoryEntry {
        id: row.get(0)?,
        project_id: row.get(1)?,
        prompt_id: row.get(2)?,
        run_type: row.get(3)?,
        provider_id: row.get(4)?,
        model: row.get(5)?,
        status: row.get(6)?,
        error_message: row.get(7)?,
        latency_ms: row.get(8)?,
        created_at: row.get(9)?,
    })
}
