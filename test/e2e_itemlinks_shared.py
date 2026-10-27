# Item links on a shared list (v0.2.7): Alice puts a link on an item, Bob sees it and can open it; Bob removes it.
# Run from repo root with `python3 -m http.server 8765` in public/ and `node test/mock-cloud.mjs` running (restart it fresh first).
import asyncio, os, re
from playwright.async_api import async_playwright
URL = 'http://localhost:8765/'
MOCK = 'http://localhost:8766'
OUT = os.environ.get('SHOTS', '/tmp/shots/')
os.makedirs(OUT, exist_ok=True)
CONFIG = f"""export const CLOUD = {{ region: 'us-east-1', userPoolId: 'us-east-1_test', clientId: 'testclient', apiUrl: '{MOCK}', cognitoEndpoint: '{MOCK}/' }};
export const cloudReady = () => true;"""

async def phone(b, errs, name):
    ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True, service_workers='block')  # (the service worker would bypass the config override below)
    await ctx.route('**/js/config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=CONFIG))
    pg = await ctx.new_page()
    pg.on('console', lambda m: errs.append(f'{name}: {m.text}') if m.type == 'error' else None)
    pg.on('pageerror', lambda e: errs.append(f'{name}: {e}'))
    pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
    await pg.goto(URL); await pg.wait_for_selector('.progress')
    return pg

async def settings(pg):
    await pg.click('nav a[data-route=sys]'); await pg.wait_for_selector('.sys')
async def today(pg):
    await pg.click('nav a[data-route=today]'); await pg.wait_for_selector('.progress')
async def add(pg, text):
    q = pg.locator('.quick input'); await q.fill(text); await q.press('Enter'); await pg.wait_for_timeout(250)
async def sync(pg):
    await pg.evaluate("import('./js/sync.js').then(m => m.syncNow())"); await pg.wait_for_timeout(500)
async def signup(pg, email):
    await settings(pg); await pg.click('[data-action=signup]'); await pg.wait_for_selector('#accForm')
    await pg.fill('#acc-email', email); await pg.fill('#acc-password', 'correct horse 1'); await pg.click('#accForm [type=submit]')
    await pg.wait_for_selector('#acc-code'); await pg.fill('#acc-code', '123456'); await pg.click('#accForm [type=submit]'); await pg.wait_for_timeout(1500)
async def card(pg, title):
    return pg.locator('.sharedcard', has_text=title)
async def code_from_invite(pg, title):
    c = await card(pg, title); await c.locator('.more').click(); await pg.wait_for_selector('.menu')
    await pg.click('.menu [data-x=invite]'); await pg.wait_for_selector('.joincode')
    return re.sub(r'\s', '', await pg.locator('.joincode').inner_text())

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        a = await phone(b, errs, 'A'); bb = await phone(b, errs, 'B')
        await signup(a, 'alice@example.com'); await signup(bb, 'bob@example.com')
        await today(a); await add(a, '#shared home: couch, rug')
        code = await code_from_invite(a, 'home'); await a.click('[data-x=done]')
        await settings(bb); await bb.click('[data-action=joinshared]'); await bb.fill('#j-code', code); await bb.click('#joinForm [type=submit]'); await bb.wait_for_timeout(1200)
        await today(bb)

        k = await card(a, 'home'); li = k.locator('li', has_text='couch')
        await li.locator('.itxt.tap').click(); await a.wait_for_timeout(450)
        assert await li.locator('.inone').is_visible()
        await a.screenshot(path=OUT + 'shared_box_empty.png')
        await li.locator('[data-action=itemlink]').click(); await a.wait_for_selector('#linkForm')
        await a.fill('#lk-url', 'https://store.com/couch'); await a.click('#linkForm [type=submit]'); await a.wait_for_timeout(500)
        k = await card(a, 'home'); li = k.locator('li', has_text='couch')
        assert await li.locator('a.iopen').get_attribute('href') == 'https://store.com/couch'
        assert await k.locator('.ibox.open').count() == 1
        await a.screenshot(path=OUT + 'shared_box_link.png', full_page=True)
        await sync(a); await sync(bb); await bb.wait_for_timeout(400)

        kb = await card(bb, 'home'); lb = kb.locator('li', has_text='couch')
        assert await lb.locator('.lmark').count() == 1, 'Bob sees the item has a link'
        await lb.locator('.itxt.tap').click(); await bb.wait_for_timeout(450)
        assert await lb.locator('a.iopen').get_attribute('href') == 'https://store.com/couch'
        assert await kb.locator('li', has_text='rug').locator('.lmark').count() == 0
        # checking the item (by Bob) keeps the link, and Alice still has it
        await lb.locator('.chk').click(); await bb.wait_for_timeout(300)
        await sync(bb); await sync(a); await a.wait_for_timeout(300)
        ka = await card(a, 'home'); assert await ka.locator('li', has_text='couch').locator('.lmark').count() == 1
        assert await ka.locator('li.done .by').inner_text() == 'Bob'
        # Bob removes the link; Alice's copy loses it too
        await lb.locator('[data-action=itemlink]').click(); await bb.wait_for_selector('#linkForm'); await bb.click('#linkForm [data-x=remove]'); await bb.wait_for_timeout(400)
        await sync(bb); await sync(a); await a.wait_for_timeout(300)
        ka = await card(a, 'home'); assert await ka.locator('li', has_text='couch').locator('.lmark').count() == 0, 'removal reaches Alice'
        assert not errs, errs
        await b.close(); print('item-link box tests passed (shared)')
asyncio.run(main())
