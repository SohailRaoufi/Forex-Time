import { readFile, writeFile, mkdir, mkdtemp, copyFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createRequire } from 'node:module';
import { execFileSync } from 'node:child_process';

// Keep every desktop icon derived from the same editable Relay mark.
const source = await readFile('src/assets/relay.svg', 'utf8');
const mark = source.replace(/^<svg[^>]*>/, '').replace(/<\/svg>\s*$/, '');
const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="1024" height="1024" viewBox="0 0 1024 1024">
  <rect x="64" y="64" width="896" height="896" rx="204" fill="#151d27"/>
  <g fill="#92e4bf" transform="translate(165 252) scale(1.084375) translate(-310 -166)">${mark}</g>
</svg>\n`;
await mkdir('public', { recursive: true });
await writeFile('public/app-icon.svg', icon);
const temporary = await mkdtemp(join(tmpdir(), 'forex-time-icons-'));
try {
  const cli = createRequire(import.meta.url).resolve('@tauri-apps/cli/tauri.js');
  execFileSync(process.execPath, [cli, 'icon', resolve('public/app-icon.svg'), '--output', temporary], { stdio: 'inherit' });
  await mkdir('src-tauri/icons', { recursive: true });
  for (const name of ['32x32.png', '128x128.png', '128x128@2x.png', 'icon.png', 'icon.ico', 'icon.icns']) {
    await copyFile(join(temporary, name), join('src-tauri/icons', name));
  }
} finally {
  await rm(temporary, { recursive: true, force: true });
}
