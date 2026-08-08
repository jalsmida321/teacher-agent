# 师座 · 单端口部署指南（VPS 已有多个项目场景）

> 适用：VPS 上已跑很多项目，师座只能占一个独立端口（如 8600），
> 且不希望改动 VPS 上已有的 Nginx / 防火墙 / 其它服务配置。

---

## 架构

```
教师浏览器
   │  https://teacherdeck.org
   ▼
Cloudflare（域名 + HTTPS + Origin Rules 回源到指定端口）
   ▼  回源 http://VPS_IP:8600
师座（Next.js，PM2 守护，只监听 8600）
```

师座**只监听自己的端口**（8600），不占用 80/443，不影响其它项目。

---

## 一、部署师座（选一个端口）

```bash
ssh root@你的VPS

# 选一个未占用的端口（建议 8600-8999 高位段，避开常见服务）
PORT=8600 bash <(curl -fsSL https://raw.githubusercontent.com/jalsmida321/teacher-agent/master/deploy/setup.sh) \
  https://github.com/jalsmida321/teacher-agent.git teacherdeck.org
```

> `deploy/setup.sh` 已支持 `PORT` 环境变量（默认 3000，改成 8600 即可）。

验证本机：
```bash
curl -s http://127.0.0.1:8600/          # 307 跳转
curl -s -o /dev/null -w "%{http_code}\n" http://127.0.0.1:8600/billing-demo   # 200
```

确认端口只监听本机（PM2 起的 next 默认绑 127.0.0.1）：
```bash
ss -tlnp | grep 8600    # 应显示 127.0.0.1:8600（不对外暴露，由 Cloudflare 回源）
```

---

## 二、接入域名（推荐：Cloudflare Origin Rules，零 VPS 改动）

### 前置
1. `teacherdeck.org` 已在 Cloudflare 托管（NS 已切到 Cloudflare）
2. DNS 加记录：`A 记录 teacherdeck.org → VPS_IP`（**灰色云朵**，代理关闭，因为我们要用 Origin Rules 自定义回源端口）

### 配置 Origin Rules
1. Cloudflare 控制台 → 你的站点 → **Rules → Origin Rules**（免费版可用）
2. 「Create rule」：
   - **Name**：`shizuo-origin`
   - **When incoming requests match**：`Hostname equals teacherdeck.org`
   - **Then**：`Resolve override to 86.xx.xx.xx:8600`（你的 VPS IP + 师座端口）
   - Protocol：选 `http`（源站用 http，CF 负责 HTTPS）
3. Save

### SSL 设置
- Cloudflare → SSL/TLS → 模式选 **Full**（源站是 http，不要选 Full strict）
- 浏览器 ↔ CF：HTTPS（免费证书）；CF ↔ 源站：http 到 8600

### 验证
```bash
curl -I https://teacherdeck.org                # 200 / 307
curl -s https://teacherdeck.org/billing-demo   # 页面 200
```

---

## 三、备选方案

### 方案 B：Cloudflare Tunnel（不开放端口、隐藏源站 IP）

1. VPS 装 cloudflared：
   ```bash
   curl -L --output cloudflared.deb https://github.com/cloudflare/cloudflared/releases/latest/download/cloudflared-linux-amd64.deb
   dpkg -i cloudflared.deb
   ```
2. 登录并建隧道：
   ```bash
   cloudflared tunnel login          # 浏览器授权你的 Cloudflare 账号
   cloudflared tunnel create shizuo
   cloudflared tunnel route dns shizuo teacherdeck.org
   ```
3. 建配置文件 `~/.cloudflared/config.yml`：
   ```yaml
   tunnel: <隧道ID>
   credentials-file: /root/.cloudflared/<隧道ID>.json
   ingress:
     - hostname: teacherdeck.org
       service: http://127.0.0.1:8600
     - service: http_status:404
   ```
4. 启动：
   ```bash
   cloudflared service install        # 开机自启
   ```
5. DNS 里把 teacherdeck.org 的 A 记录**删除**（隧道自动接管），或留 CNAME 指向隧道

### 方案 C：Nginx 反代（如果 VPS 已有 Nginx 且愿意加配置）

```nginx
# /etc/nginx/conf.d/shizuo.conf
server {
    listen 80;
    server_name teacherdeck.org;
    location / {
        proxy_pass http://127.0.0.1:8600;
        proxy_http_version 1.1;
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_buffering off;          # SSE 流式需要
        proxy_read_timeout 300s;      # AI 生成可能较久
    }
}
```
```bash
nginx -t && systemctl reload nginx
```
DNS 用橙色云朵（CF 代理）即可，SSL 设 Full。

---

## 四、为什么这样可行

| 顾虑 | 说明 |
|------|------|
| 师座要 80/443 吗？ | ❌ 不需要，只监听自己的端口（8600） |
| 会影响其它项目吗？ | ❌ 不影响：端口独立、CF 按 Hostname 路由只转发 teacherdeck.org |
| SSE 流式（AI 生成） | 需关 buffering：方案 C 已配置；方案 A/B 天然支持 |
| 成果数据 | `ARTIFACTS_DIR=/var/data/shizuo/artifacts`（独立目录，与其它项目无关） |
| PM2 重启 | `pm2 save` 已做，开机自启，不干扰其它项目 |

---

## 五、常见问题

| 问题 | 解决 |
|------|------|
| 访问 https://teacherdeck.org 显示其它项目 | DNS 用灰云 + Origin Rules 时，检查规则是否生效（CF 规则 30 秒-1 分钟生效） |
| Origin Rules 免费版够吗 | 够：免费版每个 zone 10 条规则 |
| 端口被占 | `ss -tlnp | grep 8600` 检查，换一个端口重跑 setup.sh（改 PORT 即可） |
| 更新师座 | `bash deploy/update.sh`（端口从环境变量读，无需改） |
