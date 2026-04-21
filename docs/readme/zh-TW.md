# Kano PDF Tool

<p align="center"><a href="../../README.md">English</a> | 繁體中文</p>

<p align="center">
  <a href="https://kano-pdf-tool.yuufeng.com/zh-TW">官網</a>
</p>

一個功能強大的跨平台 PDF 編輯與閱讀工具。

| Light Theme | Dark Theme |
|:-----------:|:----------:|
| ![Light Theme](https://github-static-object.yuufeng.com/PDF-Tool/zh-tw/app-cover-light.jpg) | ![Dark Theme](https://github-static-object.yuufeng.com/PDF-Tool/zh-tw/app-cover-dark.jpg) |

## 主要功能

| PDF 編輯 | PDF 閱讀 | 圖片處理 |
|:--------:|:--------:|:--------:|
| 刪除 / 新增頁面 | 高品質渲染 | 多格式支援 |
| 單頁匯出 PDF / 圖片 | 文字選擇與搜尋 | 圖片壓縮 |
| PDF 壓縮 | 暗色模式 | 圖片瀏覽 |
| 標注（螢光筆、圖形、文字、簽名） | | |

## 支持這個專案

如果這個專案對你有幫助，歡迎透過以下方式支持 ☕

### Buy Me a Coffee

[<img src="https://cdn.buymeacoffee.com/buttons/v2/default-blue.png" alt="Buy Me A Coffee" width="150">](https://www.buymeacoffee.com/yuuf.25)

或掃描 QR Code：

<img src="../website/asset/image/buymeacoffee-qr-code.png" alt="Buy me a coffee QR Code" width="200" />

## 安裝與使用

### 下載安裝包

| 平台 | 版本 | 連結 |
|------|------|------|
| macOS | Universal Binary<br/>（支援 Intel 與 Apple Silicon） | [下載](https://github.com/IDK-Silver/PDF_Tool/releases/download/v3.12.0/Kano.PDF.Tool_3.12.0_universal.dmg) |
| Windows | x64 | [下載](https://github.com/IDK-Silver/PDF_Tool/releases/download/v3.12.0/Kano.PDF.Tool_3.12.0_x64-setup.exe) |
| Linux | x64 (AppImage) | [下載](https://github.com/IDK-Silver/PDF_Tool/releases/download/v3.12.0/Kano.PDF.Tool_3.12.0_amd64.AppImage) |

> **macOS 說明**：Universal Binary 版本包含 Intel (x86_64) 和 Apple Silicon (ARM64) 兩種架構，可自動適配您的 Mac 機型。應用程式已通過 Apple 開發者簽名及公證 (Notarization)，可直接安裝使用。

> **自動更新**：應用程式內建自動更新功能，當有新版本時會提示您下載安裝。

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=IDK-Silver/PDF_Tool&type=Date)](https://star-history.com/#IDK-Silver/PDF_Tool&Date)

## 貢獻

歡迎提交 Issue 和 Pull Request 來幫助改進這個專案。

## 開發環境設定

### 環境需求
- Node.js 18+
- Rust 1.70+
- 對應平台的 Tauri 依賴項

### 安裝步驟

1. 克隆專案
    ```bash
    git clone https://github.com/IDK-Silver/PDF_Tool.git
    cd PDF_Tool
    ```

2. 安裝依賴
    ```bash
    npm install
    ```

3. 下載 PDFium 函式庫
    ```bash
    npm run pdfium:fetch
    ```

4. 啟動開發伺服器
    ```bash
    npm run tauri dev
    ```

5. 建構應用程式
    ```bash
    npm run tauri build
    ```

## 授權

本專案採用 MIT 授權條款。
