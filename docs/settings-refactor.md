# Settings 精簡重構建議

## 當前問題
- 25 個參數，其中 11 個（44%）是過度設計或重複
- 背景預載功能複雜但效益不明確
- 用戶難以理解各參數的用途與交互作用

## 精簡方案：保留 12 個核心參數

### 1. 檔案操作（2個）
```typescript
deleteBehavior: 'saveAsNew' | 'overwrite'  // 刪除頁面行為
```

### 2. 插入空白頁（4個）
```typescript
insertPaper: 'A4' | 'Letter' | ...
insertOrientation: 'portrait' | 'landscape'
insertCustomWidthMm: number
insertCustomHeightMm: number
```

### 3. 渲染品質（5個）
```typescript
renderFormat: 'png' | 'jpeg'          // 統一格式（移除 highQuality 前綴）
dprCap: number                        // DPR 上限（預設 2.0）
maxOutputWidth: number                // 最大輸出寬度（預設 1920）
actualModeDpiCap: number             // 實際大小模式 DPI 上限（預設 144）
zoomDebounceMs: number               // 縮放停止後延遲（預設 180）
```

### 4. 效能控制（2個）
```typescript
maxConcurrentRenders: number         // 並行渲染數（預設 3）
visibleMarginPages: number           // 可見區上下預渲染頁數（預設 2）
```

### 5. 編碼品質（2個）
```typescript
jpegQuality: number                  // 1-100（預設 82）
pngCompression: 'fast' | 'balanced' | 'best'  // 取代 pngFast boolean
```

### 6. 開發工具（1個）
```typescript
devPerfOverlay: boolean              // Debug 浮層
```

## 移除的參數與替代方案

| 移除參數 | 原因 | 替代方案 |
|---------|------|----------|
| `preloadAllPages` | 沒必要，記憶體爆炸 | 用雙快取 + LRU 淘汰 |
| `preloadRange` | 與 visibleMarginPages 重複 | 統一為 visibleMarginPages |
| `preloadIdleMs` | 與 zoomDebounceMs 重複 | 統一為 zoomDebounceMs |
| `preloadBatchSize` | 內部控制即可 | 固定為 2-3 |
| `preloadStartDelayMs` | 多餘 | 固定 500ms |
| `pausePreloadOnInteraction` | 應該永久開啟 | 內建行為 |
| `preloadDprCap` | 雙快取已解決 | 低清固定 72dpi |
| `targetWidthPolicy` | 容器寬即可 | 固定 container |
| `baseWidth` | 多餘 | 移除 |
| `prefetchPx` | IntersectionObserver 處理 | rootMargin 內建 |
| `highRadius` | 併入 visibleMarginPages | 統一為 visibleMarginPages |

## 實作步驟

1. ✅ 創建新的 `types-v2.ts`（精簡版）
2. ✅ 更新 `store.ts` 支援新舊格式遷移
3. ✅ 簡化 `SettingsView.vue`（單頁即可，不需分頁）
4. ✅ 移除 MediaView.vue 中的背景預載邏輯
5. ✅ 更新文件說明

## 預期效益

- 參數數量：25 → 12（減少 52%）
- UI 複雜度：下降 60%（單頁設定，無需分頁）
- 維護成本：下降（清晰的參數職責）
- 用戶體驗：提升（更容易理解與調整）
