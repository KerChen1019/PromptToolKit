use crate::{
    error::AppResult,
    models::Project,
    repo::{id, now},
};
use rusqlite::{params, Connection};

fn parse_tags(json: String) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(&json).unwrap_or_default()
}

pub fn create(conn: &Connection, name: &str) -> AppResult<Project> {
    let item = Project {
        id: id(),
        name: name.to_string(),
        global_suffix: String::new(),
        custom_tags: vec![],
        created_at: now(),
        updated_at: now(),
    };
    conn.execute(
        "INSERT INTO projects(id, name, global_suffix, custom_tags_json, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5, ?6)",
        params![
            item.id,
            item.name,
            item.global_suffix,
            "[]",
            item.created_at,
            item.updated_at
        ],
    )?;
    Ok(item)
}

pub fn list(conn: &Connection) -> AppResult<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, global_suffix, custom_tags_json, created_at, updated_at
         FROM projects
         ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            global_suffix: row.get(2)?,
            custom_tags: parse_tags(row.get::<_, String>(3)?),
            created_at: row.get(4)?,
            updated_at: row.get(5)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn update(conn: &Connection, id: &str, name: &str, global_suffix: &str) -> AppResult<Project> {
    let updated_at = now();
    conn.execute(
        "UPDATE projects SET name = ?2, global_suffix = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, name, global_suffix, updated_at],
    )?;
    get(conn, id)
}

pub fn set_custom_tags(conn: &Connection, id: &str, tags: &[String]) -> AppResult<Project> {
    let json = serde_json::to_string(tags).unwrap_or_else(|_| "[]".to_string());
    conn.execute(
        "UPDATE projects SET custom_tags_json = ?2, updated_at = ?3 WHERE id = ?1",
        params![id, json, now()],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM projects WHERE id = ?1", [id])?;
    Ok(())
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Project> {
    let item = conn.query_row(
        "SELECT id, name, global_suffix, custom_tags_json, created_at, updated_at FROM projects WHERE id = ?1",
        [id],
        |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                global_suffix: row.get(2)?,
                custom_tags: parse_tags(row.get::<_, String>(3)?),
                created_at: row.get(4)?,
                updated_at: row.get(5)?,
            })
        },
    )?;
    Ok(item)
}
