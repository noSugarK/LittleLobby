import assert from 'node:assert/strict';
import { cpSync, existsSync, mkdirSync, mkdtempSync, readFileSync, readdirSync, statSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import test from 'node:test';
import { fileURLToPath } from 'node:url';

import { check, versions, write } from '../.github/scripts/release.mjs';
import { prepareAndroid } from '../.github/scripts/prepare-android.mjs';
import { configureSigning } from '../.github/scripts/configure-android-signing.mjs';
import { releaseNotes } from '../.github/scripts/release-notes.mjs';

test('release notes group commits and always list the downloads', () => {
  const notes = releaseNotes({
    tag: 'v1.2.0-beta.3', previous: 'v1.2.0-beta.2', logins: true,
    commits: [
      { sha: 'aaaaaaa1', author: 'noSugarK', subject: 'chore: release v1.2.0-beta.3' },
      { sha: 'bbbbbbb2', author: 'friend', subject: 'fix: hide the menu when closed' },
      { sha: 'ccccccc3', author: 'noSugarK', subject: 'feat(home)!: add offline downloads' },
      { sha: 'ddddddd4', author: 'noSugarK', subject: 'refactor: unify names' },
      { sha: 'eeeeeee5', author: 'noSugarK', subject: 'Merge pull request #1 from x/y' },
    ],
  });
  assert.match(notes, /## What's new\n\n- \*\*Breaking:\*\* Add offline downloads by @noSugarK \(ccccccc\)/);
  assert.match(notes, /## Fixes\n\n- Hide the menu when closed by @friend \(bbbbbbb\)/);
  assert.match(notes, /## Other changes\n\n- Unify names by @noSugarK \(ddddddd\)/);
  assert.doesNotMatch(notes, /release v1\.2\.0|Merge pull/);
  assert.match(notes, /\[LittleLobby_1\.2\.0-beta\.3_android-arm64\.apk\]\(https:\/\/github\.com\/noSugarK\/LittleLobby\/releases\/download\/v1\.2\.0-beta\.3\/LittleLobby_1\.2\.0-beta\.3_android-arm64\.apk\)/);
  assert.equal(notes.split('| Windows |').length - 1, 2);
  // GitHub lists @mentioned authors as contributor avatars itself; a second list would duplicate it.
  assert.doesNotMatch(notes, /## Contributors/);
  assert.match(notes, /compare\/v1\.2\.0-beta\.2\.\.\.v1\.2\.0-beta\.3/);
});

const repo = join(dirname(fileURLToPath(import.meta.url)), '..');
const temp = () => mkdtempSync(join(tmpdir(), 'little-lobby-'));
const VERSION_FILES = ['package.json', 'package-lock.json', 'src-tauri/tauri.conf.json', 'src-tauri/Cargo.toml', 'src-tauri/Cargo.lock'];

test('the repository versions agree', () => {
  assert.match(check(repo), /^\d+\.\d+\.\d+/);
});

test('release write updates every version field and nothing else', () => {
  const root = temp();
  for (const file of VERSION_FILES) cpSync(join(repo, file), join(root, file));
  const before = Object.fromEntries(VERSION_FILES.map((f) => [f, readFileSync(join(root, f), 'utf8')]));
  assert.equal(write(root, '1.2.3-beta.4'), '1.2.3-beta.4');
  assert.deepEqual(versions(root), {
    pkg: '1.2.3-beta.4', lock: '1.2.3-beta.4', lockRoot: '1.2.3-beta.4', tauri: '../package.json',
    wix: '1.2.3', cargo: '1.2.3-beta.4', cargoLock: '1.2.3-beta.4',
  });
  // Only version lines change: dependency versions in the lock files stay put.
  for (const file of VERSION_FILES) {
    const a = before[file].split('\n');
    const b = readFileSync(join(root, file), 'utf8').split('\n');
    assert.equal(b.length, a.length, file);
    const changed = a.filter((line, i) => line !== b[i]);
    assert.ok(changed.length <= 2 && changed.every((line) => /version/.test(line)), `${file}: ${changed}`);
  }
  assert.throws(() => check(root, 'v1.2.3'), /Tag v1\.2\.3 must be v1\.2\.3-beta\.4/);
  assert.throws(() => write(root, '1.2'), /not a valid semver/);
});

function androidProject(existing) {
  const root = temp();
  const app = join(root, 'app');
  const file = (path, text) => { mkdirSync(dirname(join(app, path)), { recursive: true }); writeFileSync(join(app, path), text); };
  file('src/main/AndroidManifest.xml', `<?xml version="1.0" encoding="utf-8"?>
<manifest xmlns:android="http://schemas.android.com/apk/res/android">
    ${existing ? '<uses-permission android:name="android.permission.INTERNET" />' : ''}
    <uses-permission android:name="android.permission.VIBRATE" />
    <uses-feature android:name="android.software.leanback" android:required="false" />
    <application
        android:icon="@mipmap/ic_launcher"
        android:label="ScanKick"
        android:usesCleartextTraffic="\${usesCleartextTraffic}">
        <activity
            android:name=".MainActivity"
            android:exported="true">
        </activity>
    </application>
</manifest>
`);
  file('build.gradle.kts', `plugins { id("com.android.application") }\n${existing ? '// ScanKick CI signing\n// old signing configuration\n' : ''}`);
  file('src/main/java/io/github/nosugark/scankick/MainActivity.kt', '// Generated default activity\n');
  file('src/main/res/mipmap-mdpi/ic_launcher.png', 'default launcher');
  if (existing) file('src/main/res/values/strings.xml', '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n    <string name="app_name">scankick</string>\n    <string name="main_activity_title">scankick</string>\n</resources>\n');
  const distribution = 'distributionUrl=https\\://services.gradle.org/distributions/gradle-8.14.3-bin.zip\n';
  mkdirSync(join(root, 'gradle/wrapper'), { recursive: true });
  writeFileSync(join(root, 'gradle/wrapper/gradle-wrapper.properties'), distribution + (existing ? 'networkTimeout=10000\n' : ''));
  return { root, app, distribution };
}

const files = (dir) => readdirSync(dir, { recursive: true }).map(String).filter((f) => statSync(join(dir, f)).isFile());
const snapshot = (dir) => Object.fromEntries(files(dir).map((f) => [f, readFileSync(join(dir, f), 'utf8')]));

for (const existing of [false, true]) {
  test(`prepare-android configures a ${existing ? 'previously prepared' : 'fresh'} project idempotently`, () => {
    const { root, app, distribution } = androidProject(existing);
    prepareAndroid(app);
    const first = snapshot(root);
    prepareAndroid(app);
    assert.deepEqual(snapshot(root), first);

    const icons = join(repo, 'src-tauri/icons/android');
    for (const f of files(icons)) assert.deepEqual(readFileSync(join(app, 'src/main/res', f)), readFileSync(join(icons, f)), f);
    assert.equal(readFileSync(join(app, 'src/main/java/io/github/nosugark/scankick/MainActivity.kt'), 'utf8'), readFileSync(join(repo, 'src-tauri/android/MainActivity.kt'), 'utf8'));
    assert.equal(readFileSync(join(root, 'gradle/wrapper/gradle-wrapper.properties'), 'utf8'), `${distribution}networkTimeout=120000\n`);

    const manifest = readFileSync(join(app, 'src/main/AndroidManifest.xml'), 'utf8');
    const count = (s) => manifest.split(s).length - 1;
    assert.equal(count('android.permission.INTERNET'), 1);
    assert.equal(count('android.permission.CAMERA'), 1);
    assert.equal(count('android.permission.VIBRATE'), 1);
    assert.match(manifest, /<uses-feature android:name="android.hardware.camera" android:required="false" \/>/);
    const application = manifest.match(/<application\b[^>]*>/)[0];
    assert.match(application, /android:label="@string\/app_name"/);
    assert.equal((application.match(/android:icon=/g) ?? []).length, 1);
    assert.match(application, /android:roundIcon="@mipmap\/ic_launcher"/);
    assert.match(application, /android:networkSecurityConfig="@xml\/little_lobby_network_security"/);
    assert.match(application, /android:usesCleartextTraffic="\$\{usesCleartextTraffic\}"/);
    assert.match(manifest.match(/<activity\b[^>]*>/)[0], /android:screenOrientation="fullSensor"/);

    for (const [folder, title] of Object.entries({ values: 'Little Lobby', 'values-zh': '小聚场', 'values-zh-rTW': '小聚場', 'values-zh-rHK': '小聚場' })) {
      const strings = readFileSync(join(app, 'src/main/res', folder, 'strings.xml'), 'utf8');
      assert.equal(strings.split('name="app_name"').length - 1, 1);
      assert.match(strings, new RegExp(`<string name="app_name">${title}</string>`));
    }
    if (existing) assert.match(readFileSync(join(app, 'src/main/res/values/strings.xml'), 'utf8'), /main_activity_title/);

    assert.match(readFileSync(join(app, 'src/main/res/xml/little_lobby_network_security.xml'), 'utf8'), /cleartextTrafficPermitted="true"/,
      'LAN players must connect to dynamic host IPs, not only loopback');
    const gradle = readFileSync(join(app, 'build.gradle.kts'), 'utf8');
    assert.match(gradle, /System\.getenv\("ANDROID_KEYSTORE_PASSWORD"\)/);
    assert.match(gradle, /keyAlias = System\.getenv\("ANDROID_SIGNING_ALIAS"\)/);
    assert.match(gradle, /signingConfig = signingConfigs\.getByName\("debug"\)/);
    assert.match(gradle, /applicationIdSuffix = "\.debug"/);
    assert.doesNotMatch(gradle, /old signing configuration|ScanKick/);
    assert.equal(gradle.split('CI signing').length - 1, 1);
  });
}

function signingEnv(root, extra) {
  return {
    RUNNER_TEMP: root, GITHUB_ENV: join(root, 'env'), GITHUB_OUTPUT: join(root, 'output'), GITHUB_STEP_SUMMARY: join(root, 'summary'), ...extra,
  };
}

test('release signing requires all four secrets before writing anything', () => {
  for (const secrets of [{}, { ANDROID_KEY_ALIAS: 'test' }]) {
    const root = temp();
    assert.throws(() => configureSigning(signingEnv(root, { GITHUB_REF_TYPE: 'tag', ...secrets })), /all four/);
    assert.deepEqual(readdirSync(root), []);
  }
});

test('branch builds use test signing and tag builds export the keystore', () => {
  for (const signed of [false, true]) {
    const root = temp();
    const secrets = signed ? {
      ANDROID_KEYSTORE_BASE64: `${Buffer.from('test-keystore').toString('base64')}\n`,
      ANDROID_KEYSTORE_PASSWORD: 'store-password', ANDROID_KEY_ALIAS: 'test', ANDROID_KEY_PASSWORD: 'key-password',
    } : {};
    assert.equal(configureSigning(signingEnv(root, { GITHUB_REF_TYPE: signed ? 'tag' : 'branch', ...secrets }), () => ['test']), signed);
    assert.equal(readFileSync(join(root, 'output'), 'utf8'), `signed=${signed}\n`);
    const key = join(root, 'little-lobby-upload.jks');
    if (signed) {
      assert.equal(readFileSync(key, 'utf8'), 'test-keystore');
      if (process.platform !== 'win32') assert.equal(statSync(key).mode & 0o777, 0o600);
      assert.equal(readFileSync(join(root, 'env'), 'utf8'), `ANDROID_KEYSTORE_PATH=${key}\nANDROID_SIGNING_ALIAS=test\n`);
    } else {
      assert.ok(!existsSync(key));
      assert.ok(!existsSync(join(root, 'env')));
    }
  }
  assert.throws(() => configureSigning(signingEnv(temp(), {
    ANDROID_KEYSTORE_BASE64: 'not base64!', ANDROID_KEYSTORE_PASSWORD: 'a', ANDROID_KEY_ALIAS: 'b', ANDROID_KEY_PASSWORD: 'c',
  })), /not valid base64/);
});

test('signing checks the key alias against the keystore before Gradle runs', () => {
  const secrets = (alias) => ({
    GITHUB_REF_TYPE: 'tag', ANDROID_KEYSTORE_BASE64: Buffer.from('k').toString('base64'),
    ANDROID_KEYSTORE_PASSWORD: 'a', ANDROID_KEY_ALIAS: alias, ANDROID_KEY_PASSWORD: 'b',
  });
  // A pasted newline or different case still resolves to the real alias.
  const root = temp();
  assert.equal(configureSigning(signingEnv(root, secrets(' Upload\n')), () => ['upload']), true);
  assert.match(readFileSync(join(root, 'env'), 'utf8'), /ANDROID_SIGNING_ALIAS=upload\n/);
  // A wrong alias fails early, lists the real ones and removes the decoded key.
  const bad = temp();
  assert.throws(() => configureSigning(signingEnv(bad, secrets('release')), () => ['upload', 'other']), /Keys in ANDROID_KEYSTORE_BASE64: upload, other/);
  assert.ok(!existsSync(join(bad, 'little-lobby-upload.jks')));
  assert.ok(!existsSync(join(bad, 'output')));
});
