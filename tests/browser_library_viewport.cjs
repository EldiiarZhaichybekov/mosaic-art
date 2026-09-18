/* Real WebKit layout measurements. Viewport resize is NOT a physical iOS keyboard test. */
'use strict';
const {webkit}=require('playwright'),assert=require('node:assert/strict'),fs=require('node:fs');
(async()=>{const browser=await webkit.launch();const measurements=[];try{
 for(const [width,height]of [[390,844],[393,852],[430,932]]){
  const page=await browser.newPage({viewport:{width,height},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto((process.env.BASE_URL||'http://127.0.0.1:8091')+'/?lang=ru');await page.locator('#start-presets').click();
  async function check(state){const m=await page.evaluate(()=>{const d=document.querySelector('#silhouette-library'),r=e=>e.getBoundingClientRect().toJSON(),v=visualViewport;return {innerWidth,innerHeight,visualViewport:{width:v.width,height:v.height,offsetTop:v.offsetTop,scale:v.scale},document:{width:document.documentElement.scrollWidth,height:document.documentElement.scrollHeight},modal:r(d),grid:r(d.querySelector('.library-grid')),footer:r(d.querySelector('footer')),font:getComputedStyle(document.querySelector('#silhouette-search')).fontSize,focused:document.activeElement.id,bodyPosition:getComputedStyle(document.body).position};});measurements.push({width,height,state,...m});assert.ok(m.document.width<=m.innerWidth);assert.ok(Math.abs(m.modal.width-m.visualViewport.width)<2);assert.ok(Math.abs(m.footer.bottom-(m.visualViewport.height+m.visualViewport.offsetTop))<2);assert.ok(m.grid.bottom<=m.footer.top);assert.equal(m.visualViewport.scale,1);assert.ok(parseFloat(m.font)>=16);assert.equal(m.bodyPosition,'fixed');await page.screenshot({path:`/private/tmp/library-viewport-${width}-${state}.png`});}
  await check('initial');assert.equal(await page.locator('#silhouette-search').evaluate(e=>e===document.activeElement),false);
  await page.locator('#silhouette-search').tap();await check('focused');
  await page.setViewportSize({width,height:height-300});await page.waitForFunction(()=>Math.abs(document.querySelector('#silhouette-library').getBoundingClientRect().height-visualViewport.height)<2);await check('resized-not-keyboard');
  await page.locator('#silhouette-library-title').tap();await page.setViewportSize({width,height});await page.waitForFunction(()=>Math.abs(document.querySelector('#silhouette-library').getBoundingClientRect().height-visualViewport.height)<2);await check('restored');
  await page.locator('.library-grid').evaluate(e=>e.scrollTop=e.scrollHeight);await check('scrolled');
  const last=await page.locator('.silhouette-card').last().boundingBox(),footer=await page.locator('#silhouette-library footer').boundingBox();assert.ok(last.y+last.height<=footer.y);
  await page.locator('#silhouette-library footer button').first().click();await page.waitForFunction(()=>document.body.style.position!=='fixed');
  await page.locator('#silhouette-picker').click();await check('reopened-from-panel');assert.equal(await page.locator('#silhouette-search').evaluate(e=>e===document.activeElement),false);
  await page.locator('#silhouette-search').fill('Волк');assert.equal(await page.locator('.silhouette-card').count(),1);await page.locator('.silhouette-card').click();await page.locator('#silhouette-library footer button').last().click();await page.waitForFunction(()=>document.body.style.position!=='fixed');assert.equal(await page.locator('#preset').inputValue(),'wolf');
  assert.deepEqual(errors,[]);await page.close();
 }
 fs.writeFileSync('/private/tmp/library-viewport-measurements.json',JSON.stringify(measurements,null,2));console.log('PASS actual WebKit measurements: initial/focus/viewport resize/recovery/scroll at 390,393,430. Real iOS keyboard and auto-zoom NOT emulated.');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
