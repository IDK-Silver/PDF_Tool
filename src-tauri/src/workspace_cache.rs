use crate::error::AppError;
use crate::sql::open_app_db;
use image::RgbaImage;
use once_cell::sync::Lazy;
use rusqlite::{Connection, OptionalExtension, params};
use std::path::Path;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const WORKSPACE_CACHE_DB_FILE: &str = "workspace_cache.db";
const WORKSPACE_IMAGE_CACHE_SOFT_LIMIT_BYTES: i64 = 256 * 1024 * 1024;

static WORKSPACE_CACHE_DB: Lazy<Mutex<Option<WorkspaceCacheDb>>> = Lazy::new(|| Mutex::new(None));

struct WorkspaceCacheDb {
    conn: Connection,
}

pub struct WorkspaceImageCacheKey {
    pub path: String,
    pub file_size: u64,
    pub modified_ns: i64,
    pub target_width: u32,
    pub resize_method: &'static str,
}

pub struct CachedWorkspaceImage {
    pub source_width: u32,
    pub source_height: u32,
    pub image: RgbaImage,
}

impl WorkspaceCacheDb {
    fn new(cache_dir: &Path) -> Result<Self, String> {
        let conn = open_app_db(cache_dir, WORKSPACE_CACHE_DB_FILE)?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS workspace_resized_images (
                path TEXT NOT NULL,
                file_size INTEGER NOT NULL,
                modified_ns INTEGER NOT NULL,
                target_width INTEGER NOT NULL,
                resize_method TEXT NOT NULL,
                source_width INTEGER NOT NULL,
                source_height INTEGER NOT NULL,
                output_width INTEGER NOT NULL,
                output_height INTEGER NOT NULL,
                pixels BLOB NOT NULL,
                payload_size INTEGER NOT NULL,
                updated_at INTEGER NOT NULL,
                PRIMARY KEY (path, file_size, modified_ns, target_width, resize_method)
            )",
            [],
        )
        .map_err(|e| format!("Failed to create workspace cache table: {e}"))?;

        conn.execute(
            "CREATE INDEX IF NOT EXISTS idx_workspace_resized_images_updated_at
             ON workspace_resized_images(updated_at)",
            [],
        )
        .ok();

