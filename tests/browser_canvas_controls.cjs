'use strict';
const {chromium}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const browser=await chromium.launch({headless:true,executablePath:process.env.BROWSER_PATH});try{
 const page=await browser.newPage({viewport:{width:1440,height:1000},reducedMotion:'reduce'}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.BASE_URL||'http://127.0.0.1:8091')+'/?lang=ru');
 await page.locator('#file-input').setInputFiles(process.env.TEST_IMAGE);
 await page.waitForFunction(()=>document.querySelector('#step-state-1').textContent==='Готово',null,{timeout:60000});
 await page.locator('#result-tiles').click();await page.waitForFunction(()=>document.querySelector('#step-state-3').textContent==='Готово',null,{timeout:60000});
 const wait=()=>page.waitForFunction(()=>!document.querySelector('#workspace-busy').open);
 for(const width of [1440,1280,1024,768,430,390]){
  await page.setViewportSize({width,height:1000});if(width<=900&&await page.locator('#mobile-properties').getAttribute('aria-expanded')!=='true')await page.locator('#mobile-properties').click();
  for(const lang of ['ru','en','zh']){
   await page.locator('#lang').selectOption(lang);
   for(const size of ['40x40','30x40']){
    await page.locator(`#tile-format + .size-buttons [data-value="${size}"]`).click();await wait();
    assert.equal(await page.locator('#tile-orientation').isVisible(),size==='30x40');
    const group=await page.locator('#tile-panel>.tile-options').boundingBox(),row=await page.locator('#tile-format + .size-buttons').boundingBox();
    assert.ok(Math.abs(group.width-row.width)<2,'size row must occupy full width');
    if(size==='30x40')for(const orientation of ['auto','portrait','landscape']){
     await page.locator(`[data-orientation="${orientation}"]`).click();await wait();
     const box=await page.locator('#tile-orientation').boundingBox();assert.ok(box.y>=row.y+row.height+15,'orientation below size row');assert.ok(Math.abs(box.width-row.width)<2);
     assert.equal(await page.locator(`[data-orientation="${orientation}"]`).evaluate(e=>getComputedStyle(e).backgroundColor),'rgb(34, 34, 34)');
    }
    const metrics=await page.locator('#tile-panel>.tile-options button').evaluateAll(nodes=>nodes.filter(n=>n.getClientRects().length).map(n=>({h:n.getBoundingClientRect().height,w:n.getBoundingClientRect().width,overflow:n.scrollWidth>n.clientWidth})));
    assert.ok(metrics.every(m=>m.h===44&&!m.overflow),JSON.stringify({width,lang,size,metrics}));
    assert.ok(Math.abs(metrics[0].w-metrics[1].w)<1);
    if(size==='30x40')assert.ok(Math.max(...metrics.slice(2).map(m=>m.w))-Math.min(...metrics.slice(2).map(m=>m.w))<1);
    if(lang==='ru')await page.locator('#tile-panel>.tile-options').screenshot({path:`/private/tmp/prismosaic-canvas-${width}-${size}.png`});
   }
  }
  if(width<=900)await page.locator('#properties-close').click();
 }
 assert.deepEqual(errors,[]);console.log('PASS full-width stacked rows, 44px equal buttons, no text overflow; 6 widths × 3 languages × all canvas/orientation states.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
