'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),crypto=require('node:crypto'),T=require('../tile-layout');
const manifest=require('../library/manifest.json'),report=require('../library/result3-validation.json');
function area(poly){let value=0;for(let i=0,j=poly.length-1;i<poly.length;j=i++)value+=poly[j][0]*poly[i][1]-poly[i][0]*poly[j][1];return Math.abs(value/2);}
function source(id){const asset=manifest.assets.find(a=>a.id===id),data=JSON.parse(fs.readFileSync('.'+asset.sourceUrl));let outer=0;for(let i=1;i<data.polys.length;i++)if(area(data.polys[i])>area(data.polys[outer]))outer=i;return {contour:data.polys[outer],internal_lines:data.polys.filter((_,i)=>i!==outer)};}
const test=(name,fn)=>{fn();console.log('PASS',name);};
test('readiness report covers the exact active catalog and all three canvases',()=>{
  assert.equal(report.manifestSha256,crypto.createHash('sha256').update(fs.readFileSync('library/manifest.json')).digest('hex'));assert.equal(report.solverVersion,T.version);assert.equal(report.summary.failed,0);assert.equal(report.summary.assets,manifest.assets.length);
  assert.deepEqual(new Set(report.assets.map(a=>a.id)),new Set(manifest.assets.map(a=>a.id)));for(const asset of report.assets){assert.equal(asset.status,'pass');assert.deepEqual(asset.canvases.map(c=>c.format),['40x40','30x40-portrait','30x40-landscape']);assert.ok(asset.canvases.every(c=>c.status==='pass'&&c.tiles>0));}
});
test('known sailboat regression reaches a strictly valid Result 3',()=>{for(const options of [{format:'40x40'},{format:'30x40',orientation:'portrait'},{format:'30x40',orientation:'landscape'}]){const layout=T.generate(source('sailboat'),options);assert.equal(layout.status,'ok');assert.ok(T.validate(layout).valid);assert.ok(layout.tiles.length>0);}});
test('uploaded hard geometry degrades to a valid physical layout',()=>{const contour=Array.from({length:180},(_,i)=>{const a=i*Math.PI/90,r=i%2?18:100;return [120+r*Math.cos(a),100+r*.7*Math.sin(a)];}),layout=T.generate({contour,internal_lines:[]},{format:'30x40',orientation:'portrait'});assert.equal(layout.status,'ok');assert.ok(T.validate(layout).valid);assert.ok(layout.fallbackLevel>=0);});
test('library silhouettes are connected to the Result 2 and Result 3 handlers',()=>{const html=fs.readFileSync('index.html','utf8');assert.match(html,/tileUI\.sourceChanged\(physicalSource\)/);assert.match(html,/optimizedUI\?\.sourceChanged\(physicalSource/);});
