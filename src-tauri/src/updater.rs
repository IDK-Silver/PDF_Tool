use log::{info, warn};
use rusqlite::{Connection, params};
use serde::{Deserialize, Serialize};
use std::path::PathBuf;
use std::sync::Mutex;
use std::time::{SystemTime, UNIX_EPOCH};

const GITHUB_API_URL: &str = "https://api.github.com/repos/IDK-Silver/PDF_Tool/releases/latest";
const UPDATE_DB_FILE: &str = "update_state.db";
const KEY_SKIPPED_VERSION: &str = "skipped_version";
const KEY_REMIND_LATER_UNTIL: &str = "remind_later_until";

static UPDATE_DB: Mutex<Option<UpdateDb>> = Mutex::new(None);

// ============================================================================
// Data Structures
// ============================================================================

// GitHub API response structures (snake_case from API)
#[derive(Debug, Deserialize, Clone)]
pub struct GitHubReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
}

#[derive(Debug, Deserialize, Clone)]
pub struct GitHubReleaseInfo {
    pub tag_name: String,
    pub name: String,
    pub body: Option<String>,
    pub html_url: String,
    pub published_at: String,
    pub assets: Vec<GitHubReleaseAsset>,
}

// Frontend-facing structures (camelCase for JS)
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseAsset {
    pub name: String,
    pub browser_download_url: String,
    pub size: u64,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct ReleaseInfo {
    pub tag_name: String,
    pub name: String,
    pub body: String,
    pub html_url: String,
    pub published_at: String,
    pub assets: Vec<ReleaseAsset>,
}

impl From<GitHubReleaseInfo> for ReleaseInfo {
    fn from(gh: GitHubReleaseInfo) -> Self {
        Self {
            tag_name: gh.tag_name,
            name: gh.name,
            body: gh.body.unwrap_or_default(),
            html_url: gh.html_url,
            published_at: gh.published_at,
            assets: gh
                .assets
                .into_iter()
                .map(|a| ReleaseAsset {
                    name: a.name,
                    browser_download_url: a.browser_download_url,
                    size: a.size,
                })
                .collect(),
        }
    }
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateCheckResult {
    pub has_update: bool,
    pub current_version: String,
    pub latest_version: Option<String>,
    pub release_info: Option<ReleaseInfo>,
    pub is_skipped: bool,
    pub is_remind_later: bool,
    pub error: Option<String>,
}

impl Default for UpdateCheckResult {
    fn default() -> Self {
        Self {
            has_update: false,
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            latest_version: None,
            release_info: None,
            is_skipped: false,
            is_remind_later: false,
            error: None,
        }
    }
}

// ============================================================================
// SQLite State Storage
// ============================================================================

struct UpdateDb {
    conn: Connection,
}

impl UpdateDb {
    fn new(db_dir: &std::path::Path) -> Result<Self, rusqlite::Error> {
        std::fs::create_dir_all(db_dir).ok();
        let db_path = db_dir.join(UPDATE_DB_FILE);
        let conn = Connection::open(db_path)?;

        conn.execute(
            "CREATE TABLE IF NOT EXISTS update_state (
                key TEXT PRIMARY KEY,
                value TEXT NOT NULL,
                updated_at INTEGER NOT NULL
            )",
            [],
        )?;

        Ok(Self { conn })
    }

    fn set(&self, key: &str, value: &str) -> Result<(), rusqlite::Error> {
        let now = unix_timestamp();
        self.conn.execute(
            "INSERT OR REPLACE INTO update_state (key, value, updated_at) VALUES (?1, ?2, ?3)",
            params![key, value, now],
        )?;
        Ok(())
    }

    fn get(&self, key: &str) -> Option<String> {
        self.conn
            .query_row(
                "SELECT value FROM update_state WHERE key = ?1",
                params![key],
                |row| row.get(0),
            )
            .ok()
    }

    fn delete(&self, key: &str) -> Result<(), rusqlite::Error> {
        self.conn
            .execute("DELETE FROM update_state WHERE key = ?1", params![key])?;
        Ok(())
    }
}

fn unix_timestamp() -> i64 {
    SystemTime::now()
        .duration_since(UNIX_EPOCH)
        .unwrap_or_default()
        .as_secs() as i64
}

// ============================================================================
// Initialization
// ============================================================================

pub fn init_update_db(data_dir: PathBuf) {
    match UpdateDb::new(&data_dir) {
        Ok(db) => {
            *UPDATE_DB.lock().unwrap() = Some(db);
            info!("[updater] Database initialized at {:?}", data_dir);
        }
        Err(e) => {
            warn!("[updater] Failed to initialize database: {}", e);
        }
    }
}

// ============================================================================
// Version Comparison
// ============================================================================

fn is_newer_version(current: &str, latest: &str) -> bool {
    let current_clean = current.trim_start_matches('v');
    let latest_clean = latest.trim_start_matches('v');

    match (
        semver::Version::parse(current_clean),
        semver::Version::parse(latest_clean),
    ) {
        (Ok(c), Ok(l)) => l > c,
        _ => {
            warn!(
                "[updater] Failed to parse versions: current={}, latest={}",
                current, latest
            );
            false
        }
    }
}

// ============================================================================
// HTTP Request
// ============================================================================

async fn fetch_latest_release() -> Result<ReleaseInfo, String> {
    let client = reqwest::Client::builder()
        .user_agent(format!("Kano-PDF-Tool/{}", env!("CARGO_PKG_VERSION")))
        .timeout(std::time::Duration::from_secs(10))
        .build()
        .map_err(|e| format!("Failed to create HTTP client: {}", e))?;

    let response = client
        .get(GITHUB_API_URL)
        .header("Accept", "application/vnd.github.v3+json")
        .send()
        .await
        .map_err(|e| format!("Network request failed: {}", e))?;

    if !response.status().is_success() {
        return Err(format!("GitHub API returned status: {}", response.status()));
    }

    let github_release: GitHubReleaseInfo = response
        .json()
        .await
        .map_err(|e| format!("Failed to parse response: {}", e))?;

    Ok(github_release.into())
}

// ============================================================================
// Core Logic
// ============================================================================

pub async fn check_for_update_internal(app: &tauri::AppHandle, force: bool) -> UpdateCheckResult {
    let current_version = app.package_info().version.to_string();

    // Fetch latest release from GitHub
    let release_info = match fetch_latest_release().await {
        Ok(info) => info,
        Err(e) => {
            warn!("[updater] Failed to fetch release info: {}", e);
            return UpdateCheckResult {
                error: Some(e),
                ..Default::default()
            };
        }
    };

    let latest_version = release_info.tag_name.trim_start_matches('v').to_string();
    let has_update = is_newer_version(&current_version, &latest_version);

    // Check skip/remind state from database
    let (is_skipped, is_remind_later) = if force {
        (false, false)
    } else {
        let db_guard = UPDATE_DB.lock().unwrap();
        if let Some(ref db) = *db_guard {
            let skipped = db
                .get(KEY_SKIPPED_VERSION)
                .map(|v| v == latest_version)
                .unwrap_or(false);

            let remind_later = db
                .get(KEY_REMIND_LATER_UNTIL)
                .and_then(|v| v.parse::<i64>().ok())
                .map(|until| unix_timestamp() < until)
                .unwrap_or(false);

            (skipped, remind_later)
        } else {
            (false, false)
        }
    };

    info!(
        "[updater] Check complete: current={}, latest={}, has_update={}, skipped={}, remind_later={}",
        current_version, latest_version, has_update, is_skipped, is_remind_later
    );

    UpdateCheckResult {
        has_update,
        current_version,
        latest_version: Some(latest_version),
        release_info: Some(release_info),
        is_skipped,
        is_remind_later,
        error: None,
    }
}

// ============================================================================
// Tauri Commands
// ============================================================================

#[tauri::command]
pub async fn check_for_update(
    app: tauri::AppHandle,
    force: bool,
) -> Result<UpdateCheckResult, String> {
    Ok(check_for_update_internal(&app, force).await)
}

#[tauri::command]
pub fn skip_version(version: String) -> Result<(), String> {
    let db_guard = UPDATE_DB.lock().unwrap();
    if let Some(ref db) = *db_guard {
        db.set(KEY_SKIPPED_VERSION, &version)
            .map_err(|e| format!("Failed to save skipped version: {}", e))?;
        // Clear remind_later when skipping
        let _ = db.delete(KEY_REMIND_LATER_UNTIL);
        info!("[updater] Skipped version: {}", version);
        Ok(())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub fn remind_later(hours: u32) -> Result<(), String> {
    let db_guard = UPDATE_DB.lock().unwrap();
    if let Some(ref db) = *db_guard {
        let until = unix_timestamp() + (hours as i64 * 3600);
        db.set(KEY_REMIND_LATER_UNTIL, &until.to_string())
            .map_err(|e| format!("Failed to save remind later: {}", e))?;
        info!(
            "[updater] Remind later set for {} hours (until {})",
            hours, until
        );
        Ok(())
    } else {
        Err("Database not initialized".to_string())
    }
}

#[tauri::command]
pub async fn open_release_page(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("Failed to open URL: {}", e))
}

#[tauri::command]
pub fn get_platform() -> String {
    #[cfg(target_os = "macos")]
    {
        if cfg!(target_arch = "aarch64") {
            "macos-arm64".to_string()
        } else {
            "macos-x64".to_string()
        }
    }
    #[cfg(target_os = "windows")]
    {
        if cfg!(target_arch = "aarch64") {
            "windows-arm64".to_string()
        } else {
            "windows-x64".to_string()
        }
    }
    #[cfg(target_os = "linux")]
    {
        "linux-x64".to_string()
    }
    #[cfg(not(any(target_os = "macos", target_os = "windows", target_os = "linux")))]
    {
        "unknown".to_string()
    }
}
