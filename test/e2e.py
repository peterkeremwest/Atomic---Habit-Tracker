# Browser test on a phone-sized screen. Run from repo root with a server on :8765 serving public/.
import re
import asyncio, os
from playwright.async_api import async_playwright
URL = 'http://localhost:8765/'
OUT = '/tmp/claude-0/shots/'
os.makedirs(OUT, exist_ok=True)

async def add(pg, text):
    q = pg.locator('.quick input'); await q.fill(text); await q.press('Enter'); await pg.wait_for_timeout(150)
    return await pg.locator('#toast').inner_text()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 390, 'height': 844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = await ctx.new_page()
        errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('.progress')
        await pg.screenshot(path=OUT + '1-empty.png')
        dow = await pg.evaluate("new Date().getDay()")
        days = ['sunday','monday','tuesday','wednesday','thursday','friday','saturday']
        print(await add(pg, f'#fitness workout {days[dow]} {days[(dow+2)%7]}'))
        print(await add(pg, 'read 20 min daily #personal !low'))
        print(await add(pg, 'water x8'))
        print(await add(pg, 'study AWS 3x a week #career/aws'))
        print(await add(pg, 'pay rent monthly 1st #money'))
        print(await add(pg, 'deep clean monthly #home'))
        print(await add(pg, 'renew passport #home'))
        print(await add(pg, 'meditate daily #mindfulness'))
        print(await add(pg, '#timeblock work 5 pm - 11pm'))
        print(await add(pg, '#timeblock date 2pm-7pm, movie 8pm-10pm'))
        print(await add(pg, '#list : groceries: eggs, soap, juice'))
        print(await add(pg, '#list groceries: milk'))
        secs = await pg.locator('.section').all_inner_texts(); print('sections', [s.replace('\n', ' ') for s in secs])
        # check workout -> stays visible, checked
        wrow = pg.locator('.row', has_text='workout')
        await wrow.locator('.chk').click(); await pg.wait_for_timeout(150)
        assert await wrow.count() == 1, 'workout should stay visible'
        assert '✓' in await wrow.locator('.chk').inner_text()
        # task stays visible after check
        await pg.locator('.row', has_text='renew passport').locator('.chk').click(); await pg.wait_for_timeout(150)
        assert await pg.locator('.row.done', has_text='renew passport').count() == 1
        # list: check all 4 items -> list crossed
        card = pg.locator('.listcard', has_text='groceries')
        n = await card.locator('.items li').count(); print('list items', n); assert n == 4
        for i in range(n): await card.locator('.items li .chk').nth(i).click(); await pg.wait_for_timeout(100)
        assert 'done' in (await card.get_attribute('class')), 'list should be crossed'
        await card.locator('.items li .chk').first.click(); await pg.wait_for_timeout(100)
        assert 'done' not in (await card.get_attribute('class')), 'list should un-cross'
        await card.locator('.additem input').fill('bread'); await card.locator('.additem input').press('Enter'); await pg.wait_for_timeout(150)
        assert await pg.locator('.listcard', has_text='groceries').locator('.items li').count() == 5
        prog = await pg.locator('.progress').inner_text(); print('progress', prog.replace('\n', ' '))
        await pg.screenshot(path=OUT + '2-today.png', full_page=True)
        await pg.click('.quick [data-x=help]'); await pg.wait_for_selector('dialog[open] .help')
        await pg.screenshot(path=OUT + '3-help.png'); await pg.click('dialog [data-x=ok]')
        # editor on a time block
        await pg.locator('.row.block .title', has_text=re.compile('^work$')).click(); await pg.wait_for_selector('dialog[open] #atomForm')
        assert await pg.locator('#f-start').input_value() == '17:00'
        await pg.screenshot(path=OUT + '4-editor-block.png')
        await pg.click('dialog [data-x=cancel]')
        # long press menu on habit
        row = pg.locator('.row', has_text='read 20'); box = await row.bounding_box()
        await pg.mouse.move(box['x'] + 200, box['y'] + 15); await pg.mouse.down(); await pg.wait_for_timeout(700); await pg.mouse.up()
        await pg.locator('dialog .menu button', has_text='Skip today').click(); await pg.wait_for_timeout(150)
        assert '–' in await pg.locator('.row', has_text='read 20').locator('.chk').inner_text()
        # habits
        await pg.click('nav a[data-route=habits]'); await pg.wait_for_selector('.hcard')
        await pg.screenshot(path=OUT + '5-habits.png', full_page=True)
        hs = await pg.locator('.section').all_inner_texts(); print('habit sections', [s.replace('\n', ' ') for s in hs])
        # categories
        await pg.click('nav a[data-route=elements]'); await pg.wait_for_selector('.el')
        assert await pg.locator('.el', has_text='Mindfulness').count() == 1, 'auto-created category'
        await pg.locator('.el', has_text='Fitness').locator('button[data-action=openel]').click()
        await pg.click('button[data-action=editel]'); await pg.wait_for_selector('#catForm')
        await pg.fill('#c-name', 'Training'); await pg.click('#catForm button[type=submit]'); await pg.wait_for_timeout(150)
        assert await pg.locator('.el', has_text='Training').count() == 1
        await pg.screenshot(path=OUT + '6-categories.png', full_page=True)
        await pg.click('nav a[data-route=sys]'); await pg.wait_for_selector('.sys')
        await pg.screenshot(path=OUT + '7-settings.png', full_page=True)
        # ----- folding -----
        await pg.goto(URL + '#/today'); await pg.wait_for_selector('.sec')
        await pg.click('section[data-sec="today:daily"] > button.section'); await pg.wait_for_timeout(400)
        assert await pg.locator('section.folded[data-sec="today:daily"]').count() == 1
        await pg.screenshot(path=OUT + '12-folded.png')
        await pg.reload(); await pg.wait_for_selector('.sec')
        assert await pg.locator('section.folded[data-sec="today:daily"]').count() == 1, 'fold remembered'
        await pg.click('section[data-sec="today:daily"] > button.section'); await pg.wait_for_timeout(400)
        assert await pg.locator('section.folded').count() == 0
        print(await add(pg, 'do dishes #onetime'))
        assert await pg.locator('section[data-sec="today:once"] .row', has_text='do dishes').count() == 1
        # ----- v0.1.5: undo, focus, leftovers, steps, timer, drag, search, review -----
        await pg.goto(URL + '#/today'); await pg.wait_for_selector('.sec')
        print(await add(pg, 'move out: pack, clean, return keys #home'))
        mrow = pg.locator('.row', has_text='move out')
        assert await mrow.locator('.steps li').count() == 3
        for i in range(3): await mrow.locator('.steps .chk').nth(i).click(); await pg.wait_for_timeout(120)
        assert await pg.locator('.row.done', has_text='move out').count() == 1, 'all steps -> task done'
        await pg.click('#toast .undo'); await pg.wait_for_timeout(200)
        assert await pg.locator('.row.done', has_text='move out').count() == 0, 'undo last step'
        # delete + undo
        await pg.locator('.row', has_text='do dishes').locator('.more').click()
        await pg.locator('dialog .menu button', has_text='Delete').click(); await pg.wait_for_timeout(150)
        assert await pg.locator('.row', has_text='do dishes').count() == 0
        await pg.click('#toast .undo'); await pg.wait_for_timeout(250)
        assert await pg.locator('.row', has_text='do dishes').count() == 1, 'undo delete'
        # focus pin
        await pg.locator('.row', has_text='meditate').locator('.more').click()
        await pg.locator('dialog .menu button', has_text='Pin to focus').click(); await pg.wait_for_timeout(150)
        assert await pg.locator('section[data-sec="today:focus"] .row', has_text='meditate').count() == 1
        # leftovers
        n0 = await pg.locator('section[data-sec="today:once"] .row').count()
        await pg.click('[data-action=moveleft]'); await pg.wait_for_timeout(200)
        print('one-time before/after move', n0, await pg.locator('section[data-sec="today:once"] .row').count())
        await pg.click('#toast .undo'); await pg.wait_for_timeout(300)
        assert await pg.locator('section[data-sec="today:once"] .row').count() == n0, 'undo move'
        # timer
        print(await add(pg, 'study 25 min timer #career'))
        trow = pg.locator('.row', has_text='study').filter(has=pg.locator('.chk.timer'))
        await trow.locator('.chk').click(); await pg.wait_for_timeout(100); print('toast', await pg.locator('#toast').inner_text()); await pg.wait_for_timeout(1300)
        await pg.wait_for_timeout(1200)
        t1 = await trow.locator('.chk').inner_text(); print('timer', t1); assert '24:5' in t1
        await pg.evaluate("import('./js/state.js').then(A => { for (const t of Object.values(A.S.timers)) t.endsAt = Date.now() - 1; })")
        await pg.wait_for_timeout(1500)
        assert await pg.locator('.row.done', has_text='study').count() >= 1, 'timer finished -> done'
        # drag: move last daily row to top
        sec = pg.locator('section[data-sec="today:daily"] .secinner')
        before = await sec.locator(':scope > .row .title').all_inner_texts()
        h = sec.locator(':scope > .row .drag').last; hb = await h.bounding_box()
        fb = await sec.locator(':scope > .row').first.bounding_box()
        await pg.mouse.move(hb['x'] + 5, hb['y'] + 5); await pg.mouse.down()
        for y in range(int(hb['y']), int(fb['y']) - 20, -8): await pg.mouse.move(hb['x'] + 5, y)
        await pg.mouse.up(); await pg.wait_for_timeout(300)
        after = await sec.locator(':scope > .row .title').all_inner_texts()
        print('drag', before, '->', after); assert after[0] == before[-1]
        await pg.screenshot(path=OUT + '13-v015.png', full_page=True)
        # search
        await pg.click('header .hsearch'); await pg.fill('#q-search', 'keys'); await pg.wait_for_timeout(100)
        assert await pg.locator('.hit').count() == 1
        await pg.screenshot(path=OUT + '14-search.png'); await pg.locator('.hit').click(); await pg.wait_for_timeout(100)
        # review
        await pg.click('nav a[data-route=calendar]'); await pg.click('[data-action=review]'); await pg.wait_for_selector('.review')
        await pg.screenshot(path=OUT + '15-review.png', full_page=True)
        # ----- dates -----
        await pg.goto(URL + '#/today'); await pg.wait_for_selector('.daynav')
        today_label = await pg.locator('.daynav .dlabel').inner_text()
        await pg.click('[data-action=datenext]'); await pg.wait_for_timeout(100)
        assert await pg.locator('.backtoday').count() == 1
        print(await add(pg, 'dentist appointment'))
        assert await pg.locator('.row', has_text='dentist').count() == 1, 'task added to tomorrow'
        await pg.click('.backtoday'); await pg.wait_for_timeout(100)
        assert await pg.locator('.row', has_text='dentist').count() == 0, 'dentist only on tomorrow'
        assert await pg.locator('.daynav .dlabel').inner_text() == today_label
        await pg.click('[data-action=dateprev]'); await pg.wait_for_timeout(100)
        assert await pg.locator('.row', has_text='read 20').count() == 0, 'habits made today are not shown on earlier days'
        await pg.screenshot(path=OUT + '8-yesterday.png')
        await pg.click('[data-action=datepick]'); await pg.wait_for_selector('dialog[open] .cal')
        await pg.screenshot(path=OUT + '9-picker.png')
        await pg.click('dialog[open] [data-action=gotoday]'); await pg.wait_for_timeout(100)
        assert await pg.locator('.backtoday').count() == 0
        await pg.click('nav a[data-route=calendar]'); await pg.wait_for_selector('.calgrid.days')
        await pg.screenshot(path=OUT + '10-calendar.png', full_page=True)
        await pg.locator('.calgrid.days button.today').click(); await pg.wait_for_selector('.daynav')
        assert 'today' in await pg.locator('.daynav .dlabel').inner_text()
        # header cursor
        assert await pg.locator('header .cursor.offline').count() == 0
        typed = await pg.locator('header .typed').inner_text(); print('typed', typed)
        # persistence + offline
        await pg.reload(); await pg.wait_for_timeout(600)
        await pg.goto(URL + '#/today'); await pg.wait_for_selector('.row')
        await ctx.set_offline(True)
        await pg.reload(); await pg.wait_for_selector('.row', timeout=5000)
        print('offline rows', await pg.locator('.row').count())
        await pg.wait_for_timeout(300)
        print('offline cursor', await pg.locator('header .cursor').inner_text(), await pg.locator('header .cursor.offline').count())
        await pg.screenshot(path=OUT + '11-offline.png', clip={'x': 0, 'y': 0, 'width': 390, 'height': 200})
        await ctx.set_offline(False)
        print('ERRORS', errs)
        await b.close()
asyncio.run(main())
