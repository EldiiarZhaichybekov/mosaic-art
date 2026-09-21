'use strict';
const {chromium,webkit}=require('playwright'),assert=require('node:assert/strict');
(async()=>{const engine=process.env.ENGINE==='webkit'?webkit:chromium;const browser=await engine.launch({headless:true,...(engine===chromium?{executablePath:process.env.BROWSER_PATH}:{})});try{
 const page=await browser.newPage({viewport:{width:390,height:844},isMobile:true,hasTouch:true}),errors=[];page.on('pageerror',e=>errors.push(e.message));
 await page.goto((process.env.BASE_URL||'http://127.0.0.1:8091')+'/?lang=ru');await page.locator('#start-presets').click();await page.waitForFunction(()=>document.querySelectorAll('.silhouette-card').length===15);
 for(const [width,height]of [[390,844],[430,932],[375,812],[360,800],[390,650],[390,844],[1440,1000]]){
  await page.setViewportSize({width,height});
  if(width<=600)await page.waitForFunction(()=>Math.abs(document.querySelector('#silhouette-library').getBoundingClientRect().height-visualViewport.height)<2);
  const data=await page.evaluate(()=>{const d=document.querySelector('#silhouette-library'),g=d.querySelector('.library-grid'),f=d.querySelector('footer');g.scrollTop=0;return {dialog:d.getBoundingClientRect().toJSON(),grid:g.getBoundingClientRect().toJSON(),footer:f.getBoundingClientRect().toJSON(),scroll:d.scrollHeight,client:d.clientHeight,overflow:document.documentElement.scrollWidth>innerWidth};});
  assert.ok(!data.overflow);if(width<=600){assert.ok(Math.abs(data.dialog.height-height)<2);assert.ok(Math.abs(data.footer.bottom-data.dialog.bottom)<2);assert.ok(data.scroll<=data.client+1);assert.ok(data.grid.bottom<=data.footer.top);assert.ok(data.grid.height>height*.25);}
  await page.locator('.library-grid').evaluate(e=>e.scrollTop=e.scrollHeight);
  const last=await page.locator('.silhouette-card').last().boundingBox(),footer=await page.locator('#silhouette-library footer').boundingBox();assert.ok(last.y+last.height<=footer.y,'last card is not covered');
  await page.screenshot({path:`/private/tmp/library-${process.env.ENGINE||'chromium'}-${width}-${height}.png`});
  if(width<=600){const after=await page.locator('#silhouette-library footer').boundingBox();assert.equal(after.y,data.footer.y);}
 }
 await page.locator('#silhouette-library footer button').first().click();assert.equal(await page.locator('#silhouette-library').isVisible(),false);assert.deepEqual(errors,[]);console.log('PASS mobile height, resize, independent grid scroll, last card, fixed footer, desktop and cancel');
}finally{await browser.close();}})().catch(e=>{console.error(e);process.exitCode=1;});
