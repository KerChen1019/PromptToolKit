use crate::{
    error::AppResult,
    models::Project,
    repo::{id, now},
};
use rusqlite::{params, Connection};

pub fn create(conn: &Connection, name: &str) -> AppResult<Project> {
    let item = Project {
        id: id(),
        name: name.to_string(),
        global_suffix: String::new(),
        created_at: now(),
        updated_at: now(),
    };
    conn.execute(
        "INSERT INTO projects(id, name, global_suffix, created_at, updated_at)
         VALUES (?1, ?2, ?3, ?4, ?5)",
        params![
            item.id,
            item.name,
            item.global_suffix,
            item.created_at,
            item.updated_at
        ],
    )?;
    Ok(item)
}

pub fn list(conn: &Connection) -> AppResult<Vec<Project>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, global_suffix, created_at, updated_at
         FROM projects
         ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        Ok(Project {
            id: row.get(0)?,
            name: row.get(1)?,
            global_suffix: row.get(2)?,
            created_at: row.get(3)?,
            updated_at: row.get(4)?,
        })
    })?;
    let collected = rows.collect::<Result<Vec<_>, _>>()?;
    Ok(collected)
}

pub fn update(conn: &Connection, id: &str, name: &str, global_suffix: &str) -> AppResult<Project> {
    let updated_at = now();
    conn.execute(
        "UPDATE projects SET name = ?2, global_suffix = ?3, updated_at = ?4 WHERE id = ?1",
        params![id, name, global_suffix, updated_at],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM projects WHERE id = ?1", [id])?;
    Ok(())
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Project> {
    let item = conn.query_row(
        "SELECT id, name, global_suffix, created_at, updated_at FROM projects WHERE id = ?1",
        [id],
        |row| {
            Ok(Project {
                id: row.get(0)?,
                name: row.get(1)?,
                global_suffix: row.get(2)?,
                created_at: row.get(3)?,
                updated_at: row.get(4)?,
            })
        },
    )?;
    Ok(item)
}
