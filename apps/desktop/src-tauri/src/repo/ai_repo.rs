use crate::{
    error::AppResult,
    models::{AIProvider, ProviderKind},
    repo::{id, now},
};
use rusqlite::{params, Connection};

pub fn create(
    conn: &Connection,
    name: &str,
    kind: ProviderKind,
    base_url: &str,
    model: &str,
    enabled: bool,
    secret_ref_id: &str,
) -> AppResult<AIProvider> {
    let item = AIProvider {
        id: id(),
        name: name.to_string(),
        kind,
        base_url: base_url.to_string(),
        model: model.to_string(),
        enabled,
        secret_ref_id: secret_ref_id.to_string(),
        created_at: now(),
        updated_at: now(),
    };
    conn.execute(
        "INSERT INTO ai_providers(id, name, kind, base_url, model, enabled, secret_ref_id, created_at, updated_at)
         VALUES(?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)",
        params![
            item.id,
            item.name,
            item.kind.as_str(),
            item.base_url,
            item.model,
            if item.enabled { 1 } else { 0 },
            item.secret_ref_id,
            item.created_at,
            item.updated_at
        ],
    )?;
    Ok(item)
}

pub fn insert_secret_ref(conn: &Connection, key_name: &str) -> AppResult<String> {
    let secret_ref_id = id();
    conn.execute(
        "INSERT INTO ai_provider_secrets_ref(id, key_name, created_at)
         VALUES(?1, ?2, ?3)",
        params![secret_ref_id, key_name, now()],
    )?;
    Ok(secret_ref_id)
}

