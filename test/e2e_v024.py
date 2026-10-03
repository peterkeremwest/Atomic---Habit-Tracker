# v0.2.4 browser checks (phone-sized, touch). Server on :8765 serving public/.
import asyncio, os, json
from playwright.async_api import async_playwright
URL = 'http://localhost:8765/'
OUT = '/tmp/claude-0/shots/'; os.makedirs(OUT, exist_ok=True)

async def add(pg, text):
    q = pg.locator('.quick input'); await q.fill(text); await q.press('Enter'); await pg.wait_for_timeout(200)
    return await pg.locator('#toast').inner_text()

async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width': 375, 'height': 812}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = await ctx.new_page(); errs = []
        pg.on('console', lambda m: errs.append(m.text) if m.type == 'error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('.progress')

        # 4. duplicate categories: inject a second "Fitness" + an item in it, reload -> merged
        await pg.evaluate("""async () => {
          const db = await new Promise(r => { const q = indexedDB.open('atomic'); q.onsuccess = () => r(q.result); });
          const tx = db.transaction(['elements','atoms'], 'readwrite');
          tx.objectStore('elements').put({ id: 'el_dup1', name: 'Fitness', order: 9, createdAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z', deletedAt: null });
          tx.objectStore('elements').put({ id: 'el_dup2', name: 'career', order: 9, createdAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z', deletedAt: null });
          tx.objectStore('atoms').put({ id: 'atom_x', kind: 'task', title: 'dup item', elementId: 'el_dup1', items: [], createdAt: '2026-09-30T00:00:00Z', updatedAt: '2026-09-30T00:00:00Z', deletedAt: null, order: 1 });
          await new Promise(r => tx.oncomplete = r);
        }""")
        await pg.reload(); await pg.wait_for_selector('.progress')
        chips = await pg.locator('.chips .chip').all_inner_texts(); print('chips', chips)
        assert chips.count('Fitness') == 1 and chips.count('Career') + chips.count('career') == 1, chips
        assert '#fitness' in await pg.locator('.row', has_text='dup item').inner_text()
        print(await add(pg, '#fitness lift'), '| typing an existing tag reuses it')
        chips = await pg.locator('.chips .chip').all_inner_texts(); assert chips.count('Fitness') == 1

        # 2. "on Friday" = one date, "Fridays" = weekly
        t = await add(pg, 'buy groceries on Friday'); print(t); assert 'Friday' in t and 'habit' not in t
        t = await add(pg, 'take out trash on Fridays'); print(t); assert 'habit added' in t and 'Friday' in t

        # 1. edit a task -> date field works by tap
        await add(pg, 'call bank')
        await pg.locator('.row', has_text='call bank').locator('.more').tap(); await pg.wait_for_timeout(150)
        await pg.locator('.menu button', has_text='Edit').tap(); await pg.wait_for_timeout(200)
        await pg.locator('.dpick[data-name=dueDate] .dbtn').tap(); await pg.wait_for_timeout(150)
        assert await pg.locator('.dpick[data-name=dueDate] .dcal .mgrid.days button').count() >= 28
        await pg.screenshot(path=OUT + 'v024-1-datefield.png')
        await pg.locator('.dpick[data-name=dueDate] .dcal [data-p=next]').tap(); await pg.wait_for_timeout(100)
        target = await pg.locator('.dpick[data-name=dueDate] .dcal .mgrid.days button').nth(9).get_attribute('data-d')
        await pg.locator('.dpick[data-name=dueDate] .dcal .mgrid.days button').nth(9).tap(); await pg.wait_for_timeout(100)
        print('picked', target, await pg.locator('.dpick[data-name=dueDate] .dval').inner_text())
        await pg.locator('#atomForm button[type=submit]').tap(); await pg.wait_for_timeout(200)
        due = await pg.evaluate("""async (t) => { const db = await new Promise(r => { const q = indexedDB.open('atomic'); q.onsuccess = () => r(q.result); });
          const all = await new Promise(r => { const q = db.transaction('atoms').objectStore('atoms').getAll(); q.onsuccess = () => r(q.result); });
          return all.find(a => a.title === 'call bank').dueDate; }""", target)
        assert due == target, (due, target)
        # editing again shows the date; NO DATE clears it
        assert await pg.locator('.row', has_text='call bank').count() == 0  # moved to the future

        # 3. move to another day from the menu
        await add(pg, 'renew license')
        await pg.locator('.row', has_text='renew license').locator('.more').tap(); await pg.wait_for_timeout(150)
        await pg.locator('.menu button', has_text='Move to another day').tap(); await pg.wait_for_timeout(200)
        await pg.screenshot(path=OUT + 'v024-2-moveto.png')
        await pg.locator('.mquick [data-p=day]', has_text='IN A WEEK').tap(); await pg.wait_for_timeout(200)
        t = await pg.locator('#toast').inner_text(); print(t); assert 'moved to' in t and 'in 7 days' in t

        # 7/8. ongoing
        t = await add(pg, '#ongoing learn spanish'); print(t)
        t = await add(pg, '#goal read 12 books'); print(t)
        secs = await pg.locator('.section').all_inner_texts(); print([s.replace('\n', ' ') for s in secs])
        assert any('ONGOING' in s for s in secs)
        await pg.locator('.row', has_text='learn spanish').locator('.chk').tap(); await pg.wait_for_timeout(200)
        print('cls', await pg.locator('.row', has_text='learn spanish').get_attribute('class'), await pg.locator('#toast').inner_text())
        assert 'done' in await pg.locator('.row', has_text='learn spanish').get_attribute('class')
        await pg.locator('[data-action=datenext]').tap(); await pg.wait_for_timeout(150)
        assert await pg.locator('.row', has_text='read 12 books').count() == 1, 'open ongoing shows tomorrow'
        assert await pg.locator('.row', has_text='learn spanish').count() == 0, 'done one does not'
        await pg.locator('[data-action=gotoday]').first.tap(); await pg.wait_for_timeout(150)
        # fold ongoing
        await pg.locator('button.section[data-sec="today:ongoing"]').tap(); await pg.wait_for_timeout(300)
        assert 'folded' in await pg.locator('section[data-sec="today:ongoing"]').get_attribute('class')
        await pg.locator('button.section[data-sec="today:ongoing"]').tap(); await pg.wait_for_timeout(300)

        # 5/6. notes
        await pg.locator('nav.tabs a[data-route=notes]').tap(); await pg.wait_for_timeout(200)
        await pg.locator('form[data-form=addnote] input').fill('books to read: dune, piranesi')
        await pg.locator('form[data-form=addnote] input').press('Enter'); await pg.wait_for_timeout(200)
        await pg.locator('form[data-form=addnote] input').fill('books to read: hyperion')
        await pg.locator('form[data-form=addnote] input').press('Enter'); await pg.wait_for_timeout(200)
        print(await pg.locator('#toast').inner_text())
        assert await pg.locator('.notecard').count() == 1
        assert await pg.locator('.notecard .items li').count() == 3
        await pg.locator('[data-action=newnote]').tap(); await pg.wait_for_timeout(200)
        await pg.locator('#n-title').fill('quotes'); await pg.locator('#n-text').fill('"we are what we repeatedly do"')
        await pg.locator('#noteForm button[type=submit]').tap(); await pg.wait_for_timeout(200)
        await pg.locator('.notecard', has_text='books to read').locator('[data-action=notepin]').tap(); await pg.wait_for_timeout(200)
        await pg.screenshot(path=OUT + 'v024-3-notes.png', full_page=True)
        await pg.locator('nav.tabs a[data-route=today]').tap(); await pg.wait_for_timeout(200)
        assert await pg.locator('section[data-sec="today:note"] .notecard').count() == 1
        await pg.locator('section[data-sec="today:note"] .items .chk').first.tap(); await pg.wait_for_timeout(200)
        await pg.locator('section[data-sec="today:note"] form[data-form=additem] input').fill('the left hand of darkness')
        await pg.locator('section[data-sec="today:note"] form[data-form=additem] input').press('Enter'); await pg.wait_for_timeout(200)
        assert await pg.locator('section[data-sec="today:note"] .items li').count() == 4
        t = await add(pg, '#note quotes: stay hungry'); print(t)
        await pg.screenshot(path=OUT + 'v024-4-today.png', full_page=True)
        # nav fits on a small phone
        sw = await pg.evaluate("document.querySelector('nav.tabs div').scrollWidth"); cw = await pg.evaluate("document.querySelector('nav.tabs div').clientWidth")
        print('nav', sw, cw); assert sw <= cw + 1
        # search finds notes
        await pg.locator('header .hsearch').tap(); await pg.locator('#q-search').fill('piranesi'); await pg.wait_for_timeout(100)
        print(await pg.locator('#q-results').inner_text())
        await pg.locator('#q-results .hit').first.tap(); await pg.wait_for_timeout(200)
        assert await pg.locator('#noteForm').count() == 1
        print('ERRORS', errs)
        await b.close()
asyncio.run(main())
