use serde::Serialize;

/// 統一的應用程式錯誤類型
/// 用於所有 Tauri command 的錯誤回傳
#[derive(Serialize, Debug, Clone)]
#[serde(rename_all = "snake_case")]
pub struct AppError {
    pub code: String,
    pub message: String,
}

#[allow(dead_code)]
impl AppError {
    pub fn new(code: impl Into<String>, message: impl Into<String>) -> Self {
        Self {
            code: code.into(),
            message: message.into(),
        }
    }

    // 常用錯誤建構器
    pub fn not_found(message: impl Into<String>) -> Self {
        Self::new("not_found", message)
    }

    pub fn io_error(message: impl Into<String>) -> Self {
        Self::new("io_error", message)
    }

    pub fn parse_error(message: impl Into<String>) -> Self {
        Self::new("parse_error", message)
    }

    pub fn invalid_input(message: impl Into<String>) -> Self {
        Self::new("invalid_input", message)
    }

    pub fn decode_error(message: impl Into<String>) -> Self {
        Self::new("decode_error", message)
    }

    pub fn encode_error(message: impl Into<String>) -> Self {
        Self::new("encode_error", message)
    }

    pub fn async_error(message: impl Into<String>) -> Self {
        Self::new("async_error", message)
    }

    pub fn canceled(message: impl Into<String>) -> Self {
        Self::new("canceled", message)
    }

    pub fn cache_error(message: impl Into<String>) -> Self {
        Self::new("cache_error", message)
    }

    pub fn unsupported(message: impl Into<String>) -> Self {
        Self::new("unsupported", message)
    }
}

impl std::fmt::Display for AppError {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "[{}] {}", self.code, self.message)
    }
}

impl std::error::Error for AppError {}

// 為了向後相容，提供類型別名
pub type MediaError = AppError;
