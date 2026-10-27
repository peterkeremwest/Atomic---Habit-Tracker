# Item-link box browser test (v0.2.7): tap an item, its box opens; add / change / remove its link; OPEN goes to the browser.
# Private lists, notes and task steps, plus a shared list against test/mock-cloud.mjs.
# Run from repo root with `python3 -m http.server 8765` in public/ and `node test/mock-cloud.mjs` running.
import asyncio, os
from playwright.async_api import async_playwright
URL = 'http://localhost:8765/'
MOCK = 'http://localhost:8766'
OUT = os.environ.get('SHOTS', '/tmp/shots/'); os.makedirs(OUT, exist_ok=True)
CONFIG = f"""export const CLOUD = {{ region: 'us-east-1', userPoolId: 'us-east-1_test', clientId: 'testclient', apiUrl: '{MOCK}', cognitoEndpoint: '{MOCK}/' }};
export const cloudReady = () => true;"""

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True, service_workers='block')
        await ctx.route('**/js/config.js', lambda r: r.fulfill(status=200, content_type='text/javascript', body=CONFIG))
        await ctx.route(lambda u: 'localhost' not in u, lambda r: r.fulfill(status=200, content_type='text/html', body='<title>ok</title>'))  # no real internet needed
        pg = await ctx.new_page()
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        pg.on('dialog', lambda d: asyncio.ensure_future(d.accept()))
        await pg.goto(URL); await pg.wait_for_selector('.progress')
        q = pg.locator('.quick input')
        async def add(t): await q.fill(t); await q.press('Enter'); await pg.wait_for_timeout(250)
        async def open_boxes(): return await pg.locator('.ibox.open').count()

        # ---- a private list ----
        await add('#list shopping: couch, lamp, see https://store.com/cart#top')
        card = pg.locator('.listcard', has_text='shopping')
        couch = card.locator('li', has_text='couch'); lamp = card.locator('li', has_text='lamp')
        assert await open_boxes() == 0 and not await couch.locator('.iopen').is_visible(), 'boxes start closed'
        await couch.locator('.itxt.tap').click(); await pg.wait_for_timeout(500)
        assert await open_boxes() == 1 and await couch.locator('.ibox-in').is_visible()
        assert await couch.locator('.inone').is_visible(), 'says there is no link yet'
        assert await couch.locator('.itxt.tap').get_attribute('aria-expanded') == 'true'
        await pg.screenshot(path=OUT + 'box_empty.png')
        # add a link: a bad one is refused, a good one is saved and the box stays open
        await couch.locator('[data-action=itemlink]').click(); await pg.wait_for_selector('#linkForm')
        await pg.fill('#lk-url', 'not a link'); await pg.click('#linkForm [type=submit]')
        assert "doesn't look like" in await pg.locator('#lk-err').inner_text()
        await pg.fill('#lk-url', 'store.com/couch?id=7'); await pg.click('#linkForm [type=submit]'); await pg.wait_for_timeout(500)
        o = card.locator('li', has_text='couch').locator('a.iopen')
        assert await o.get_attribute('href') == 'https://store.com/couch?id=7' and await o.get_attribute('target') == '_blank' and 'noopener' in await o.get_attribute('rel')
        assert await open_boxes() == 1, 'box stays open after saving'
        assert await card.locator('li', has_text='couch').locator('.lmark').count() == 1, 'item shows it has a link'
        assert await card.locator('li', has_text='lamp').locator('.lmark').count() == 0
        await pg.screenshot(path=OUT + 'box_link.png')
        # OPEN really leaves for the browser (a new tab)
        async with ctx.expect_page() as newp:
            await o.click()
        np = await newp.value; assert 'store.com' in np.url, np.url; await np.close()
        # opening another item closes this one; tapping the open one closes it
        await lamp.locator('.itxt.tap').click(); await pg.wait_for_timeout(450)
        assert await open_boxes() == 1 and await lamp.locator('.ibox').evaluate("e => e.classList.contains('open')")
        assert not await card.locator('li', has_text='couch').locator('a.iopen').is_visible(), 'closed box is hidden'
        await lamp.locator('.itxt.tap').click(); await pg.wait_for_timeout(450)
        assert await open_boxes() == 0
        # tapping the checkbox checks, and does not open a box; a link inside the text opens itself, not the box
        await lamp.locator('.chk').click(); await pg.wait_for_timeout(250)
        assert await open_boxes() == 0 and await pg.locator('.listcard', has_text='shopping').locator('li', has_text='lamp.*').count() >= 0
        cart = card.locator('li', has_text='store.com/cart')
        a = cart.locator('a.ilink'); assert await a.get_attribute('href') == 'https://store.com/cart#top'
        async with ctx.expect_page() as newp2:
            await a.click()
        np2 = await newp2.value; await np2.close()
        assert await open_boxes() == 0, 'tapping a link in the text must not open the box'
        # the link survives: editing the text, checking, and a reload
        await pg.locator('.listcard', has_text='shopping').locator('li', has_text='couch').locator('.ed').click(); await pg.wait_for_selector('#itemForm')
        await pg.fill('#it-text', 'big couch'); await pg.click('#itemForm [type=submit]'); await pg.wait_for_timeout(300)
        li = pg.locator('.listcard', has_text='shopping').locator('li', has_text='big couch')
        assert await li.locator('.lmark').count() == 1, 'editing the text keeps the link'
        await li.locator('.chk').click(); await pg.wait_for_timeout(250)
        assert await pg.locator('.listcard', has_text='shopping').locator('li', has_text='big couch').locator('.lmark').count() == 1
        await pg.reload(); await pg.wait_for_selector('.progress')
        li = pg.locator('.listcard', has_text='shopping').locator('li', has_text='big couch')
        assert await li.locator('.lmark').count() == 1 and await li.locator('a.iopen').get_attribute('href') == 'https://store.com/couch?id=7', 'link kept after reload'
        # change, then remove
        await li.locator('.itxt.tap').click(); await pg.wait_for_timeout(450)
        await li.locator('[data-action=itemlink]').click(); await pg.wait_for_selector('#linkForm')
        assert await pg.input_value('#lk-url') == 'https://store.com/couch?id=7'
        await pg.click('#linkForm [data-x=remove]'); await pg.wait_for_timeout(400)
        li = pg.locator('.listcard', has_text='shopping').locator('li', has_text='big couch')
        assert await li.locator('.lmark').count() == 0 and await li.locator('.inone').is_visible()
        # undo brings it back
        await pg.click('#toast .undo'); await pg.wait_for_timeout(400)
        assert await pg.locator('.listcard', has_text='shopping').locator('li', has_text='big couch').locator('.lmark').count() == 1, 'undo restores the link'

        # ---- a note's item and a task's step ----
        await add('#note books: dune, piranesi')
        await pg.click('nav a[data-route=notes]'); await pg.wait_for_selector('.notecard')
        await pg.locator('.notecard', has_text='books').locator('li', has_text='dune').locator('.itxt.tap').click(); await pg.wait_for_timeout(450)
        n = pg.locator('.notecard', has_text='books').locator('li', has_text='dune')
        await n.locator('[data-action=itemlink]').click(); await pg.wait_for_selector('#linkForm')
        await pg.fill('#lk-url', 'https://library.org/dune'); await pg.click('#linkForm [type=submit]'); await pg.wait_for_timeout(400)
        assert await pg.locator('.notecard', has_text='books').locator('li', has_text='dune').locator('a.iopen').get_attribute('href') == 'https://library.org/dune'
        await pg.click('nav a[data-route=today]'); await pg.wait_for_selector('.progress')
        await add('move out: pack, clean')
        t = pg.locator('.row', has_text='move out').locator('xpath=..')
        step = pg.locator('.steps li', has_text='pack')
        await step.locator('.itxt.tap').click(); await pg.wait_for_timeout(450)
        await step.locator('[data-action=itemlink]').click(); await pg.wait_for_selector('#linkForm')
        await pg.fill('#lk-url', 'https://boxes.com'); await pg.click('#linkForm [type=submit]'); await pg.wait_for_timeout(400)
        assert await pg.locator('.steps li', has_text='pack').locator('a.iopen').get_attribute('href') == 'https://boxes.com'
        await pg.screenshot(path=OUT + 'box_steps.png', full_page=True)

        assert not errs, errs
        await b.close()
        print('item-link box tests passed (private)')
asyncio.run(main())
