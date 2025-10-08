# DPR 與雙解析度渲染機制詳解

## 📐 DPR（Device Pixel Ratio）是什麼？

### 基本概念

**DPR = 裝置像素比 = 實體像素 ÷ CSS 像素**

```javascript
// 一般螢幕
window.devicePixelRatio = 1    // 1920×1080 螢幕，CSS 1920px = 實體 1920px

// Retina 螢幕
window.devicePixelRatio = 2    // MacBook Pro，CSS 1920px = 實體 3840px

// 4K 高解析度螢幕
window.devicePixelRatio = 3    // 某些高階螢幕
```

### 為什麼需要 DPR？

#### 問題：模糊的圖片

```html
<!-- CSS 寬度 800px 的圖片 -->
<img src="image.png" width="800px">

一般螢幕（DPR=1）：
  CSS 800px = 實體 800px
  如果圖片是 800×600，顯示剛好清晰 ✅

Retina 螢幕（DPR=2）：
  CSS 800px = 實體 1600px
  如果圖片是 800×600，被放大到 1600×1200
  → 模糊！❌
```

#### 解決方案：DPR 放大

```javascript
// 本專案的做法（MediaView.vue）
const dpr = Math.min(window.devicePixelRatio, settings.s.dprCap)
const targetWidth = containerWidth * dpr

// 範例：容器 800px，Retina 螢幕（DPR=2）
const targetWidth = 800 * 2 = 1600px

// 渲染 1600px 寬的圖片 → 在 Retina 螢幕上清晰 ✅
```

---

## 🎨 本專案的雙解析度策略

### 1️⃣ 低清渲染（Low Resolution）

**目的：快速顯示，滾動流暢**

#### 觸發時機
```typescript
// src/modules/media/store.ts:280
// 1. 若無低解析度，立即請求
if (!existing?.lowResUrl && !pdfInflight.has(index)) {
  const isLargePage = size && (size.widthPt > 650 || size.heightPt > 900)
  const lowResDpi = isLargePage 
    ? settings.s.largePageLowResDpi  // A3: 48dpi
    : settings.s.lowResDpi           // A4: 60dpi
  
  enqueueJob(index, lowResWidth, 'raw', undefined, true)  // 固定用 raw
}
```

#### 特點
- ✅ **固定用 Raw 格式**（零編解碼，5-10ms）
- ✅ **低 DPI**（48-60），像素少，渲染快（80-120ms）
- ✅ **立即請求**（滾動時馬上顯示）
- ✅ **不快取**（用完即拋，節省記憶體）

#### 計算方式
```typescript
// A4 頁面（595×842 pt），低清 60dpi
const lowResWidth = 595 * 60 / 72 = 496px
const lowResHeight = 842 * 60 / 72 = 702px
// 總像素：496×702 = 0.35M 像素
// Raw 大小：0.35M × 4 bytes = 1.4MB
// 渲染時間：~80ms
```

---

### 2️⃣ 高清渲染（High Resolution）

**目的：精細品質，停止滾動後提升**

#### 觸發時機
```typescript
// src/modules/media/store.ts:291
// 2. 若已有高解析度且解析度足夠則略過
if (existing?.highResUrl && existing.widthPx >= requiredWidth) return

// 3. 請求高解析度
if (!pdfInflight.has(index)) {
  // fit 模式：根據容器寬度 × DPR
  // actual 模式：根據縮放百分比換算 DPI
  enqueueJob(index, targetWidth, finalFormat, dpi, false)
}
```

#### 特點
- ✅ **可選格式**：Raw（激進）/ WebP/JPEG（保守）
- ✅ **高 DPI/寬度**：根據 DPR 或縮放百分比
- ✅ **延遲請求**（debounce，防止頻繁重渲染）
- ✅ **LRU 快取**（保留最近使用的 10-50 頁）

#### Fit 模式（最佳符合）
```typescript
// MediaView.vue:565
const dpr = dprForMode()  // Math.min(window.devicePixelRatio, dprCap)
const baseW = containerWidth  // 容器寬度
const hiW = Math.floor(baseW * dpr)  // 高清目標寬度

// 範例：容器 800px，Retina 螢幕（DPR=2），dprCap=2.0
const hiW = 800 * 2 = 1600px

// 再套用 highResDpiCap 限制
// A4 頁面：595pt，highResDpiCap=96
const maxWidth = 595 * 96 / 72 = 793px
const finalWidth = Math.min(1600, 793) = 793px  // 被 DPI 上限限制
```

