'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),T=require('../tile-layout');
const test=(name,fn)=>{fn();console.log('PASS',name);};
const circle={contour:Array.from({length:180},(_,i)=>[100+90*Math.cos(i*Math.PI/90),100+90*Math.sin(i*Math.PI/90)]),internal_lines:[]};
let round;
test('rigid dimensions, budget, safe area, no overlaps, closed gaps, deviation',()=>{
  round=T.generate(circle);assert.equal(round.status,'ok');assert.ok(round.tiles.length<150);assert.deepEqual(round.canvas,[400,400]);assert.ok(T.validate(round).valid);
  const grid=new T.SegmentGrid([round.target[0].points]);
  round.tiles.forEach((t,i)=>{assert.equal(t.lengthMm,30);assert.equal(t.widthMm,3);assert.equal(T.corners(t).length,4);assert.ok(T.inside(t,round.canvas));assert.ok(T.deviation(t,grid).max<=3);assert.ok(T.gap(t,round.tiles[(i+1)%round.tiles.length])<=2+1e-7);for(let j=0;j<i;j++)assert.equal(T.overlap(t,round.tiles[j]),false);});
});
test('physical 0mm contact and T-junction; crossing forbidden',()=>{
  const a=T.makeTile(80,80,0),end=T.makeTile(110,80,0),tee=T.makeTile(80,96.5,90),cross=T.makeTile(80,80,90);
  assert.equal(T.overlap(a,end),false);assert.equal(T.gap(a,end),0);
  assert.equal(T.overlap(a,tee),false);assert.ok(T.gap(a,tee)<1e-7);assert.equal(T.overlap(a,cross),true);
  assert.equal(T.overlap(a,T.makeTile(80,96.4,90)),true);
});
test('optimizer discovers rigid sharp-corner arrangements',()=>{
  const r=T.generate({contour:[[0,0],[180,0],[180,120],[0,120]],internal_lines:[]});assert.equal(r.status,'ok');assert.ok(T.validate(r).valid);
  assert.ok(r.tiles.some((t,i)=>Math.abs(Math.sin((t.angleDeg-r.tiles[(i+1)%r.tiles.length].angleDeg)*Math.PI/180))>.8));
});
test('tiny loops removed, stable portions and major skeleton retained, no physical crosses',()=>{
  const tiny=Array.from({length:20},(_,i)=>[100+4*Math.cos(i*Math.PI/10),100+4*Math.sin(i*Math.PI/10)]);tiny.push(tiny[0]);
  const r=T.generate({...circle,internal_lines:[tiny,[[40,100],[160,100]],[[100,40],[100,160]]]});
  assert.equal(r.status,'ok');assert.ok(T.validate(r).valid);assert.ok(r.tiles.some(t=>t.role==='skeleton'));assert.ok(r.tiles.length<150);assert.equal(new Set(r.tiles.filter(t=>t.role==='skeleton').map(t=>t.sourceGroupId)).size,2);
  const mixed=[[20,80],[85,80],[86,85],[87,75],[88,85],[89,75],[90,80],[180,80]];
  const m=T.generate({...circle,internal_lines:[mixed]});assert.equal(m.status,'ok');assert.ok(m.tiles.some(t=>t.role==='skeleton'));assert.ok(T.validate(m).valid);
});
test('Auto evaluates both orientations without rotating the object; overrides recompute',()=>{
  const source={contour:Array.from({length:120},(_,i)=>[100+95*Math.cos(i*Math.PI/60),60+40*Math.sin(i*Math.PI/60)]),internal_lines:[]};
  const auto=T.generate(source,{format:'30x40',orientation:'auto'}),portrait=T.generate(source,{format:'30x40',orientation:'portrait'}),landscape=T.generate(source,{format:'30x40',orientation:'landscape'});
  assert.equal(auto.evaluated.length,2);assert.equal(auto.status,'ok');assert.equal(auto.orientation,'landscape');
  assert.deepEqual(portrait.canvas,[300,400]);assert.deepEqual(landscape.canvas,[400,300]);
  assert.equal(portrait.status,'ok');assert.equal(landscape.status,'ok');assert.notDeepEqual(portrait.tiles,landscape.tiles);
  for(const r of [auto,portrait,landscape]){assert.ok(T.validate(r).valid);r.tiles.forEach(t=>assert.equal(t.lengthMm,30));}
});
test('manual edit, undo/redo and full-rectangle rejection',()=>{
  const d=new T.TileDocument(round),first=d.layout.tiles[0],before=JSON.stringify(d.layout);
  assert.equal(d.update(first.id,{xMm:0}).valid,false);assert.equal(JSON.stringify(d.layout),before);
  assert.equal(d.remove(first.id).valid,true);assert.equal(T.validate(d.layout).valid,false);assert.throws(()=>T.exportSVG(d.layout));
  d.undo();assert.equal(JSON.stringify(d.layout),before);d.redo();assert.equal(d.layout.tiles.length,round.tiles.length-1);d.undo();
  assert.equal(d.update(first.id,{angleDeg:first.angleDeg,lengthMm:5,widthMm:1}).valid,true);assert.equal(d.layout.tiles[0].lengthMm,30);assert.equal(d.layout.tiles[0].widthMm,3);
  const repair=new T.TileDocument(round);repair.remove(first.id);assert.equal(repair.add(first).valid,true);assert.ok(T.validate(repair.layout).valid);
});
test('manual 151st tile impossible; invalid physical imports rejected',()=>{
  const tiles=Array.from({length:150},(_,i)=>({...T.makeTile(32+31*(i%10),20+4*Math.floor(i/10),0,'skeleton'),id:i+1}));
  const d=new T.TileDocument({canvas:[400,400],target:[],tiles});assert.equal(d.add(T.makeTile(50,150,0)).valid,false);assert.equal(d.layout.tiles.length,150);
  assert.equal(d.remove(150).valid,true);assert.equal(d.add(T.makeTile(50,150,0)).valid,true);assert.equal(d.layout.tiles.length,150);
  assert.throws(()=>new T.TileDocument({...round,tiles:[{...round.tiles[0],lengthMm:20}]}));
});
test('snapping permits exact side contact and bypass',()=>{
  const a={...T.makeTile(80,80,0),id:1},candidate={...T.makeTile(80,97,90,'skeleton'),id:2};
  const layout={canvas:[400,400],tiles:[a],target:[]};const snapped=T.snap(candidate,layout);assert.equal(T.overlap(a,snapped),false);assert.ok(T.gap(a,snapped)<=2);assert.equal(T.snap(candidate,layout,true),candidate);
});
test('SVG preserves millimeters, actual rectangles, target, numbering, count',()=>{
  const svg=T.exportSVG(round),plan=T.exportSVG(round,{mounting:true});assert.ok(svg.includes('width="400mm" height="400mm"'));assert.equal((svg.match(/data-tile-id=/g)||[]).length,round.tiles.length);
  for(const t of round.tiles)assert.ok(svg.includes(`translate(${t.xMm} ${t.yMm}) rotate(${t.angleDeg})`));
  assert.ok(svg.includes('width="30" height="3"'));assert.ok(svg.includes('stroke-dasharray="2 1.5"'));assert.ok(plan.includes(' / 150 tiles'));assert.equal((plan.match(/dominant-baseline=/g)||[]).length,round.tiles.length);
});
test('invalid targets do not emit impossible geometry',()=>{const r=T.generate({contour:[[0,0]]});assert.equal(r.status,'LAYOUT_NOT_FEASIBLE');assert.deepEqual(r.tiles,[]);});
test('frontend syntax',()=>{new Function(fs.readFileSync('tile-ui.js','utf8'));new Function(fs.readFileSync('tile-worker.js','utf8'));});
test('Result 1 renderer and SVG/JPG export source frozen',()=>{
  const html=fs.readFileSync('index.html','utf8'),source=html.slice(html.indexOf('function drawDashes('),html.indexOf('const MAX_CONTOUR_UPLOAD_BYTES'));
  assert.equal(require('node:crypto').createHash('sha256').update(source).digest('hex'),'d29a47f87704f7856ebc439dacf199e9da9b0cb2fd5866899d75299924df57a4');
  assert.equal(require('node:crypto').createHash('sha256').update(fs.readFileSync('contour_geometry.py')).digest('hex'),'236a876de483aeb7941e924c17ba0f01d8dba5a0d0c6ac40647f5d1b2aab0767');
});
console.log('Physical layout checks complete');
