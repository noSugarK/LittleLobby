<p align="center">
  <picture>
    <source media="(prefers-color-scheme: dark)" srcset="public/brand/logo-dark.png">
    <img src="public/brand/logo.png" alt="ScanKick" width="420">
  </picture>
</p>

<p align="center">
  <a href="https://github.com/noSugarK/scankick/stargazers"><img src="https://img.shields.io/github/stars/noSugarK/scankick?style=flat&logo=github&color=2fa866" alt="GitHub stars"></a>
  <a href="https://github.com/noSugarK/scankick/actions/workflows/deploy.yml"><img src="https://img.shields.io/github/actions/workflow/status/noSugarK/scankick/deploy.yml?branch=main&label=deploy" alt="Deploy"></a>
  <a href="https://github.com/noSugarK/scankick/commits/main"><img src="https://img.shields.io/github/last-commit/noSugarK/scankick" alt="Last commit"></a>
  <a href="https://nosugark.github.io/scankick/"><img src="https://img.shields.io/badge/demo-%E5%9C%A8%E7%BA%BF%E4%BD%93%E9%AA%8C-2fa866" alt="Demo"></a>
</p>

<p align="center">
  <b>扫码足球</b> · 手机扫码当手柄的多人足球<br>
  <a href="https://nosugark.github.io/scankick/">在线体验</a> · 简体中文 · <a href="README.en.md">English</a>
</p>

大屏创建房间，手机扫码加入，用虚拟手柄（左摇杆 + ABXY）实时 4v4 对战。手机与大屏同时显示比赛画面。纯静态站点，可直接部署到 GitHub Pages。界面支持简体中文、繁體中文、English，首页可切换浅色 / 深色主题，首页另有玩法教程（`#/guide`）。

## 玩法

| 按键 | 作用 |
|---|---|
| 左侧摇杆 | 移动（在左半屏任意位置按下即出现） |
| A 传球 | 自动传给朝向扇区内最合适的队友，没有队友则向前推球 |
| B 射门 | 按住蓄力，松开射门（蓄满约 0.85 秒） |
| X 冲刺 | 按住加速，消耗体力 |
| Y 铲球 | 向前冲刺铲断，命中对手会让其短暂倒地，有冷却 |

### 两种开房方式

- **大屏模式**：电脑/电视打开首页 →「开房 → 大屏开房」，大屏只负责显示，所有人用手机扫码参赛。
- **无大屏模式**：首页 →「开房 → 手机开房」，这台手机既是主机也是球员，菜单里有二维码供其他人扫码。主机手机需保持页面在前台、不要锁屏。

### 公开大厅与房间密码

- 开房前可打开「展示在公开大厅」，首页「大厅」页会实时列出所有公开房间（人数、是否在比赛、是否加锁）。主机关闭或掉线后自动从大厅消失。
- 可设置 4–6 位数字密码。扫二维码会自动带上密码；从大厅或手输房间码加入时需要输入。错误尝试全局限速（10 秒最多 5 次）。

### 加入房间

首页「加入」页可直接用摄像头扫描大屏二维码（需要 HTTPS），也可以输入 5 位房间码，或在「大厅」里点公开房间。

### 结束比赛

- **投降**：比赛中点手机右上角「菜单 →投降」，本队在线真人**严格过半**同意即判负（1 人 1 票，2 人需 2 票，3 人需 2 票，4 人需 3 票）；再点一次可撤回。
- **房主结束**：大屏右上角「结束比赛」（或按 Esc），无大屏模式下在主机手机的菜单里；按当前比分判定胜负。

桌面浏览器调试：WASD/方向键移动，J 传球，K/空格 射门，L/Shift 冲刺，I 铲球。

## 架构

- **主机**（大屏，或无大屏模式下的某台手机，逻辑见 `src/game/host-game.ts`）：运行 60Hz 物理和比赛逻辑，以 30Hz 向所有手机广播二进制状态快照（8 人约 115 字节/帧）。
- **手机 = 客户端**：以 30Hz 上传输入；画面做快照插值，自己的球员做本地预测，按下摇杆立即响应。
- **连接**：通过公共 MQTT（EMQX，国内可访问）交换 WebRTC 信令，建立 P2P DataChannel 直连。
  直连失败时自动回退到 MQTT 中继，并每 15 秒尝试恢复直连。
- 不需要自己的后端服务器。

## 本地开发

```bash
npm install
npm run dev        # HTTPS，局域网内手机可扫码访问（首次需信任自签名证书）
```

大屏用 `localhost` 打开时，二维码会自动换成本机局域网 IP。

调试参数：手机地址后加 `?relay`（如 `#/join/ABCDE?relay`）可强制走中继。

## 部署到 GitHub Pages

1. 推送到 GitHub 仓库的 `main` 分支。
2. 仓库 Settings → Pages → Source 选择 **GitHub Actions**。
3. 之后每次推送会自动构建发布，访问 `https://<用户名>.github.io/<仓库名>/`。

扫码加入需要 HTTPS，建议同时在 Pages 设置里勾选「Enforce HTTPS」。

## 网络配置（`src/config.ts`）

- `brokers`：信令服务器，按顺序尝试。
- `iceServers`：默认使用小米、B 站的 STUN。**如果有玩家用 4G 经常显示「中继」，建议在国内云服务器上自建 coturn 并填入 TURN 配置**，中继延迟会从秒级降到几十毫秒。

## 已知限制

- 大屏页面必须保持在前台，切到后台浏览器会暂停计时器，比赛会停住。
- 公共 MQTT 主题是公开的，适合聚会娱乐；房间密码只能挡住大厅里的陌生人，挡不住监听 broker 的人（密码随 hello 明文发送）；正式使用建议换成带鉴权的 EMQX Serverless 或自建 broker。
- iOS Safari 不支持震动和网页全屏。
