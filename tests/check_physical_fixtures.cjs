// Run prepare_tile_fixtures.py first. Only temporary outputs are written.
const fs=require('node:fs'),assert=require('node:assert/strict'),T=require('../tile-layout');
for(const name of ['test_butterfly','bat_source']){
  const path='/private/tmp/tiles-'+name+'.json';if(!fs.existsSync(path))continue;
  const source=JSON.parse(fs.readFileSync(path)),result=T.generate(source);
  assert.equal(result.status,'ok',name+' must progressively find a valid layout');
  if(result.status==='ok'){assert.ok(T.validate(result).valid);fs.writeFileSync('/private/tmp/physical-'+name+'.svg',T.exportSVG(result,{mounting:true}));}
  else assert.deepEqual(result.tiles,[]);
  fs.writeFileSync('/private/tmp/physical-'+name+'.json',JSON.stringify(result));
  console.log(name,result.status,result.tiles.length,result.timings);
}
