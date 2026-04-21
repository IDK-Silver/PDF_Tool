# macOS App 簽名與公證指南

本文件說明如何設定 Apple Developer 證書來簽名和公證 macOS 應用程式，包含 GitHub 直接下載版本和 App Store 版本。

## 版本差異

| 版本 | 憑證類型 | 自動更新 | 分發方式 |
|------|---------|---------|---------|
| GitHub 版本 | Developer ID Application | ✅ 支援 | GitHub Release |
| App Store 版本 | 3rd Party Mac Developer | ❌ 不支援 | Mac App Store |

## 前置需求

- Apple Developer Program 會員資格（年費 USD $99 / TWD $3,400）
- macOS 電腦
- Xcode Command Line Tools

## 一、建立 Developer ID 證書

### 1. 產生 CSR（Certificate Signing Request）

```bash
openssl req -new -newkey rsa:2048 -nodes \
  -keyout ~/Desktop/developer_key.key \
  -out ~/Desktop/developer_csr.certSigningRequest \
  -subj "/emailAddress=你的email/CN=你的名字/C=TW"
```

**重要**：`developer_key.key` 是私鑰，務必妥善保管。

### 2. 在 Apple Developer Portal 建立證書

1. 登入 [Apple Developer Portal](https://developer.apple.com/account/resources/certificates/list)
2. 點擊 "+" 建立新證書
3. 選擇 **Developer ID Application**
4. 選擇 **G2 Sub-CA (Xcode 11.4.1 or later)**
5. 上傳 `developer_csr.certSigningRequest`
6. 下載產生的 `.cer` 檔案

### 3. 安裝證書

```bash
# 匯入私鑰
security import ~/Desktop/developer_key.key -k ~/Library/Keychains/login.keychain-db -T /usr/bin/codesign

# 雙擊 .cer 檔案安裝，或用命令列：
security import ~/Downloads/developerID_application.cer -k ~/Library/Keychains/login.keychain-db

# 安裝中繼憑證
curl -O https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer
security import DeveloperIDG2CA.cer -k ~/Library/Keychains/login.keychain-db
```

### 4. 驗證安裝

```bash
security find-identity -v -p codesigning
```

應顯示：`"Developer ID Application: 你的名字 (TEAM_ID)"`

## 二、建立 App Store 證書（選用）

若要上架 Mac App Store，需要額外建立以下證書。

### 1. 產生 CSR

```bash
# Application 憑證用
openssl req -new -newkey rsa:2048 -nodes \
  -keyout ~/Desktop/appstore_app.key \
  -out ~/Desktop/appstore_app.csr \
  -subj "/emailAddress=你的email/CN=你的名字/C=TW"

# Installer 憑證用
openssl req -new -newkey rsa:2048 -nodes \
  -keyout ~/Desktop/appstore_installer.key \
  -out ~/Desktop/appstore_installer.csr \
  -subj "/emailAddress=你的email/CN=你的名字/C=TW"
```

### 2. 在 Apple Developer Portal 建立證書

1. 登入 [Apple Developer Portal](https://developer.apple.com/account/resources/certificates/list)
2. 建立 **Mac App Distribution**（或 3rd Party Mac Developer Application）
3. 建立 **Mac Installer Distribution**（或 3rd Party Mac Developer Installer）
4. 分別上傳對應的 CSR 並下載 `.cer` 檔案

### 3. 轉換為 .p12

```bash
# 需要加 -legacy 參數確保相容性
openssl x509 -in ~/Desktop/appstore_app.cer -inform DER -out ~/Desktop/appstore_app.pem
openssl pkcs12 -export \
  -out ~/Desktop/appstore_app.p12 \
  -inkey ~/Desktop/appstore_app.key \
  -in ~/Desktop/appstore_app.pem \
  -name "3rd Party Mac Developer Application: 你的名字" \
  -passout pass:你的密碼 \
  -legacy

openssl x509 -in ~/Desktop/appstore_installer.cer -inform DER -out ~/Desktop/appstore_installer.pem
openssl pkcs12 -export \
  -out ~/Desktop/appstore_installer.p12 \
  -inkey ~/Desktop/appstore_installer.key \
  -in ~/Desktop/appstore_installer.pem \
  -name "3rd Party Mac Developer Installer: 你的名字" \
  -passout pass:你的密碼 \
  -legacy
```

### 4. 建立 Provisioning Profile

1. 到 [Identifiers](https://developer.apple.com/account/resources/identifiers/list) 建立 App ID
2. Bundle ID 必須與 `tauri.conf.json` 的 `identifier` 一致
3. 到 [Profiles](https://developer.apple.com/account/resources/profiles/list) 建立 **Mac App Store Connect** profile
4. 下載 `.provisionprofile` 檔案

## 三、設定 Tauri 簽名

在 `src-tauri/tauri.conf.json` 的 `bundle.macOS` 加入：

```json
{
  "bundle": {
    "macOS": {
      "signingIdentity": "Developer ID Application: 你的名字 (TEAM_ID)"
    }
  }
}
```

## 三、簽名外部函式庫

Tauri 不會自動簽名 `resources` 裡的 `.dylib` 檔案，需要手動簽名：

```bash
codesign --force --options runtime --timestamp \
  --sign "Developer ID Application: 你的名字 (TEAM_ID)" \
  src-tauri/resources/pdfium/aarch64-apple-darwin/libpdfium.dylib
```

## 四、公證（Notarization）

### 1. 建立 App 專用密碼

1. 到 [appleid.apple.com](https://appleid.apple.com/account/manage)
2. 登入與安全性 → App 專用密碼 → 產生
3. 記下產生的密碼（格式如 `xxxx-xxxx-xxxx-xxxx`）

### 2. 設定環境變數（本地 build 自動公證用）

```bash
export APPLE_ID="你的apple_id@email.com"
export APPLE_TEAM_ID="你的TEAM_ID"
export APPLE_PASSWORD="你的app專用密碼"
```

### 3. 手動公證

如果需要手動公證已簽名的 dmg：

```bash
# 提交公證
xcrun notarytool submit "path/to/app.dmg" \
  --apple-id "你的apple_id@email.com" \
  --team-id "你的TEAM_ID" \
  --password "你的app專用密碼" \
  --wait

# 公證成功後 staple
xcrun stapler staple "path/to/app.dmg"
```

### 4. 驗證公證狀態

```bash
spctl -a -vvv -t install "path/to/app.dmg"
```

## 五、GitHub Actions 設定

### 1. 匯出證書為 .p12

```bash
# 匯出（設定一個密碼保護 .p12 檔案）
security export -k ~/Library/Keychains/login.keychain-db \
  -t identities -f pkcs12 -P "你設的密碼" \
  -o ~/Desktop/certificate.p12

# 轉成 base64（複製到剪貼簿）
base64 -i ~/Desktop/certificate.p12 | pbcopy
```

### 2. 設定 GitHub Secrets

在 repo 的 Settings → Secrets and variables → Actions 新增：

**GitHub 版本必要：**

| Secret 名稱 | 說明 |
|------------|------|
| `APPLE_CERTIFICATE` | Developer ID .p12 的 base64 編碼 |
| `APPLE_CERTIFICATE_PASSWORD` | 匯出 .p12 時設定的密碼 |
| `APPLE_ID` | Apple ID email |
| `APPLE_TEAM_ID` | Team ID（10 字元） |
| `APPLE_PASSWORD` | App 專用密碼 |
| `TAURI_SIGNING_PRIVATE_KEY` | Tauri updater 私鑰 |
| `TAURI_SIGNING_PRIVATE_KEY_PASSWORD` | Tauri updater 私鑰密碼 |

**App Store 版本必要（選用）：**

| Secret 名稱 | 說明 |
|------------|------|
| `APPSTORE_APP_CERTIFICATE` | App Store Application .p12 的 base64 編碼 |
| `APPSTORE_INSTALLER_CERTIFICATE` | App Store Installer .p12 的 base64 編碼 |
| `APPSTORE_CERTIFICATE_PASSWORD` | App Store 憑證密碼 |
| `APPSTORE_PROVISIONING_PROFILE` | Provisioning Profile 的 base64 編碼 |

**產生 base64 編碼：**

```bash
base64 -i ~/Desktop/certificate.p12 | pbcopy
```

### 3. Workflow 設定

參考 `.github/workflows/release-tauri.yml`：

**GitHub 版本建置：**
- `Import Apple certificates`：匯入所有證書到 runner
- `Verify Apple signing identity`：確認 `Developer ID Application` 憑證已正確匯入 keychain
- `Verify Apple notarization access`：先用 `notarytool history` 檢查 Apple 公證 API 是否可用，避免 build 完才發現 agreement 或權限問題
- `Sign PDFium libraries`：簽名外部 dylib
- `Build & Release with Tauri`：建置並上傳到 GitHub Release（非 Draft）
- `Publish release`：確保 Release 為已發布狀態

**App Store 版本建置：**
- `Prepare App Store build`：切換 entitlements 和簽名身份
- `Build App Store version`：用 `--no-default-features --features app-store` 建置
- `Sign and package for App Store`：重新簽名並打包為 .pkg
- `Upload App Store artifacts`：上傳為 GitHub Artifact（保留 90 天）

App Store 版本可從 Actions → 對應 workflow run → Artifacts 下載。

## 六、本地開發與測試

### Feature Flags

專案使用 Cargo features 區分版本：

| Feature | 說明 |
|---------|------|
| `self-update`（預設） | 啟用自動更新功能（GitHub 版本） |
| `app-store` | App Store 版本，禁用所有更新相關功能 |

### 本地測試 App Store 版本

App Store 版本需要移除 `updater.json` capability 檔案，因為 `tauri-plugin-updater` 不會被編譯：

```bash
# 1. 暫時移除 updater capability
mv src-tauri/capabilities/updater.json src-tauri/capabilities/updater.json.bak

# 2. 啟動 App Store 版本開發模式
npm run tauri dev -- -- --no-default-features --features app-store

# 3. 測試完畢後還原
mv src-tauri/capabilities/updater.json.bak src-tauri/capabilities/updater.json
```

**驗證項目：**
- 選單中沒有「Check for Updates...」項目
- 應用程式正常運作

### 為何需要移除 updater.json？

Tauri 的 capabilities 是靜態 JSON 檔案，無法條件編譯。當 `app-store` feature 啟用時：

1. `tauri-plugin-updater` 不會被編譯（optional dependency）
2. `updater:default` 權限不存在
3. Build script 讀取 `updater.json` 時找不到權限 → 編譯失敗

CI workflow 已自動處理此問題（`.github/workflows/release-tauri.yml:344`）。

## 七、常見問題

### 證書顯示「不受信任」

缺少中繼憑證，執行：

```bash
curl -O https://www.apple.com/certificateauthority/DeveloperIDG2CA.cer
security import DeveloperIDG2CA.cer -k ~/Library/Keychains/login.keychain-db
```

### 公證失敗：dylib 未簽名

外部 `.dylib` 需要在 build 前手動簽名，確保加上 `--options runtime --timestamp`。

### 公證時間過長

Apple 公證通常需要 2-15 分鐘，跨年或假日期間可能更久。可以先用 `--no-sign` 測試 build，之後再處理簽名和公證。

### 查看公證失敗原因

```bash
xcrun notarytool log <submission-id> \
  --apple-id "你的apple_id@email.com" \
  --team-id "你的TEAM_ID" \
  --password "你的app專用密碼"
```

## 八、重要檔案位置

| 檔案 | 用途 |
|------|------|
| `developer_key.key` | 私鑰（務必備份，遺失需重新建立證書） |
| `developerID_application.cer` | Apple 簽發的證書 |
| `certificate.p12` | 包含私鑰和證書的匯出檔（給 CI 用） |

## 九、證書有效期

- Developer ID Application 證書有效期：5 年
- 到期前需重新建立並更新 GitHub Secrets
