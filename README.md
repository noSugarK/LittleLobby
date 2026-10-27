# 小聚场 · Little Lobby

朋友线下聚会的多游戏平台。大屏开房，手机扫码作为手柄；支持同一 Wi-Fi 或热点内离线联机。

[网页版](https://nosugark.github.io/LittleLobby/) · [下载安装包](https://github.com/noSugarK/LittleLobby/releases) · [部署状态](https://github.com/noSugarK/LittleLobby/actions/workflows/deploy.yml) · [English](README.en.md)

## 游戏与房间

- **开踢**：最多 4v4，支持经典计时、抢三球、金球制与派对道具。
- **软乎乎冒险**：1–8 人合作闯关，选择一二或布布，收集星星、经过检查点并到终点集合。角色使用完整 PNG 帧动画。
- 首页选择游戏后创建房间；房主可以切换游戏、地图和规则，房间号、二维码与成员保留。
- 玩家可以选择角色、球队、准备或旁观。地图场景和道具由房主选择，独立于玩家角色。

## 离线聚会游玩

1. 电脑运行原生应用，所有设备连接同一 Wi-Fi 或热点。
2. 选择局域网模式和游戏，以大屏或自己参与的方式创建房间。
3. 选择手机可以访问的网卡地址；朋友扫码或通过应用内局域网大厅加入。
4. 玩家准备后，由房主开始游戏。主机需要保持运行。

原生主机直接提供网页、素材与 WebSocket 服务，玩家手机无需安装应用或访问外网。普通网页版联机使用公共信令服务，需要互联网；单人冒险可在本地运行。

## 本地开发

需要 Node.js 24。原生应用还需要 Rust 与对应平台的 Tauri 构建环境。

```sh
npm ci
npm run dev
npm test
npm run build
```

开发服务默认启用 HTTPS。原生应用调试使用 `npm run app:dev`，构建使用 `npm run app:build`。内部 Cargo 包名与应用标识保留原值，以保持构建和安装兼容。

## 部署与安装包

网页由 **GitHub Actions** 部署：

- 推送 `main` 或手动运行 `.github/workflows/deploy.yml`。
- 工作流安装依赖、运行测试并构建，将 **`dist/`** 上传至 GitHub Pages。
- 仓库 **Settings → Pages → Source** 应选择 **GitHub Actions**。不使用 `docs/` 作为发布目录。
- 发布入口：`https://nosugark.github.io/LittleLobby/`。相对资源路径支持仓库子路径部署。

`.github/workflows/release-app.yml` 负责 Windows、macOS、Linux 和 Android 安装包。推送与应用版本一致的 `v*` 标签时发布 Release，手动运行时生成 Actions 构建产物。

发版只有一个入口，版本号只写在 `package.json`：

```bash
npm run release -- 0.2.0-beta.2
```

脚本检查分支和工作区，同步 `package-lock.json`、`Cargo.toml`、`Cargo.lock` 和 MSI 版本（`tauri.conf.json` 直接读取 `package.json`），运行测试和构建，最后打印在 WSL 里提交、打标签、推送的命令。CI 用 `node .github/scripts/release.mjs --check` 校验同一套规则。

Android 正式发布需要四个 Secrets：`ANDROID_KEYSTORE_BASE64`、`ANDROID_KEYSTORE_PASSWORD`、`ANDROID_KEY_ALIAS`、`ANDROID_KEY_PASSWORD`。签名步骤会先核对别名是否在密钥库里，不在时列出密钥库中实际的别名。PKCS12 密钥库的密钥密码与密钥库密码相同。

## 目录

| 目录 | 用途 |
| --- | --- |
| `src/` | 页面、游戏逻辑和联机代码 |
| `public/brand/` | 当前品牌图标 |
| `public/adventure/characters/` | 当前使用的一二、布布两张精灵图集 |
| `src-tauri/` | 原生应用、局域网服务与平台配置 |
| `tests/` | 游戏、输入和网络回归测试 |
| `.github/workflows/` | 网页部署与安装包构建 |
| `.github/scripts/` | 发版入口 `release.mjs`，以及 Actions 调用的 Android 配置和签名脚本 |

生成原图、试验版本、截图与一次性图片处理脚本不纳入版本控制。提交、合并和推送使用 WSL Git，身份为 `nosugark <nosugark@qq.com>`。
