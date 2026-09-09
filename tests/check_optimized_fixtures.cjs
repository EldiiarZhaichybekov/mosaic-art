'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),O=require('../optimized-contour'),G=require('../tile-layout'),cases=require('./fixtures/optimized-cases.json');
for(const [name,source] of Object.entries(cases)){
 const before=JSON.stringify(source),result=O.generate(source);assert.equal(JSON.stringify(source),before);O.assertResult(result);assert.ok(result.internal_lines.length>0);assert.ok(result.internal_lines.length<source.internal_lines.length);
 const sourceSize=Math.max(...source.contour.map(p=>p[0]))-Math.min(...source.contour.map(p=>p[0]));for(const p of source.contour)assert.ok(G.nearestOnPath(p,result.contour).distance<sourceSize*.0015);
 fs.writeFileSync('/private/tmp/result2-'+name+'.svg',O.exportSVG(result));fs.writeFileSync('/private/tmp/result1-'+name+'.svg',O.exportSVG({status:'ok',canvas:[400,400],paths:[source.contour,...source.internal_lines].map(points=>({points}))}));
 console.log('PASS fixture',name,source.internal_lines.length,'->',result.internal_lines.length,result.timings.totalMs+'ms');
}
