/**
 * Copy portable modules from shared/js (and fallback web-preview/lib) into tizen-tv/js/lib.
 */
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const root = path.resolve(__dirname, '../..');
const dest = path.resolve(__dirname, '../js/lib');
const shared = path.join(root, 'shared', 'js');
const preview = path.join(root, 'web-preview', 'lib');

const FILES = [
  'languages.js',
  'displayMeta.js',
  'seriesIdentity.js',
  'catalog.js',
  'workIdentity.js',
  'searchEngine.js',
  'continueWatching.js',
  'episodeProgress.js',
  'groupSelection.js',
  'liveIndex.js',
  'liveCatalog.js',
  'navStack.js',
  'arrayUtil.js',
  'urlGuard.js',
  'xtreamClient.js',
  'demoCatalog.js',
  'recommendations.js',
  'titleAliases.js'
];

fs.mkdirSync(dest, { recursive: true });
for (const f of FILES) {
  const fromShared = path.join(shared, f);
  const fromPreview = path.join(preview, f);
  const src = fs.existsSync(fromShared) ? fromShared : fromPreview;
  if (!fs.existsSync(src)) throw new Error(`Missing shared module: ${f}`);
  fs.copyFileSync(src, path.join(dest, f));
  console.log('synced', f, '←', path.relative(root, src));
}
console.log('OK', FILES.length, 'modules → tizen-tv/js/lib');
