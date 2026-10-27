// 统一发版入口。版本号只写在 package.json；其余文件由这里同步，CI 用 --check 校验同一套规则。
//   npm run release -- 0.2.0-beta.2   同步版本号、跑测试和构建，然后打印提交 / 打标签 / 推送命令
//   node .github/scripts/release.mjs --check [--tag v0.2.0-beta.2]   只校验（CI 用）
import assert from 'node:assert/strict';
import { execSync } from 'node:child_process';
import { appendFileSync, readFileSync, writeFileSync } from 'node:fs';
import { join } from 'node:path';
import { pathToFileURL } from 'node:url';

const SEMVER = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?$/;
const FILES = {
  pkg: 'package.json',
  lock: 'package-lock.json',
  tauri: 'src-tauri/tauri.conf.json',
  cargo: 'src-tauri/Cargo.toml',
  cargoLock: 'src-tauri/Cargo.lock',
};

const read = (root, file) => readFileSync(join(root, file), 'utf8');
const crateName = (root) => read(root, FILES.cargo).match(/^name\s*=\s*"([^"]+)"/m)[1];
const cargoLockEntry = (name) => new RegExp(`(name = "${name}"\\r?\\nversion = ")([^"]+)(")`);

/** 读出每个文件里的版本号 */
export function versions(root = '.') {
  const lock = JSON.parse(read(root, FILES.lock));
  const tauri = JSON.parse(read(root, FILES.tauri));
  return {
    pkg: JSON.parse(read(root, FILES.pkg)).version,
    lock: lock.version,
    lockRoot: lock.packages[''].version,
    tauri: tauri.version,
    wix: tauri.bundle.windows.wix.version,
    cargo: read(root, FILES.cargo).match(/^version\s*=\s*"([^"]+)"/m)[1],
    cargoLock: read(root, FILES.cargoLock).match(cargoLockEntry(crateName(root)))?.[2],
  };
}

/** 校验所有文件和 package.json 一致；带 tag 时还要求标签就是 v<版本> */
export function check(root = '.', tag) {
  const v = versions(root);
  assert.match(v.pkg, SEMVER, `package.json version "${v.pkg}" is not a valid semver`);
  assert.equal(v.lock, v.pkg, 'package-lock.json version must match package.json');
  assert.equal(v.lockRoot, v.pkg, 'package-lock.json root package version must match package.json');
  assert.equal(v.tauri, '../package.json', 'tauri.conf.json must read its version from ../package.json');
  assert.equal(v.cargo, v.pkg, 'Cargo.toml version must match package.json');
  assert.equal(v.cargoLock, v.pkg, 'Cargo.lock version must match package.json');
  // MSI 只认纯数字版本，预发布后缀要去掉
  assert.equal(v.wix, v.pkg.split('-')[0], 'MSI (wix) version must be the numeric part of the version');
  if (tag) assert.equal(tag, `v${v.pkg}`, `Tag ${tag} must be v${v.pkg}`);
  return v.pkg;
}

/** 把版本号写进所有文件；只替换版本字段，不动其余格式 */
export function write(root, version) {
  assert.match(version, SEMVER, `"${version}" is not a valid semver`);
  const edit = (file, fn) => writeFileSync(join(root, file), fn(read(root, file)));
  const field = /("version": ")[^"]*(")/;
  edit(FILES.pkg, (s) => s.replace(field, `$1${version}$2`));
  // package-lock.json 的前两个 version 是顶层和 packages[""]，后面的是依赖
  let n = 0;
  edit(FILES.lock, (s) => s.replace(/("version": ")[^"]*(")/g, (m, a, b) => (n++ < 2 ? `${a}${version}${b}` : m)));
  edit(FILES.tauri, (s) => s.replace(/("wix": \{\s*"version": ")[^"]*(")/, `$1${version.split('-')[0]}$2`));
  edit(FILES.cargo, (s) => s.replace(/^(version\s*=\s*")[^"]*(")/m, `$1${version}$2`));
  const name = crateName(root);
  edit(FILES.cargoLock, (s) => s.replace(cargoLockEntry(name), `$1${version}$3`));
  return check(root);
}

function main(args) {
  if (args[0] === '--check') {
    const tagAt = args.indexOf('--tag');
    // GitHub Actions：标签触发的构建自动校验标签名
    const tag = tagAt > 0 ? args[tagAt + 1] : process.env.GITHUB_REF_TYPE === 'tag' ? process.env.GITHUB_REF_NAME : undefined;
    const version = check('.', tag);
    if (process.env.GITHUB_OUTPUT) appendFileSync(process.env.GITHUB_OUTPUT, `version=${version}\n`);
    console.log(version);
    return;
  }
  const version = args[0];
  if (!version || !SEMVER.test(version)) throw new Error('Usage: npm run release -- <version>, e.g. 0.2.0-beta.2');
  const tag = `v${version}`;
  const git = (cmd) => execSync(`git ${cmd}`, { encoding: 'utf8' }).trim();
  assert.equal(git('branch --show-current'), 'main', 'Release from main');
  assert.equal(git('status --porcelain --untracked-files=no'), '', 'Commit or stash tracked changes first');
  // 只查本地标签：远端已有同名标签时 push 会直接拒绝
  assert.equal(git(`tag --list ${tag}`), '', `Tag ${tag} already exists`);

  write('.', version);
  execSync('npm test', { stdio: 'inherit' });
  execSync('npm run build', { stdio: 'inherit' });
  const files = Object.values(FILES).join(' ');
  console.log(`\nVersion ${version} is ready. Commit, tag and push:\n
  git add ${files}
  git commit -m "chore: release ${tag}"
  git tag -a ${tag} -m "${tag}"
  git push origin main
  git push origin refs/tags/${tag}\n`);
}

if (import.meta.url === pathToFileURL(process.argv[1]).href) {
  try {
    main(process.argv.slice(2));
  } catch (error) {
    console.error(error.message);
    process.exit(1);
  }
}
