'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('../tile-layout');
const test=(name,f)=>{f();console.log('PASS',name);};
const box=[[0,0],[200,0],[200,200],[0,200],[0,0]];
test('fragments are joined before length filtering, including graph junctions',()=>{
 const r=T.buildStructures([[[20,80],[40,80]],[[40,80],[60,80]],[[60,80],[100,80]],[[40,80],[40,90]]],box);
 assert.ok(r.paths.some(p=>p.ids.length===3&&p.lengthMm===80));
});
test('short aligned gaps reconstruct a coherent observed structure',()=>{
 const r=T.buildStructures([[[20,80],[60,80]],[[63,80],[100,80]]],box);
 assert.equal(r.paths.length,1);assert.equal(r.paths[0].origin,'RECONSTRUCTED');assert.equal(r.paths[0].bridges[0].gapMm,3);
});
test('large unsupported gaps do not create invented branches',()=>{
 const r=T.buildStructures([[[20,80],[60,80]],[[85,80],[130,80]]],box);
 assert.ok(r.paths.every(p=>!p.bridges.length));
});
test('incompatible tangent directions are not repaired',()=>{
 const r=T.buildStructures([[[20,80],[60,80]],[[63,80],[63,140]]],box);
 assert.ok(r.paths.every(p=>!p.bridges.length));
});
test('small circles and isolated minor details are rejected, not replaced',()=>{
 const circle=Array.from({length:41},(_,i)=>[100+6*Math.cos(i*Math.PI/20),100+6*Math.sin(i*Math.PI/20)]);
 const r=T.buildStructures([circle,[[20,20],[25,20]]],box);
 assert.equal(r.paths.length,0);assert.ok(r.rejected.some(p=>p.reason==='SMALL_LOOP'));
});
test('strong mask symmetry assists only an observed partial counterpart',()=>{
 // Horizontal reflection of the box: a complete lower path supports a gap
 // in an already observed upper path, never an absent branch.
 const r=T.buildStructures([[[20,60],[70,60]],[[76,60],[130,60]],[[20,140],[130,140]]],box);
 assert.ok(r.symmetry.confidence>=.85);assert.ok(r.paths.some(p=>p.origin==='SYMMETRY_ASSISTED'));
 const missing=T.buildStructures([[[20,140],[130,140]]],box);
 assert.equal(missing.paths.length,1);assert.equal(missing.paths[0].origin,'OBSERVED');
});
test('asymmetric silhouette is not forcibly mirrored',()=>{
 const asym=[[0,0],[200,0],[175,60],[90,80],[130,190],[15,130],[0,0]],r=T.buildStructures([[[20,60],[70,60]],[[76,60],[130,60]]],asym);
 assert.ok(r.symmetry.confidence<.85);assert.ok(r.paths.every(p=>p.origin!=='SYMMETRY_ASSISTED'));
});
test('reconstruction cannot cross an exterior notch',()=>{
 const notch=[[0,0],[200,0],[200,200],[102,200],[102,40],[98,40],[98,200],[0,200],[0,0]];
 const r=T.buildStructures([[[30,80],[97,80]],[[103,80],[170,80]]],notch);
 assert.ok(r.paths.every(p=>!p.bridges.length));
});
test('input geometry remains immutable and diagnostics are serializable',()=>{
 const internal=[[[20,80],[60,80]],[[63,80],[100,80]]],before=JSON.stringify(internal),r=T.buildStructures(internal,box);
 assert.equal(JSON.stringify(internal),before);assert.ok(JSON.stringify(r).includes('ALIGNED_ENDPOINTS'));assert.ok(r.timings.structuralMs>=0);
});
test('full structural targets survive placement rather than per-tile clipping',()=>{
 const r=T.generate({contour:box,internal_lines:[[[30,100],[170,100]]]});
 assert.equal(r.status,'ok');assert.ok(T.validate(r).valid);const targets=r.target.filter(p=>p.role==='skeleton');
 assert.equal(targets.length,1);assert.ok(T.pathModel(targets[0].points).length>200);assert.ok(r.tiles.filter(t=>t.role==='skeleton').length>4);
});
test('every physical UI translation key is present in RU EN ZH',()=>{
 const ctx={};vm.runInNewContext(fs.readFileSync('tile-i18n.js','utf8'),ctx);const catalogs=ctx.TileMessages,keys=Object.keys(catalogs.ru);
 assert.ok(keys.length>65);for(const lang of ['en','zh'])assert.deepEqual(Object.keys(catalogs[lang]).sort(),keys.slice().sort());
 for(const key of keys)for(const lang of ['ru','en','zh'])assert.ok(catalogs[lang][key].length>0,key+' '+lang);
 const ui=fs.readFileSync('tile-ui.js','utf8');assert.equal(/[А-Яа-я]/.test(ui),false);
 for(const m of ui.matchAll(/tr\('([^']+)'/g))assert.ok(catalogs.en['tile.'+m[1]],m[1]);
});
test('localized export escapes XML and preserves physical placements',()=>{
 const r=T.generate({contour:box,internal_lines:[]}),svg=T.exportSVG(r,{mounting:true,labels:{header:'板片 < 150 & 安全',footer:'Печать 100%'}});
 assert.ok(svg.includes('板片 &lt; 150 &amp; 安全'));assert.ok(svg.includes('Печать 100%'));
});
test('obsolete server threshold is hidden, not rewired into frozen extraction',()=>{
 const html=fs.readFileSync('index.html','utf8');assert.ok(html.includes('.server-contour #threshold-control'));
 assert.ok(html.includes('JSON.stringify({ image: dataUrl, canvas: [cw, ch], debug: CONTOUR_DEBUG })'));
});
test('debug display is opt-in and does not affect exports',()=>{
 const ui=fs.readFileSync('tile-ui.js','utf8');assert.ok(ui.includes("get('debug')==='1'"));assert.ok(ui.includes("'observed','reconstructed','symmetry','rejected','skeleton','outer','tiles','collisions'"));
 assert.ok(ui.includes('draw(ctx,doc.layout,mounting)'));
});
