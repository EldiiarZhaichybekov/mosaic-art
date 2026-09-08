// Production contract + deployed asset identity + physical validation.
// Upload only the generated fixture prepared by smoke_deployed.py --fixture.
const fs=require('node:fs'),assert=require('node:assert/strict'),T=require('../tile-layout');
(async()=>{
  const base=process.argv[2],file=process.argv[3];assert.ok(base&&file,'URL and synthetic fixture required');
  for(const name of ['tile-layout.js','tile-ui.js','tile-worker.js','tile-i18n.js']){
    const res=await fetch(base+'/'+name,{signal:AbortSignal.timeout(30000)});assert.equal(res.status,200);assert.equal(await res.text(),fs.readFileSync(name,'utf8'));
  }
  const response=await fetch(base+'/api/contour',{method:'POST',headers:{'Content-Type':'application/json','X-Request-ID':'physical-production-smoke'},body:JSON.stringify({image:'data:image/png;base64,'+fs.readFileSync(file).toString('base64')}),signal:AbortSignal.timeout(30000)});
  assert.equal(response.status,200);const source=await response.json(),layout=T.generate(source);
  assert.equal(layout.status,'ok');assert.ok(T.validate(layout).valid);assert.ok(T.exportSVG(layout,{mounting:true}).includes('width="30" height="3"'));
  const ping=await(await fetch(base+'/api/contour')).json();
  console.log('PASS physical production',ping.revision,T.version,layout.canvas,layout.tiles.length,'tiles');
})().catch(error=>{console.error(error);process.exitCode=1;});
