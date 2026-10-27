# Little Lobby · 小聚场

A local party game collection. Host on a big screen, scan in with phones as controllers, and play together over the same Wi-Fi or hotspot.

[Play online](https://nosugark.github.io/LittleLobby/) · [Downloads](https://github.com/noSugarK/LittleLobby/releases) · [Deployment](https://github.com/noSugarK/LittleLobby/actions/workflows/deploy.yml) · [简体中文](README.md)

## Games and rooms

- **Football**: up to 4v4, timed matches, first to three, golden goal, and party rules.
- **Cozy Adventure**: 1–8 players collect stars, use checkpoints, and reach the finish together. Choose Yier or Bubu, animated with complete PNG sprite frames.
- Hosts switch games, maps, and rules without changing the room code, QR invite, or members.
- Players choose characters or teams, ready up, or spectate. Maps and item themes are shared and independent of character selection.

## Offline play

1. Run the native app and connect all devices to the same Wi-Fi or hotspot.
2. Select LAN mode and a game; host as a big screen or as a player.
3. Select a reachable network address. Friends scan the QR code or join through the native LAN lobby.
4. Players ready up and the host starts. Keep the host running.

The native host serves the website, assets, and WebSocket connections locally. Phones need neither an app installation nor internet access. Ordinary browser multiplayer uses public signaling services and requires internet access; solo adventure can run locally.

## Development

Use Node.js 24. Native development also requires Rust and the platform's Tauri build dependencies.

```sh
npm ci
npm run dev
npm test
npm run build
```

The development server uses HTTPS by default. Use `npm run app:dev` for native development and `npm run app:build` to build the app. Internal Cargo names and application identifiers remain unchanged for compatibility.

## Deployment and installers

The website deploys through **GitHub Actions**:

- Push `main` or manually run `.github/workflows/deploy.yml`.
- The workflow installs dependencies, tests, builds, and uploads **`dist/`** to GitHub Pages.
- Select **GitHub Actions** under **Settings → Pages → Source**. There is no `docs/` publishing directory.
- Website URL: `https://nosugark.github.io/LittleLobby/`. Relative assets support repository subpaths.

`.github/workflows/release-app.yml` builds Windows, macOS, Linux, and Android installers. A `v*` tag matching the application version publishes a Release; manual runs produce workflow artifacts.

Releases have one entry point, and the version lives only in `package.json`:

```bash
npm run release -- 0.2.0-beta.2
```

The script checks the branch and working tree, syncs `package-lock.json`, `Cargo.toml`, `Cargo.lock` and the MSI version (`tauri.conf.json` reads `package.json` directly), runs tests and the build, then prints the WSL commands to commit, tag and push. CI runs `node .github/scripts/release.mjs --check` with the same rules.

Production Android releases need four Secrets: `ANDROID_KEYSTORE_BASE64`, `ANDROID_KEYSTORE_PASSWORD`, `ANDROID_KEY_ALIAS`, `ANDROID_KEY_PASSWORD`. The signing step checks the alias against the keystore first and lists the aliases it actually contains when it does not match. In a PKCS12 keystore the key password is the keystore password.

## Source layout

| Directory | Purpose |
| --- | --- |
| `src/` | Pages, games, and networking |
| `public/brand/` | Current branding |
| `public/adventure/characters/` | The two current character atlases |
| `src-tauri/` | Native app and LAN server |
| `tests/` | Gameplay, input, and network regressions |
| `.github/workflows/` | Website deployment and installer builds |
| `.github/scripts/` | The `release.mjs` entry point, plus Android preparation and signing used by Actions |

Generated source images, experimental variants, captures, and one-off image processing scripts are excluded from version control. Commit, merge, and push through WSL Git using `nosugark <nosugark@qq.com>`.