#### Actual 模式（實際大小）
```typescript
// MediaView.vue:563
const dpi = dpiForActual()
// 100% 縮放 → 96dpi
// 150% 縮放 → 144dpi（但會被 actualModeDpiCap 限制）

// 範例：A4 頁面，150% 縮放
const dpi = 96 * 1.5 = 144dpi
const cap = settings.s.actualModeDpiCap  // 預設 144
const finalDpi = Math.min(144, 144) = 144dpi
const width = 595 * 144 / 72 = 1190px
```

---

## 🔄 完整渲染流程

### Fit 模式流程圖

```
用戶滾動到新頁面
  ↓
檢查是否有低清快取
  ↓ 無
立即請求低清（60dpi Raw）
  ↓
80-120ms 後顯示模糊圖
  ↓
檢查是否有高清快取
  ↓ 無
計算目標寬度：containerW × DPR
  ↓
套用 highResDpiCap 限制
  ↓
延遲 300ms（debounce）
  ↓
請求高清（WebP/JPEG/Raw）
  ↓
200-500ms 後顯示清晰圖
  ↓
替換低清，revoke 舊 blob
```

### Actual 模式流程圖

```
用戶縮放到 150%
  ↓
檢查是否有低清快取
  ↓ 無
立即請求低清（60dpi Raw）
  ↓
80-120ms 後顯示模糊圖
  ↓
計算 DPI：96 × 1.5 = 144dpi
  ↓
套用 actualModeDpiCap 限制（144）
  ↓
延遲 300ms（debounce）
  ↓
請求高清（144dpi）
  ↓
300-700ms 後顯示清晰圖
  ↓
替換低清，revoke 舊 blob
```

---

## 📊 參數對照表

### DPR 相關參數

| 參數 | 位置 | 預設值 | 用途 | 影響 |
|------|------|--------|------|------|
| `dprCap` | 高清區塊 | 2.0 | Fit 模式 DPR 上限 | 限制 Retina 螢幕放大倍數 |
| `highResDpiCap` | 高清區塊 | 96 | Fit 模式高清 DPI 上限 | 防止 DPR 導致過高 DPI |
| `actualModeDpiCap` | 高清區塊 | 144 | Actual 模式 DPI 上限 | 防止縮放導致過高 DPI |

### DPI 相關參數

| 參數 | 位置 | 預設值 | 用途 | 像素數（A4） |
|------|------|--------|------|-------------|
| `lowResDpi` | 低清區塊 | 60 | 一般頁面低清 | 0.35M (80ms) |
| `largePageLowResDpi` | 低清區塊 | 48 | 大頁面低清 | 0.44M (80ms, A3) |
| `highResDpiCap` | 高清區塊 | 96 | Fit 模式高清上限 | 1.1M (200ms) |
| `actualModeDpiCap` | 高清區塊 | 144 | Actual 模式上限 | 2.5M (450ms) |

---

## 🎯 實際案例分析

### 案例 1：Retina MacBook Pro（DPR=2）

**場景：** 容器寬度 1000px，A4 PDF，Fit 模式

```typescript
// 低清渲染
const lowResDpi = 60
const lowResWidth = 595 * 60 / 72 = 496px
// 立即顯示，80ms

// 高清渲染
const dpr = Math.min(2, 2.0) = 2.0  // dprCap
const hiW = 1000 * 2 = 2000px

// 套用 highResDpiCap
const maxDpi = 96
const maxWidth = 595 * 96 / 72 = 793px
const finalWidth = Math.min(2000, 793) = 793px

// 結果：793px 寬度渲染
// 對應 DPI = 793 / 595 * 72 = 96dpi
// 像素數：793×1122 = 0.89M
// 渲染時間：~180ms（WebP）或 ~10ms（Raw）
```

**結論：** highResDpiCap 限制了 DPR 的影響，避免過高 DPI。

---

### 案例 2：4K 螢幕（DPR=1）

**場景：** 容器寬度 1920px，A4 PDF，Fit 模式

```typescript
// 低清渲染
const lowResDpi = 60
const lowResWidth = 595 * 60 / 72 = 496px

// 高清渲染
const dpr = Math.min(1, 2.0) = 1.0  // 4K 螢幕通常 DPR=1
const hiW = 1920 * 1 = 1920px

// 套用 highResDpiCap
const maxWidth = 595 * 96 / 72 = 793px
const finalWidth = Math.min(1920, 793) = 793px

// 結果：仍是 793px（被 DPI 上限限制）
```

