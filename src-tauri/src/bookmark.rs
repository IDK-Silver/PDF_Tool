//! Security-scoped bookmark operations for macOS sandbox.
//!
//! Allows persisting file access permissions across app sessions by creating
//! and resolving security-scoped bookmarks.

use crate::error::AppError;
use serde::Serialize;

#[derive(Serialize)]
pub struct BookmarkResolveResult {
    pub path: String,
    pub is_stale: bool,
}

#[cfg(target_os = "macos")]
mod macos {
    use super::*;
    use base64::{Engine, engine::general_purpose::STANDARD as BASE64};
    use log::{debug, warn};
    use objc2::rc::Retained;
    use objc2::runtime::Bool;
    use objc2_foundation::{NSData, NSError, NSString, NSURL};
    use std::collections::HashMap;
    use std::ffi::c_void;
    use std::sync::Mutex;

    // NSURLBookmarkCreationOptions
    const NS_URL_BOOKMARK_CREATION_WITH_SECURITY_SCOPE: usize = 1 << 11;

    // NSURLBookmarkResolutionOptions
    const NS_URL_BOOKMARK_RESOLUTION_WITH_SECURITY_SCOPE: usize = 1 << 10;

    // Track active security-scoped accesses
    static ACTIVE_ACCESSES: Mutex<Option<HashMap<String, Retained<NSURL>>>> = Mutex::new(None);

    fn get_accesses() -> std::sync::MutexGuard<'static, Option<HashMap<String, Retained<NSURL>>>> {
        let mut guard = ACTIVE_ACCESSES.lock().expect("access mutex poisoned");
        if guard.is_none() {
            *guard = Some(HashMap::new());
        }
        guard
    }

    /// Create a security-scoped bookmark for the given file path.
    /// Returns Base64-encoded bookmark data.
    pub fn create_bookmark(path: &str) -> Result<String, String> {
        debug!("Creating bookmark for: {}", path);

        unsafe {
            let path_str = NSString::from_str(path);
            let url = NSURL::fileURLWithPath(&path_str);

            // bookmarkDataWithOptions:includingResourceValuesForKeys:relativeToURL:error:
            let mut error: *mut NSError = std::ptr::null_mut();
            let options = NS_URL_BOOKMARK_CREATION_WITH_SECURITY_SCOPE;

            let bookmark_data: *mut NSData = objc2::msg_send![
                &url,
                bookmarkDataWithOptions: options,
                includingResourceValuesForKeys: std::ptr::null::<c_void>(),
                relativeToURL: std::ptr::null::<NSURL>(),
                error: &mut error
            ];

            if bookmark_data.is_null() {
                let err_msg = if !error.is_null() {
                    let err_ref = &*error;
                    let desc: Retained<NSString> = objc2::msg_send![err_ref, localizedDescription];
                    desc.to_string()
                } else {
                    "Unknown error".to_string()
                };
                return Err(format!("Failed to create bookmark: {}", err_msg));
            }

            let data_ref = &*bookmark_data;
            let bytes: *const u8 = objc2::msg_send![data_ref, bytes];
            let len: usize = objc2::msg_send![data_ref, length];

            if bytes.is_null() || len == 0 {
                return Err("Bookmark data is empty".to_string());
            }

            let slice = std::slice::from_raw_parts(bytes, len);
            let encoded = BASE64.encode(slice);
            debug!("Bookmark created successfully, size: {} bytes", len);
            Ok(encoded)
        }
    }

    /// Resolve a security-scoped bookmark and start accessing the resource.
    /// Returns the resolved path and whether the bookmark is stale.
    pub fn resolve_bookmark(bookmark_b64: &str) -> Result<BookmarkResolveResult, String> {
        debug!("Resolving bookmark...");

        let bytes = BASE64
            .decode(bookmark_b64)
            .map_err(|e| format!("Invalid Base64: {}", e))?;

        unsafe {
            let data = NSData::with_bytes(&bytes);

            let mut is_stale: Bool = Bool::NO;
            let mut error: *mut NSError = std::ptr::null_mut();
            let options = NS_URL_BOOKMARK_RESOLUTION_WITH_SECURITY_SCOPE;

            // URLByResolvingBookmarkData:options:relativeToURL:bookmarkDataIsStale:error:
            let resolved_url: *mut NSURL = objc2::msg_send![
                objc2::class!(NSURL),
                URLByResolvingBookmarkData: &*data,
                options: options,
                relativeToURL: std::ptr::null::<NSURL>(),
                bookmarkDataIsStale: &mut is_stale,
                error: &mut error
            ];

            if resolved_url.is_null() {
                let err_msg = if !error.is_null() {
                    let err_ref = &*error;
                    let desc: Retained<NSString> = objc2::msg_send![err_ref, localizedDescription];
                    desc.to_string()
                } else {
                    "Unknown error".to_string()
                };
                return Err(format!("Failed to resolve bookmark: {}", err_msg));
            }

            // Retain the URL for our use
            let url_retained: Retained<NSURL> =
                Retained::retain(resolved_url).ok_or_else(|| "Failed to retain URL".to_string())?;

            // Start accessing the security-scoped resource
            let started: Bool =
                objc2::msg_send![&url_retained, startAccessingSecurityScopedResource];
            if !started.as_bool() {
                warn!("startAccessingSecurityScopedResource returned false");
                return Err("Failed to start accessing security-scoped resource".to_string());
            }

            // Get the path
            let path_str: *mut NSString = objc2::msg_send![&url_retained, path];
            if path_str.is_null() {
                let _: () = objc2::msg_send![&url_retained, stopAccessingSecurityScopedResource];
                return Err("Failed to get path from URL".to_string());
            }

            let path = (*path_str).to_string();
            let stale = is_stale.as_bool();

            // Store the access handle
            let mut accesses = get_accesses();
            if let Some(ref mut map) = *accesses {
                if let Some(prev) = map.remove(&path) {
                    let _: () = objc2::msg_send![&prev, stopAccessingSecurityScopedResource];
                }
                map.insert(path.clone(), url_retained);
            }

            debug!("Bookmark resolved successfully: {}, stale: {}", path, stale);

            Ok(BookmarkResolveResult {
                path,
                is_stale: stale,
            })
        }
    }

    /// Stop accessing a security-scoped resource.
    pub fn stop_access(path: &str) {
        debug!("Stopping access for: {}", path);

        let mut accesses = get_accesses();
        if let Some(ref mut map) = *accesses {
            if let Some(url) = map.remove(path) {
                unsafe {
                    let _: () = objc2::msg_send![&url, stopAccessingSecurityScopedResource];
                }
                debug!("Access stopped for: {}", path);
            }
        }
    }

    /// Stop all active security-scoped accesses.
    #[allow(dead_code)]
    pub fn stop_all_accesses() {
        debug!("Stopping all accesses");

        let mut accesses = get_accesses();
        if let Some(ref mut map) = *accesses {
            for (path, url) in map.drain() {
                unsafe {
                    let _: () = objc2::msg_send![&url, stopAccessingSecurityScopedResource];
                }
                debug!("Access stopped for: {}", path);
            }
        }
    }
}

