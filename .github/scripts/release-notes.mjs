// Release notes in one fixed format, built from Conventional Commit subjects since the previous tag.
//   node .github/scripts/release-notes.mjs v0.2.0-beta.2 [previous-tag] > notes.md
// With GH_TOKEN and GITHUB_REPOSITORY set (CI), authors are @mentioned GitHub logins (GitHub shows them as contributor avatars);
// otherwise they fall back to commit author names.
import { execFileSync } from 'node:child_process';
import { pathToFileURL } from 'node:url';

const REPO = 'noSugarK/LittleLobby';
const SECTIONS = [
  ['feat', "What's new"],
  ['fix', 'Fixes'],
  ['other', 'Other changes'],
];
const DOWNLOADS = [
  ['Windows', 'windows-x64.exe', 'Installer (recommended)'],
  ['Windows', 'windows-x64.msi', 'MSI package'],
  ['macOS', 'macos-universal.dmg', 'Intel and Apple silicon'],
  ['Linux', 'linux-x64.deb', 'Debian / Ubuntu'],
  ['Linux', 'linux-x64.rpm', 'Fedora / openSUSE'],
  ['Android', 'android-arm64.apk', 'ARM64 phones'],
];
const CONVENTIONAL = /^(\w+)(\([^)]*\))?(!)?:\s*(.+)$/;

/** Build the Markdown body. commits: [{ sha, subject, author }] newest first; author is a login or a name. */
export function releaseNotes({ tag, previous, commits, repo = REPO, logins = false }) {
  const version = tag.replace(/^v/, '');
  const groups = { feat: [], fix: [], other: [] };
  for (const c of commits) {
    const m = c.subject.match(CONVENTIONAL);
    // Release bumps and merge commits carry no user-facing change.
    if (!m || (m[1] === 'chore' && /^release\b/.test(m[4])) || c.subject.startsWith('Merge ')) continue;
    const text = m[4].charAt(0).toUpperCase() + m[4].slice(1);
    // GitHub turns @mentions into its own contributor avatars under the notes, so authors go on each line instead of a separate list.
    const by = c.author ? ` by ${logins ? '@' : ''}${c.author}` : '';
    const line = `- ${m[3] ? '**Breaking:** ' : ''}${text}${by} (${c.sha.slice(0, 7)})`;
    (groups[m[1]] ?? groups.other).push(line);
  }
  const out = [];
  for (const [key, title] of SECTIONS) if (groups[key].length) out.push(`## ${title}\n\n${groups[key].join('\n')}`);
  if (!out.length) out.push("## What's new\n\n- Maintenance release.");

  const base = `https://github.com/${repo}/releases/download/${tag}`;
  out.push(`## Downloads\n\n| Platform | File | Notes |\n| --- | --- | --- |\n${DOWNLOADS
    .map(([os, suffix, note]) => `| ${os} | [LittleLobby_${version}_${suffix}](${base}/LittleLobby_${version}_${suffix}) | ${note} |`)
    .join('\n')}\n\nNo install needed to play in a browser: https://nosugark.github.io/LittleLobby/. Friends join from their phone browser either way.`);

  out.push(previous
    ? `**Full changelog**: https://github.com/${repo}/compare/${previous}...${tag}`
    : `**Full changelog**: https://github.com/${repo}/commits/${tag}`);
  return `${out.join('\n\n')}\n`;
}

async function main([tag, previousArg]) {
  if (!tag) throw new Error('Usage: node .github/scripts/release-notes.mjs <tag> [previous-tag]');
  const git = (...args) => execFileSync('git', args, { encoding: 'utf8' }).trim();
  let previous = previousArg;
  if (!previous) {
    try { previous = git('describe', '--tags', '--abbrev=0', `${tag}^`); } catch { previous = undefined; }
  }
  const range = previous ? `${previous}..${tag}` : tag;
  const commits = git('log', '--format=%H%x09%an%x09%s', range).split('\n').filter(Boolean)
    .map((line) => { const [sha, author, subject] = line.split('\t'); return { sha, author, subject }; });

  const repo = process.env.GITHUB_REPOSITORY ?? REPO;
  let logins = false;
  if (process.env.GH_TOKEN && previous) {
    // Commit authors as GitHub accounts, so the notes can @mention them.
    const res = await fetch(`https://api.github.com/repos/${repo}/compare/${previous}...${tag}`, {
      headers: { authorization: `Bearer ${process.env.GH_TOKEN}`, accept: 'application/vnd.github+json' },
    });
    if (res.ok) {
      const login = new Map((await res.json()).commits.map((c) => [c.sha, c.author?.login]));
      if (commits.every((c) => login.get(c.sha))) {
        for (const c of commits) c.author = login.get(c.sha);
        logins = true;
      }
    }
  }
  process.stdout.write(releaseNotes({ tag, previous, commits, repo, logins }));
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main(process.argv.slice(2)).catch((error) => {
    console.error(error.message);
    process.exit(1);
  });
}
