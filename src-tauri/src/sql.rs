use rusqlite::Connection;
use std::fs;
use std::path::{Path, PathBuf};
use std::time::Duration;

pub const APP_DB_DIR: &str = "db";

pub fn app_db_dir(cache_dir: &Path) -> PathBuf {
    cache_dir.join(APP_DB_DIR)
}

pub fn open_app_db(cache_dir: &Path, file_name: &str) -> Result<Connection, String> {
    let db_dir = app_db_dir(cache_dir);
    fs::create_dir_all(&db_dir)
        .map_err(|e| format!("Failed to create app db directory: {e}"))?;

    let db_path = db_dir.join(file_name);
    let conn =
        Connection::open(&db_path).map_err(|e| format!("Failed to open database {:?}: {e}", db_path))?;

    let _ = conn.pragma_update(None, "journal_mode", "WAL");
    let _ = conn.pragma_update(None, "synchronous", "NORMAL");
    let _ = conn.busy_timeout(Duration::from_secs(3));

    Ok(conn)
}
