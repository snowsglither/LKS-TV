/**
 * 1920×1080 captures of universal search UI (localhost).
 */
import { createServer } from 'http';
import { chromium } from 'playwright';
import { mkdirSync } from 'fs';
import { dirname, join } from 'path';
import { fileURLToPath } from 'url';
import { spawn } from 'child_process';

const __dirname = dirname(fileURLToPath(import.meta.url));
const root = join(__dirname, '..');
const outDir = join(root, '..', 'docs', 'captures', 'task-004.6');
mkdirSync(outDir, { recursive: true });

function waitPort(port, ms = 20000) {
  const start = Date.now();
  return new Promise((resolve, reject) => {
    const tryOnce = () => {
      const req = createServer().listen(port, '127.0.0.1', () => {
        req.close(() => resolve(false));
      });
      req.on('error', () => {
        if (Date.now() - start > ms) reject(new Error('timeout waiting for port'));
        else setTimeout(() => resolve(true), 200);
      });
    };
    // If listen fails, port is in use (server up).
    const probe = createServer();
    probe.once('error', () => {
      probe.close?.();
      resolve(true);
    });
    probe.listen(port, '127.0.0.1', () => {
      probe.close(() => {
        if (Date.now() - start > ms) reject(new Error('server not up'));
        else setTimeout(tryOnce, 300);
      });
    });
  });
}

async function ensureServer() {
  try {
    const res = await fetch('http://127.0.0.1:3000/api/state');
    if (res.ok) return null;
  } catch {
    /* start */
  }
  const child = spawn(process.execPath, ['server.mjs'], {
    cwd: root,
    stdio: 'ignore',
    detached: true
  });
  child.unref();
  for (let i = 0; i < 40; i++) {
    await new Promise((r) => setTimeout(r, 250));
    try {
      const res = await fetch('http://127.0.0.1:3000/api/state');
      if (res.ok) return child;
    } catch {
      /* retry */
    }
  }
  throw new Error('preview server failed to start');
}

const started = await ensureServer();
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1920, height: 1080 } });

await page.goto('http://127.0.0.1:3000/', { waitUntil: 'networkidle' });
// Skip splash / pick first profile if needed
await page.waitForTimeout(900);
const profile = page.locator('[data-action="select-profile"]').first();
if (await profile.count()) {
  await profile.click();
  await page.waitForTimeout(500);
}
await page.screenshot({ path: join(outDir, '01-hub.png'), fullPage: false });

const searchBtn = page.locator('[data-action="open-search"]').first();
if (await searchBtn.count()) {
  await searchBtn.click();
} else {
  await page.evaluate(async () => {
    await fetch('/api/search', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ query: '', filter: 'all' })
    });
    location.reload();
  });
  await page.waitForTimeout(800);
}
await page.waitForTimeout(400);
await page.screenshot({ path: join(outDir, '02-search-idle.png'), fullPage: false });

await page.fill('#searchInput', 'a');
await page.waitForTimeout(600);
await page.screenshot({ path: join(outDir, '03-search-results.png'), fullPage: false });

const filmFilter = page.locator('[data-action="search-filter"][data-id="films"]').first();
if (await filmFilter.count()) {
  await filmFilter.click();
  await page.waitForTimeout(400);
  await page.screenshot({ path: join(outDir, '04-search-filter-films.png'), fullPage: false });
}

await browser.close();
console.log('Captures written to', outDir);
if (started) {
  try {
    process.kill(-started.pid);
  } catch {
    /* ignore */
  }
}
