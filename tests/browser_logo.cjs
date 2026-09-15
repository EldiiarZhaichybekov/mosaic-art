/* Branding-only visual smoke. No uploads, API calls or processing. */
const {chromium}=require('playwright'),assert=require('node:assert/strict'),path=require('node:path'),fs=require('node:fs'),crypto=require('node:crypto');
(async()=>{
 const base=process.env.BASE_URL;
 const asset=fs.readFileSync('assets/prismosaic-logo.png');
 assert.equal(crypto.createHash('sha256').update(asset).digest('hex'),'1ca6aa17f6ef315442e680e303918e49787483d07c3944522a6d31007f495459');
 if(base){const response=await fetch(base+'/assets/prismosaic-logo.png');assert.equal(response.status,200);assert.deepEqual(Buffer.from(await response.arrayBuffer()),asset);}
 const browser=await chromium.launch({headless:true,...(process.env.BROWSER_PATH?{executablePath:process.env.BROWSER_PATH}:{})});
 try{
  const page=await browser.newPage({deviceScaleFactor:2}),errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto(base?base+'/?lang=ru':'file://'+path.resolve('index.html')+'?lang=ru');
  await page.locator('.brand-logo').evaluate(img=>img.decode());
  assert.equal(await page.locator('.wordmark').innerText(),'');assert.equal(await page.locator('.brand-logo').getAttribute('alt'),'Prismosaic');
  assert.equal(await page.locator('.brand-symbol').count(),0);
  for(const width of [1440,1280,1024,430,390]){
   await page.setViewportSize({width,height:900});
   const box=await page.locator('.brand-logo').boundingBox(),header=await page.locator('#app-header').boundingBox();
   assert.ok(Math.abs(box.width/box.height-3)<.001);assert.equal(box.width,width>600?180:144);
   assert.ok(box.y>=header.y&&box.y+box.height<=header.y+header.height);
   assert.ok(await page.evaluate(()=>document.documentElement.scrollWidth<=innerWidth));
   await page.locator('#app-header').screenshot({path:`/private/tmp/prismosaic-logo-${base?'production':'local'}-${width}.png`});
  }
  await page.locator('.wordmark').click();assert.ok(page.url().endsWith('#workspace-heading'));
  assert.deepEqual(errors,[]);console.log('PASS approved PNG identity, 3:1 aspect ratio, five widths at 2x DPR, one wordmark, link, no page errors');
 }finally{await browser.close();}
})().catch(e=>{console.error(e);process.exitCode=1;});
