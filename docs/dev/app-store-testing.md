# 測試 App Store 版本行為

本文說明如何在開發階段模擬 App Store 版本的行為，以便測試相關功能的隱藏邏輯。

## 背景

App Store 版本與一般版本的主要差異：

| 功能 | 一般版本 | App Store 版本 |
|------|----------|----------------|
| 自動更新 | 啟用 | 停用 |
| 選單「檢查更新」 | 顯示 | 隱藏 |
| 設定頁「更新」區塊 | 顯示 | 隱藏 |
| 啟動時自動檢查更新 | 依設定 | 停用 |

正式的 App Store 版本使用 compile-time feature flag (`--features app-store`) 編譯，但開發時可透過環境變數模擬此行為。

## 使用方式

### 模擬 App Store 版本

```bash
SIMULATE_APP_STORE=1 npm run tauri dev
```

設定 `SIMULATE_APP_STORE` 環境變數後，`isAppStoreBuild()` 會回傳 `true`，觸發以下行為：

- 選單列的「檢查更新」項目隱藏
- 設定頁面的「更新」區塊隱藏
- 設定導覽列的「更新」項目隱藏
- 啟動時不會自動檢查更新

### 一般開發模式

```bash
npm run tauri dev
```

不設定環境變數時，所有更新相關功能正常顯示。

## 實作原理

後端 (`src-tauri/src/updater.rs` 和 `src-tauri/src/menu.rs`) 使用以下邏輯判斷：

```rust
fn is_app_store_build() -> bool {
    cfg!(feature = "app-store") || std::env::var("SIMULATE_APP_STORE").is_ok()
}
```

- `cfg!(feature = "app-store")` 是 compile-time 檢查，正式 App Store 版本會直接回傳 `true`
- `std::env::var("SIMULATE_APP_STORE")` 是 runtime 檢查，僅在開發時使用

由於 `||` 短路求值，正式 App Store 版本不會執行環境變數檢查，沒有效能影響。

## 正式編譯 App Store 版本

若需要完整編譯 App Store 版本（用於提交審核）：

```bash
npm run tauri build -- --features app-store -- --no-default-features
```

詳細的簽章與打包流程請參考 [apple-signing.md](./apple-signing.md)。
