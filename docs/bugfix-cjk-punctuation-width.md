# 修正：中文標點字元寬高失真問題

## 問題描述

在 PDF 文字提取時，遇到全形中文標點（、。「」『』；：等）時，取得的字元寬高會失真，導致：

1. 字元寬度不準確（過寬或過窄）
2. 字元高度異常（特別是旋轉或直排文字）
3. 行內字元重疊判斷失準
4. 字距計算錯誤

## 根本原因

原始實作只使用 `loose_bounds()` 方法（對應 PDFium 的 `FPDFText_GetLooseCharBox`）：

```rust
// 舊實作
if let Ok(bounds) = text_char.loose_bounds() {
    let width  = bounds.width().value as f32;  // ← 常出錯
    let height = bounds.height().value as f32;  // ← 也會出錯
    // ...
}
```

**`loose_bounds()` 的問題**：

- 高度固定等於字體大小（font size）
- 寬度取整個 advance width，不是實際字形外框
- 在頁面或字元旋轉時可能明顯錯誤（PDFium 已知問題）
- 對中文標點這種字形、advance、直排/旋轉常不對稱的情況，AABB（軸對齊框）特別不可靠

## 解決方案

### 1. 使用 `tight_bounds()` 優先取得精確邊界框

`tight_bounds()` 對應 PDFium 的 `FPDFText_GetCharBox`，回傳實際字形的緊身邊界框：

```rust
fn char_geometry(
    ch: &PdfPageTextChar,
    global_offset_x: f32,
) -> Option<(f32, f32, f32, f32)> {
    // 1) 優先使用 tight_bounds (FPDFText_GetCharBox)
    //    對 CJK 標點更準確，回傳實際字形邊界框
    if let Ok(b) = ch.tight_bounds() {
        let x = b.left().value as f32 + global_offset_x;
        let y = b.bottom().value as f32;
        let w = b.width().value as f32;
        let h = b.height().value as f32;
        return Some((x, y, w, h));
    }

    // 2) 退回使用 loose_bounds (FPDFText_GetLooseCharBox)
    if let Ok(b) = ch.loose_bounds() {
        let x = b.left().value as f32 + global_offset_x;
        let y = b.bottom().value as f32;
        let w = b.width().value as f32;
        let h = b.height().value as f32;
        return Some((x, y, w, h));
    }

    None
}
```

### 2. 改善行內/重疊判斷邏輯

使用前後字元的平均高度作為行判斷閾值，更加穩健：

```rust
// 追蹤前一個字元的高度
let mut prev_height: Option<f32> = None;

// ...

if let (Some(prev_end), Some(prev_y_val), Some(prev_h)) =
    (prev_x_end, prev_y, prev_height)
{
    // 使用平均高度計算行閾值
    let avg_h = (height + prev_h) * 0.5;
    let line_threshold = avg_h * 0.6; // 更穩健的閾值

    // 判斷是否在同一行
    if (y - prev_y_val).abs() < line_threshold {
        // 同一行的間距處理邏輯
        // ...
    }
}
```

### 3. 加入合理性守門機制

使用中位數字高作為基準，過濾極端異常值：

```rust
// 收集高度用於計算中位數
let mut heights_for_median = Vec::new();

for i in 0..char_count {
    // ...
    if height > 0.1 {
        heights_for_median.push(height);
    }

    // 計算中位數作為基準
    let em_baseline = if heights_for_median.len() > 10 {
        let mut sorted = heights_for_median.clone();
        sorted.sort_by(|a, b| a.partial_cmp(b).unwrap());
        sorted[sorted.len() / 2]
    } else {
        height.max(1.0)
    };

    // 過濾極端值
    if width < 0.2 * em_baseline || width > 3.0 * em_baseline {
        width = em_baseline; // 重設為基準值
    }
    if height < 0.2 * em_baseline || height > 3.0 * em_baseline {
        height = em_baseline;
    }
}
```

## 效果

1. **中文標點寬高更準確**：使用實際字形邊界框，而非 advance width
2. **旋轉文字支援更好**：`tight_bounds()` 在旋轉場景下更可靠
3. **行內判斷更精準**：使用平均高度作為閾值，減少誤判
4. **異常值過濾**：防止極端測量誤差影響整體佈局

## 參考資料

- PDFium `FPDFText_GetCharBox` vs `FPDFText_GetLooseCharBox` 差異
- `pdfium-render` 0.8.35 API：`tight_bounds()` vs `loose_bounds()`
- 相關 Issue：PDFium 在旋轉頁面時 loose bounds 可能回傳錯誤值

## 相關檔案

- `src-tauri/src/media.rs` - `PdfRequest::GetPageText` 處理邏輯
- 修改位置：約 1680-1800 行

## 修改日期

2025-01-01
