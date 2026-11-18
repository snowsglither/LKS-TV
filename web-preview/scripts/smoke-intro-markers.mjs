import assert from 'assert';
import {
  reliableIntroWindow,
  shouldShowSkipIntro,
  markersForEpisode
} from '../lib/introMarkers.js';

assert.equal(reliableIntroWindow(null), null);
assert.equal(reliableIntroWindow({}), null);
assert.equal(reliableIntroWindow({ introEndSec: 0 }), null);
assert.equal(reliableIntroWindow({ introStartSec: 10, introEndSec: 10 }), null);

const win = reliableIntroWindow({ introStartSec: 2, introEndSec: 45 });
assert.deepEqual(win, { introStartSec: 2, introEndSec: 45 });

assert.equal(shouldShowSkipIntro({ introEndSec: 40 }, 5), true);
assert.equal(shouldShowSkipIntro({ introEndSec: 40 }, 40), false);
assert.equal(shouldShowSkipIntro(null, 5), false);

assert.equal(markersForEpisode({ ep1: { introEndSec: 30 } }, 'ep1')?.introEndSec, 30);
assert.equal(markersForEpisode({ ep1: { introEndSec: 30 } }, 'missing'), null);

console.log('smoke-intro-markers: OK');
