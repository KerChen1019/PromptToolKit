use crate::error::AppResult;
use chrono::Utc;
use rusqlite::Connection;
use tauri::Manager;

pub fn init_connection(app: &tauri::AppHandle) -> AppResult<(Connection, std::path::PathBuf)> {
    let app_data_dir = app
        .path()
        .app_data_dir()
        .map_err(|e| crate::error::AppError::BadRequest(e.to_string()))?;
    std::fs::create_dir_all(&app_data_dir)?;
    let db_path = app_data_dir.join("prompt_toolkit.db");
    let mut conn = Connection::open(db_path)?;
    conn.pragma_update(None, "journal_mode", "WAL")?;
    conn.pragma_update(None, "foreign_keys", "ON")?;
    run_migrations(&mut conn)?;
    let asset_dir = app_data_dir.join("assets");
    std::fs::create_dir_all(&asset_dir)?;
    Ok((conn, asset_dir))
}

fn run_migrations(conn: &mut Connection) -> AppResult<()> {
    conn.execute_batch(
        "CREATE TABLE IF NOT EXISTS schema_migrations (
            version TEXT PRIMARY KEY,
            applied_at TEXT NOT NULL
        );",
    )?;

    let migrations: [(&str, &str); 3] = [
        ("0001_init", include_str!("../../migrations/0001_init.sql")),
        ("0002_ai_runs", include_str!("../../migrations/0002_ai_runs.sql")),
        ("0003_prompt_starred", include_str!("../../migrations/0003_prompt_starred.sql")),
    ];

    for (version, sql) in migrations {
        let applied: bool = conn.query_row(
            "SELECT EXISTS(SELECT 1 FROM schema_migrations WHERE version = ?1)",
            [version],
            |row| row.get(0),
        )?;
        if !applied {
            conn.execute_batch(sql)?;
            conn.execute(
                "INSERT INTO schema_migrations(version, applied_at) VALUES(?1, ?2)",
                [version, Utc::now().to_rfc3339().as_str()],
            )?;
        }
    }
    Ok(())
}
