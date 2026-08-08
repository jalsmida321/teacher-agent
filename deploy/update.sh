#!/usr/bin/env bash
# ============================================================
# 师座 更新脚本：拉最新代码 → 构建 → 重启
# 用法: bash deploy/update.sh
# ============================================================
set -euo pipefail

APP_DIR="${APP_DIR:-/opt/shizuo}"
DATA_DIR="${DATA_DIR:-/var/data/shizuo}"
PORT="${PORT:-3000}"

cd "$APP_DIR"
echo "[1/3] 拉取最新代码..."
git pull --rebase

echo "[2/3] 安装依赖 + 构建..."
export NODE_ENV=development
npm ci --ignore-scripts || npm install --ignore-scripts
npm run build

echo "[3/3] 重启..."
export ARTIFACTS_DIR="$DATA_DIR/artifacts"
if [ -n "${SUBLYX_API_KEY:-}" ]; then
  export SUBLYX_API_KEY="$SUBLYX_API_KEY"
fi
pm2 restart shizuo --update-env

echo "✅ 更新完成"
