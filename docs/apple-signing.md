# macOS App 簽名與公證指南

本文件說明如何設定 Apple Developer 證書來簽名和公證 macOS 應用程式。

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

## 二、設定 Tauri 簽名

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

| Secret 名稱 | 說明 |
|------------|------|
| `APPLE_CERTIFICATE` | .p12 檔案的 base64 編碼 |
| `APPLE_CERTIFICATE_PASSWORD` | 匯出 .p12 時設定的密碼 |
| `APPLE_ID` | Apple ID email |
| `APPLE_TEAM_ID` | Team ID（10 字元） |
| `APPLE_PASSWORD` | App 專用密碼 |

### 3. Workflow 設定

參考 `.github/workflows/release-tauri.yml` 中的：
- `Import Apple certificate` step：匯入證書到 runner
- `Sign PDFium libraries` step：簽名外部 dylib
- `Build & Release with Tauri` step：設定公證環境變數

## 六、常見問題

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

## 七、重要檔案位置

| 檔案 | 用途 |
|------|------|
| `developer_key.key` | 私鑰（務必備份，遺失需重新建立證書） |
| `developerID_application.cer` | Apple 簽發的證書 |
| `certificate.p12` | 包含私鑰和證書的匯出檔（給 CI 用） |

## 八、證書有效期

- Developer ID Application 證書有效期：5 年
- 到期前需重新建立並更新 GitHub Secrets
