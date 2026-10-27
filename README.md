<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/brand/logo-white.png">
  <img src="public/brand/logo.png" alt="小聚场 · Little Lobby" width="420">
</picture>

**朋友碰头，随时一起开玩**

大屏开房，手机扫码就是手柄。同一个 Wi-Fi 或热点，不用外网也能一起玩。

[![版本](https://img.shields.io/github/v/release/noSugarK/LittleLobby?include_prereleases&label=%E7%89%88%E6%9C%AC&color=0f5c5a)](https://github.com/noSugarK/LittleLobby/releases)
[![下载量](https://img.shields.io/github/downloads/noSugarK/LittleLobby/total?label=%E4%B8%8B%E8%BD%BD&color=d9502f)](https://github.com/noSugarK/LittleLobby/releases)
[![Stars](https://img.shields.io/github/stars/noSugarK/LittleLobby?style=flat&color=ff7a59)](https://github.com/noSugarK/LittleLobby/stargazers)
[![网页部署](https://img.shields.io/github/actions/workflow/status/noSugarK/LittleLobby/deploy.yml?label=%E7%BD%91%E9%A1%B5)](https://github.com/noSugarK/LittleLobby/actions/workflows/deploy.yml)
[![协议](https://img.shields.io/github/license/noSugarK/LittleLobby?label=%E5%8D%8F%E8%AE%AE)](LICENSE)
<br>
![平台](https://img.shields.io/badge/%E5%B9%B3%E5%8F%B0-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android%20%7C%20Web-10302f)

[**在线试玩**](https://nosugark.github.io/LittleLobby/) · [**下载安装包**](#下载) · [玩法](#玩法) · [English](README.en.md)

</div>

## 下载

网页版打开就能玩：<https://nosugark.github.io/LittleLobby/>。想在没有外网的地方聚会，装一个桌面或安卓版当主机就行，朋友的手机不用装任何东西。

| 平台 | 安装包 | 说明 |
| --- | --- | --- |
| Windows | `.exe` / `.msi` | 64 位，Windows 10 及以上 |
| macOS | `.dmg` | 通用版，Intel 与 Apple 芯片都能用 |
| Linux | `.deb` / `.rpm` | x86-64 |
| Android | `.apk` | ARM64，大多数近几年的手机 |

👉 [前往最新版本下载](https://github.com/noSugarK/LittleLobby/releases/latest)

> 目前是测试版（beta）。macOS 首次打开如果提示无法验证开发者，在「系统设置 → 隐私与安全性」里选择「仍要打开」。

## 玩法

### 怎么开一局

1. **开房**：在电脑、电视浏览器或平板上打开小聚场，选一个游戏，点「大屏开房」。也可以「手机开房」，自己一边当房主一边玩。
2. **加入**：朋友用手机扫大屏上的二维码，或在首页输入 5 位房间码。
3. **开始**：大家选好队伍或角色，房主点开始。中途可以随时换游戏，房间码和朋友都保留。

**没有外网时**：用桌面或安卓应用开房，所有设备连同一个 Wi-Fi 或手机热点。应用自己就是服务器，朋友扫码用手机浏览器直接进，不经过互联网。

### 游戏

<table>
<tr>
<td width="50%" valign="top">

<img src="public/home/football.webp" alt="开踢">

**⚽ 开踢**（1–8 人 · 组队对战）

传球、射门，和朋友来一场。最多 4v4，人不够时可以加电脑队友。

- 三种赛制：经典计时 · 抢三球 · 金球制
- 可开派对道具，场地和规则由房主设置
- 赛后有战绩统计

</td>
<td width="50%" valign="top">

<img src="public/home/adventure.webp" alt="软乎乎冒险">

**✦ 软乎乎冒险**（1–8 人 · 合作闯关）

挑一位小伙伴，一起跳跳闯关。一个人也能先逛逛。

- 四个角色：一二 · 布布 · 小白 · 小金毛
- 经典闯关三站：莓莓散步道 → 云朵奶糖桥 → 晚安星光园
- 多人合作玩法：**串一串**（全员一根绳子）· **吃吐吐**（吃掉队友再吐过缺口）· **叠罗汉**（踩着队友爬高墙）

</td>
</tr>
</table>

### 手机操作

- 左手摇杆或十字键移动，右手按键跳跃 / 射门 / 吃吐。
- 菜单「按键」页里可以改成十字键、换成圆弧按键布局、调整按键大小，设置会记在手机上。
- 横屏体验最好；支持全屏。

<details>
<summary><b>开发</b></summary>

### 环境

需要 Node.js 24。桌面和安卓应用还需要 Rust 与对应平台的 [Tauri 2](https://v2.tauri.app/start/prerequisites/) 构建环境。

```bash
npm ci
npm run dev        # 网页开发服务（默认 HTTPS，手机可直接访问局域网地址）
npm test           # 游戏、输入、网络与发版脚本测试
npm run build      # 类型检查并构建到 dist/
npm run app:dev    # 原生应用调试
npm run app:build  # 构建当前平台的安装包
```

### 目录

| 目录 | 用途 |
| --- | --- |
| `src/` | 页面、游戏逻辑和联机代码（`game/` 游戏，`net/` 联机，`ui/` 界面组件，`pages/` 页面） |
| `src-tauri/` | 原生应用、局域网服务与平台配置 |
| `public/` | 品牌图标、首页插图、角色精灵图集 |
| `tests/` | 回归测试（`node --test`） |
| `.github/workflows/` | 网页部署与安装包构建 |
| `.github/scripts/` | 发版入口，以及 Android 工程配置与签名脚本 |

### 联机方式

- **网页版**：通过公共 MQTT 服务做信令，玩家之间用 WebRTC 直连；需要互联网。
- **原生应用**：本机启动 HTTP + WebSocket 服务，直接提供网页和素材；局域网内用 UDP 广播发现房间，不需要外网。

### 网页部署

推送 `main` 后，`.github/workflows/deploy.yml` 运行测试、构建并把 `dist/` 发布到 GitHub Pages（Settings → Pages → Source 选 GitHub Actions）。资源使用相对路径，支持仓库子路径部署。

### 发版

版本号只写在 `package.json`，其余文件由脚本同步：

```bash
npm run release -- 0.2.0-beta.2
```

脚本检查分支和工作区，同步 `package-lock.json`、`Cargo.toml`、`Cargo.lock` 和 MSI 版本（`tauri.conf.json` 直接读取 `package.json`），运行测试和构建，最后列出提交、打标签、推送的命令。推送 `v*` 标签后，`.github/workflows/release-app.yml` 构建四个平台的安装包并发布 Release；手动运行只生成构建产物。

Android 正式签名需要四个 Secrets：`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。签名步骤会先核对别名是否在密钥库里，不在时列出实际的别名。PKCS12 密钥库的密钥密码与密钥库密码相同。

</details>

## 开源协议

代码以 [MIT](LICENSE) 协议开源。

游戏中的角色形象（一二、布布、小白、小金毛）版权归各自原作者所有，不在 MIT 授权范围内，仅用于非商业的朋友聚会娱乐。
