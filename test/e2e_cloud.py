# Cloud sync browser test: two phones, one account, against test/mock-cloud.mjs (fake Cognito + the real data clerk).
# Run from repo root with `python3 -m http.server 8765` in public/ and `node test/mock-cloud.mjs` running.
import asyncio, os, json, urllib.request
from playwright.async_api import async_playwright
URL = 'http://localhost:8765/'
MOCK = 'http://localhost:8766'
OUT = '/tmp/claude-0/shots/'
os.makedirs(OUT, exist_ok=True)
CONFIG = f"""export const CLOUD = {{ region: 'us-east-1', userPoolId: 'us-east-1_test', clientId: 'testclient', apiUrl: '{MOCK}', cognitoEndpoint: '{MOCK}/' }};
export const cloudReady = () => true;"""
rows = lambda: json.load(urllib.request.urlopen(MOCK + '/__rows'))

async def phone(b, errs, name):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
    await ctx.route('**/js/config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=CONFIG))
    pg = await ctx.new_page()
    pg.on('console', lambda m: errs.append(f'{name}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(f'{name}: {e}'))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto(URL); await pg.wait_for_selector('.progress')
    return pg

async def add(pg, text):
    q = pg.locator('.quick input'); await q.fill(text); await q.press('Enter'); await pg.wait_for_timeout(150)

async def settings(pg):
    await pg.click('nav a[data-route=sys]'); await pg.wait_for_selector('.sys')

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        a = await phone(b, errs, 'A')
        await add(a, 'read 20 min daily #personal'); await add(a, 'car repair: tires $10 brakes $50')
        await settings(a)
        assert 'SIGN IN' in await a.locator('.sys').inner_text()
        await a.click('[data-action=signup]'); await a.wait_for_selector('#accForm')
        await a.fill('#acc-email', 'kerem@example.com'); await a.fill('#acc-password', 'short')
        await a.click('#accForm [type=submit]'); print('short pw ->', await a.locator('#acc-err').inner_text())
        await a.fill('#acc-password', 'correct horse 1'); await a.click('#accForm [type=submit]')
        await a.wait_for_selector('#acc-code'); await a.fill('#acc-code', '000000'); await a.click('#accForm [type=submit]'); await a.wait_for_timeout(200)
        print('bad code ->', await a.locator('#acc-err').inner_text())
        await a.fill('#acc-code', '123456'); await a.click('#accForm [type=submit]'); await a.wait_for_timeout(1500)
        txt = await a.locator('.sys').inner_text(); print('A settings:', ' | '.join(txt.split('\n')[:6]))
        assert 'kerem@example.com' in txt and 'synced' in txt
        r = rows(); print('cloud rows after first sign-in', r); assert r['rows'] >= 8  # 6 starter categories + subcategories + 2 items
        await a.screenshot(path=OUT + '20-settings-signed-in.png')
        # a change made after sign-in is sent on its own
        before = rows()['rows']
        await a.click('nav a[data-route=today]'); await add(a, 'call mom tomorrow'); await a.wait_for_timeout(2500)
        assert rows()['rows'] == before + 1, 'new task pushed'

        # second phone: signs in with the same account, gets everything, no duplicate starter categories
        bb = await phone(b, errs, 'B')
        await settings(bb); await bb.click('[data-action=signin]'); await bb.wait_for_selector('#accForm')
        await bb.fill('#acc-email', 'kerem@example.com'); await bb.fill('#acc-password', 'wrong password')
        await bb.click('#accForm [type=submit]'); await bb.wait_for_timeout(200); print('wrong pw ->', await bb.locator('#acc-err').inner_text())
        await bb.fill('#acc-password', 'correct horse 1'); await bb.click('#accForm [type=submit]'); await bb.wait_for_timeout(1500)
        await bb.click('nav a[data-route=today]'); await bb.wait_for_selector('.row')
        assert await bb.locator('.row', has_text='read 20').count() == 1
        assert await bb.locator('.expcard', has_text='car repair').count() == 1
        cats = await bb.evaluate("import('./js/state.js').then(A => A.live(A.S.elements).length)")
        cats_a = await a.evaluate("import('./js/state.js').then(A => A.live(A.S.elements).length)")
        print('categories A/B', cats_a, cats); assert cats == cats_a, 'no duplicate starter categories'
        # B checks the habit off; A picks it up
        await bb.locator('.row', has_text='read 20').locator('.chk').click(); await bb.wait_for_timeout(2500)
        await settings(a); await a.click('[data-action=syncnow]'); await a.wait_for_timeout(600)
        await a.click('nav a[data-route=today]'); await a.wait_for_selector('.row')
        assert await a.locator('.row.done', has_text='read 20').count() == 1, 'check-off synced from B to A'
        # both edit the same item offline-ish: newest wins
        await a.evaluate("import('./js/state.js').then(A => { const x = A.live(A.S.atoms).find(a => a.title === 'call mom'); return A.updateAtom(x.id, { title: 'call mom (A)' }); })")
        await a.wait_for_timeout(200)
        await bb.evaluate("import('./js/state.js').then(A => { const x = A.live(A.S.atoms).find(a => a.title === 'call mom'); return A.updateAtom(x.id, { title: 'call mom (B, newer)' }); })")
        await a.wait_for_timeout(2500); await bb.wait_for_timeout(500)
        await settings(a); await a.click('[data-action=syncnow]'); await a.wait_for_timeout(600)
        ta = await a.evaluate("import('./js/state.js').then(A => A.live(A.S.atoms).filter(a => a.title.startsWith('call mom')).map(a => a.title))")
        print('newest wins on A:', ta); assert ta == ['call mom (B, newer)']
        # sign out clears the device
        await a.click('[data-action=signout]'); await a.wait_for_timeout(800)
        assert 'SIGN IN' in await a.locator('.sys').inner_text()
        n = await a.evaluate("import('./js/state.js').then(A => A.live(A.S.atoms).length)"); print('A items after sign-out', n); assert n == 0
        await bb.click('nav a[data-route=sys]'); await bb.wait_for_selector('.sys'); await bb.screenshot(path=OUT + '21-settings-B.png')
        await bb.click('[data-action=signin]') if False else None
        print('ERRORS', errs)
        await b.close()
asyncio.run(main())