pub fn list(conn: &Connection) -> AppResult<Vec<AIProvider>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, kind, base_url, model, enabled, secret_ref_id, created_at, updated_at
         FROM ai_providers
         ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        let kind_raw: String = row.get(2)?;
        let kind = parse_kind(&kind_raw);
        Ok(AIProvider {
            id: row.get(0)?,
            name: row.get(1)?,
            kind,
            base_url: row.get(3)?,
            model: row.get(4)?,
            enabled: row.get::<_, i64>(5)? == 1,
            secret_ref_id: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn list_enabled(conn: &Connection) -> AppResult<Vec<AIProvider>> {
    let mut stmt = conn.prepare(
        "SELECT id, name, kind, base_url, model, enabled, secret_ref_id, created_at, updated_at
         FROM ai_providers
         WHERE enabled = 1
         ORDER BY updated_at DESC",
    )?;
    let rows = stmt.query_map([], |row| {
        let kind_raw: String = row.get(2)?;
        let kind = parse_kind(&kind_raw);
        Ok(AIProvider {
            id: row.get(0)?,
            name: row.get(1)?,
            kind,
            base_url: row.get(3)?,
            model: row.get(4)?,
            enabled: row.get::<_, i64>(5)? == 1,
            secret_ref_id: row.get(6)?,
            created_at: row.get(7)?,
            updated_at: row.get(8)?,
        })
    })?;
    Ok(rows.collect::<Result<Vec<_>, _>>()?)
}

pub fn get(conn: &Connection, id: &str) -> AppResult<AIProvider> {
    let item = conn.query_row(
        "SELECT id, name, kind, base_url, model, enabled, secret_ref_id, created_at, updated_at
         FROM ai_providers WHERE id = ?1",
        [id],
        |row| {
            let kind_raw: String = row.get(2)?;
            Ok(AIProvider {
                id: row.get(0)?,
                name: row.get(1)?,
                kind: parse_kind(&kind_raw),
                base_url: row.get(3)?,
                model: row.get(4)?,
                enabled: row.get::<_, i64>(5)? == 1,
                secret_ref_id: row.get(6)?,
                created_at: row.get(7)?,
                updated_at: row.get(8)?,
            })
        },
    )?;
    Ok(item)
}

pub fn update(
    conn: &Connection,
    id: &str,
    name: &str,
    kind: ProviderKind,
    base_url: &str,
    model: &str,
    enabled: bool,
) -> AppResult<AIProvider> {
    conn.execute(
        "UPDATE ai_providers
         SET name = ?2, kind = ?3, base_url = ?4, model = ?5, enabled = ?6, updated_at = ?7
         WHERE id = ?1",
        params![
            id,
            name,
            kind.as_str(),
            base_url,
            model,
            if enabled { 1 } else { 0 },
            now()
        ],
    )?;
    get(conn, id)
}

pub fn delete(conn: &Connection, id: &str) -> AppResult<()> {
    conn.execute("DELETE FROM ai_providers WHERE id = ?1", [id])?;
    Ok(())
}

pub fn secret_key_name(conn: &Connection, secret_ref_id: &str) -> AppResult<String> {
    let key_name = conn.query_row(
        "SELECT key_name FROM ai_provider_secrets_ref WHERE id = ?1",
        [secret_ref_id],
        |row| row.get(0),
    )?;
    Ok(key_name)
}

pub fn get_default_provider_id(conn: &Connection) -> AppResult<Option<String>> {
    get_setting_value(conn, "default_llm_provider_id")
}

pub fn set_default_provider_id(conn: &Connection, provider_id: Option<&str>) -> AppResult<()> {
    set_setting_value(conn, "default_llm_provider_id", provider_id.unwrap_or(""))
}

pub fn get_default_vlm_provider_id(conn: &Connection) -> AppResult<Option<String>> {
    get_setting_value(conn, "default_vlm_provider_id")
}

pub fn set_default_vlm_provider_id(conn: &Connection, provider_id: Option<&str>) -> AppResult<()> {
    set_setting_value(conn, "default_vlm_provider_id", provider_id.unwrap_or(""))
}

pub fn get_app_setting(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    get_setting_value(conn, key)
}

pub fn set_app_setting(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    set_setting_value(conn, key, value)
}

fn get_setting_value(conn: &Connection, key: &str) -> AppResult<Option<String>> {
    let value = conn.query_row(
        "SELECT value FROM app_settings WHERE key = ?1",
        [key],
        |row| row.get::<_, String>(0),
    );
    match value {
        Ok(v) if v.trim().is_empty() => Ok(None),
        Ok(v) => Ok(Some(v)),
        Err(_) => Ok(None),
    }
}

fn set_setting_value(conn: &Connection, key: &str, value: &str) -> AppResult<()> {
    conn.execute(
        "INSERT INTO app_settings(key, value, updated_at)
         VALUES(?1, ?2, ?3)
         ON CONFLICT(key) DO UPDATE SET value = excluded.value, updated_at = excluded.updated_at",
        params![key, value, now()],
    )?;
    Ok(())
}

pub fn resolve_effective_provider(
    conn: &Connection,
    provider_id_override: Option<&str>,
) -> AppResult<Option<AIProvider>> {
    if let Some(provider_id) = provider_id_override {
        return Ok(Some(get(conn, provider_id)?));
    }
    if let Some(default_id) = get_default_provider_id(conn)? {
        if let Ok(provider) = get(conn, &default_id) {
            return Ok(Some(provider));
        }
    }
    let enabled = list_enabled(conn)?;
    Ok(enabled.into_iter().next())
}

pub fn resolve_effective_vlm_provider(
    conn: &Connection,
    provider_id_override: Option<&str>,
) -> AppResult<Option<AIProvider>> {
    if let Some(provider_id) = provider_id_override {
        return Ok(Some(get(conn, provider_id)?));
    }
    if let Some(default_id) = get_default_vlm_provider_id(conn)? {
        if let Ok(provider) = get(conn, &default_id) {
            return Ok(Some(provider));
        }
    }
    let enabled = list_enabled(conn)?;
    Ok(enabled.into_iter().next())
}

fn parse_kind(kind: &str) -> ProviderKind {
    match kind {
        "openai_compatible" => ProviderKind::OpenaiCompatible,
        "openai" => ProviderKind::Openai,
        "anthropic" => ProviderKind::Anthropic,
        "gemini" => ProviderKind::Gemini,
        _ => ProviderKind::OpenaiCompatible,
    }
}
