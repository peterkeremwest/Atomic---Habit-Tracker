# Shared-list browser test: three phones against test/mock-cloud.mjs (fake Cognito + the real data and shared-list clerks).
# Run from repo root with `python3 -m http.server 8765` in public/ and `node test/mock-cloud.mjs` running.
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
        a = await phone(b, errs, 'A'); bb = await phone(b, errs, 'B'); c = await phone(b, errs, 'C')

        # signed out: the quick add asks you to sign in instead of making a list nobody could share
        await add(a, '#shared errands: milk, stamps')
        assert await a.locator('#accForm').count() == 1, 'asks to sign in'
        await a.keyboard.press('Escape')
        await signup(a, 'alice@example.com'); await signup(bb, 'bob@example.com'); await signup(c, 'carol@example.com')

        # A makes a shared list from the typing box, next to a private task
        await today(a); await add(a, 'buy a gift tomorrow'); await add(a, '#shared errands: milk, stamps')
        assert await a.locator('section[data-sec="today:shared"]').count() == 1
        k = await card(a, 'errands'); txt = await k.inner_text(); print('A card:', ' | '.join(txt.split('\n')[:4]))
        assert 'only you so far' in txt and await k.locator('.items li').count() == 2
        await a.screenshot(path=OUT + 's1-alice-new-list.png')

        # A invites; B joins with the code
        code = await code_from_invite(a, 'errands'); print('code', code); assert re.fullmatch(r'[A-Z2-9]{8}', code)
        await a.screenshot(path=OUT + 's2-invite.png'); await a.click('[data-x=done]')
        await settings(bb); await bb.click('[data-action=joinshared]'); await bb.wait_for_selector('#joinForm')
        await bb.fill('#j-code', 'WRONGCOD'); await bb.click('#joinForm [type=submit]'); await bb.wait_for_timeout(500)
        err = await bb.locator('#j-err').inner_text(); print('wrong code ->', err); assert "isn't valid" in err
        await bb.fill('#j-code', code.lower()); await bb.click('#joinForm [type=submit]'); await bb.wait_for_timeout(1200)
        await today(bb)
        k = await card(bb, 'errands'); txt = await k.inner_text(); print('B card:', ' | '.join(txt.split('\n')[:5]))
        assert 'with Alice' in txt and await k.locator('.items li').count() == 2, 'B sees the list and both items'
        assert await bb.locator('.row', has_text='buy a gift').count() == 0, 'A private task stays private'

        # C cannot use the same code (works once)
        await settings(c); await c.click('[data-action=joinshared]'); await c.fill('#j-code', code); await c.click('#joinForm [type=submit]'); await c.wait_for_timeout(600)
        print('used code ->', await c.locator('#j-err').inner_text()); assert "isn't valid" in await c.locator('#j-err').inner_text()
        await c.keyboard.press('Escape')

        # B sets a name, checks milk; A sees who did it
        await settings(bb); await bb.fill('#sharedName', 'Bobby'); await bb.press('#sharedName', 'Enter'); await bb.wait_for_timeout(300)
        await today(bb); k = await card(bb, 'errands')
        await k.locator('li', has_text='milk').locator('.chk').click(); await bb.wait_for_timeout(300)
        assert (await k.locator('li.done .by').inner_text()) == 'you'
        await sync(bb); await sync(a); await today(a)
        k = await card(a, 'errands'); txt = await k.inner_text()
        done_by = await k.locator('li.done .by').all_inner_texts(); print('A sees milk checked by', done_by, '| meta:', txt.split('\n')[2])
        assert done_by == ['Bobby'] and 'with Bobby' in txt
        # A adds and checks an item; B sees both
        f = k.locator('form.additem input'); await f.fill('eggs'); await f.press('Enter'); await a.wait_for_timeout(300)
        k = await card(a, 'errands'); await k.locator('li', has_text='stamps').locator('.chk').click(); await a.wait_for_timeout(300)
        await sync(a); await sync(bb); await today(bb)
        k = await card(bb, 'errands'); items = await k.locator('.items li').count(); dn = await k.locator('li.done .by').all_inner_texts()
        print('B sees', items, 'items; checked by', dn); assert items == 3 and sorted(dn) == ['Alice', 'you']
        # a link on the list: A adds it, B sees the button
        k = await card(a, 'errands'); await k.locator('.more').click(); await a.click('.menu [data-x=link]'); await a.wait_for_selector('#linkForm')
        await a.fill('#lk-url', 'store.com/shopping/42'); await a.click('#linkForm [type=submit]'); await a.wait_for_timeout(300)
        await sync(a); await sync(bb); await today(bb)
        chip = (await card(bb, 'errands')).locator('a.chiplink'); print('B sees link', await chip.get_attribute('href'))
        assert await chip.get_attribute('href') == 'https://store.com/shopping/42'
        await bb.screenshot(path=OUT + 's3-bob-list.png'); await a.screenshot(path=OUT + 's4-alice-list.png')
        # both check different items at the same moment: nobody's check-off is lost
        await a.evaluate("import('./js/shared.js').then(async S => { const it = S.itemsOf(S.liveLists()[0].id).find(i => i.text === 'eggs'); await S.toggleItem(it.id); })")
        await bb.evaluate("import('./js/shared.js').then(async S => { const it = S.itemsOf(S.liveLists()[0].id).find(i => i.text === 'eggs'); await S.removeItem(it.id); })")
        await sync(a); await sync(bb); await sync(a)
        n = await a.evaluate("import('./js/shared.js').then(S => S.itemsOf(S.liveLists()[0].id).length)"); print('items on A after remove', n); assert n == 2

        # a link opened while signed out: sign in first, then it carries on
        await today(bb); await add(bb, '#shared trip: tickets')
        code2 = await code_from_invite(bb, 'trip'); await bb.click('[data-x=done]')
        await c.evaluate("import('./js/sync.js').then(m => m.signOutAndClear(true))"); await c.wait_for_timeout(500)
        await c.goto(URL + '#/join/' + code2); await c.wait_for_selector('#joinForm'); await c.wait_for_timeout(300)
        assert 'sign in first' in await c.locator('.inner').inner_text(), 'asks to sign in'
        await c.click('[data-x=signin]'); await c.wait_for_selector('#accForm')
        await c.fill('#acc-email', 'carol@example.com'); await c.fill('#acc-password', 'correct horse 1'); await c.click('#accForm [type=submit]')
        await c.wait_for_selector('#j-code', timeout=8000); assert (await c.input_value('#j-code')).upper() == code2, 'code carried over'
        await c.click('#joinForm [type=submit]'); await c.wait_for_timeout(1200)
        k = await card(c, 'trip'); print('C card:', ' | '.join((await k.inner_text()).split('\n')[:4])); assert 'with Bobby' in await k.inner_text()

        # B leaves errands; A keeps it
        await today(bb); k = await card(bb, 'errands'); await k.locator('.more').click(); await bb.click('.menu [data-x=leave]'); await bb.wait_for_timeout(1000)
        assert await bb.locator('.sharedcard', has_text='errands').count() == 0, 'B no longer has it'
        await sync(a); await today(a); k = await card(a, 'errands'); txt = await k.inner_text()
        assert 'only you so far' in txt and await k.locator('.items li').count() == 2, 'A keeps the list'
        # signing out clears shared lists from the device
        await settings(a); await a.click('[data-action=signout]'); await a.wait_for_timeout(800)
        left = await a.evaluate("import('./js/state.js').then(A => A.S.slists.length + A.S.sitems.length)"); assert left == 0
        errs = [e for e in errs if '404' not in e]  # (the wrong / already-used code attempts are answered with a 404 on purpose)
        print('ERRORS', errs); assert not errs
        await b.close()
asyncio.run(main())
