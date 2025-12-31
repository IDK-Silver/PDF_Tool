//! PDF 處理模組
//!
//! 提供 PDF 載入、渲染、壓縮等功能。

mod compress;
mod pdfium;
mod render;
mod types;
mod worker;

// Re-export public API (use * to include Tauri command internal functions)
pub use compress::*;
pub use pdfium::get_pdfium;
pub use render::{PageRender, PdfRenderArgs, render_page_for_document};
pub use types::*;
pub use worker::{init_pdf_worker, PdfRequest, WORKER_TX};
