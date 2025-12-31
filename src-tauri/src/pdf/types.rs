//! PDF 相關的共用類型
//!
//! 包含 Tauri commands 的輸入/輸出結構。

use serde::{Deserialize, Serialize};

/// 文字圖層設定
#[derive(Deserialize, Default, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TextLayerSettings {
    pub overlap_threshold: Option<f32>,
    pub min_spacing: Option<f32>,
    pub small_gap_threshold: Option<f32>,
    pub small_gap_spacing: Option<f32>,
    pub global_offset_x: Option<f32>,
    pub global_offset_y: Option<f32>,
}

/// PDF 開啟結果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfOpenResult {
    pub doc_id: u64,
    pub pages: usize,
    pub dirty: bool,
    pub revision: u64,
}

/// PDF 頁面尺寸
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfPageSize {
    pub width_pt: f32,
    pub height_pt: f32,
}

/// 變動操作結果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct MutationResult {
    pub pages: usize,
    pub dirty: bool,
    pub revision: u64,
}

/// 旋轉操作結果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct RotationResult {
    pub rotation_deg: u16,
    pub dirty: bool,
    pub revision: u64,
}

/// 儲存結果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct SaveResult {
    pub path: String,
    pub pages: usize,
    pub dirty: bool,
    pub revision: u64,
}

/// 單字元文字資訊（保留供工具/除錯使用）
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
#[allow(dead_code)]
pub struct TextChar {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
    pub font_size: f32,
}

/// 詞彙級合併的文字片段（減少 DOM 數量 80%+）
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct TextSpan {
    pub text: String,
    pub x: f32,
    pub y: f32,
    pub width: f32,
    pub height: f32,
}

/// 頁面文字內容
#[derive(Serialize, Deserialize, Clone)]
#[serde(rename_all = "camelCase")]
pub struct PageTextContent {
    pub page_index: u32,
    /// 已合併的文字片段（優化版本）
    pub spans: Vec<TextSpan>,
    pub width_pt: f32,
    pub height_pt: f32,
}

/// 頁面匯出為圖片的結果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportImageResult {
    pub path: String,
    pub width_px: u32,
    pub height_px: u32,
    pub format: String,
}

/// 頁面匯出為 PDF 的結果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct PdfExportPdfResult {
    pub path: String,
}

/// 圖片轉 PDF 結果
#[derive(Serialize)]
#[serde(rename_all = "camelCase")]
pub struct ImageToPdfResult {
    pub path: String,
    pub width_pt: f32,
    pub height_pt: f32,
}
