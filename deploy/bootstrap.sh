#!/usr/bin/env bash
# Dayflow 一键部署脚本（Ubuntu 22.04 / 24.04，root 执行）
# 用法：把仓库放到 /opt/dayflow 后执行 bash deploy/bootstrap.sh
set -euo pipefail

APP_DIR=/opt/dayflow
NODE_VERSION=${NODE_VERSION:-22.20.0}
REGISTRY=${REGISTRY:-https://registry.npmmirror.com}
APP_USER=dayflow

log() { printf '\n\033[1;32m==> %s\033[0m\n' "$*"; }
warn() { printf '\033[1;33m[!] %s\033[0m\n' "$*"; }

[ "$(id -u)" = "0" ] || { echo "请用 root 执行"; exit 1; }
[ -f "$APP_DIR/package.json" ] || { echo "找不到 $APP_DIR/package.json"; exit 1; }

log "1/5 创建运行用户 $APP_USER"
if ! id -u "$APP_USER" >/dev/null 2>&1; then
  useradd --system --home "$APP_DIR" --shell /usr/sbin/nologin "$APP_USER"
fi

log "2/5 安装 Node.js v$NODE_VERSION"
if [ -x /usr/local/bin/node ]; then
  echo "已存在：$(/usr/local/bin/node -v)"
else
  tarball="node-v$NODE_VERSION-linux-x64.tar.xz"
  tmp=$(mktemp -d)
  ok=0
  for base in "https://registry.npmmirror.com/-/binary/node" "https://nodejs.org/dist"; do
    echo "尝试 $base"
    if curl -fsSL --retry 2 --connect-timeout 10 -o "$tmp/$tarball" "$base/v$NODE_VERSION/$tarball"; then ok=1; break; fi
  done
  [ "$ok" = "1" ] || { echo "Node 下载失败，请手动安装后重试"; exit 1; }
  tar -xJf "$tmp/$tarball" -C /usr/local --strip-components=1 \
    --exclude='*/CHANGELOG.md' --exclude='*/LICENSE' --exclude='*/README.md'
  rm -rf "$tmp"
  /usr/local/bin/node -v
fi

export PATH=/usr/local/bin:$PATH

log "3/5 安装依赖并构建（registry: $REGISTRY）"
if ! command -v pnpm >/dev/null 2>&1; then
  npm install -g pnpm@11 --registry="$REGISTRY" --no-audit --no-fund
fi
cd "$APP_DIR"
pnpm install --frozen-lockfile --registry="$REGISTRY"
pnpm build

log "4/5 安装 systemd 服务"
chown -R "$APP_USER:$APP_USER" "$APP_DIR"
chmod 600 "$APP_DIR/.env" 2>/dev/null || true
install -m 644 "$APP_DIR/deploy/dayflow.service" /etc/systemd/system/dayflow.service
systemctl daemon-reload
systemctl enable --now dayflow
sleep 2
systemctl --no-pager --lines=5 status dayflow || true

log "5/5 放行端口"
if command -v ufw >/dev/null 2>&1 && ufw status | grep -q "Status: active"; then
  ufw allow 80/tcp || true
else
  warn "系统防火墙未启用 ufw；请确认云厂商安全组已放行 80 端口"
fi

log "自检"
curl -fsS --max-time 5 http://127.0.0.1/api/health && echo
warn "如果 curl 失败，看日志：journalctl -u dayflow -n 50 --no-pager"
