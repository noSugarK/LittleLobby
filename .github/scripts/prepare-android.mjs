// Configure the generated Tauri Android project for local hosting and signing.
// Run from the repository root after `tauri android init`; safe to run repeatedly.
import { copyFileSync, cpSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath, pathToFileURL } from 'node:url';

const tauri = join(dirname(fileURLToPath(import.meta.url)), '../../src-tauri');
const read = (file) => readFileSync(file, 'utf8');
const write = (file, text) => { mkdirSync(dirname(file), { recursive: true }); writeFileSync(file, text); };

/** Set (or replace) one attribute on the first opening tag named `tag`. */
function setAttr(xml, tag, name, value) {
  return xml.replace(new RegExp(`<${tag}\\b[^>]*?(?=/?>)`), (open) => {
    const attr = new RegExp(`\\s${name}="[^"]*"`);
    return attr.test(open) ? open.replace(attr, ` ${name}="${value}"`) : `${open} ${name}="${value}"`;
  });
}

const SIGNING = `
// Little Lobby CI signing
if (System.getenv("ANDROID_KEYSTORE_PATH") != null) {
    android {
        signingConfigs {
            maybeCreate("release").apply {
                storeFile = file(System.getenv("ANDROID_KEYSTORE_PATH"))
                storePassword = System.getenv("ANDROID_KEYSTORE_PASSWORD")
                keyAlias = System.getenv("ANDROID_SIGNING_ALIAS")
                keyPassword = System.getenv("ANDROID_KEY_PASSWORD")
            }
        }
        buildTypes.getByName("release").signingConfig = signingConfigs.getByName("release")
    }
} else {
    android {
        buildTypes.getByName("release").apply {
            signingConfig = signingConfigs.getByName("debug")
            applicationIdSuffix = ".debug"
        }
    }
}
`;
// Older builds wrote the same block under the previous project name.
const SIGNING_MARKERS = ['// Little Lobby CI signing', '// ScanKick CI signing'];

export function prepareAndroid(app = 'src-tauri/gen/android/app') {
  // The package path follows the bundle identifier, which stays io.github.nosugark.scankick so installed apps can upgrade.
  const activity = join(app, 'src/main/java/io/github/nosugark/scankick/MainActivity.kt');
  mkdirSync(dirname(activity), { recursive: true });
  copyFileSync(join(tauri, 'android/MainActivity.kt'), activity);
  // Android init creates its own launcher resources instead of using desktop icons.
  cpSync(join(tauri, 'icons/android'), join(app, 'src/main/res'), { recursive: true });

  // Gradle's default 10-second download timeout is too short for CI network stalls.
  const wrapper = join(app, '../gradle/wrapper/gradle-wrapper.properties');
  const properties = read(wrapper).split(/\r?\n/).filter((line) => line && !line.startsWith('networkTimeout='));
  writeFileSync(wrapper, [...properties, 'networkTimeout=120000', ''].join('\n'));

  const manifest = join(app, 'src/main/AndroidManifest.xml');
  let xml = read(manifest);
  // The WebView asks for CAMERA at runtime for QR scanning; Android only prompts for declared permissions.
  for (const name of ['android.permission.INTERNET', 'android.permission.CAMERA']) {
    if (!xml.includes(`<uses-permission android:name="${name}"`)) xml = xml.replace(/<application\b/, `<uses-permission android:name="${name}" />\n    $&`);
  }
  if (!xml.includes('<uses-feature android:name="android.hardware.camera"')) {
    xml = xml.replace(/<application\b/, '<uses-feature android:name="android.hardware.camera" android:required="false" />\n    $&');
  }
  xml = setAttr(xml, 'application', 'android:networkSecurityConfig', '@xml/little_lobby_network_security');
  xml = setAttr(xml, 'application', 'android:icon', '@mipmap/ic_launcher');
  xml = setAttr(xml, 'application', 'android:roundIcon', '@mipmap/ic_launcher');
  xml = setAttr(xml, 'application', 'android:label', '@string/app_name');
  // The controller needs landscape even when the phone has rotation locked.
  xml = setAttr(xml, 'activity', 'android:screenOrientation', 'fullSensor');
  writeFileSync(manifest, xml);

  // Keep the English name and localize the launcher name for Chinese devices.
  for (const [folder, title] of Object.entries({ values: 'Little Lobby', 'values-zh': '小聚场', 'values-zh-rTW': '小聚場', 'values-zh-rHK': '小聚場' })) {
    const strings = join(app, 'src/main/res', folder, 'strings.xml');
    const text = existsSync(strings) ? read(strings) : '<?xml version="1.0" encoding="utf-8"?>\n<resources>\n</resources>\n';
    const label = `<string name="app_name">${title}</string>`;
    write(strings, /<string name="app_name">[^<]*<\/string>/.test(text)
      ? text.replace(/<string name="app_name">[^<]*<\/string>/, label)
      : text.replace('</resources>', `    ${label}\n</resources>`));
  }

  // LAN hosts use dynamic IP addresses, which Android domain-config cannot match
  // by subnet. Allow their HTTP/WebSocket traffic; online services still use TLS.
  write(join(app, 'src/main/res/xml/little_lobby_network_security.xml'), `<?xml version="1.0" encoding="utf-8"?>
<network-security-config>
    <base-config cleartextTrafficPermitted="true" />
</network-security-config>
`);

  const gradle = join(app, 'build.gradle.kts');
  let text = read(gradle);
  for (const marker of SIGNING_MARKERS) text = text.split(marker)[0];
  writeFileSync(gradle, `${text.trimEnd()}\n${SIGNING}`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) prepareAndroid();
