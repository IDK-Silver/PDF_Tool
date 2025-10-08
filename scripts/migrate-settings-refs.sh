#!/bin/bash
# 批次替換 MediaView.vue 中的舊參數名

FILE="src/components/MediaView/MediaView.vue"

# 備份
cp "$FILE" "$FILE.bak"

# 替換參數名
sed -i '' 's/settings\.s\.highQualityFormat/getRenderFormat()/g' "$FILE"
sed -i '' 's/settings\.s\.pngFast ? 25 : 100/getRenderQuality()/g' "$FILE"
sed -i '' 's/settings\.s\.maxTargetWidth/settings.s.maxOutputWidth/g' "$FILE"
sed -i '' 's/settings\.s\.highRadius/settings.s.visibleMarginPages/g' "$FILE"

# 移除 preload 相關（統一替換為固定值或移除）
sed -i '' 's/settings\.s\.preloadAllPages/false/g' "$FILE"
sed -i '' 's/settings\.s\.preloadRange/settings.s.visibleMarginPages/g' "$FILE"
sed -i '' 's/settings\.s\.preloadIdleMs || 0/500/g' "$FILE"
sed -i '' 's/settings\.s\.preloadBatchSize || 2/2/g' "$FILE"
sed -i '' 's/settings\.s\.preloadStartDelayMs || 0/500/g' "$FILE"
sed-i '' 's/settings\.s\.pausePreloadOnInteraction/true/g' "$FILE"
sed -i '' 's/settings\.s\.preloadDprCap || 1\.0/1.0/g' "$FILE"

# 移除 targetWidthPolicy 和 baseWidth（統一為 container）
sed -i '' 's/settings\.s\.targetWidthPolicy === .container./true/g' "$FILE"
sed -i '' 's/settings\.s\.baseWidth || 1200/containerW.value || 1200/g' "$FILE"
sed -i '' 's/settings\.s\.baseWidth/containerW.value || 1200/g' "$FILE"

echo "Migration complete! Backup saved to $FILE.bak"
