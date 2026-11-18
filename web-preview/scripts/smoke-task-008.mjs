/**
 * TASK-008 smoke: boot → profiles gate → select → hub continue row.
 */
import assert from 'assert';
import { chromium } from 'playwright';

const BASE = 'http://127.0.0.1:3000';

const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1280, height: 720 } });
await page.goto(BASE, { waitUntil: 'networkidle' });
await page.waitForTimeout(800);

let st = await (await fetch(`${BASE}/api/state`)).json();
assert.equal(st.activeProfileId, null, 'boot clears active profile');
assert.ok(st.screen === 'splash' || st.screen === 'profiles', `screen=${st.screen}`);

// Skip splash if needed
const skip = page.locator('[data-action=skip-splash]');
if (await skip.count()) {
  await skip.click();
  await page.waitForTimeout(400);
}

assert.ok(await page.locator('.profiles-brand, .profiles h1').count());
assert.ok(await page.locator('[data-action=select-profile]').count() >= 1);
assert.ok(await page.locator('[data-action=add-profile]').count() >= 1);

await page.locator('[data-action=select-profile]').first().click();
await page.waitForTimeout(700);
st = await (await fetch(`${BASE}/api/state`)).json();
assert.ok(st.activeProfileId, 'profile selected');
assert.equal(st.screen, 'hub');
assert.ok(Array.isArray(st.continueWatching), 'continueWatching array');

// Switch profile via side account → gate again
await page.locator('[data-action=nav][data-screen=profiles]').first().click();
await page.waitForTimeout(500);
st = await (await fetch(`${BASE}/api/state`)).json();
assert.equal(st.activeProfileId, null, 'nav to profiles clears active');
assert.equal(st.screen, 'profiles');

console.log('smoke-task-008: OK', {
  continueCount: (await (async () => {
    await page.locator('[data-action=select-profile]').first().click();
    await page.waitForTimeout(500);
    return (await (await fetch(`${BASE}/api/state`)).json()).continueWatching?.length;
  })())
});
await browser.close();
