import { copyFile, mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { createHash } from 'node:crypto';
import { join } from 'node:path';

const { version } = JSON.parse(await readFile('src-tauri/tauri.conf.json', 'utf8'));
const packages = {
  'x86_64-pc-windows-msvc': { folder: 'nsis', extension: '.exe', name: 'windows-x64-setup.exe' },
  'aarch64-apple-darwin': { folder: 'dmg', extension: '.dmg', name: 'macos-arm64.dmg' },
  'x86_64-apple-darwin': { folder: 'dmg', extension: '.dmg', name: 'macos-x64.dmg' },
};
const filename = info => `Forex-Time_${version}_${info.name}`;
const [command, target] = process.argv.slice(2);

if (command === 'validate') {
  const npmVersion = JSON.parse(await readFile('package.json', 'utf8')).version;
  const cargo = await readFile('src-tauri/Cargo.toml', 'utf8');
  const cargoVersion = cargo.match(/^version = "([^"]+)"/m)?.[1];
  if (npmVersion !== version || cargoVersion !== version) throw new Error('Package versions must match.');
  if (process.env.GITHUB_REF_TYPE === 'tag' && process.env.GITHUB_REF_NAME !== `v${version}`) {
    throw new Error(`Release tag must be v${version}.`);
  }
  console.log(`Validated Forex Time v${version}`);
} else if (command === 'collect') {
  const info = packages[target];
  if (!info) throw new Error(`Unsupported release target: ${target}`);
  const folder = join('src-tauri', 'target', target, 'release', 'bundle', info.folder);
  const matches = (await readdir(folder)).filter(name => name.endsWith(info.extension));
  if (matches.length !== 1) throw new Error(`Expected one ${info.extension} installer, found ${matches.length}.`);
  await mkdir('release-artifacts', { recursive: true });
  await copyFile(join(folder, matches[0]), join('release-artifacts', filename(info)));
  console.log(filename(info));
} else if (command === 'checksums') {
  const expected = Object.values(packages).map(filename).sort();
  const actual = (await readdir('release-artifacts')).filter(name => name !== 'SHA256SUMS.txt').sort();
  if (JSON.stringify(expected) !== JSON.stringify(actual)) throw new Error('The release must contain all three installers and no unexpected files.');
  const lines = [];
  for (const name of expected) {
    const bytes = await readFile(join('release-artifacts', name));
    if (bytes.length < 100_000) throw new Error(`Installer is unexpectedly small: ${name}`);
    lines.push(`${createHash('sha256').update(bytes).digest('hex')}  ${name}`);
  }
  await writeFile('release-artifacts/SHA256SUMS.txt', `${lines.join('\n')}\n`);
  console.log(lines.join('\n'));
} else {
  throw new Error('Use validate, collect <target>, or checksums.');
}
