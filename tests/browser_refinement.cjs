'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH});const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
try{
 await page.goto((process.env.BASE_URL||'http://127.0.0.1:8091')+'/?lang=ru');
 await page.locator('#silhouette-picker').waitFor({state:'attached'});assert.equal(await page.title(),'Prismosaic');
 assert.equal(await page.locator('#nav-editor').isVisible(),false);assert.equal(await page.locator('#nav-export').isVisible(),false);
 await page.locator('#start-presets').click();await page.waitForFunction(()=>document.querySelectorAll('.silhouette-card').length===24);await page.locator('#silhouette-library').waitFor({state:'visible'});
 assert.equal(await page.locator('.silhouette-card').count(),24);
 await page.locator('#silhouette-search').fill('Волк');await page.waitForFunction(()=>document.querySelectorAll('.silhouette-card').length===1);assert.equal(await page.locator('.silhouette-card').count(),1);
 await page.locator('.silhouette-card').click();await page.locator('#silhouette-library footer button').last().click();
 assert.equal(await page.locator('#preset').inputValue(),'wolf');
 for(const width of [1440,1280,1024,768,430,390]){
  await page.setViewportSize({width,height:width<600?844:1000});
  if(width<=900&&await page.locator('#mobile-properties').getAttribute('aria-expanded')!=='true')await page.locator('#mobile-properties').click();
  await page.locator('#properties-replace').click();await page.locator('#start-presets').click();
  assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),'page overflow '+width);
  assert.ok(await page.locator('#silhouette-library').evaluate(e=>e.scrollWidth<=e.clientWidth),'modal overflow '+width);
  await page.screenshot({path:`/private/tmp/prismosaic-library-${width}.png`});await page.keyboard.press('Escape');
  if(width<=900&&await page.locator('#properties-close').isVisible())await page.locator('#properties-close').click();
 }
 await page.setViewportSize({width:1440,height:1000});
 const image=process.env.TEST_IMAGE;if(!image)throw new Error('TEST_IMAGE required: use synthetic fixture for production');
 await page.locator('#file-input').setInputFiles(image);
 await page.waitForFunction(()=>document.querySelector('#step-state-1').textContent==='Готово',null,{timeout:60000});
 for(const [id,n]of [['result-optimized',2],['result-tiles',3]]){await page.locator('#'+id).click();await page.waitForFunction(n=>document.querySelector('#step-state-'+n).textContent==='Готово',n,{timeout:60000});}
 assert.equal(await page.locator('#tile-edit').isVisible(),false);assert.equal(await page.locator('#tile-editor').isVisible(),false);
 await page.locator('#tile-edit').evaluate(e=>e.click());assert.equal(await page.locator('#tile-editor').isVisible(),false);
 assert.equal(await page.locator('#tile-orientation').isVisible(),false);
 await page.locator('#tile-format + .size-buttons [data-value="30x40"]').click();await page.waitForFunction(()=>!document.querySelector('#workspace-busy').open);
 for(const orientation of ['portrait','landscape','auto']){await page.locator(`[data-orientation="${orientation}"]`).click();await page.waitForFunction(()=>!document.querySelector('#workspace-busy').open);assert.equal(await page.locator(`[data-orientation="${orientation}"]`).getAttribute('aria-pressed'),'true');}
 await page.locator('#tile-format + .size-buttons [data-value="40x40"]').click();await page.waitForFunction(()=>!document.querySelector('#workspace-busy').open);
 assert.match(await page.locator('#inventory-large-text').innerText(),/\d+ \/ 100/);assert.match(await page.locator('#inventory-small-text').innerText(),/\d+ \/ 50/);
 await page.locator('#tile-view-plan').click();await page.locator('#tile-plan-info summary').click();
 for(const id of ['btn-svg','btn-jpg','tile-csv']){const [d]=await Promise.all([page.waitForEvent('download'),page.locator('#'+id).click()]);assert.ok(await d.path());}
 await page.locator('#tile-view-layout').click();
 for(const lang of ['en','zh','ru']){await page.locator('#lang').selectOption(lang);await page.locator('#properties-replace').click();await page.locator('#start-presets').click();assert.ok(!(await page.locator('#silhouette-library').innerText()).includes('ux.'));await page.keyboard.press('Escape');}
 await page.screenshot({path:'/private/tmp/prismosaic-refined-desktop.png'});
 for(const width of [1440,1280,1024,768,430,390]){await page.setViewportSize({width,height:width<600?844:1000});if(width<=900&&await page.locator('#mobile-properties').getAttribute('aria-expanded')!=='true')await page.locator('#mobile-properties').click();await page.screenshot({path:`/private/tmp/prismosaic-properties-${width}.png`});assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));if(width<=900)await page.locator('#properties-close').click();}
 await page.setViewportSize({width:1440,height:1000});
 await page.locator('#file-input').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('bad')});await page.locator('#workspace-error').waitFor({state:'visible'});await page.screenshot({path:'/private/tmp/prismosaic-error.png'});await page.locator('#workspace-error button').click();
 // Explicitly mocked timeout to verify overlay and error UI, not an API success measurement.
 let release;const gate=new Promise(r=>release=r);
 await page.route('**/api/contour',async route=>{await gate;await route.fulfill({status:504,contentType:'application/json',body:JSON.stringify({code:'PROCESSING_TIMEOUT',error:'PROCESSING_TIMEOUT'})});},{times:1});
 await page.locator('#file-input').setInputFiles(image);await page.locator('#workspace-busy').waitFor({state:'visible'});await page.keyboard.press('Escape');assert.equal(await page.locator('#workspace-busy').isVisible(),true);await page.screenshot({path:'/private/tmp/prismosaic-busy.png'});release();await page.locator('#workspace-error').waitFor({state:'visible'});await page.locator('#workspace-error button').click();await page.locator('#retry-processing').click();await page.waitForFunction(()=>document.querySelector('#step-state-1').textContent==='Готово',null,{timeout:60000});
 await page.locator('#file-input').setInputFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(3*1024*1024+1)});await page.locator('#workspace-error').waitFor({state:'visible'});await page.keyboard.press('Tab');assert.equal(await page.evaluate(()=>document.activeElement.closest('dialog')?.id),'workspace-error');await page.keyboard.press('Escape');
 assert.deepEqual(errors,[]);console.log('PASS refinement: 6 widths, modal presets, R1/R2/R3, canvas/orientations, export, hidden editor, RU/EN/ZH, mocked timeout and retry.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
