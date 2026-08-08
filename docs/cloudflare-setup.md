# Cloudflare 接入指南（师座 · 海外 VPS）

> 师座**不能**部署到 Cloudflare Pages/Workers（pi SDK 需要真实文件系统）。
> 正确做法：**Cloudflare 只做域名/DNS/HTTPS/CDN 门面**，应用本体跑在海外 VPS 的 Node 上。

## 架构

```
教师浏览器
   │ HTTPS（Cloudflare 免费证书）
   ▼
Cloudflare（DNS + SSL + CDN + 防攻击）
   ▼ 代理到源站
海外 VPS（Node.js + PM2, 端口 3000）
   ├─ /api/llm    （pi SDK + 中转站）
   ├─ /api/export （Word/Excel/PDF 导出）
   └─ /api/artifacts（成果存取）
```

## 步骤

### 1. 买域名并托管到 Cloudflare

- 推荐 `teacherdeck.org`（已确认可注册）
- 注册后把域名的 NS 记录改成 Cloudflare 分配的两个 NS（免费）

### 2. 部署应用到 VPS（先于 Cloudflare，保证源站可访问）

```bash
ssh root@你的VPS
bash deploy/setup.sh https://github.com/<你>/shizuo.git teacherdeck.org
```

部署完成后先在 VPS 本机验证：`curl http://127.0.0.1:3000/billing-demo`

### 3. Cloudflare DNS 配置

| 类型 | 名称 | 内容 | 代理 |
|------|------|------|------|
| A | `@` | VPS 公网 IP | 橙色云朵（开启代理） |
| A | `www` | VPS 公网 IP | 橙色云朵 |

### 4. SSL 设置

Cloudflare 控制台 → SSL/TLS → **Full (strict)**：
- 自动签发给源站的证书
- 浏览器 ↔ Cloudflare、Cloudflare ↔ VPS 全 HTTPS

（若 VPS 没配 HTTPS，选 **Full** 即可；Cloudflare 会自动终止 TLS 再回源）

### 5. 验证

```bash
# 在本地电脑
curl -I https://teacherdeck.org/billing-demo   # 应返回 200
```

## 可选加固

- **WAF**：Cloudflare 免费防火墙 → 开启「Bot Fight Mode」
- **限速**：对 `/api/llm` 设置 Rate Limiting（防滥用，BYOK 场景 key 在客户端，主要防爬）
- **缓存**：静态资源（`/_next/static/*`）设 Cache Everything，动态 API 不缓存

## 常见问题

| 问题 | 解决 |
|------|------|
| 源站 502（Cloudflare 连不上 VPS） | 检查 VPS 防火墙：`ufw allow 3000`；确认 PM2 在跑 `pm2 status` |
| 证书不生效 | SSL/TLS 模式改为 Full 或 Full(strict)，等 1-5 分钟 |
| 教师访问慢 | VPS 选新加坡/日本节点；Cloudflare 自动选就近边缘 |
| 成果数据丢失 | 确认 `ARTIFACTS_DIR=/var/data/shizuo/artifacts`（VPS 上），定期备份该目录 |
