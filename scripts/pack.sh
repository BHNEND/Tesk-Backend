#!/bin/bash
set -e

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

OUTPUT_NAME="tesk-deploy.tar.gz"
TMP_DIR=$(mktemp -d)

echo "==> 开始构建部署包..."

# 1. 同步 API 文档到前端
echo "==> [1/4] 同步 API 文档..."
cp docs/api.md admin/public/api.md

# 2. 构建前端
echo "==> [2/4] 构建前端..."
cd admin && npm install && npm run build && cd "$ROOT_DIR"

# 3. 构建后端
echo "==> [3/4] 构建后端..."
npm run build

# 4. 打包
echo "==> [4/4] 打包部署文件..."
mkdir -p "$TMP_DIR/admin/dist"
cp -r dist "$TMP_DIR/"
cp -r admin/dist/* "$TMP_DIR/admin/dist/"
mkdir -p "$TMP_DIR/prisma"
cp prisma/schema.prisma "$TMP_DIR/prisma/"
cp package.json "$TMP_DIR/"
cp package-lock.json "$TMP_DIR/"
cp .env.example "$TMP_DIR/"
cp ecosystem.config.cjs "$TMP_DIR/"

cd "$TMP_DIR"
tar -czf "$ROOT_DIR/$OUTPUT_NAME" \
  dist/ \
  admin/dist/ \
  prisma/ \
  package.json \
  package-lock.json \
  .env.example \
  ecosystem.config.cjs

cd "$ROOT_DIR"
rm -rf "$TMP_DIR"

SIZE=$(du -h "$OUTPUT_NAME" | cut -f1)
echo ""
echo "==> 打包完成: $OUTPUT_NAME ($SIZE)"
echo ""
echo "部署命令："
echo "  tar -xzf $OUTPUT_NAME -C /www/wwwroot/tesk-backend"
echo "  cd /www/wwwroot/tesk-backend"
echo "  cp .env.example .env && vi .env"
echo "  npm install --production"
echo "  npx prisma db push && npx prisma generate"
echo "  mkdir -p storage"
echo "  pm2 start ecosystem.config.cjs"
echo ""
