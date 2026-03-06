use crate::{
    error::AppResult,
    models::Snippet,
    repo::{id, now},
};
use rusqlite::{params, Connection};

fn parse_tags(tags_json: String) -> Vec<String> {
    serde_json::from_str::<Vec<String>>(&tags_json).unwrap_or_default()
}

pub fn create(
    conn: &Connection,
    project_id: &str,
    name: &str,
    scope: &str,
    content: &str,
    tags: &[String],
) -> AppResult<Snippet> {
    let item = Snippet {
        id: id(),
        project_id: project_id.to_string(),
        name: name.to_string(),
        scope: scope.to_string(),
        content: content.to_string(),
        tags: tags.to_vec(),
        created_at: now(),
        updated_at: now(),
    };
    conn.execute(
        "INSERT INTO snippets(id, project_id, name, scope, content, tags_json, created_at, updated_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)",
        params![
            item.id,
            item.project_id,
            item.name,
            item.scope,
            item.content,
            serde_json::to_string(&item.tags)?,
            item.created_at,
            item.updated_at
        ],
    )?;
    Ok(item)
}

pub fn list(conn: &Connection, project_id: &str) -> AppResult<Vec<Snippet>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, scope, content, tags_json, created_at, updated_at
         FROM snippets WHERE project_id = ?1
         ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([project_id], |row| {
        let tags_json: String = row.get(5)?;
        Ok(Snippet {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            scope: row.get(3)?,
            content: row.get(4)?,
            tags: parse_tags(tags_json),
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_by_scope(conn: &Connection, project_id: &str, scope: &str) -> AppResult<Vec<Snippet>> {
    let mut stmt = conn.prepare(
        "SELECT id, project_id, name, scope, content, tags_json, created_at, updated_at
         FROM snippets WHERE project_id = ?1 AND scope = ?2
         ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([project_id, scope], |row| {
        let tags_json: String = row.get(5)?;
        Ok(Snippet {
            id: row.get(0)?,
            project_id: row.get(1)?,
            name: row.get(2)?,
            scope: row.get(3)?,
            content: row.get(4)?,
            tags: parse_tags(tags_json),
            created_at: row.get(6)?,
            updated_at: row.get(7)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn update(
    conn: &Connection,
    id: &str,
    name: &str,
    scope: &str,
    content: &str,
    tags: &[String],
) -> AppResult<Snippet> {
    conn.execute(
        "UPDATE snippets
         SET name = ?2, scope = ?3, content = ?4, tags_json = ?5, updated_at = ?6
         WHERE id = ?1",
        params![id, name, scope, content, serde_json::to_string(tags)?, now()],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM snippets WHERE id = ?1", [id])?;
    Ok(())
}

pub fn get(conn: &Connection, id: &str) -> AppResult<Snippet> {
    let item = conn.query_row(
        "SELECT id, project_id, name, scope, content, tags_json, created_at, updated_at
         FROM snippets WHERE id = ?1",
        [id],
        |row| {
            let tags_json: String = row.get(5)?;
            Ok(Snippet {
                id: row.get(0)?,
                project_id: row.get(1)?,
                name: row.get(2)?,
                scope: row.get(3)?,
                content: row.get(4)?,
                tags: parse_tags(tags_json),
                created_at: row.get(6)?,
                updated_at: row.get(7)?,
            })
        },
    )?;
    Ok(item)
}
