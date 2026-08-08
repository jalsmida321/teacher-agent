#!/usr/bin/env bash
# ============================================================
# 师座 一键部署脚本（服务器端）
# 适用于 Debian/Ubuntu 海外 VPS（免备案）
#
# 用法：
#   bash deploy/setup.sh <git仓库URL> [域名]
# 示例：
#   bash deploy/setup.sh https://github.com/you/shizuo.git teacherdeck.org
#
# 步骤：装 Node → 拉代码 → 装依赖 → 建成果目录 → 构建 → PM2 启动
# ============================================================
set -euo pipefail

REPO_URL="${1:?用法: bash deploy/setup.sh <git仓库URL> [域名]}"
DOMAIN="${2:-}"
APP_DIR="${APP_DIR:-/opt/shizuo}"
DATA_DIR="${DATA_DIR:-/var/data/shizuo}"
PORT="${PORT:-3000}"

echo "=========================================="
echo "师座部署开始"
echo "  代码目录: $APP_DIR"
echo "  数据目录: $DATA_DIR (成果)"
echo "  端口:     $PORT"
echo "=========================================="

# 1. Node.js 24（Nodesource）
if ! command -v node >/dev/null 2>&1; then
  echo "[1/6] 安装 Node.js 24..."
  curl -fsSL https://deb.nodesource.com/setup_24.x | bash -
  apt-get install -y nodejs
fi
echo "Node: $(node -v) / npm: $(npm -v)"

# 2. PM2
if ! command -v pm2 >/dev/null 2>&1; then
  echo "[2/6] 安装 PM2..."
  npm i -g pm2
fi

# 3. 拉代码
echo "[3/6] 拉取代码..."
if [ ! -d "$APP_DIR/.git" ]; then
  mkdir -p "$APP_DIR"
  git clone "$REPO_URL" "$APP_DIR"
fi
cd "$APP_DIR"
git pull --rebase || true

# 4. 依赖
echo "[4/6] 安装依赖（含 devDeps，NODE_ENV 需为 development）..."
export NODE_ENV=development
npm ci --ignore-scripts || npm install --ignore-scripts
npm install -D typescript@5.9.3 --ignore-scripts || true

# 5. 数据目录（成果）
echo "[5/6] 建数据目录..."
mkdir -p "$DATA_DIR/artifacts"
chmod 755 "$DATA_DIR"

# 6. 构建 + 启动
echo "[6/6] 构建并启动..."
npm run build
if [ -n "${SUBLYX_API_KEY:-}" ]; then
  export SUBLYX_API_KEY="$SUBLYX_API_KEY"
fi
export ARTIFACTS_DIR="$DATA_DIR/artifacts"

pm2 delete shizuo 2>/dev/null || true
pm2 start npm --name shizuo -- start -- -p "$PORT"
pm2 save
pm2 startup systemd -u root --hp /root || true

echo ""
echo "=========================================="
echo "✅ 部署完成！"
echo "  本地访问: http://127.0.0.1:$PORT"
if [ -n "$DOMAIN" ]; then
  echo "  公网访问: https://$DOMAIN  (需在 Cloudflare 配置 DNS)"
fi
echo ""
echo "  后续更新: bash deploy/update.sh"
echo "  查看日志: pm2 logs shizuo"
echo "=========================================="
