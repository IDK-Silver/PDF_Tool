# MediaView.vue 精簡重構方案

## 目標
1. 移除所有背景預載邏輯（400+ 行）
2. 統一使用雙快取策略
3. 更新為新的參數名

## 需要移除的功能
- `buildPreloadQueue()`
- `schedulePreloadStart()`
- `scheduleIdle()`
- `processPreloadBatch()`
- `cancelIdle()`
- `pausePreload()` / `resumePreload()`
- 所有 `preloadQueue`、`idleHandle` 相關狀態

## 需要更新的參數映射

| 舊參數 | 新參數 | 備註 |
|--------|--------|------|
| `highQualityFormat` | `renderFormat` | 統一命名 |
| `pngFast` | `pngCompression` | 改為枚舉（fast/balanced/best） |
| `maxTargetWidth` | `maxOutputWidth` | 更清晰 |
| `actualDpiCap` | `actualModeDpiCap` | 更明確 |
| `highQualityDelayMs` | `zoomDebounceMs` | 更精確 |
| `highRadius` | `visibleMarginPages` | 統一命名 |
| `preload*` | *(移除)* | 雙快取已解決 |
| `targetWidthPolicy` | *(移除，固定 container)* | 簡化 |
| `baseWidth` | *(移除，用 containerW)* | 簡化 |

## 精簡後的邏輯流程

```typescript
// 1. 可見頁進入視窗 → IntersectionObserver 觸發
observe(el, idx) → pendingIdx.add(idx) → scheduleProcess()

// 2. RAF 批次處理可見頁
scheduleProcess() → {
  - 計算可見範圍 ± visibleMarginPages
  - 呼叫 media.renderPdfPage(idx, width, format, quality, dpi)
  - store 自動處理雙快取（低解析度 + 高解析度）
}

// 3. 縮放/滾動停止 → debounce 後觸發高清重渲染
scheduleHiResRerender() → {
  - 延遲 zoomDebounceMs
  - 對可見範圍重新請求高解析度
}
```

## 簡化後的狀態數量
- 移除前：~30 個 ref/reactive
- 移除後：~15 個 ref/reactive（減少50%）

## 預期檔案大小
- 移除前：~1000 行
- 移除後：~600 行（減少40%）
