// Offline geometry regression only. These FOLLOW plans are NOT AI results.
'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),H=require('../result3-hybrid'),O=require('../optimized-contour');
const fixtures=JSON.parse(fs.readFileSync('tests/fixtures/optimized-cases.json','utf8'));
const crypto=require('node:crypto');
for(const [file,hash]of Object.entries({'optimized-contour.js':'8c2ee8324aa24e73d7d38f9a2b65d1ebc918c677ee4b37805c5353f96c36a371','optimized-ui.js':'b96c22400390adea987ff9da6287b051aee56034b79502d13866b35ca273cf9f','optimized-worker.js':'ecc68dfc09a27e436f8a61e205b485551b70dc5e15cf92d9feab807b68b8fb16','contour_geometry.py':'236a876de483aeb7941e924c17ba0f01d8dba5a0d0c6ac40647f5d1b2aab0767'}))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash);
let html='<meta charset="utf-8"><title>Offline follower — NOT AI output</title><style>body{font:14px system-ui}article{display:flex}section{width:33%}svg{width:100%}</style><h1>Offline follower test — synthetic FOLLOW plans, NOT DeepSeek output</h1>';
for(const [name,source]of Object.entries(fixtures)){
  const optimized=O.generate(source),context=H.prepare(source,optimized),plan={version:1,objectAnalysis:'Offline fixture, no semantic inference',essentialFeatures:[],globalIntent:'FOLLOW baseline only',complexityBudget:150,omissions:[],routes:context.paths.filter(p=>p.source==='result2').slice(0,48).map((p,i)=>({id:'route_'+i,role:p.role,priority:1-i/160,sourcePathIds:[p.id],source:'result2',strategy:'FOLLOW',viaAnchors:[],reason:'offline geometry test'}))};
  const start=Date.now(),target=H.target(plan,context),layout=H.follow(target,context.canvas,150);assert.ok(H.physical(layout).valid);
  const targetSVG=O.exportSVG({status:'ok',canvas:context.canvas,paths:target});html+=`<h2>${name}</h2><article><section><h3>Result 2</h3>${O.exportSVG(optimized)}</section><section><h3>Unplanned target</h3>${targetSVG}</section><section><h3>Follower (unreviewed)</h3>${H.exportSVG(layout)}</section></article>`;
  console.log(JSON.stringify({fixture:name,mode:'OFFLINE_NOT_AI',tiles:layout.tiles.length,followerMs:layout.timings.followerMs,totalGeometryMs:Date.now()-start,skippedStations:layout.stats.skippedStations}));
}
fs.writeFileSync('/private/tmp/drawacrl-hybrid-offline.html',html);
console.log('PASS frozen Result 1/2 hashes; offline physical fixtures. AI quality NOT tested.');
