// Offline geometry comparison. Synthetic FOLLOW plans are not live AI evidence.
'use strict';
const fs=require('node:fs'),vm=require('node:vm'),cp=require('node:child_process'),assert=require('node:assert/strict');
const T=require('../tile-layout'),H=require('../result3-hybrid'),O=require('../optimized-contour');
const fixtures={...require('./fixtures/optimized-cases.json')};
const html=fs.readFileSync('index.html','utf8'),start=html.indexOf('polys: [[',html.indexOf('const PRESETS'))+7,end=html.indexOf('\n  wolf:',start),block=html.slice(start,end);
fixtures.preset_butterfly={contour:vm.runInNewContext(block.slice(0,block.lastIndexOf('}')).trim())[0],internal_lines:[]};
function oldModule(file,imports){const box={module:{exports:{}},require:name=>imports[name],console};vm.runInNewContext(cp.execFileSync('git',['show','c335e81:'+file],{encoding:'utf8'}),box);return box.module.exports;}
const oldT=oldModule('tile-layout.js',{}),oldH=oldModule('result3-hybrid.js',{'./tile-layout.js':oldT});
fixtures.preset_butterfly={contour:T.fit(fixtures.preset_butterfly,[400,400]).contour,internal_lines:[]};
const results=[];let report='<meta charset="utf-8"><title>Mixed inventory benchmark</title><style>body{font:14px system-ui;background:#eee}article{display:grid;grid-template-columns:repeat(5,1fr);gap:8px}section{background:white;padding:8px}svg{width:100%;height:auto}h3{font-size:14px}</style><h1>Offline comparisons — NOT live AI results</h1>';
function pathsSVG(paths,canvas){return O.exportSVG({status:'ok',canvas,paths});}
(async()=>{
let sharp;try{sharp=require('sharp');}catch{}
for(const [name,source]of Object.entries(fixtures)){
  const optimized=O.generate(source),context=H.prepare(source,optimized),routes=context.paths.filter(p=>p.source==='result2').slice(0,48).map((p,i)=>({id:'route_'+i,role:p.role==='outer'?'outer':'skeleton',priority:1-i/160,piecePreference:'MIXED',points:p.points.map(([x,y])=>[31+x*338,31+y*338])}));
  const previous=oldH.follow(routes,context.canvas),mixed=H.follow(routes,context.canvas),fallback=T.generate(source);
  assert.ok(T.validate(mixed).valid);assert.ok(T.validate(fallback).valid);
  const summary={fixture:name,mode:'OFFLINE_NOT_AI',oldLargeOnly:previous.tiles.length,hybrid:mixed.inventory,fallback:fallback.inventory,followerMs:mixed.timings.followerMs,fallbackMs:fallback.timings.totalMs,collisions:0,safeArea:true,skippedStations:mixed.stats.skippedStations};results.push(summary);console.log(JSON.stringify(summary));
  const panels=[['Source geometry',pathsSVG([{points:source.contour},...source.internal_lines.map(points=>({points}))],[400,400])],['Result 2',O.exportSVG(optimized)],['Target (synthetic plan)',pathsSVG(routes,context.canvas)],['Previous 30 mm follower',oldH.exportSVG(previous)],['Mixed follower',T.exportSVG(mixed)]];
  report+=`<h2>${name}</h2><p>${mixed.inventory.largeUsed} large + ${mixed.inventory.smallUsed} small; ${mixed.timings.followerMs} ms</p><article>`+panels.map(([label,svg])=>`<section><h3>${label}</h3>${svg}</section>`).join('')+'</article>';
  if(sharp){const preview=`<svg xmlns="http://www.w3.org/2000/svg" width="2000" height="430"><rect width="2000" height="430" fill="white"/>${panels.map(([label,svg],i)=>`<text x="${i*400+10}" y="20" font-size="16">${label}</text><svg x="${i*400}" y="30" width="400" height="400" viewBox="0 0 400 400">${svg.replace(/^.*?<svg[^>]*>/s,'').replace(/<\/svg>\s*$/,'')}</svg>`).join('')}</svg>`;await sharp(Buffer.from(preview)).png().toFile('/private/tmp/mixed-'+name+'.png');}
}
fs.writeFileSync('/private/tmp/prismosaic-mixed-benchmark.html',report);fs.writeFileSync('/private/tmp/prismosaic-mixed-benchmark.json',JSON.stringify(results,null,2));
})().catch(e=>{console.error(e);process.exitCode=1;});
