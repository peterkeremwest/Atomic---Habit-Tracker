# Links browser test (no cloud needed): addresses inside items, and a list's own link button.
# Run from repo root with `python3 -m http.server 8765` in public/.
import asyncio, os
from playwright.async_api import async_playwright
URL = 'http://localhost:8765/'
OUT = os.environ.get('SHOTS', '/tmp/shots/'); os.makedirs(OUT, exist_ok=True)

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch(); errs = []
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True, service_workers='block')
        pg = await ctx.new_page()
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None); pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('.progress')
        q = pg.locator('.quick input')
        async def add(t): await q.fill(t); await q.press('Enter'); await pg.wait_for_timeout(250)
        await add('#list shopping: milk, see https://store.com/cart#top, soap')
        await add('#note books: dune, https://library.org/dune')
        a = pg.locator('.listcard', has_text='shopping').locator('a.ilink')
        assert await a.count() == 1 and await a.get_attribute('href') == 'https://store.com/cart#top' and await a.get_attribute('target') == '_blank'
        assert 'noopener' in await a.get_attribute('rel')
        assert await pg.locator('.listcard', has_text='shopping').locator('.items li').count() == 3, 'the #top in the address was not read as a category'
        # the list's own link, from its ⋯ menu
        card = pg.locator('.listcard', has_text='shopping')
        await card.locator('.more').click(); await pg.click('.menu [data-x=link]'); await pg.wait_for_selector('#linkForm')
        await pg.fill('#lk-url', 'not a link'); await pg.click('#linkForm [type=submit]')
        assert "doesn't look like" in await pg.locator('#lk-err').inner_text()
        await pg.fill('#lk-url', 'www.store.com/lists/7'); await pg.click('#linkForm [type=submit]'); await pg.wait_for_timeout(300)
        chip = pg.locator('.listcard', has_text='shopping').locator('a.chiplink')
        assert await chip.get_attribute('href') == 'https://www.store.com/lists/7' and 'store.com' in await chip.inner_text()
        await pg.screenshot(path=OUT + 'l1-list-link.png')
        # it survives a reload, and can be changed or removed
        await pg.reload(); await pg.wait_for_selector('.progress')
        assert await pg.locator('a.chiplink').count() == 1
        card = pg.locator('.listcard', has_text='shopping'); await card.locator('.more').click()
        assert 'Change or remove link' in await pg.locator('.menu').inner_text()
        await pg.click('.menu [data-x=link]'); await pg.wait_for_selector('#linkForm'); await pg.click('[data-x=remove]'); await pg.wait_for_timeout(300)
        assert await pg.locator('a.chiplink').count() == 0
        # the same on a note (notes live on the NOTES screen)
        await pg.click('nav a[data-route=notes]'); await pg.wait_for_selector('.notecard')
        assert await pg.locator('.notecard a.ilink').count() == 1
        await pg.locator('.notecard .more').click(); await pg.click('.menu [data-x=link]'); await pg.fill('#lk-url', 'https://library.org'); await pg.click('#linkForm [type=submit]'); await pg.wait_for_timeout(300)
        assert await pg.locator('.notecard a.chiplink').count() == 1
        print('ERRORS', errs); assert not errs
        await b.close()
asyncio.run(main())
