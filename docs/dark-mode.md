# 深色模式實作

## 概述

本專案支援亮色／暗色主題切換，使用者可在設定頁面選擇偏好的配色方案。

## 實作方式

### CSS 變數系統

定義於 `src/assets/tailwind.css`，使用 HSL 色彩空間以便於調整：

#### 亮色模式（預設）
```css
:root {
  --background: 0 0% 100%;      /* 純白背景 */
  --foreground: 0 0% 9%;        /* 深灰文字 */
  --muted: 0 0% 96%;            /* 柔和背景 */
  --muted-foreground: 0 0% 45%; /* 次要文字 */
  --accent: 0 0% 90%;           /* 強調色 */
  --on-accent: 0 0% 9%;         /* 強調色上的文字 */
  --border: 0 0% 89%;           /* 邊框 */
  --card: 0 0% 100%;            /* 卡片背景 */
  --input: 0 0% 100%;           /* 輸入欄背景 */
  --selection: 0 0% 90%;        /* 選取狀態 */
  --hover: 0 0% 96%;            /* 懸停狀態 */
}
```

#### 暗色模式
使用舒適的灰色調，避免純黑過於刺眼：

```css
.dark {
  --background: 0 0% 12%;       /* 深灰背景（非純黑） */
  --foreground: 0 0% 95%;       /* 淺色文字 */
  --muted: 0 0% 20%;            /* 柔和背景 */
  --muted-foreground: 0 0% 65%; /* 次要文字 */
  --accent: 0 0% 25%;           /* 強調色 */
  --on-accent: 0 0% 95%;        /* 強調色上的文字 */
  --border: 0 0% 24%;           /* 邊框 */
  --card: 0 0% 16%;             /* 卡片背景 */
  --input: 0 0% 18%;            /* 輸入欄背景 */
  --selection: 0 0% 24%;        /* 選取狀態 */
  --hover: 0 0% 20%;            /* 懸停狀態 */
}
```

### Tailwind 配置

在 `tailwind.config.js` 中啟用 class-based 深色模式，並定義對應的 utility classes：

```js
{
  darkMode: 'class',
  theme: {
    extend: {
      colors: {
        background: 'hsl(var(--background) / <alpha-value>)',
        foreground: 'hsl(var(--foreground) / <alpha-value>)',
        card: 'hsl(var(--card) / <alpha-value>)',
        input: 'hsl(var(--input) / <alpha-value>)',
        hover: 'hsl(var(--hover) / <alpha-value>)',
        // ... 其他顏色
      }
    }
  }
}
```

### 設定儲存

#### 型別定義（`src/modules/settings/types.ts`）
```typescript
export interface SettingsState {
  theme: 'light' | 'dark'
  // ... 其他設定
}

export const defaultSettings: SettingsState = {
  theme: 'light',  // 預設為亮色
  // ...
}
```

#### Store 實作（`src/modules/settings/store.ts`）
```typescript
// 套用主題到 <html> 元素
function applyTheme(theme: 'light' | 'dark') {
  const html = document.documentElement
  if (theme === 'dark') {
    html.classList.add('dark')
  } else {
    html.classList.remove('dark')
  }
}

export const useSettingsStore = defineStore('settings', () => {
  const s = ref<SettingsState>(loadFromStorage())
  
  // 初始化時套用主題
  applyTheme(s.value.theme)
  
  // 監聽主題變更，即時套用
  watch(() => s.value.theme, (theme) => {
    applyTheme(theme)
  })
  
  // ...
})
```

### UI 控制（`src/components/Settings/SettingsView.vue`）

提供 radio button 讓使用者切換：

```vue
<section id="appearance" class="space-y-3">
  <h2 class="font-medium text-base">外觀</h2>
  <div class="rounded-md border p-4 space-y-3">
    <div>
      <label class="block mb-2">主題模式</label>
      <div class="flex flex-col gap-2 md:flex-row md:items-center md:gap-6">
        <label class="flex items-center gap-2">
          <input type="radio" value="light" v-model="s.theme" />
          <span>亮色（預設）</span>
        </label>
        <label class="flex items-center gap-2">
          <input type="radio" value="dark" v-model="s.theme" />
          <span>暗色</span>
        </label>
      </div>
      <p class="text-xs text-[hsl(var(--muted-foreground))] mt-1">
        切換介面的配色主題，即時生效。
      </p>
    </div>
  </div>
</section>
```

## 元件適配原則

### 避免硬編碼顏色

❌ **錯誤**：
```vue
<button class="bg-white text-gray-900 border">...</button>
<input class="bg-white border">
```

✅ **正確**：
```vue
<button class="bg-card text-foreground border border-border">...</button>
<input class="bg-input border border-border text-foreground">
```

### 常用類別對應

| 用途 | Tailwind Class |
|------|----------------|
| 背景 | `bg-background` |
| 卡片背景 | `bg-card` |
| 輸入欄背景 | `bg-input` |
| 文字 | `text-foreground` |
| 次要文字 | `text-muted-foreground` |
| 邊框 | `border-border` |
| 懸停 | `hover:bg-hover` |
| 選取狀態 | `bg-selection` |

### 已適配的元件清單

- ✅ `SettingsView.vue` - 所有設定頁面元素
- ✅ `InsertDefaults.vue` - 插入預設設定
- ✅ `ExportSettings.vue` - 匯出設定
- ✅ `MediaView.vue` - 檢視器工具列、頁面容器、右鍵選單
- ✅ `FileList.vue` / `FileListItem.vue` - 檔案清單（已使用 CSS 變數）
- ✅ `ModeChooseList.vue` - 模式切換按鈕（已使用 CSS 變數）
- ✅ `SettingBar.vue` - 頂部工具列（已使用 CSS 變數）
- ✅ `App.vue` - 主佈局（已使用 CSS 變數）

## 設計考量

### 為什麼選擇灰色系暗色模式？

1. **舒適度**：純黑（#000）在 OLED 螢幕上對比過強，長時間使用容易疲勞
2. **專業感**：灰色調（12% 亮度）更符合現代設計語言（如 GitHub、VS Code）
3. **層次感**：灰階漸層可清楚區分卡片、輸入欄、背景等不同層級
4. **可讀性**：文字與背景對比適中，不會過於刺眼

### 色彩選擇原則

- **背景**：12% 亮度（避免純黑）
- **卡片**：16% 亮度（略高於背景）
- **輸入欄**：18% 亮度（明確的互動元素）
- **邊框**：24% 亮度（微妙但可見）
- **文字**：95% 亮度（高對比，但非純白）
- **次要文字**：65% 亮度（清楚但不搶眼）

## 維護指引

### 新增元件時

1. 避免使用 `bg-white`, `bg-gray-*`, `text-black` 等固定色彩
2. 優先使用語意化的顏色變數（`bg-card`, `text-foreground` 等）
3. 確保在亮/暗兩種模式下測試視覺效果

### 除錯技巧

開啟開發者工具，手動在 `<html>` 元素加上 `dark` class 即可即時預覽暗色模式：

```js
document.documentElement.classList.add('dark')
```

## 未來擴展

可考慮的功能：
- [ ] 自動跟隨系統主題（`prefers-color-scheme`）
- [ ] 自訂色彩主題
- [ ] 高對比模式
- [ ] 藍光過濾模式
