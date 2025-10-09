# 深色模式功能總結

## 已完成的工作

### 1. 核心實作
- ✅ 更新 CSS 變數系統（`src/assets/tailwind.css`）
  - 定義舒適的灰色調深色模式（背景 12% 亮度，非純黑）
  - 新增 `--card`, `--input`, `--hover` 等語意化變數
  - 完整的亮/暗兩套色彩方案

- ✅ 更新 Tailwind 配置（`tailwind.config.js`）
  - 啟用 `darkMode: 'class'`
  - 新增對應的 utility classes

- ✅ Settings Store（`src/modules/settings/`）
  - 新增 `theme: 'light' | 'dark'` 欄位
  - 實作 `applyTheme()` 函式，即時切換 `<html>` 的 `dark` class
  - 初始化時自動套用儲存的主題偏好
  - 監聽主題變更，即時生效

### 2. UI 控制
- ✅ 設定頁面（`SettingsView.vue`）
  - 新增「外觀」區塊，提供亮色/暗色 radio 選項
  - 預設為亮色模式
  - 即時切換，無需重載頁面

### 3. 元件適配
已將所有硬編碼的顏色替換為語意化 CSS 變數：

- ✅ `SettingsView.vue`
  - 所有 input/select/button 改用 `bg-input`, `bg-card`, `border-border`
  
- ✅ `InsertDefaults.vue`
  - 輸入欄與按鈕適配深色模式
  
- ✅ `ExportSettings.vue`
  - 輸入欄適配深色模式
  
- ✅ `MediaView.vue`
  - 工具列按鈕群組：`bg-card`, `hover:bg-hover`
  - 頁面容器背景：`bg-muted`（取代 `bg-neutral-200`）
  - 卡片容器：`bg-card`（取代 `bg-white`）
  - 右鍵選單：`bg-card`, `hover:bg-hover`
  - 載入中骨架：`bg-muted`（取代 `bg-gray-100`）

- ✅ 其他元件
  - `FileList.vue`, `FileListItem.vue`, `ModeChooseList.vue`, `SettingBar.vue`, `App.vue` 
  - 這些元件原本就使用 CSS 變數，無需額外修改

### 4. 文件
- ✅ 建立 `docs/dark-mode.md`
  - 完整的實作說明
  - 設計考量與色彩選擇原則
  - 元件適配指引
  - 維護與除錯技巧

## 使用方式

1. 開啟應用程式
2. 點選左上角齒輪圖示進入設定頁面
3. 在「外觀」區塊選擇「亮色」或「暗色」
4. 主題會即時套用，並儲存偏好至 localStorage

## 技術亮點

### 舒適的灰色調
- **背景**：`hsl(0 0% 12%)`（HSL 色彩空間，12% 亮度）
- **避免純黑**：長時間使用更舒適，對 OLED 螢幕友善
- **清晰層次**：卡片（16%）、輸入欄（18%）、背景（12%）形成微妙漸層

### 完整的語意化系統
- `--background` / `--foreground`：主背景與文字
- `--card`：卡片、對話框等浮起元素
- `--input`：表單輸入欄
- `--muted` / `--muted-foreground`：柔和背景與次要文字
- `--hover` / `--selection`：互動狀態
- `--border`：邊框

### 即時生效
- 透過 `watch()` 監聽 `s.theme` 變更
- 直接操作 `document.documentElement.classList`
- 無需重載頁面，立即看到效果

## 檢查清單

- [x] CSS 變數定義（亮色 + 暗色）
- [x] Tailwind 配置更新
- [x] Settings 型別與預設值
- [x] Store 實作與主題切換邏輯
- [x] UI 控制介面
- [x] 所有元件顏色適配
- [x] 文件撰寫
- [x] 無編譯錯誤

## 已知限制

- 目前不支援自動跟隨系統主題（未實作 `prefers-color-scheme` 偵測）
- 主題選項僅有亮/暗兩種，無其他配色方案

## 未來可擴充

1. 自動跟隨系統：偵測 `window.matchMedia('(prefers-color-scheme: dark)')`
2. 更多主題：提供藍色、綠色等色彩變體
3. 高對比模式：輔助功能增強
4. 藍光過濾模式：夜間閱讀優化
