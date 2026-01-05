use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

use rusqlite::{params, Connection};
use serde::Serialize;

const SIGNATURES_DB_FILE: &str = "signatures.db";

// Global signature database connection
static SIGNATURE_DB: Mutex<Option<SignatureDb>> = Mutex::new(None);

struct SignatureDb {
    conn: Connection,
}

#[derive(Debug, Clone, Serialize)]
pub struct SignatureInfo {
    pub id: String,
    #[serde(rename = "imageData")]
    pub image_data: Vec<u8>,
    #[serde(rename = "createdAt")]
    pub created_at: i64,
}

impl SignatureDb {
    fn new(base_dir: &Path) -> Result<Self, String> {
        std::fs::create_dir_all(base_dir)
            .map_err(|e| format!("Failed to create signature db directory: {e}"))?;

        let db_path = base_dir.join(SIGNATURES_DB_FILE);
        let conn = Connection::open(db_path)
            .map_err(|e| format!("Failed to open signature database: {e}"))?;

        // Enable WAL mode for better concurrent access
        let _ = conn.pragma_update(None, "journal_mode", "WAL");
        let _ = conn.pragma_update(None, "synchronous", "NORMAL");

        conn.execute(
            "CREATE TABLE IF NOT EXISTS signatures (
                id TEXT PRIMARY KEY,
                image_data BLOB NOT NULL,
                created_at INTEGER NOT NULL
            )",
            [],
        )
        .map_err(|e| format!("Failed to create signatures table: {e}"))?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_signatures_created ON signatures(created_at DESC)",
            [],
        )
        .ok();

        Ok(Self { conn })
    }

    fn list(&self) -> Result<Vec<SignatureInfo>, String> {
        let mut stmt = self
            .conn
            .prepare("SELECT id, image_data, created_at FROM signatures ORDER BY created_at DESC")
            .map_err(|e| format!("Failed to prepare list query: {e}"))?;

        let rows = stmt
            .query_map([], |row| {
                Ok(SignatureInfo {
                    id: row.get(0)?,
                    image_data: row.get(1)?,
                    created_at: row.get(2)?,
                })
            })
            .map_err(|e| format!("Failed to query signatures: {e}"))?;

        let mut signatures = Vec::new();
        for row in rows {
            signatures.push(row.map_err(|e| format!("Failed to read signature row: {e}"))?);
        }

        Ok(signatures)
    }

    fn add(&self, image_data: Vec<u8>) -> Result<SignatureInfo, String> {
        let now = SystemTime::now()
            .duration_since(UNIX_EPOCH)
            .map_err(|e| format!("System time error: {e}"))?
            .as_millis() as i64;

        let id = format!("sig-{}", now);

        self.conn
            .execute(
                "INSERT INTO signatures (id, image_data, created_at) VALUES (?1, ?2, ?3)",
                params![id, image_data, now],
            )
            .map_err(|e| format!("Failed to insert signature: {e}"))?;

        Ok(SignatureInfo {
            id,
            image_data,
            created_at: now,
        })
    }

    fn delete(&self, id: &str) -> Result<(), String> {
        self.conn
            .execute("DELETE FROM signatures WHERE id = ?1", params![id])
            .map_err(|e| format!("Failed to delete signature: {e}"))?;

        Ok(())
    }
}

/// Initialize the signature database
pub fn init_signature_db(cache_dir: &Path) {
    let db_dir = cache_dir.join("db");
    match SignatureDb::new(&db_dir) {
        Ok(db) => {
            let mut guard = SIGNATURE_DB.lock().expect("signature db mutex poisoned");
            *guard = Some(db);
            log::info!("Signature database initialized at {:?}", db_dir);
        }
        Err(e) => {
            log::error!("Failed to initialize signature database: {}", e);
        }
    }
}

fn with_db<T, F>(f: F) -> Result<T, String>
where
    F: FnOnce(&SignatureDb) -> Result<T, String>,
{
    let guard = SIGNATURE_DB.lock().expect("signature db mutex poisoned");
    match guard.as_ref() {
        Some(db) => f(db),
        None => Err("Signature database not initialized".to_string()),
    }
}

#[tauri::command]
pub fn signature_list() -> Result<Vec<SignatureInfo>, String> {
    with_db(|db| db.list())
}

#[tauri::command]
pub fn signature_add(image_data: Vec<u8>) -> Result<SignatureInfo, String> {
    with_db(|db| db.add(image_data))
}

#[tauri::command]
pub fn signature_delete(id: String) -> Result<(), String> {
    with_db(|db| db.delete(&id))
}
