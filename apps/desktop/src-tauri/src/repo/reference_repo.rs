use crate::{
    error::AppResult,
    models::ReferenceAsset,
    repo::{id, now},
};
use rusqlite::{params, Connection};

pub fn insert_asset(
    conn: &Connection,
    project_id: &str,
    source_path: &str,
    stored_path: &str,
    file_hash: &str,
    width: Option<i64>,
    height: Option<i64>,
) -> AppResult<ReferenceAsset> {
    let item = ReferenceAsset {
        id: id(),
        project_id: project_id.to_string(),
        source_path: source_path.to_string(),
        stored_path: stored_path.to_string(),
        file_hash: file_hash.to_string(),
        width,
        height,
        tags: vec![],
        linked_prompt_version_id: None,
        prompt_id: None,
        created_at: now(),
    };
    conn.execute(
        "INSERT INTO reference_assets(id, project_id, source_path, stored_path, file_hash, width, height, linked_prompt_version_id, prompt_id, created_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10)",
        params![
            item.id,
            item.project_id,
            item.source_path,
            item.stored_path,
            item.file_hash,
            item.width,
            item.height,
            item.linked_prompt_version_id,
            item.prompt_id,
            item.created_at
        ],
    )?;
    Ok(item)
}

pub fn list(
    conn: &Connection,
    project_id: &str,
    tag_filter: Option<&str>,
    prompt_id_filter: Option<&str>,
) -> AppResult<Vec<ReferenceAsset>> {
    let mut items = Vec::new();

    // Build the query based on filters
    let base_cols = "ra.id, ra.project_id, ra.source_path, ra.stored_path, ra.file_hash, ra.width, ra.height, ra.linked_prompt_version_id, ra.prompt_id, ra.created_at";

    if let Some(filter) = tag_filter {
        let sql = format!(
            "SELECT DISTINCT {base_cols}
             FROM reference_assets ra
             JOIN reference_asset_tags rat ON rat.reference_asset_id = ra.id
             JOIN tags t ON t.id = rat.tag_id
             WHERE ra.project_id = ?1 AND t.name = ?2
             {}
             ORDER BY ra.created_at DESC",
            if prompt_id_filter.is_some() { "AND ra.prompt_id = ?3" } else { "" }
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = if let Some(pid) = prompt_id_filter {
            stmt.query_map(params![project_id, filter, pid], row_mapper)?
                .collect::<Result<Vec<_>, _>>()?
        } else {
            stmt.query_map(params![project_id, filter], row_mapper)?
                .collect::<Result<Vec<_>, _>>()?
        };
        for raw in rows {
            let id = raw.0.clone();
            let tags = list_tags(conn, &id)?;
            items.push(build_asset(raw, tags));
        }
    } else {
        let sql = format!(
            "SELECT {base_cols}
             FROM reference_assets ra
             WHERE ra.project_id = ?1
             {}
             ORDER BY ra.created_at DESC",
            if prompt_id_filter.is_some() { "AND ra.prompt_id = ?2" } else { "" }
        );
        let mut stmt = conn.prepare(&sql)?;
        let rows = if let Some(pid) = prompt_id_filter {
            stmt.query_map(params![project_id, pid], row_mapper)?
                .collect::<Result<Vec<_>, _>>()?
        } else {
            stmt.query_map(params![project_id], row_mapper)?
                .collect::<Result<Vec<_>, _>>()?
        };
        for raw in rows {
            let id = raw.0.clone();
            let tags = list_tags(conn, &id)?;
            items.push(build_asset(raw, tags));
        }
    }
    Ok(items)
}

type RawRow = (String, String, String, String, String, Option<i64>, Option<i64>, Option<String>, Option<String>, String);

fn row_mapper(row: &rusqlite::Row<'_>) -> rusqlite::Result<RawRow> {
    Ok((
        row.get(0)?,
        row.get(1)?,
        row.get(2)?,
        row.get(3)?,
        row.get(4)?,
        row.get(5)?,
        row.get(6)?,
        row.get(7)?,
        row.get(8)?,
        row.get(9)?,
    ))
}

fn build_asset(raw: RawRow, tags: Vec<String>) -> ReferenceAsset {
    ReferenceAsset {
        id: raw.0,
        project_id: raw.1,
        source_path: raw.2,
        stored_path: raw.3,
        file_hash: raw.4,
        width: raw.5,
        height: raw.6,
        linked_prompt_version_id: raw.7,
        prompt_id: raw.8,
        tags,
        created_at: raw.9,
    }
}

fn list_tags(conn: &Connection, asset_id: &str) -> AppResult<Vec<String>> {
    let mut stmt = conn.prepare(
        "SELECT t.name
         FROM tags t
         JOIN reference_asset_tags rat ON rat.tag_id = t.id
         WHERE rat.reference_asset_id = ?1
         ORDER BY t.name ASC",
    )?;
    let rows = stmt.query_map([asset_id], |row| row.get::<_, String>(0))?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn set_tags(conn: &Connection, asset_id: &str, tags: &[String]) -> AppResult<ReferenceAsset> {
    let project_id: String = conn.query_row(
        "SELECT project_id FROM reference_assets WHERE id = ?1",
        [asset_id],
        |row| row.get(0),
    )?;
    conn.execute(
        "DELETE FROM reference_asset_tags WHERE reference_asset_id = ?1",
        [asset_id],
    )?;

    for tag_name in tags {
        let existing_tag_id = conn.query_row(
            "SELECT id FROM tags WHERE project_id = ?1 AND name = ?2",
            params![project_id, tag_name],
            |row| row.get::<_, String>(0),
        );
        let tag_id = match existing_tag_id {
            Ok(value) => value,
            Err(_) => {
                let new_tag = id();
                conn.execute(
                    "INSERT INTO tags(id, project_id, name, created_at) VALUES(?1, ?2, ?3, ?4)",
                    params![new_tag, project_id, tag_name, now()],
                )?;
                new_tag
            }
        };
        conn.execute(
            "INSERT INTO reference_asset_tags(id, reference_asset_id, tag_id, created_at)
             VALUES(?1, ?2, ?3, ?4)",
            params![id(), asset_id, tag_id, now()],
        )?;
    }

    get(conn, asset_id)
}

pub fn link_to_prompt_version(
    conn: &Connection,
    asset_id: &str,
    prompt_version_id: &str,
) -> AppResult<()> {
    conn.execute(
        "UPDATE reference_assets SET linked_prompt_version_id = ?2 WHERE id = ?1",
        params![asset_id, prompt_version_id],
    )?;
    Ok(())
}

pub fn link_to_prompt(
    conn: &Connection,
    asset_id: &str,
    prompt_id: Option<&str>,
) -> AppResult<ReferenceAsset> {
    conn.execute(
        "UPDATE reference_assets SET prompt_id = ?2 WHERE id = ?1",
        params![asset_id, prompt_id],
    )?;
    get(conn, asset_id)
}

pub fn delete(conn: &Connection, asset_id: &str) -> AppResult<String> {
    let stored_path: String = conn.query_row(
        "SELECT stored_path FROM reference_assets WHERE id = ?1",
        [asset_id],
        |row| row.get(0),
    )?;
    conn.execute("DELETE FROM reference_assets WHERE id = ?1", [asset_id])?;
    Ok(stored_path)
}

pub fn get(conn: &Connection, asset_id: &str) -> AppResult<ReferenceAsset> {
    let raw = conn.query_row(
        "SELECT id, project_id, source_path, stored_path, file_hash, width, height, linked_prompt_version_id, prompt_id, created_at
         FROM reference_assets WHERE id = ?1",
        [asset_id],
        |row| {
            Ok(ReferenceAsset {
                id: row.get(0)?,
                project_id: row.get(1)?,
                source_path: row.get(2)?,
                stored_path: row.get(3)?,
                file_hash: row.get(4)?,
                width: row.get(5)?,
                height: row.get(6)?,
                linked_prompt_version_id: row.get(7)?,
                prompt_id: row.get(8)?,
                tags: vec![],
                created_at: row.get(9)?,
            })
        },
    )?;
    Ok(ReferenceAsset {
        tags: list_tags(conn, &raw.id)?,
        ..raw
    })
}
