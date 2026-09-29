import asyncio, sys
from playwright.async_api import async_playwright
URL='http://localhost:8765/'
OUT='/tmp/claude-0/shots/'
import os; os.makedirs(OUT, exist_ok=True)
async def main():
    async with async_playwright() as p:
        b = await p.chromium.launch()
        ctx = await b.new_context(viewport={'width':390,'height':844}, device_scale_factor=2, has_touch=True, is_mobile=True)
        pg = await ctx.new_page()
        errs=[]
        pg.on('console', lambda m: errs.append(m.text) if m.type=='error' else None)
        pg.on('pageerror', lambda e: errs.append(str(e)))
        await pg.goto(URL); await pg.wait_for_selector('.progress')
        await pg.screenshot(path=OUT+'1-empty.png')
        q = pg.locator('.quick input')
        for t in ['gym mon wed fri tue thu #Fi.strength','read 20 min daily #Ps !low','water x8 daily #Fi','study AWS 3x #Cr.aws','renew passport tomorrow #Hm','buy groceries #Hm']:
            await q.fill(t); await q.press('Enter'); await pg.wait_for_timeout(120)
        rows = await pg.locator('.row').count(); print('rows today', rows)
        assert rows == 5, rows  # passport is due tomorrow
        # check the read habit
        await pg.locator('.row', has_text='read 20 min').locator('.chk').click(); await pg.wait_for_timeout(150)
        # counter x3
        for _ in range(3): await pg.locator('.row', has_text='water').locator('.chk').click(); await pg.wait_for_timeout(80)
        txt = await pg.locator('.row', has_text='water').locator('.chk').inner_text(); print('counter', txt); assert '3/8' in txt
        # menu -> skip gym
        await pg.locator('.row', has_text='gym').locator('.more').click()
        await pg.locator('dialog .menu button', has_text='Skip today').click(); await pg.wait_for_timeout(150)
        prog = await pg.locator('.progress').inner_text(); print('progress', prog.replace('\n',' '))
        await pg.locator('[data-action=showdone]').click()
        await pg.screenshot(path=OUT+'2-today.png', full_page=True)
        # long press on task
        row = pg.locator('.row', has_text='groceries'); box = await row.bounding_box()
        await pg.mouse.move(box['x']+200, box['y']+15); await pg.mouse.down(); await pg.wait_for_timeout(700); await pg.mouse.up()
        assert await pg.locator('dialog[open] .menu').count()==1, 'longpress menu'
        await pg.locator('dialog .menu button', has_text='Mark done').click(); await pg.wait_for_timeout(150)
        # editor
        await pg.locator('.row', has_text='study AWS').locator('.title').click()
        await pg.wait_for_selector('dialog[open] #atomForm')
        await pg.screenshot(path=OUT+'3-editor.png')
        assert await pg.locator('#atomForm select[name=perWeek]').input_value()=='3'
        await pg.locator('#atomForm button[type=submit]').click(); await pg.wait_for_timeout(150)
        # habits
        await pg.click('nav a[data-route=habits]'); await pg.wait_for_selector('.hcard')
        await pg.locator('.hcard', has_text='read 20').locator('.week button').first.click(); await pg.wait_for_timeout(150)
        await pg.screenshot(path=OUT+'4-habits.png', full_page=True)
        st = await pg.locator('.hcard', has_text='read 20').locator('.streak').inner_text(); print('read streak', st)
        # elements
        await pg.click('nav a[data-route=elements]'); await pg.wait_for_selector('.el')
        await pg.fill('form[data-form=addel] input[name=symbol]','st'); await pg.fill('form[data-form=addel] input[name=name]','Studies'); await pg.press('form[data-form=addel] input[name=name]','Enter'); await pg.wait_for_timeout(150)
        assert await pg.locator('.el .sym', has_text='St').count()==1
        await pg.locator('.el button[data-action=openel]').first.click()
        await pg.fill('form[data-form=addiso] input','Yoga'); await pg.press('form[data-form=addiso] input','Enter'); await pg.wait_for_timeout(150)
        await pg.screenshot(path=OUT+'5-elements.png', full_page=True)
        # sys: amber theme
        await pg.click('nav a[data-route=sys]'); await pg.wait_for_selector('.sys')
        await pg.locator('input[value=amber]').check(force=True); await pg.wait_for_timeout(150)
        await pg.screenshot(path=OUT+'6-sys-amber.png', full_page=True)
        pend = await pg.locator('.kv', has_text='waiting').inner_text(); print(pend.replace('\n',' '))
        # persistence + SW offline
        await pg.reload(); await pg.wait_for_selector('.sys')
        assert await pg.evaluate("document.documentElement.dataset.theme")=='amber'
        await pg.evaluate("navigator.serviceWorker.ready.then(()=>1)")
        await pg.reload(); await pg.wait_for_timeout(500)
        ctrl = await pg.evaluate("!!navigator.serviceWorker.controller"); print('sw controls', ctrl)
        await ctx.set_offline(True)
        await pg.goto(URL+'#/today'); await pg.wait_for_selector('.row', timeout=5000)
        print('offline rows', await pg.locator('.row').count())
        await ctx.set_offline(False)
        await pg.locator('input[value=green]').count()
        # manifest check
        m = await pg.evaluate("fetch('manifest.webmanifest').then(r=>r.json())"); print('manifest', m['name'], len(m['icons']))
        print('ERRORS', errs)
        await b.close()
asyncio.run(main())
