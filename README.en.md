<div align="center">

<picture>
  <source media="(prefers-color-scheme: dark)" srcset="public/brand/logo-white.png">
  <img src="public/brand/logo.png" alt="Little Lobby" width="420">
</picture>

**Get together and play, anytime**

Host on a big screen; every phone that scans the QR code becomes a controller. On the same Wi-Fi or hotspot, you can play together without internet.

[![Release](https://img.shields.io/github/v/release/noSugarK/LittleLobby?include_prereleases&color=0f5c5a)](https://github.com/noSugarK/LittleLobby/releases)
[![Downloads](https://img.shields.io/github/downloads/noSugarK/LittleLobby/total?color=d9502f)](https://github.com/noSugarK/LittleLobby/releases)
[![Stars](https://img.shields.io/github/stars/noSugarK/LittleLobby?style=flat&color=ff7a59)](https://github.com/noSugarK/LittleLobby/stargazers)
[![Website](https://img.shields.io/github/actions/workflow/status/noSugarK/LittleLobby/deploy.yml?label=website)](https://github.com/noSugarK/LittleLobby/actions/workflows/deploy.yml)
[![License](https://img.shields.io/github/license/noSugarK/LittleLobby)](LICENSE)
<br>
![Platforms](https://img.shields.io/badge/platforms-Windows%20%7C%20macOS%20%7C%20Linux%20%7C%20Android%20%7C%20Web-10302f)

[**Play online**](https://nosugark.github.io/LittleLobby/) · [**Download**](#download) · [How to play](#how-to-play) · [简体中文](README.md)

</div>

## Download

The web version runs in any browser: <https://nosugark.github.io/LittleLobby/>. For parties without internet, install the desktop or Android app on the host device. Friends' phones don't need to install anything.

| Platform | Installer | Notes |
| --- | --- | --- |
| Windows | `.exe` / `.msi` | 64-bit, Windows 10 or later |
| macOS | `.dmg` | Universal build for Intel and Apple silicon |
| Linux | `.deb` / `.rpm` | x86-64 |
| Android | `.apk` | ARM64, most recent phones |

👉 [Get the latest release](https://github.com/noSugarK/LittleLobby/releases/latest)

> If macOS says it can't verify the developer the first time you open the app, choose **Open Anyway** in **System Settings → Privacy & Security**.

## How to play

### Start a game

1. **Host**: open Little Lobby on a computer, TV browser or tablet, pick a game and choose **Host on big screen**. You can also **Host on phone** and play while hosting.
2. **Join**: friends scan the QR code on the big screen with their phones, or enter the 5-character room code on the home page.
3. **Play**: everyone picks a team or character, then the host starts. The host can switch games at any time; the room code and players stay.

**Public rooms**: before hosting, turn on **Show in public lobby** under **Room settings**. The room appears in the lobby list on the home page and anyone can join with one tap; you can still set a password. If the list looks stale, tap **Refresh** next to the lobby title.

**Without internet**: host from the desktop or Android app and connect every device to the same Wi-Fi or phone hotspot. The app is the server, so friends join by scanning with their phone browser and nothing goes over the internet.

### Games

<table>
<tr>
<td width="50%" valign="top">

<img src="public/home/football.webp" alt="Kickabout">

**⚽ Kickabout** (1–8 players · team match)

Pass, shoot and play a match with friends. Up to 4v4, with computer teammates when you're short.

- Three formats: Timed · First to 3 · Golden goal
- Optional party items; the host sets the pitch and rules
- Match stats after every game

</td>
<td width="50%" valign="top">

<img src="public/home/adventure.webp" alt="Squishy Adventure">

**✦ Squishy Adventure** (1–8 players · co-op)

Pick a buddy and hop through levels together. You can also explore on your own.

- Ten characters: Yier · Bubu · Xiaobai · Jinmao · Nailong · Naiwa · Niulai · Lulu · Baobao · Doudou, all in the **Characters** gallery. The apps ship with the first four and download the rest from the gallery
- Three classic stages: Berry Stroll → Cloud Candy Bridge → Starlight Garden
- Co-op modes: **Rope** (everyone on one rope) · **Gobble** (swallow a teammate and spit them across a gap) · **Stack** (climb tall walls on each other's heads)

</td>
</tr>
</table>

### Phone controls

- Move with the left joystick or D-pad; the right buttons jump, shoot or gobble.
- In the menu's **Controls** tab you can switch to a D-pad, use an arc button layout and change the button size. Settings are saved on the phone.
- Landscape works best. Android and desktop browsers go fullscreen with one tap. Safari on iPhone has no web fullscreen: tap **Share → Add to Home Screen** and open it from the icon to play fullscreen.

<details>
<summary><b>Development</b></summary>

### Setup

Requires Node.js 24. The desktop and Android apps also need Rust and the [Tauri 2](https://v2.tauri.app/start/prerequisites/) prerequisites for your platform.

```bash
npm ci
npm run dev        # web dev server (HTTPS by default, reachable from phones on the LAN)
npm test           # game, input, network and release-script tests
npm run build      # type-check and build to dist/
npm run app:dev    # run the native app in development
npm run app:build  # build installers for the current platform
```

### Source layout

| Directory | Purpose |
| --- | --- |
| `src/` | Pages, game logic and networking (`game/`, `net/`, `ui/` components, `pages/`) |
| `src-tauri/` | Native app, LAN server and platform configuration |
| `public/` | Brand icons and home page art |
| `public/characters/` | Characters: one folder each (multilingual text + sprite atlases); see its README for the spec and generation prompts |
| `tests/` | Regression tests (`node --test`) |
| `.github/workflows/` | Website deployment and installer builds |
| `.github/scripts/` | Release entry point, plus Android project and signing scripts |

### Networking

- **Web**: signaling through a public MQTT broker, with WebRTC connections between players; needs internet.
- **Native app**: the home page switches between **Online** and **Local network**. Online works like the web version. Local network runs an HTTP + WebSocket server on the device that serves the web app and assets (including downloaded characters) and finds rooms with UDP broadcast; no internet needed.
- **Public lobby**: hosts that choose to be public publish their room as a retained MQTT message, refreshed every 30 seconds and cleared when they close or drop; the home page subscribes to these to list rooms.
- **Character images** load on demand: joining a game waits only for your own character, and other players' characters and the Gobble sheets download when first drawn.

### Website deployment

Pushing `main` runs `.github/workflows/deploy.yml`, which tests, builds and publishes `dist/` to GitHub Pages (Settings → Pages → Source: GitHub Actions). Assets use relative paths, so repository subpaths work.

### Releases

The version lives only in `package.json`; the script syncs everything else:

```bash
npm run release -- 0.2.1
```

The script checks the branch and working tree, syncs `package-lock.json`, `Cargo.toml`, `Cargo.lock` and the MSI version (`tauri.conf.json` reads `package.json` directly), runs tests and the build, then lists the commands to commit, tag and push. Pushing a `v*` tag makes `.github/workflows/release-app.yml` build installers for all four platforms and publish a Release; manual runs only produce workflow artifacts.

Production Android signing needs four Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The signing step checks the alias against the keystore first and lists the aliases it contains when it doesn't match. In a PKCS12 keystore the key password is the keystore password.

</details>

## License

The code is released under the [MIT License](LICENSE).

Characters from other works belong to their original creators: Yier and Bubu (Yier & Bubu), Xiaobai and Jinmao (Line Puppy), Lulu (Capybara Lulu), Nailong (Nailong), Naiwa (a Nailong meme remix) and Niulai (the animated film Niulai). They are not covered by the MIT License and are included only for non-commercial play among friends. Baobao and Doudou are original characters.
