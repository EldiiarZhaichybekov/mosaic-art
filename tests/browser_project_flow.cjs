/* Project/source UX only. No processing algorithm or API is mocked. */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})}),base=process.env.BASE_URL||'http://127.0.0.1:8092';
 try{
  const page=await browser.newPage({viewport:{width:1440,height:960}}),errors=[];page.on('pageerror',e=>errors.push(e.message));await page.goto(base+'/?lang=ru');
  assert.equal(await page.locator('.source-choice-card').count(),3);assert.equal(await page.locator('#panel').isVisible(),false);assert.equal(await page.locator('#workflow').isVisible(),false);
  await page.locator('#start-presets').click();assert.equal(await page.getByRole('button',{name:'Назад',exact:true}).isVisible(),true);assert.equal(await page.locator('[data-category=uploaded]').count(),0);await page.getByRole('button',{name:'Назад',exact:true}).click();
  await page.locator('#start-photos').click();assert.equal(await page.locator('[data-mode=photo]').getAttribute('aria-pressed'),'true');assert.equal(await page.getByRole('button',{name:'Назад',exact:true}).isVisible(),true);await page.getByRole('button',{name:'Назад',exact:true}).click();
  await page.locator('#start-presets').click();await page.locator('[data-value=circle]').click();await page.getByRole('button',{name:'Выбрать',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#step-state-1').textContent==='Готово');
  assert.equal(await page.locator('#current-source-name').textContent(),'Круг');assert.equal(await page.locator('#current-source-type').textContent(),'Готовый силуэт');assert.equal(await page.locator('.legacy-source-picker').isVisible(),false);
  await page.locator('#sec-canvas > .section-title').click();await page.locator('#canvas-format + .size-buttons [data-value="30x40"]').click();assert.equal(await page.locator('#canvas-format').inputValue(),'30x40');
  await page.getByRole('button',{name:'На главную'}).click();assert.equal(await page.locator('#continue-project-button').isVisible(),true);await page.locator('#continue-project-button').click();assert.equal(await page.locator('#canvas-sheet').isVisible(),true);
  await page.locator('#properties-replace').click();await page.locator('#start-presets').click();assert.equal(await page.getByRole('button',{name:'Отмена',exact:true}).isVisible(),true);await page.getByRole('button',{name:'Отмена',exact:true}).click();assert.equal(await page.locator('#current-source-name').textContent(),'Круг');assert.equal(await page.locator('#canvas-format').inputValue(),'30x40');
  await page.locator('#properties-replace').click();await page.locator('#start-presets').click();await page.locator('[data-value=star]').click();await page.getByRole('button',{name:'Выбрать',exact:true}).click();await page.waitForFunction(()=>document.querySelector('#step-state-1').textContent==='Готово');assert.equal(await page.locator('#current-source-name').textContent(),'Звезда');assert.equal(await page.locator('#canvas-format').inputValue(),'30x40');
  for(const lang of ['en','zh','ru']){await page.locator('#lang').selectOption(lang);assert.equal(await page.locator('html').getAttribute('lang'),lang);assert.ok(!(await page.locator('#workspace-start').textContent()).includes('ws.'));}
  assert.deepEqual(errors,[]);await page.screenshot({path:'/private/tmp/prismosaic-project-flow-desktop.png'});
  const mobile=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true});await mobile.goto(base+'/?lang=ru');const boxes=await mobile.locator('.source-choice-card').evaluateAll(nodes=>nodes.map(n=>n.getBoundingClientRect().toJSON()));assert.equal(boxes.length,3);assert.ok(boxes[1].top>boxes[0].bottom&&boxes[2].top>boxes[1].bottom);assert.ok(await mobile.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));await mobile.screenshot({path:'/private/tmp/prismosaic-project-flow-mobile.png'});await mobile.close();
  console.log('PASS home, three sources, Back, confirm, logo/Home, Continue, Change source/Cancel, setting preservation, RU/EN/ZH, desktop/mobile');
 }finally{await browser.close();}
})().catch(error=>{console.error(error);process.exitCode=1;});
