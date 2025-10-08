# 性能優化方案

## 🐌 卡頓原因診斷

### 1. **雙重渲染負擔**
```
滾動 → IntersectionObserver 觸發
      → 請求低清（72dpi WebP）
      → 150ms 後請求高清（144dpi WebP）
      → 每頁 2 次完整編碼
```

**問題**：WebP 編碼比 JPEG 慢 30%，雙重編碼導致 CPU 過載

### 2. **過於激進的高清策略**
- `visibleMarginPages = 2`：可見區上下各 2 頁都請求高清
- 快速滾動時，大量頁面同時請求高清
- `maxConcurrentRenders = 3`：並發限制過小

### 3. **LRU 淘汰頻率過高**
- 每次高清完成都執行 `evictHighResCache()`
- 30 頁快取上限太小（100 頁文件時頻繁淘汰）

### 4. **IntersectionObserver 靈敏度過高**
- `threshold: 0.01`：元素露出 1% 就觸發
- `rootMargin: '400px'`：提前 400px 就開始載入

---

## 🚀 優化方案

### 方案 A：簡化為單階段渲染（推薦）

**核心思路**：放棄雙快取，直接渲染目標品質

```typescript
// 移除低清階段，直接以最終 DPI 渲染
function renderPage(idx: number) {
  const dpi = viewMode === 'actual' ? dpiForActual() : 96 * dpr
  media.renderPdfPage(idx, targetWidth, 'webp', 75, dpi)  // 單次渲染
}
```

**優點**：
- ✅ 減少 50% 渲染次數
- ✅ CPU 負載減半
- ✅ 記憶體佔用減少（單一快取）

**缺點**：
- ❌ 初次載入慢（無低清佔位）

---

### 方案 B：優化雙快取策略

#### B1. 降低 WebP 品質
```typescript
// 低清：WebP quality 60（更快編碼）
// 高清：WebP quality 85
const lowResQuality = 60   // 原 85，減少 40% 編碼時間
const highResQuality = 85
```

#### B2. 增加並發與快取
```typescript
maxConcurrentRenders: 6    // 3 → 6（現代 CPU 有 8+ 核心）
MAX_HIRES_CACHE: 50        // 30 → 50（減少淘汰頻率）
visibleMarginPages: 1      // 2 → 1（減少預載範圍）
```

#### B3. 延遲高清請求
```typescript
// 低清完成後等待更久再請求高清
const hiResDelay = viewMode === 'fit' ? 300 : 500  // 原 150ms
```

#### B4. 批次淘汰 LRU
```typescript
// 不是每次都淘汰，累積到閾值再批次處理
let evictCounter = 0
function evictHighResCache() {
  if (++evictCounter % 5 !== 0) return  // 每 5 次才執行一次
  if (highResPages.size <= MAX_HIRES_CACHE) return
  // ...淘汰邏輯
}
```

---

### 方案 C：JPEG 作為低清格式

**核心思路**：低清用 JPEG（快），高清用 WebP（小）

```typescript
// 低清階段
format: 'jpeg'
quality: 70
dpi: 72

// 高清階段
format: 'webp'
quality: 85
dpi: 144
```

**優點**：
- ✅ 低清編碼快 50%（JPEG vs WebP）
- ✅ 首屏載入快
- ✅ 高清仍保持小檔案

---

### 方案 D：智能降級

根據硬體能力自動調整：

```typescript
const cpuCores = navigator.hardwareConcurrency || 4

if (cpuCores >= 8) {
  // 高性能：完整雙快取 WebP
  maxConcurrentRenders = 6
  lowResFormat = 'webp'
  highResFormat = 'webp'
} else if (cpuCores >= 4) {
  // 中等：JPEG + WebP
  maxConcurrentRenders = 4
  lowResFormat = 'jpeg'
  highResFormat = 'webp'
} else {
  // 低性能：全 JPEG
  maxConcurrentRenders = 2
  lowResFormat = 'jpeg'
  highResFormat = 'jpeg'
}
```

---

## 📊 推薦配置

### 立即優化（不改架構）

```typescript
// src/modules/settings/types.ts
export const defaultSettings: SettingsState = {
  renderFormat: 'webp',
  maxConcurrentRenders: 6,        // 3 → 6
  visibleMarginPages: 1,          // 2 → 1
  zoomDebounceMs: 300,            // 180 → 300
  // ...
}
```

```typescript
// src/modules/media/store.ts
const MAX_HIRES_CACHE = 50        // 30 → 50
const LOW_RES_DPI = 72
const LOW_RES_QUALITY = 65        // WebP 降低品質加速編碼
```

```typescript
// src/components/MediaView/MediaView.vue
const hiResDelay = 400            // 150 → 400（延遲高清請求）
```

### 長期優化（架構調整）

**建議採用方案 C**：JPEG 低清 + WebP 高清

理由：
1. 平衡速度與品質
2. 最小改動量
3. 適用所有硬體

---

## 🔧 實作檢查清單

- [ ] 調整預設並發數：3 → 6
- [ ] 調整快取上限：30 → 50
- [ ] 調整可見範圍：2 → 1
- [ ] 低清改用 JPEG（可選）
- [ ] 批次 LRU 淘汰
- [ ] 測試 100+ 頁文件
- [ ] 監控 CPU/記憶體使用

---

## 測試指標

| 指標 | 目標 | 當前 |
|------|------|------|
| 首屏載入 | < 1s | ? |
| 滾動 FPS | 60 | ? |
| CPU 使用率 | < 40% | ? |
| 記憶體佔用 | < 500MB (100頁) | ? |

先執行「立即優化」，若仍卡頓則採用方案 C。
