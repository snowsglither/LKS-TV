#!/usr/bin/env node
/**
 * TASK-008 language smoke — ISO 639 / BCP 47 / editions.
 */
import assert from 'node:assert/strict';
import {
  normalizeLanguageTag,
  languageDisplayName,
  detectMediaLanguage,
  matchesPreferredLanguage,
  isEditionTag
} from '../lib/languages.js';
import { versionLabel } from '../lib/displayMeta.js';

const cases = [
  ['NL', 'nl', 'Néerlandais'],
  ['FR', 'fr', 'Français'],
  ['EN', 'en', 'Anglais'],
  ['AR', 'ar', 'Arabe'],
  ['TR', 'tr', 'Turc'],
  ['PT-BR', 'pt-BR', 'Portugais (Brésil)'],
  ['zh-Hant', 'zh-Hant', 'Chinois traditionnel'],
  ['FRA', 'fr', 'Français'],
  ['NLD', 'nl', 'Néerlandais'],
  ['DUT', 'nl', 'Néerlandais'],
  ['ENG', 'en', 'Anglais'],
  ['DEU', 'de', 'Allemand'],
  ['GER', 'de', 'Allemand'],
  ['JPN', 'ja', 'Japonais'],
  ['POR', 'pt', 'Portugais'],
  ['MULTI', 'edition:multi', 'Multi'],
  ['VF', 'edition:vf', 'VF'],
  ['VO', 'edition:vo', 'VO']
];

for (const [raw, expectNorm, expectName] of cases) {
  assert.equal(normalizeLanguageTag(raw), expectNorm, `normalize ${raw}`);
  assert.equal(languageDisplayName(raw), expectName, `display ${raw}`);
}

assert.equal(isEditionTag('edition:vf'), true);
assert.equal(isEditionTag('fr'), false);
assert.equal(languageDisplayName('', { useful: true }), 'Langue non renseignée');
assert.equal(languageDisplayName('', { useful: false }), '');

const rare = languageDisplayName('eu');
assert.ok(rare && !/unknown/i.test(rare), `rare language got: ${rare}`);

assert.equal(detectMediaLanguage('[VF] Film').language, 'edition:vf');
assert.equal(detectMediaLanguage('Film MULTI').language, 'edition:multi');
assert.equal(detectMediaLanguage('Serie (NL)').language, 'nl');
assert.equal(detectMediaLanguage('Film [ARA]').language, 'ar');
assert.equal(detectMediaLanguage('Anime [JPN]').language, 'ja');
assert.equal(detectMediaLanguage('Dizi [TUR]').language, 'tr');
assert.equal(detectMediaLanguage('Filme [POR]').language, 'pt');

assert.equal(matchesPreferredLanguage('fr', 'edition:vf'), true);
assert.equal(matchesPreferredLanguage('en', 'edition:vf'), false);
assert.equal(matchesPreferredLanguage('edition:multi', 'MULTI'), true);

const label = versionLabel(
  { languageTag: '', language: 'UNKNOWN', rawTitle: 'Cross S01 1080p', containerExtension: 'mkv' },
  { index: 0, total: 3, groupName: 'Action' }
);
assert.ok(!/unknown/i.test(label), `label: ${label}`);
assert.ok(!/langue inconnue/i.test(label), `label: ${label}`);

console.log('smoke-languages: OK');