#[cfg(not(target_os = "macos"))]
mod stub {
    use super::*;

    pub fn create_bookmark(_path: &str) -> Result<String, String> {
        Err("Bookmarks only supported on macOS".to_string())
    }

    pub fn resolve_bookmark(_bookmark_b64: &str) -> Result<BookmarkResolveResult, String> {
        Err("Bookmarks only supported on macOS".to_string())
    }

    pub fn stop_access(_path: &str) {}

    #[allow(dead_code)]
    pub fn stop_all_accesses() {}
}

#[cfg(target_os = "macos")]
use macos::*;

#[cfg(not(target_os = "macos"))]
use stub::*;

// Tauri commands

/// Create a security-scoped bookmark for the given path.
/// Returns Base64-encoded bookmark data.
#[tauri::command]
pub fn bookmark_create(path: String) -> Result<String, AppError> {
    create_bookmark(&path).map_err(|e| AppError::new("bookmark_error", e))
}

/// Resolve a bookmark and start accessing the security-scoped resource.
/// Returns the resolved path and whether the bookmark is stale.
#[tauri::command]
pub fn bookmark_resolve(bookmark_data: String) -> Result<BookmarkResolveResult, AppError> {
    resolve_bookmark(&bookmark_data).map_err(|e| AppError::new("bookmark_error", e))
}

/// Stop accessing a security-scoped resource.
#[tauri::command]
pub fn bookmark_stop_access(path: String) -> Result<(), AppError> {
    stop_access(&path);
    Ok(())
}
