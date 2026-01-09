#[cfg(all(feature = "self-update", not(feature = "app-store")))]
use log::{info, warn};
use serde::{Deserialize, Serialize};

#[cfg(all(feature = "self-update", not(feature = "app-store")))]
use tauri_plugin_updater::UpdaterExt;

#[cfg(not(feature = "app-store"))]
const GITHUB_API_URL: &str = "https://api.github.com/repos/IDK-Silver/PDF_Tool/releases/latest";

// ============================================================================
// Data Structures
// ============================================================================

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
    pub error: Option<String>,
}

impl Default for UpdateCheckResult {
    fn default() -> Self {
        Self {
            has_update: false,
            current_version: env!("CARGO_PKG_VERSION").to_string(),
            latest_version: None,
            release_info: None,
            error: None,
        }
    }
}

#[cfg(feature = "self-update")]
#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct DownloadProgress {
    pub downloaded: u64,
    pub total: Option<u64>,
}

#[derive(Debug, Serialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct UpdateResult {
    pub success: bool,
    pub error: Option<String>,
}

// ============================================================================
// Version Comparison
// Only compiled for non-App Store builds
// ============================================================================

#[cfg(not(feature = "app-store"))]
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
// HTTP Request (for version check via GitHub API)
// Only compiled for non-App Store builds
// ============================================================================

#[cfg(not(feature = "app-store"))]
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
// Tauri Commands
// ============================================================================

/// Check for updates (does NOT download, just checks version)
/// Only available in non-App Store builds
#[cfg(not(feature = "app-store"))]
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Result<UpdateCheckResult, String> {
    let current_version = app.package_info().version.to_string();

    let release_info = match fetch_latest_release().await {
        Ok(info) => info,
        Err(e) => {
            warn!("[updater] Failed to fetch release info: {}", e);
            return Ok(UpdateCheckResult {
                error: Some(e),
                ..Default::default()
            });
        }
    };

    let latest_version = release_info.tag_name.trim_start_matches('v').to_string();
    let has_update = is_newer_version(&current_version, &latest_version);

    info!(
        "[updater] Check complete: current={}, latest={}, has_update={}",
        current_version, latest_version, has_update
    );

    Ok(UpdateCheckResult {
        has_update,
        current_version,
        latest_version: Some(latest_version),
        release_info: Some(release_info),
        error: None,
    })
}

/// Stub for App Store builds (update check disabled)
#[cfg(feature = "app-store")]
#[tauri::command]
pub async fn check_for_update(app: tauri::AppHandle) -> Result<UpdateCheckResult, String> {
    Ok(UpdateCheckResult {
        has_update: false,
        current_version: app.package_info().version.to_string(),
        latest_version: None,
        release_info: None,
        error: Some("Update check is not available in App Store builds".to_string()),
    })
}

/// Download and install update (only called after user consent)
/// This uses Tauri's built-in updater plugin
#[cfg(all(feature = "self-update", not(feature = "app-store")))]
#[tauri::command]
pub async fn download_and_install_update(app: tauri::AppHandle) -> Result<UpdateResult, String> {
    use tauri::Emitter;

    info!("[updater] User consented, starting download...");

    let updater = match app.updater() {
        Ok(u) => u,
        Err(e) => {
            return Ok(UpdateResult {
                success: false,
                error: Some(format!("Failed to initialize updater: {}", e)),
            });
        }
    };

    let update = match updater.check().await {
        Ok(Some(update)) => update,
        Ok(None) => {
            return Ok(UpdateResult {
                success: false,
                error: Some("No update available".to_string()),
            });
        }
        Err(e) => {
            return Ok(UpdateResult {
                success: false,
                error: Some(format!("Failed to check for update: {}", e)),
            });
        }
    };

    info!(
        "[updater] Downloading update to version {}",
        update.version
    );

    // Download with progress reporting
    let app_handle = app.clone();
    let result = update
        .download_and_install(
            |downloaded, total| {
                let progress = DownloadProgress {
                    downloaded: downloaded as u64,
                    total,
                };
                let _ = app_handle.emit("update-download-progress", &progress);
            },
            || {
                info!("[updater] Download complete, preparing to install...");
            },
        )
        .await;

    match result {
        Ok(_) => {
            info!("[updater] Update installed successfully, restart required");
            Ok(UpdateResult {
                success: true,
                error: None,
            })
        }
        Err(e) => {
            warn!("[updater] Failed to install update: {}", e);
            Ok(UpdateResult {
                success: false,
                error: Some(format!("Failed to install update: {}", e)),
            })
        }
    }
}

/// Stub for App Store builds (updater disabled)
#[cfg(any(not(feature = "self-update"), feature = "app-store"))]
#[tauri::command]
pub async fn download_and_install_update(_app: tauri::AppHandle) -> Result<UpdateResult, String> {
    Ok(UpdateResult {
        success: false,
        error: Some("Self-update is disabled in this build".to_string()),
    })
}

/// Open release page in browser (fallback for manual download)
#[tauri::command]
pub async fn open_release_page(app: tauri::AppHandle, url: String) -> Result<(), String> {
    use tauri_plugin_opener::OpenerExt;
    app.opener()
        .open_url(&url, None::<&str>)
        .map_err(|e| format!("Failed to open URL: {}", e))
}

/// Get current platform identifier
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

/// Check if self-update feature is enabled
#[tauri::command]
pub fn is_self_update_enabled() -> bool {
    cfg!(feature = "self-update")
}

/// Check if this is an App Store build
#[tauri::command]
pub fn is_app_store_build() -> bool {
    cfg!(feature = "app-store")
}
