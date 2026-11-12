# 部署到云服务器（IP 直连版）

目标：先让项目在国内**用 IP 直接打开**，不依赖域名、不依赖 Vercel。等演示稳定后再买域名上 HTTPS。

## 已部署状态

| 项 | 值 |
| --- | --- |
| 地址 | <http://39.106.48.233> |
| 机器 | 阿里云 · Ubuntu 24.04.2 LTS · x86_64 · 2 核 / 1.6 GB / 40 GB ESSD |
| 运行方式 | systemd 单元 `dayflow.service`，非 root 用户 `dayflow` 用 `CAP_NET_BIND_SERVICE` 监听 80 |
| 资源占用 | 常驻内存 **19 MB**；`/opt/dayflow` 88 MB + pnpm store 104 MB；`dist` 360 KB |
| 实测 | 首页 200、`/assets/*.js` 200、SPA 深链接回落 200、无 Key 调 `/api/ai/parse` 返回 400 与中文提示 |
| 开机自启 | `enabled`；由 1 GB swap 兜底（`/swapfile`，已写入 fstab） |

## 0. 先明确三件事

| 项 | IP + HTTP 下的现状 | 影响 |
| --- | --- | --- |
| 备案 | **用 IP 访问不需要备案**（备案是绑域名用的） | 今天就能上线 |
| PWA / 离线 / 通知 | Service Worker 只在 HTTPS 或 localhost 下生效 | IP 访问时「添加到桌面、离线缓存、浏览器通知」全部不可用 |
| 安全 | DeepSeek Key 由浏览器发到你的服务器，HTTP 下是明文 | 别在公共 Wi-Fi 里填真 Key；自己演示时无所谓 |

所以这一版是**「能打开、能演示」**，不是最终形态。买域名后加 HTTPS（见第 5 节）才能恢复 PWA。

## 1. 选机器

| 方案 | 价格（大致） | 备案 | 适合 |
| --- | --- | --- | --- |
| 腾讯云 / 阿里云 轻量应用服务器 · **香港** 1核2G 或 2核2G | 24–40 元/月 | 不需要 | **推荐**：买域名后当天就能上 HTTPS |
| 同上的大陆节点（学生机更便宜） | 9.9–24 元/月 | 域名要备案，IP 直连不用 | 追求低延迟、愿意等备案 |
| 海外 VPS（Vultr / Hetzner 等） | $4–6/月 | 不需要 | 大陆访问延迟高一些 |

配置要求很低：**1 核 1G 够跑**（本次实测：运行内存 19 MB，`vite build` 在 1.6 GB 机器上通过，另加了 1 GB swap 兜底）。镜像选 **Ubuntu 24.04 LTS**（22.04 也可以）。带宽 1–3M 足够——首屏 JS 285 KB、gzip 后 88 KB。

> 大陆节点注意：部分厂商对 80 端口需要域名备案后才放行，**用非 80 端口（如 8080）可以绕开**，访问时带端口号即可。

## 2. 创建实例时贴公钥

创建页面一般有「登录方式 → SSH 密钥」，把下面这行整段粘进去：

```
ssh-ed25519 AAAAC3NzaC1lZDI1NTE5AAAAIAi/XIUmKmVr24qQHEZ9aGH+Fae7Js4HDQ/Wg3c1uGsz dayflow-deploy
```

（如果创建时没找到密钥选项，就先用密码登录，登录后执行 `mkdir -p ~/.ssh && echo '<上面那行>' >> ~/.ssh/authorized_keys && chmod 600 ~/.ssh/authorized_keys`。）

> **本次实际踩到的两个坑**
> 1. 阿里云镜像默认登录用户是 `admin` 而不是 `root`，直接 `mkdir /root/.ssh` 会 `Permission denied`；要用 `sudo mkdir -p /root/.ssh && ... | sudo tee -a /root/.ssh/authorized_keys`。
> 2. 实例可能关掉了密码登录（`Authentications that can continue: publickey`），这时唯一入口是控制台的 **Workbench / VNC 远程连接**，先用它把公钥追加进去。

然后把 **公网 IP、SSH 端口（默认 22）、用户名（root 或 ubuntu）** 告诉我，剩下的我来做。

## 3. 我这边会执行什么

```bash
# 本地：打包（不含 node_modules）
tar -czf dayflow.tgz --exclude=node_modules --exclude=dist --exclude=.git --exclude=.shots --exclude=.deploy .
scp -P <端口> dayflow.tgz <用户>@<IP>:/tmp/

# 服务器
mkdir -p /opt/dayflow && tar -xzf /tmp/dayflow.tgz -C /opt/dayflow
bash /opt/dayflow/deploy/bootstrap.sh
```

`deploy/bootstrap.sh` 做五件事，全部幂等，可重复执行：

1. 建系统用户 `dayflow`（不用 root 跑应用）
2. 从 npmmirror 装 Node 22（失败自动回退 nodejs.org）
3. `pnpm install --frozen-lockfile` + `pnpm build`
4. 安装 `deploy/dayflow.service`，用 `CAP_NET_BIND_SERVICE` 让非 root 用户监听 80 端口，开机自启
5. 放行 ufw 端口并自检 `/api/health`

## 4. 验收清单

- [ ] `curl http://<IP>/api/health` → `{"ok":true,"service":"dayflow"}`
- [ ] 浏览器打开 `http://<IP>/`，样式与本地一致
- [ ] 手机上（关掉代理、用流量/家里 Wi-Fi）能打开
- [ ] 设置里填自己的 DeepSeek Key → 输入一句话 → 出草案 → 确认后进日历
- [ ] 刷新页面数据还在（localStorage 按域隔离：**IP 换了数据就没了，且当前没有导入功能**，换域名前先导出 JSON）

## 5. 以后再买域名

香港/海外机器：装 Caddy，`caddy reverse-engineer` 都不用，两行搞定，自动申请证书：

```
your-domain.com {
    reverse_proxy 127.0.0.1:80
}
```

把 `deploy/dayflow.service` 里的 `PORT=80` 改成 `PORT=8080`（让出 80 给 Caddy），`systemctl restart dayflow`。

大陆机器：域名要**先备案**（7–20 天），再解析到服务器；HTTPS 同样用 Caddy + Let's Encrypt。

上 HTTPS 之后 PWA 才完整：Service Worker 可注册、可「添加到主屏幕」、通知可用。

## 6. 日常运维

```bash
journalctl -u dayflow -n 100 --no-pager   # 看日志
systemctl restart dayflow                 # 重启
systemctl status dayflow                  # 状态
```

更新代码：本地重新打包 scp 上去 → `cd /opt/dayflow && pnpm install --frozen-lockfile && pnpm build && systemctl restart dayflow`（或重跑 `bootstrap.sh`）。

## 7. 关于「共享 Key」

不要在生产环境里配 `DEEPSEEK_API_KEY`。一旦配上，`keyFromHeaders()` 会回退到环境变量，**任何拿到你 IP 的人都能免 Key 调用你的额度**（`server/ai.mjs:225`）。

想给面试官「打开就能试」的体验，正确做法是：服务端加一个按 IP 的每日限额（例如 20 次/天）再配一个低额度 Key。这是 P1 的改动，等 IP 访问稳定了再加。
