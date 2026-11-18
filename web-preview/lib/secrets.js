/**
 * Encrypted Xtream secrets for web-preview.
 * Ciphertext on disk under .data/ — never returned by API.
 * Key: derived from machine id + local key file (not in git).
 */
import crypto from 'crypto';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const dataDir = path.join(__dirname, '..', '.data');
const keyPath = path.join(dataDir, 'preview.key');
const vaultPath = path.join(dataDir, 'xtream-vault.enc.json');

function ensureKey() {
  fs.mkdirSync(dataDir, { recursive: true });
  if (!fs.existsSync(keyPath)) {
    const seed = `${os.hostname()}|${os.userInfo().username}|${crypto.randomBytes(32).toString('hex')}`;
    const key = crypto.createHash('sha256').update(seed).digest();
    fs.writeFileSync(keyPath, key.toString('base64'), { mode: 0o600 });
  }
  return Buffer.from(fs.readFileSync(keyPath, 'utf8'), 'base64');
}

function encryptJson(obj) {
  const key = ensureKey();
  const iv = crypto.randomBytes(12);
  const cipher = crypto.createCipheriv('aes-256-gcm', key, iv);
  const plaintext = Buffer.from(JSON.stringify(obj), 'utf8');
  const enc = Buffer.concat([cipher.update(plaintext), cipher.final()]);
  const tag = cipher.getAuthTag();
  return {
    v: 1,
    iv: iv.toString('base64'),
    tag: tag.toString('base64'),
    data: enc.toString('base64')
  };
}

function decryptJson(payload) {
  if (!payload?.data) return {};
  const key = ensureKey();
  const iv = Buffer.from(payload.iv, 'base64');
  const tag = Buffer.from(payload.tag, 'base64');
  const data = Buffer.from(payload.data, 'base64');
  const decipher = crypto.createDecipheriv('aes-256-gcm', key, iv);
  decipher.setAuthTag(tag);
  const plain = Buffer.concat([decipher.update(data), decipher.final()]).toString('utf8');
  return JSON.parse(plain);
}

function readVault() {
  if (!fs.existsSync(vaultPath)) return {};
  try {
    const raw = JSON.parse(fs.readFileSync(vaultPath, 'utf8'));
    return decryptJson(raw);
  } catch {
    return {};
  }
}

function writeVault(map) {
  fs.mkdirSync(dataDir, { recursive: true });
  fs.writeFileSync(vaultPath, JSON.stringify(encryptJson(map), null, 2), { mode: 0o600 });
}

/** In-memory cache (process lifetime). */
const memory = new Map();

export function putXtreamSecret(sourceId, username, password) {
  memory.set(sourceId, { username, password });
  const vault = readVault();
  vault[sourceId] = { username, password };
  writeVault(vault);
}

export function getXtreamSecret(sourceId) {
  if (memory.has(sourceId)) return memory.get(sourceId);
  const vault = readVault();
  if (vault[sourceId]) {
    memory.set(sourceId, vault[sourceId]);
    return vault[sourceId];
  }
  return null;
}

export function deleteXtreamSecret(sourceId) {
  memory.delete(sourceId);
  const vault = readVault();
  if (vault[sourceId]) {
    delete vault[sourceId];
    writeVault(vault);
  }
}

export function hasXtreamSecret(sourceId) {
  return !!getXtreamSecret(sourceId);
}

/** Warm memory from vault on boot. */
export function loadSecretsIntoMemory() {
  const vault = readVault();
  for (const [id, creds] of Object.entries(vault)) {
    if (creds?.username && creds?.password) memory.set(id, creds);
  }
  return memory.size;
}
