# GitHub Actions CI/CD 部署

## 流程概览

```
git push origin main → GitHub Actions 自动构建 → 上传服务器 → 重启 PM2 → 健康检查
```

全程无需手动操作，约 2-3 分钟完成。

---

## 首次配置

### 1. 生成 SSH 密钥

```bash
ssh-keygen -t ed25519 -f ~/.ssh/tesk_deploy -N ""
```

### 2. 公钥添加到服务器

```bash
ssh-copy-id -i ~/.ssh/tesk_deploy.pub root@你的服务器IP
```

如果服务器禁用了密钥登录，需先开启：

```bash
# 登录服务器后执行
sed -i 's/PubkeyAuthentication no/PubkeyAuthentication yes/' /etc/ssh/sshd_config
systemctl restart sshd
```

### 3. 添加 GitHub Secrets

仓库 → **Settings** → **Secrets and variables** → **Actions** → **New repository secret**

| Name | Value |
|------|-------|
| `SERVER_HOST` | 服务器 IP（如 `64.90.17.99`） |
| `SERVER_USER` | `root` |
| `SERVER_SSH_KEY` | 私钥全文（`~/.ssh/tesk_deploy` 的内容，从 `-----BEGIN` 到 `-----END`） |

### 4. 验证

去 **Actions** 页面手动点 **Run workflow** 测试一次。

---

## 日常使用

正常开发、提交、推送即可，无需额外操作：

```bash
git add .
git commit -m "feat: 新增 xxx handler"
git push origin main
```

推送后自动触发部署。可在 **https://github.com/BHNEND/Tesk-Backend/actions** 查看实时日志。

---

## 手动部署（备用）

如果 GitHub Actions 不可用，仍可手动部署：

```bash
# 本地打包
npm run pack

# 上传并部署
scp tesk-deploy.tar.gz root@服务器IP:/tmp/
ssh root@服务器IP
cd /www/wwwroot/tesk-backend
tar -xzf /tmp/tesk-deploy.tar.gz
npm install --production
pm2 restart tesk-api tesk-worker tesk-timeout || pm2 start ecosystem.config.cjs
```

---

## 注意事项

- **数据库变更**：如果修改了 `prisma/schema.prisma`，部署后需手动执行 `npx prisma db push`
- **环境变量**：GitHub Actions 不会覆盖服务器上的 `.env` 文件
- **构建失败**：Actions 页面会标红，服务不会受影响（旧版本继续运行）
