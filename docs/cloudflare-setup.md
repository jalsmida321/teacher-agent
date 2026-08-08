# Cloudflare 接入指南（师座 · 海外 VPS）

> 师座不能部署到 Cloudflare Pages/Workers：Pi SDK 与成果文件需要完整 Node.js 运行时和持久文件系统。
> 推荐架构：应用跑在 VPS 的本地端口，Nginx 按域名反向代理，Cloudflare 提供 DNS、HTTPS、CDN 与基础防护。

## 架构

```text
教师浏览器
   │ HTTPS
   ▼
Cloudflare（可选橙云代理）
   ▼ HTTPS
VPS Nginx :443（按 server_name 分流）
   ▼ HTTP 127.0.0.1:13000
师座 Next.js + PM2
```

同一个 VPS 公网 IP 可以服务多个域名，Nginx 根据域名分别转发到不同应用端口。

## 一、DNS

在 `teacherdeck.org` 当前 DNS 平台添加：

| 类型 | 名称 | 内容 |
|------|------|------|
| A | `@` | VPS 公网 IP |
| CNAME | `www` | `teacherdeck.org` |

初次部署建议使用「仅 DNS（灰云）」，便于验证源站和申请 Let's Encrypt 证书。完成后可切换为 Cloudflare「已代理（橙云）」。

## 二、部署应用

完整命令和 Nginx 配置见 `docs/deploy-single-port.md`。

当前规划端口：

```bash
PORT=13000 bash deploy/setup.sh \
  https://github.com/jalsmida321/teacher-agent.git teacherdeck.org
```

应用只监听 `127.0.0.1:13000`，无需在防火墙开放 13000。

## 三、Nginx

Nginx 必须按域名反代：

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
        proxy_buffering off;
        proxy_cache off;
        proxy_read_timeout 300s;
    }
}
```

`proxy_buffering off` 是 AI 流式输出正常工作的必要设置。

## 四、HTTPS

先为 Nginx 配置源站证书：

```bash
apt-get install -y certbot python3-certbot-nginx
certbot --nginx -d teacherdeck.org -d www.teacherdeck.org
```

证书生效后，可开启 Cloudflare 橙云代理，并设置：

```text
Cloudflare → SSL/TLS → 概述 → 完全（严格）
```

注意：

- **Full / 完全并不表示可以回源到纯 HTTP。** Full 与 Full (strict) 都使用 HTTPS 回源；strict 额外验证源站证书。
- 不建议使用 Flexible / 灵活，它会用 HTTP 回源，容易造成重定向循环并降低安全性。
- 如果暂时不使用 Cloudflare 橙云，Let's Encrypt + Nginx 本身已经能提供正常 HTTPS。

## 五、验证

```bash
curl -I https://teacherdeck.org/
curl -I https://www.teacherdeck.org/
curl -I -H 'Host: teacherdeck.org' http://127.0.0.1/
```

## 六、部署前检查

```bash
mkdir -p ~/.pi/agent
printf '{}\n' > ~/.pi/agent/settings.json
mkdir -p /var/data/shizuo/artifacts

ss -tlnp | grep ':13000'
pm2 status
curl -I http://127.0.0.1:13000/
nginx -t
```

环境变量：

```text
ARTIFACTS_DIR=/var/data/shizuo/artifacts
PORT=13000
SUBLYX_API_KEY=   # 可选；生产用户默认使用自己的 Key
```

## 七、可选加固

- Cloudflare WAF / Bot Fight Mode。
- 对 `/api/llm`、`/api/models` 设置合理限速。
- 静态资源可缓存；`/api/*` 和 SSE 响应不缓存。
- 定期备份 `/var/data/shizuo/artifacts`。
- 13000 只监听 `127.0.0.1`，不要直接开放公网。
