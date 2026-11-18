#!/usr/bin/env node
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { loadState, getXtreamSecret } from '../lib/session.js';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const state = loadState();
const src = (state.sources || []).find((s) => s.kind === 'XTREAM' && s.enabled);
if (!src) {
  console.log('no xtream source');
  process.exit(0);
}
const creds = getXtreamSecret(src.id);
const xml = new URL(`${String(src.endpoint).replace(/\/$/, '')}/xmltv.php`);
xml.searchParams.set('username', creds.username);
xml.searchParams.set('password', creds.password);
console.log('fetching xmltv…');
const t0 = Date.now();
const res = await fetch(xml);
const buf = Buffer.from(await res.arrayBuffer());
console.log('fetched', buf.length, 'bytes in', Date.now() - t0, 'ms');
const headPath = path.join(__dirname, '..', '.data', 'epg-sample-head.xml');
fs.writeFileSync(headPath, buf.subarray(0, 80000));
const text = buf.toString('utf8', 0, Math.min(buf.length, 400000));
const channelIds = [...text.matchAll(/<channel id="([^"]+)">/g)].map((m) => m[1]);
const displayNames = [...text.matchAll(/<display-name>([^<]+)<\/display-name>/g)].map((m) => m[1]);
console.log('sample channel ids', channelIds.slice(0, 12));
console.log('sample names', displayNames.slice(0, 12));
console.log('channels in head chunk', channelIds.length);
const progCount = [...text.matchAll(/<programme /g)].length;
console.log('programmes in head chunk', progCount);

// Normalize helper
const norm = (s) =>
  String(s || '')
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

const nameIndex = new Map();
for (let i = 0; i < displayNames.length; i++) {
  nameIndex.set(norm(displayNames[i]), channelIds[i] || displayNames[i]);
}

let matched = 0;
const lives = (state.catalog.titles || []).filter((t) => t.type === 'LIVE').slice(0, 500);
for (const t of lives) {
  const n = norm(t.canonicalTitle.replace(/^\|[^\|]*\|/, ''));
  if (nameIndex.has(n) || [...nameIndex.keys()].some((k) => k.includes(n) || n.includes(k))) {
    matched++;
  }
}
console.log('loose name matches in first 500 lives vs head names', matched);
