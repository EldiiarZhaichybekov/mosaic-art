'use strict';
const assert=require('node:assert/strict'),T=require('../tile-layout'),O=require('../optimized-contour'),fixtures=require('./fixtures/optimized-cases.json');
const profile=T.FALLBACK_PROFILES.find(p=>p.id==='reduced-detail');
const test=(name,fn)=>{fn();console.log('PASS',name);};
function pair(name){const source=O.asPhysicalInput(O.generate(fixtures[name])),before=T.generateForCanvas(source,[400,400],{...profile,enableSmallRefinement:false}),after=T.generateForCanvas(source,[400,400],profile);return {before,after};}
test('strict fallback restores real small strips on two difficult silhouettes',()=>{
  for(const name of ['butterfly','bat']){const {before,after}=pair(name),oldStock=T.inventory(before.tiles),stock=T.inventory(after.tiles);
    assert.equal(oldStock.smallUsed,0,name+' regression baseline');assert.ok(stock.smallUsed>0,name+' must use short strips where geometry improves');assert.ok(stock.largeUsed<=100&&stock.smallUsed<=50&&stock.totalUsed<=150);assert.ok(T.validate(after).valid);
    assert.ok(after.mixedDiagnostics.largeCandidatesGenerated>0);assert.ok(after.mixedDiagnostics.smallCandidatesGenerated>0);assert.equal(after.mixedDiagnostics.largeSelected,stock.largeUsed);assert.equal(after.mixedDiagnostics.smallSelected,stock.smallUsed);assert.ok(after.mixedDiagnostics.smallSelections.every(s=>s.meanImprovementMm>0));
  }
});
test('simple broad circle does not waste scarce small inventory',()=>{const source={contour:Array.from({length:180},(_,i)=>[200+120*Math.cos(i*Math.PI/90),200+120*Math.sin(i*Math.PI/90)]),internal_lines:[]},layout=T.generateForCanvas(source,[400,400],profile);assert.ok(T.validate(layout).valid);assert.equal(T.inventory(layout.tiles).smallUsed,0);});
test('mixed follower exposes candidate and rejection diagnostics without changing its choices',()=>{const route={id:'turn',role:'outer',priority:1,piecePreference:'MIXED',points:[[40,40],[135,40],[150,55],[150,200]]},layout=T.followMixed([route],[400,400]);assert.ok(T.validate(layout).valid);assert.ok(layout.mixedDiagnostics.largeCandidatesGenerated>0&&layout.mixedDiagnostics.smallCandidatesGenerated>0);assert.equal(layout.mixedDiagnostics.largeSelected,layout.inventory.largeUsed);assert.equal(layout.mixedDiagnostics.smallSelected,layout.inventory.smallUsed);assert.ok(Object.keys(layout.mixedDiagnostics.selectionReasons).length>0);});
