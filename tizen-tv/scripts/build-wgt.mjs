/**
 * Build an unsigned .wgt (zip) for Samsung Tizen Web TV.
 * Signing must be done with Tizen Certificate Manager / tizen package -s — never commit certs.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { execFileSync } from 'child_process';
import { createRequire } from 'module';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const appRoot = path.resolve(__dirname, '..');
const outDir = path.join(appRoot, 'dist');
const staging = path.join(outDir, 'staging');

// Refresh shared libs
execFileSync(process.execPath, [path.join(__dirname, 'sync-shared.mjs')], {
  stdio: 'inherit'
});

fs.rmSync(staging, { recursive: true, force: true });
fs.mkdirSync(staging, { recursive: true });

const INCLUDE = [
  'config.xml',
  'index.html',
  'css',
  'js',
  'images'
];

function copyRecursive(src, dest) {
  const st = fs.statSync(src);
  if (st.isDirectory()) {
    fs.mkdirSync(dest, { recursive: true });
    for (const name of fs.readdirSync(src)) {
      if (name === 'node_modules' || name === 'dist' || name === 'tests' || name === 'scripts') continue;
      copyRecursive(path.join(src, name), path.join(dest, name));
    }
  } else {
    fs.mkdirSync(path.dirname(dest), { recursive: true });
    fs.copyFileSync(src, dest);
  }
}

for (const item of INCLUDE) {
  const src = path.join(appRoot, item);
  if (!fs.existsSync(src)) throw new Error(`Missing ${item}`);
  copyRecursive(src, path.join(staging, item));
}

const wgtPath = path.join(outDir, 'LKS-TV.wgt');
fs.rmSync(wgtPath, { force: true });

// Prefer system zip; fallback to PowerShell Compress-Archive on Windows.
try {
  execFileSync('zip', ['-r', wgtPath, '.'], { cwd: staging, stdio: 'inherit' });
} catch {
  const ps = `Compress-Archive -Path '${staging}\\*' -DestinationPath '${wgtPath}.zip' -Force; Move-Item -Force '${wgtPath}.zip' '${wgtPath}'`;
  execFileSync('powershell', ['-NoProfile', '-Command', ps], { stdio: 'inherit' });
}

console.log('Built unsigned package:', wgtPath);
console.log('Sign with Tizen CLI before TV install, e.g.:');
console.log('  tizen package -t wgt -s <profile> -- ' + staging);
console.log('Do NOT commit author certificates or passwords.');