**結論：** 即使容器很寬，DPI 上限仍能防止過度渲染。

---

### 案例 3：Actual 模式，200% 縮放

**場景：** A3 頁面（842×1191pt），200% 縮放

```typescript
// 低清渲染
const lowResDpi = 48  // 大頁面專用
const lowResWidth = 842 * 48 / 72 = 561px

// 高清渲染
const dpi = 96 * 2.0 = 192dpi
const cap = 144  // actualModeDpiCap
const finalDpi = Math.min(192, 144) = 144dpi

const width = 842 * 144 / 72 = 1684px
const height = 1191 * 144 / 72 = 2384px
// 像素數：1684×2384 = 4.01M
// 渲染時間：~700ms（WebP）或 ~30ms（Raw）
```

**結論：** actualModeDpiCap 防止高倍縮放導致的卡頓。

---

## 💡 最佳實踐建議

### 一般用戶（記憶體 < 16GB）

```yaml
低清 DPI: 60
大頁面低清 DPI: 48
高清 DPI 上限: 96          # 防卡頓
DPR 上限: 2.0
實際大小 DPI 上限: 96      # 更激進，防止縮放卡頓
激進模式: 關閉             # 使用 WebP 壓縮
```

**效果：**
- 滾動流暢（80-120ms 低清）
- 高清載入中等（180-300ms）
- 記憶體可控（50 頁快取 = 15-30MB）

---

### 高階用戶（記憶體 ≥ 16GB）

```yaml
低清 DPI: 60
大頁面低清 DPI: 48
高清 DPI 上限: 120         # 稍高品質
DPR 上限: 2.0
實際大小 DPI 上限: 144
激進模式: 開啟             # Raw 零編解碼
Raw 高清快取: 15          # 更多快取
```

**效果：**
- 滾動絲滑（80-120ms 低清）
- 高清極快（5-10ms Raw）
- 記憶體較大（15 頁快取 = 45-180MB）

---

### 超高解析度需求（專業用途）

```yaml
低清 DPI: 72              # 稍高低清品質
大頁面低清 DPI: 60
高清 DPI 上限: 144        # 高品質
DPR 上限: 3.0             # 支援 4K/5K 螢幕
實際大小 DPI 上限: 192
激進模式: 開啟
Raw 高清快取: 10          # 記憶體控制
```

**效果：**
- 低清稍清晰（100-150ms）
- 高清品質極佳（但渲染慢 500-1000ms）
- 記憶體大（10 頁快取 = 60-240MB）

---

## 🔧 常見問題

### Q1: 為什麼 Retina 螢幕還是模糊？

**A:** 檢查 `dprCap` 和 `highResDpiCap`：

```typescript
// 如果 dprCap=1.0（錯誤設定）
const hiW = 1000 * 1.0 = 1000px  // Retina 螢幕不夠清晰

// 應該 dprCap=2.0
const hiW = 1000 * 2.0 = 2000px  // 但會被 highResDpiCap 限制
```

**解決：** 提高 `highResDpiCap` 至 144（代價是渲染變慢）。

---

### Q2: 為什麼高倍縮放會卡頓？

**A:** Actual 模式 DPI 線性增長：

```typescript
// 300% 縮放
const dpi = 96 * 3.0 = 288dpi  // A4 = 5.7M 像素 = 1200ms 渲染
```

**解決：** 降低 `actualModeDpiCap` 至 96-120。

---

### Q3: 低清和高清差異不明顯？

**A:** 低清 DPI 太高：

```typescript
// lowResDpi=96（太高）
const lowResWidth = 595 * 96 / 72 = 793px  // 已經很清晰

// 高清 highResDpiCap=96
const highResWidth = 793px  // 完全一樣！
```

**解決：** 降低 `lowResDpi` 至 48-60。

---

## 📝 總結

### DPR 的作用
- **適配高解析度螢幕**（Retina、4K）
- **防止圖片模糊**（CSS 像素 vs 實體像素）
- **可控的品質提升**（dprCap 限制放大倍數）

### 低清的作用
- **快速首次渲染**（80-120ms）
- **滾動流暢不卡頓**（立即顯示）
- **節省記憶體**（不快取，用完即拋）

### 高清的作用
- **精細品質**（停止後提升）
- **適配螢幕解析度**（DPR 放大）
- **可選格式與快取**（記憶體 vs 速度平衡）

**核心理念：低清先顯示（快），高清後提升（好），DPR 適配螢幕（清晰）。** 🎯
