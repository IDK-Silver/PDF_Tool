use font_kit::handle::Handle;
use font_kit::source::SystemSource;
use serde::Serialize;
use std::sync::OnceLock;

#[derive(Debug, Clone, Serialize)]
#[serde(rename_all = "camelCase")]
pub struct FontInfo {
    pub family: String,
    pub path: Option<String>,
    pub is_cjk: bool,
}

// Cache system fonts list
static SYSTEM_FONTS: OnceLock<Vec<FontInfo>> = OnceLock::new();

pub fn get_system_fonts() -> &'static Vec<FontInfo> {
    SYSTEM_FONTS.get_or_init(scan_system_fonts)
}

fn scan_system_fonts() -> Vec<FontInfo> {
    let source = SystemSource::new();
    let families = source.all_families().unwrap_or_default();

    // Keywords to identify CJK fonts
    let cjk_keywords = [
        "tc",
        "sc",
        "jp",
        "kr",
        "cjk",
        "hei",
        "song",
        "kai",
        "ming",
        "gothic",
        "pingfang",
        "hiragino",
        "noto sans",
        "noto serif",
        "source han",
        "microsoft yahei",
        "microsoft jhenghei",
        "simsun",
        "simhei",
        "mingliu",
        "malgun",
        "meiryo",
        "yu gothic",
        "yu mincho",
    ];

    fn has_cjk_chars(name: &str) -> bool {
        name.chars().any(|ch| {
            let c = ch as u32;
            matches!(
                c,
                0x3040..=0x30FF  // Hiragana + Katakana
                    | 0x3400..=0x4DBF  // CJK Extension A
                    | 0x4E00..=0x9FFF  // CJK Unified Ideographs
                    | 0xF900..=0xFAFF  // CJK Compatibility Ideographs
                    | 0x1100..=0x11FF  // Hangul Jamo
                    | 0x3130..=0x318F  // Hangul Compatibility Jamo
                    | 0xAC00..=0xD7AF  // Hangul Syllables
            )
        })
    }

    fn has_cjk_glyphs(handles: &[Handle]) -> bool {
        const CJK_SAMPLE_CODEPOINTS: [u32; 4] = [0x4E2D, 0x3042, 0x30A2, 0xD55C];
        for handle in handles {
            let font = match handle.load() {
                Ok(font) => font,
                Err(_) => continue,
            };
            for code in CJK_SAMPLE_CODEPOINTS {
                let ch = match char::from_u32(code) {
                    Some(ch) => ch,
                    None => continue,
                };
                if font.glyph_for_char(ch).is_some() {
                    return true;
                }
            }
        }
        false
    }

    let mut fonts: Vec<FontInfo> = families
        .into_iter()
        .filter_map(|family| {
            // Try to load font to confirm it's available
            let handle = source.select_family_by_name(&family).ok()?;
            let font_handles = handle.fonts();
            if font_handles.is_empty() {
                return None;
            }

            let family_lower = family.to_lowercase();
            let is_cjk = has_cjk_chars(&family)
                || cjk_keywords.iter().any(|kw| family_lower.contains(kw))
                || has_cjk_glyphs(&font_handles);

            Some(FontInfo {
                family,
                path: get_font_path(&font_handles[0]),
                is_cjk,
            })
        })
        .collect();

    // Sort: CJK fonts first, then alphabetically
    fonts.sort_by(|a, b| match (a.is_cjk, b.is_cjk) {
        (true, false) => std::cmp::Ordering::Less,
        (false, true) => std::cmp::Ordering::Greater,
        _ => a.family.cmp(&b.family),
    });

    fonts
}

fn get_font_path(handle: &Handle) -> Option<String> {
    match handle {
        Handle::Path { path, .. } => path.to_str().map(|s| s.to_string()),
        _ => None,
    }
}

/// Load font data bytes for PDF embedding
pub fn load_font_data(family: &str) -> Result<Vec<u8>, String> {
    let source = SystemSource::new();
    let handle = source
        .select_family_by_name(family)
        .map_err(|e| format!("Font not found: {e}"))?;

    let font_handles = handle.fonts();
    if font_handles.is_empty() {
        return Err("Font family has no available fonts".to_string());
    }

    let font = font_handles[0]
        .load()
        .map_err(|e| format!("Failed to load font: {e}"))?;

    font.copy_font_data()
        .ok_or_else(|| "Cannot copy font data".to_string())
        .map(|arc| (*arc).clone())
}

/// Initialize font scanning in background thread (call at app startup)
pub fn init_font_cache() {
    std::thread::spawn(|| {
        let _ = get_system_fonts(); // Triggers OnceLock initialization
    });
}

#[tauri::command]
pub fn list_system_fonts() -> Vec<FontInfo> {
    get_system_fonts().clone()
}