        Ok(Self { conn })
    }

    fn get(&self, key: &WorkspaceImageCacheKey) -> Result<Option<CachedWorkspaceImage>, String> {
        let mut stmt = self
            .conn
            .prepare_cached(
                "SELECT source_width, source_height, output_width, output_height, pixels
                 FROM workspace_resized_images
                 WHERE path = ?1 AND file_size = ?2 AND modified_ns = ?3
                 AND target_width = ?4 AND resize_method = ?5",
            )
            .map_err(|e| format!("Failed to prepare workspace cache read: {e}"))?;

        let row = stmt
            .query_row(
                params![
                    key.path.as_str(),
                    u64_to_i64(key.file_size),
                    key.modified_ns,
                    u32_to_i64(key.target_width),
                    key.resize_method,
                ],
                |row| {
                    Ok((
                        row.get::<_, i64>(0)?,
                        row.get::<_, i64>(1)?,
                        row.get::<_, i64>(2)?,
                        row.get::<_, i64>(3)?,
                        row.get::<_, Vec<u8>>(4)?,
                    ))
                },
            )
            .optional()
            .map_err(|e| format!("Failed to query workspace cache: {e}"))?;

        let Some((source_width, source_height, output_width, output_height, pixels)) = row else {
            return Ok(None);
        };

        let source_width = i64_to_u32(source_width)?;
        let source_height = i64_to_u32(source_height)?;
        let output_width = i64_to_u32(output_width)?;
        let output_height = i64_to_u32(output_height)?;
        let image = RgbaImage::from_raw(output_width, output_height, pixels)
            .ok_or_else(|| "Failed to rebuild cached workspace image".to_string())?;

        let _ = self.conn.execute(
            "UPDATE workspace_resized_images SET updated_at = ?1
             WHERE path = ?2 AND file_size = ?3 AND modified_ns = ?4
             AND target_width = ?5 AND resize_method = ?6",
            params![
                unix_ts_secs(),
                key.path.as_str(),
                u64_to_i64(key.file_size),
                key.modified_ns,
                u32_to_i64(key.target_width),
                key.resize_method,
            ],
        );

        Ok(Some(CachedWorkspaceImage {
            source_width,
            source_height,
            image,
        }))
    }

    fn put(
        &self,
        key: &WorkspaceImageCacheKey,
        source_width: u32,
        source_height: u32,
        image: &RgbaImage,
    ) -> Result<(), String> {
        let pixels = image.as_raw();
        let ts = unix_ts_secs();

        self.conn
            .execute(
                "INSERT OR REPLACE INTO workspace_resized_images
                 (path, file_size, modified_ns, target_width, resize_method,
                  source_width, source_height, output_width, output_height,
                  pixels, payload_size, updated_at)
                 VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9, ?10, ?11, ?12)",
                params![
                    key.path.as_str(),
                    u64_to_i64(key.file_size),
                    key.modified_ns,
                    u32_to_i64(key.target_width),
                    key.resize_method,
                    u32_to_i64(source_width),
                    u32_to_i64(source_height),
                    u32_to_i64(image.width()),
                    u32_to_i64(image.height()),
                    pixels,
                    u64_to_i64(pixels.len() as u64),
                    ts,
                ],
            )
            .map_err(|e| format!("Failed to write workspace cache: {e}"))?;

        let _ = self.prune(WORKSPACE_IMAGE_CACHE_SOFT_LIMIT_BYTES);
        Ok(())
    }

    fn prune(&self, budget_bytes: i64) -> rusqlite::Result<()> {
        let total: i64 = self.conn.query_row(
            "SELECT IFNULL(SUM(payload_size), 0) FROM workspace_resized_images",
            [],
            |row| row.get(0),
        )?;

        if total <= budget_bytes {
            return Ok(());
        }

        let mut to_remove = total - budget_bytes;
        let mut stmt = self.conn.prepare(
            "SELECT rowid, payload_size
             FROM workspace_resized_images
             ORDER BY updated_at ASC",
        )?;
        let mut rows = stmt.query([])?;
        let mut victims: Vec<i64> = Vec::new();

        while to_remove > 0 {
            if let Some(row) = rows.next()? {
                let rowid: i64 = row.get(0)?;
                let size: i64 = row.get(1)?;
                victims.push(rowid);
                if size >= to_remove {
                    break;
                }
                to_remove = to_remove.saturating_sub(size);
            } else {
                break;
            }
        }

        for rowid in victims {
            let _ = self.conn.execute(
                "DELETE FROM workspace_resized_images WHERE rowid = ?1",
                params![rowid],
            );
        }

        Ok(())
    }
}

pub fn init_workspace_cache(cache_dir: &Path) {
    match WorkspaceCacheDb::new(cache_dir) {
        Ok(db) => {
            let mut guard = WORKSPACE_CACHE_DB
                .lock()
                .expect("workspace cache db mutex poisoned");
            *guard = Some(db);
            log::info!("Workspace cache database initialized");
        }
        Err(err) => {
            log::error!("Failed to initialize workspace cache database: {}", err);
        }
    }
}

pub fn get_cached_workspace_image(
    key: &WorkspaceImageCacheKey,
) -> Result<Option<CachedWorkspaceImage>, AppError> {
    with_db(|db| db.get(key))
}

pub fn put_cached_workspace_image(
    key: &WorkspaceImageCacheKey,
    source_width: u32,
    source_height: u32,
    image: &RgbaImage,
) -> Result<(), AppError> {
    with_db(|db| db.put(key, source_width, source_height, image))
}

fn with_db<T, F>(f: F) -> Result<T, AppError>
where
    F: FnOnce(&WorkspaceCacheDb) -> Result<T, String>,
{
    let guard = WORKSPACE_CACHE_DB
        .lock()
        .expect("workspace cache db mutex poisoned");

    let Some(db) = guard.as_ref() else {
        return Err(AppError::cache_error("Workspace cache database not initialized"));
    };

    f(db).map_err(AppError::cache_error)
}

fn unix_ts_secs() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

fn u64_to_i64(value: u64) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

fn u32_to_i64(value: u32) -> i64 {
    i64::try_from(value).unwrap_or(i64::MAX)
}

fn i64_to_u32(value: i64) -> Result<u32, String> {
    u32::try_from(value).map_err(|_| format!("Invalid cached dimension: {value}"))
}
