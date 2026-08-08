# 师座 · 单端口部署指南（VPS 多项目 + Nginx）

> 适用：一台 VPS 上运行多个不同域名的项目，由 Nginx 根据 `server_name` 分流。
> 当前规划：`teacherdeck.org` → Nginx → `127.0.0.1:13000`。

## 架构

```text
教师浏览器
   │ https://teacherdeck.org
   ▼
DNS / Cloudflare
   │ 49.51.200.107:443
   ▼
VPS Nginx（按域名分流）
   │ proxy_pass http://127.0.0.1:13000
   ▼
师座 Next.js + PM2
```

不同域名可以同时使用同一个公网 IP，不会冲突：

```text
api.pinniq.org   → 49.51.200.107 → Nginx → 127.0.0.1:3000
img2.icedit.ai   → 49.51.200.107 → Nginx → 127.0.0.1:8080
teacherdeck.org  → 49.51.200.107 → Nginx → 127.0.0.1:13000
```

Nginx 根据 HTTP `Host` / TLS SNI 区分域名。师座不占公网 80/443，也不影响现有项目。

## 一、配置 DNS

在当前实际负责 `teacherdeck.org` DNS 的平台（Porkbun 或 Cloudflare）添加：

| 类型 | 名称 | 内容 |
|------|------|------|
| A | `@` | `49.51.200.107` |
| CNAME | `www` | `teacherdeck.org` |

`www` 也可以使用指向同一 IP 的 A 记录，但 CNAME 更便于以后修改 IP。

如果 DNS 在 Cloudflare：

- 初次申请 Let's Encrypt 证书时可先使用 **仅 DNS（灰云）**。
- 证书和 Nginx 验证成功后，可改为 **已代理（橙云）**。
- 开启橙云后，SSL/TLS 模式使用 **完全（严格）**，前提是 Nginx 已有有效证书。

检查解析：

```bash
dig +short teacherdeck.org
dig +short www.teacherdeck.org
```

应解析到 `49.51.200.107`。

## 二、部署师座到 13000 端口

先检查端口：

```bash
ss -tlnp | grep ':13000'
```

没有输出再部署：

```bash
ssh root@49.51.200.107

PORT=13000 bash <(curl -fsSL https://raw.githubusercontent.com/jalsmida321/teacher-agent/master/deploy/setup.sh) \
  https://github.com/jalsmida321/teacher-agent.git teacherdeck.org
```

脚本会让 Next.js 只监听 `127.0.0.1:13000`，不会直接暴露公网端口。

验证：

```bash
pm2 status
curl -I http://127.0.0.1:13000/
curl -I http://127.0.0.1:13000/billing-demo
```

根路径预期返回 `307`，`/billing-demo` 预期返回 `200`。

## 三、添加独立 Nginx 配置

新建 `/etc/nginx/conf.d/teacherdeck.org.conf`：

```nginx
server {
    listen 80;
    listen [::]:80;
    server_name teacherdeck.org www.teacherdeck.org;

    client_max_body_size 25m;

    location / {
        proxy_pass http://127.0.0.1:13000;
        proxy_http_version 1.1;

        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        proxy_set_header X-Forwarded-Proto $scheme;

        # Pi SDK 通过 SSE 流式返回，不能缓冲。
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
        proxy_send_timeout 300s;
    }
}
```

部分发行版使用 `/etc/nginx/sites-available/`：

```bash
ln -s /etc/nginx/sites-available/teacherdeck.org /etc/nginx/sites-enabled/teacherdeck.org
```

测试并重新加载：

```bash
nginx -t
systemctl reload nginx
curl -I -H 'Host: teacherdeck.org' http://127.0.0.1/
```

最后一条应命中师座，而不是现有项目。

## 四、配置 HTTPS

### 方式 A：Let's Encrypt（DNS 直连或 Cloudflare 灰云）

```bash
apt-get update
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d teacherdeck.org -d www.teacherdeck.org
```

Certbot 会自动添加 443 配置及 HTTP → HTTPS 跳转。

验证续期：

```bash
certbot renew --dry-run
```

### 方式 B：Cloudflare 橙云

先让 Nginx 持有有效的 Let's Encrypt 或 Cloudflare Origin Certificate，然后：

1. DNS 记录改为 **已代理（橙云）**。
2. Cloudflare → SSL/TLS → 概述 → 模式选择 **完全（严格）**。
3. 不要使用「灵活」模式，否则容易产生重定向循环或明文回源。

## 五、上线验证

```bash
curl -I https://teacherdeck.org/
curl -I https://www.teacherdeck.org/
curl -s https://teacherdeck.org/api/models \
  -X POST \
  -H 'Content-Type: application/json' \
  -d '{"apiKey":"无效测试Key"}'
```

然后在浏览器进行完整验证：

1. 根域名能进入师座工作台。
2. Key 不出现在地址栏。
3. 模型列表能够加载。
4. AI 输出保持流式更新。
5. Word、Excel、PDF、Markdown 导出正常。
6. 不同 Key 的成果互相不可见。

## 六、更新与排错

更新：

```bash
cd /opt/shizuo
bash deploy/update.sh
```

状态与日志：

```bash
pm2 status
pm2 logs shizuo --lines 100
nginx -t
journalctl -u nginx -n 100 --no-pager
```

常见问题：

| 现象 | 检查 |
|------|------|
| 访问到另一个项目 | 是否有重复/default `server_name`；运行 `nginx -T | grep -n teacherdeck.org` |
| 502 Bad Gateway | `pm2 status` 和 `curl http://127.0.0.1:13000/` |
| AI 输出最后一次性出现 | 确认 `proxy_buffering off`、没有代理缓存 |
| 413 Request Entity Too Large | 确认 `client_max_body_size 25m` |
| Cloudflare 526 | 源站证书无效；确认 Full (strict) 与 Nginx 证书 |
| 证书申请失败 | DNS 是否已解析到 VPS，80 端口是否可从公网访问 |
