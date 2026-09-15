/* Real local upload/processing, UI navigation, responsive screenshots and exports.
 * Run with Playwright on NODE_PATH; BROWSER_PATH may select an installed Chromium.
 * No external AI request is faked by this test. Hybrid is tested separately. */
'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
 const page=await browser.newPage({viewport:{width:1440,height:1000}}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 const base=process.env.BASE_URL||'http://127.0.0.1:8089';
 try{
  await page.goto(base+'/?lang=ru');await page.locator('#workspace-start').waitFor({state:'visible'});
  assert.equal(await page.locator('#result-tiles').isDisabled(),true);
  await page.screenshot({path:'/private/tmp/prismosaic-empty-desktop.png'});
  await page.locator('#file-input').setInputFiles(process.env.TEST_IMAGE||'/Users/eldiiarzhaichybekov/Downloads/download.png');
  await page.waitForFunction(()=>document.querySelector('#step-state-1').textContent==='Готово',null,{timeout:60000});
  await page.screenshot({path:'/private/tmp/prismosaic-result1.png'});
  await page.locator('#result-optimized').click();
  await page.waitForFunction(()=>document.querySelector('#step-state-2').textContent==='Готово',null,{timeout:60000});
  await page.screenshot({path:'/private/tmp/prismosaic-result2.png'});
  await page.locator('#result-tiles').click();
  await page.waitForFunction(()=>document.querySelector('#step-state-3').textContent==='Готово',null,{timeout:60000});
  await page.waitForFunction(()=>document.querySelectorAll('.notice').length===0,null,{timeout:10000});
  assert.match(await page.locator('#inventory-large-text').innerText(),/\d+ \/ 100/);
  assert.match(await page.locator('#inventory-small-text').innerText(),/\d+ \/ 50/);
  for(const width of [1440,1280,1024,768,430,390]){
   await page.setViewportSize({width,height:width<600?844:1000});
   await page.screenshot({path:`/private/tmp/prismosaic-workspace-${width}.png`});
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth),`overflow ${width}`);
  }
  await page.locator('#mobile-properties').click();await page.locator('#tile-edit').click();
  await page.screenshot({path:'/private/tmp/prismosaic-mobile-properties.png'});
  assert.equal(await page.locator('#tile-editor').isVisible(),true);
  await page.locator('#tile-view-plan').click();assert.equal(await page.locator('#tile-plan-info').isVisible(),true);
  await page.locator('#tile-plan-info summary').click();assert.ok(await page.locator('#tile-plan-table tbody tr').count()>0);
  for(const [id,suffix]of [['tile-csv','csv'],['btn-svg','svg'],['btn-jpg','jpg']]){
   const [download]=await Promise.all([page.waitForEvent('download'),page.locator('#'+id).click()]);
   await download.saveAs('/private/tmp/prismosaic-workspace-export.'+suffix);assert.ok(fs.statSync('/private/tmp/prismosaic-workspace-export.'+suffix).size>100);
  }
  await page.locator('#properties-close').click();
  await page.locator('#view-in').click();assert.equal(await page.locator('#view-zoom').innerText(),'125%');
  await page.locator('#view-fit').click();assert.equal(await page.locator('#view-zoom').innerText(),'100%');
  await page.locator('#view-grid').click();assert.equal(await page.locator('#view-grid').getAttribute('aria-pressed'),'true');
  await page.locator('#workflow-source').click();assert.equal(await page.locator('#source-canvas').isVisible(),true);
  await page.locator('#lang').selectOption('en');assert.equal(await page.locator('#source-canvas').isVisible(),true);
  await page.locator('#result-tiles').click();
  for(const lang of ['en','zh','ru']){
   await page.locator('#lang').selectOption(lang);
   assert.equal(await page.locator('html').getAttribute('lang'),lang);
   await page.screenshot({path:`/private/tmp/prismosaic-mobile-${lang}.png`});
  }
  await page.setViewportSize({width:1280,height:900});
  const row=fs.readFileSync('/private/tmp/prismosaic-workspace-export.csv','utf8').split('\n')[1].split(',');
  const tileBox=await page.locator('#tile-canvas').boundingBox();
  await page.mouse.click(tileBox.x+Number(row[1])/400*tileBox.width,tileBox.y+Number(row[2])/400*tileBox.height);
  assert.equal(await page.locator('#tile-x').isDisabled(),false);
  const countBefore=await page.locator('#inventory-total-text').innerText();
  await page.locator('#tile-delete').click();assert.notEqual(await page.locator('#inventory-total-text').innerText(),countBefore);
  await page.locator('#tile-undo').click();assert.equal(await page.locator('#inventory-total-text').innerText(),countBefore);
  await page.locator('#tile-redo').click();assert.notEqual(await page.locator('#inventory-total-text').innerText(),countBefore);
  await page.locator('#tile-undo').click();
  await page.locator('#tile-format').selectOption('30x40');
  await page.waitForFunction(()=>!document.querySelector('#tile-recompute').disabled);
  for(const orientation of ['portrait','landscape','auto']){
   await page.locator(`[data-orientation="${orientation}"]`).click();
   await page.waitForFunction(()=>!document.querySelector('#tile-recompute').disabled);
   assert.equal(await page.locator(`[data-orientation="${orientation}"]`).getAttribute('aria-pressed'),'true');
   const rect=await page.locator('#tile-canvas').boundingBox();
   if(orientation==='portrait')assert.ok(rect.height>rect.width);
   if(orientation==='landscape')assert.ok(rect.width>rect.height);
  }
  await page.locator('#tile-format').selectOption('40x40');
  await page.waitForFunction(()=>!document.querySelector('#tile-recompute').disabled);
  // Cached switching must not spawn new processing workers or requests.
  let workers=0;const countWorker=()=>workers++;page.on('worker',countWorker);
  await page.locator('#result-detailed').click();await page.locator('#result-optimized').click();await page.locator('#result-tiles').click();
  assert.equal(workers,0);page.off('worker',countWorker);
  // Replacing input with an unsupported/oversized file leaves a usable project.
  await page.locator('#file-input').setInputFiles({name:'bad.txt',mimeType:'text/plain',buffer:Buffer.from('not an image')});
  assert.ok(await page.locator('.notice.error').count()>0);
  // Deliberately simulated HTTP failure; never counted as a real AI/API result.
  await page.route('**/api/contour',route=>route.fulfill({status:504,contentType:'application/json',body:JSON.stringify({error:'PROCESSING_TIMEOUT',code:'PROCESSING_TIMEOUT'})}),{times:1});
  await page.locator('#file-input').setInputFiles(process.env.TEST_IMAGE||'/Users/eldiiarzhaichybekov/Downloads/download.png');
  await page.waitForFunction(()=>document.querySelector('#step-state-1').textContent==='Ошибка');
  assert.equal(await page.locator('#result-tiles').isDisabled(),true);
  await page.locator('#retry-processing').click();
  await page.waitForFunction(()=>document.querySelector('#step-state-1').textContent==='Готово',null,{timeout:60000});
  assert.equal(await page.locator('#result-tiles').isDisabled(),false);
  await page.locator('#file-input').setInputFiles({name:'large.png',mimeType:'image/png',buffer:Buffer.alloc(3*1024*1024+1)});
  assert.ok(await page.locator('.notice.error').count()>0);
  assert.deepEqual(errors,[]);console.log('PASS upload → R1 → R2 → mixed fallback → editor → mounting → SVG/JPG/CSV; 6 widths; RU/EN/ZH; zero page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
