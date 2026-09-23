// Offline geometry regression only. These FOLLOW plans are NOT AI results.
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),H=require('../result3-hybrid'),O=require('../optimized-contour'),T=require('../tile-layout');
const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/optimized-cases.json','utf8'));
const crypto=require('node:crypto');
// The baseline math remains frozen. AI orchestration in optimized-ui is now
// intentionally changeable; its renderer/export are checked separately below.
const frozenSource=file=>fs.readFileSync(file,'utf8');
const optimizedUI=fs.readFileSync('optimized-ui.js','utf8');
for(const [source,hash]of [[optimizedUI.slice(optimizedUI.indexOf('    function draw('),optimizedUI.indexOf('    function refresh(')),'516ddbfad3fddbdc488db7d26008f1d5452b33c35a692911aeb00b5edd0b0934'],[optimizedUI.slice(optimizedUI.indexOf('export(kind)'),optimizedUI.indexOf('\n  }\n')),'c4c60d099b6b720725395ab6f34508c406bd39f69818c1f21948bc62f43239fe']])assert.equal(crypto.createHash('sha256').update(source).digest('hex'),hash,'Result 2 renderer/export remains unchanged');
for(const [file,hash]of Object.entries({'optimized-contour.js':'8c2ee8324aa24e73d7d38f9a2b65d1ebc918c677ee4b37805c5353f96c36a371','optimized-worker.js':'ecc68dfc09a27e436f8a61e205b485551b70dc5e15cf92d9feab807b68b8fb16','contour_geometry.py':'236a876de483aeb7941e924c17ba0f01d8dba5a0d0c6ac40647f5d1b2aab0767'}))assert.equal(crypto.createHash('sha256').update(frozenSource(file)).digest('hex'),hash);
let html='<meta charset="utf-8"><title>Offline follower — NOT AI output</title><style>body{font:14px system-ui}article{display:flex}section{width:33%}svg{width:100%}</style><h1>Offline follower test — synthetic FOLLOW plans, NOT DeepSeek output</h1>';
for(const [name,source]of Object.entries(fixtures)){
  const optimized=O.generate(source),context=H.prepare(source,optimized),plan={version:1,objectAnalysis:'Offline fixture, no semantic inference',essentialFeatures:[],globalIntent:'FOLLOW baseline only',complexityBudget:150,omissions:[],routes:context.paths.filter(p=>p.source==='result2').slice(0,48).map((p,i)=>({id:'route_'+i,role:p.role,priority:1-i/160,sourcePathIds:[p.id],source:'result2',strategy:'FOLLOW',viaAnchors:[],reason:'offline geometry test'}))};
  const start=Date.now(),target=H.target(plan,context),layout=H.follow(target,context.canvas,150),gapRoutes=Object.values(layout.routeCoverage).filter(r=>r.gapsOver2mm>0).length;assert.ok(T.validate(layout).valid);assert.equal(H.physical(layout).valid,gapRoutes===0);
  const targetSVG=O.exportSVG({status:'ok',canvas:context.canvas,paths:target});html+=`<h2>${name}</h2><article><section><h3>Result 2</h3>${O.exportSVG(optimized)}</section><section><h3>Unplanned target</h3>${targetSVG}</section><section><h3>Follower (unreviewed)</h3>${H.exportSVG(layout)}</section></article>`;
  console.log(JSON.stringify({fixture:name,mode:'OFFLINE_NOT_AI',tiles:layout.tiles.length,gapRoutes,strictPhysical:H.physical(layout).valid,followerMs:layout.timings.followerMs,totalGeometryMs:Date.now()-start,skippedStations:layout.stats.skippedStations}));
}
fs.writeFileSync('/private/tmp/drawacrl-hybrid-offline.html',html);
console.log('PASS frozen Result 1/2 hashes; unsafe offline routes are identified for deterministic fallback. AI quality NOT tested.');
