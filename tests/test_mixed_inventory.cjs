'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),T=require('../tile-layout'),H=require('../result3-hybrid'),C=require('../result3-contract');
const test=(name,fn)=>{fn();console.log('PASS',name);};
const canvas=[400,400],piece=(type,x=60,y=60,a=0)=>({...T.makeTile(x,y,a,'outer',0,type),id:1});
const packed=(large,small)=>Array.from({length:large+small},(_,i)=>({...piece(i<large?'large':'small',35+34*(i%10),25+5*Math.floor(i/10)),id:i+1}));
const layout=tiles=>({schemaVersion:3,mode:'AI_HYBRID',canvas,tiles,target:[{id:0,role:'outer',points:[[20,20],[380,20]]}]});
const route=(points,extra={})=>({id:0,role:'outer',priority:1,points,...extra});
const follow=(points,extra={},fixed=[])=>T.followMixed([route(points,extra)],canvas,150,fixed);
test('exact dimensions and independent inventory limits',()=>{
  for(const type of ['large','small'])assert.deepEqual([piece(type).lengthMm,piece(type).widthMm],[type==='large'?30:10,3]);
  assert.ok(T.validate(layout(packed(100,50))).valid);
  for(const [large,small,code]of [[101,20,'LARGE_LIMIT'],[80,51,'SMALL_LIMIT'],[101,50,'TILE_LIMIT']])assert.ok(T.validate(layout(packed(large,small))).errors.includes(code));
  assert.ok(T.inventory(packed(99,50)).valid);assert.ok(T.inventory(packed(80,40)).valid);
});
test('SAT for all size pairs: contact, crossing, rotation, disjoint short rectangles',()=>{
  for(const a of ['large','small'])for(const b of ['large','small']){
    const left=piece(a),right=piece(b,60+(T.INVENTORY[a].lengthMm+T.INVENTORY[b].lengthMm)/2);
    assert.equal(T.overlap(left,right),false);assert.equal(T.gap(left,right),0);
    assert.ok(T.overlap(left,piece(b,60,60,90)));assert.ok(T.overlap(piece(a,60,60,45),piece(b,60,60,-45)));
  }
  assert.equal(T.overlap(piece('small'),piece('small',71)),false);
});
test('entire oriented rectangle stays inside safe area for both sizes',()=>{
  for(const type of ['large','small']){const half=T.INVENTORY[type].lengthMm/2;assert.ok(T.inside(piece(type,15+half,30),canvas));assert.equal(T.inside(piece(type,15+half-.01,30),canvas),false);assert.equal(T.inside(piece(type,18,18,45),canvas),false);}
});
test('editor Add Large/Small enforces separate limits; undo redo preserves types',()=>{
  const doc=new T.TileDocument(layout(packed(100,49)));
  assert.ok(doc.add(piece('small',50,180)).valid);assert.ok(doc.add(piece('large',90,180)).errors.includes('LARGE_LIMIT'));
  doc.undo();assert.equal(T.inventory(doc.layout.tiles).smallUsed,49);doc.redo();assert.equal(T.inventory(doc.layout.tiles).smallUsed,50);
  doc.remove(1);assert.ok(doc.add(piece('small',100,180)).errors.includes('SMALL_LIMIT'));assert.ok(doc.add(piece('large',100,180)).valid);
  const t=doc.layout.tiles.at(-1);assert.equal(doc.update(t.id,{lengthMm:10}).valid,false);assert.equal(doc.update(t.id,{type:'small',lengthMm:10}).valid,false);
});
test('legacy layout migration is unambiguous and never resizes pieces',()=>{
  const old={...piece('large')};delete old.type;delete old.lengthMm;
  const doc=new T.TileDocument(layout([old]));assert.equal(doc.layout.schemaVersion,3);assert.equal(doc.layout.tiles[0].type,'large');assert.equal(doc.layout.tiles[0].lengthMm,30);
  assert.throws(()=>new T.TileDocument(layout([{...old,lengthMm:10}])));assert.throws(()=>T.makeTile(50,50,0,'outer',0,'medium'));
});
test('SVG and mounting labels preserve every size, type and exact transform',()=>{
  const l=layout([piece('large'),{...piece('small',100),id:2}]);const svg=T.exportSVG(l,{mounting:true});
  assert.ok(svg.includes('data-tile-type="large" x="-15"'));assert.ok(svg.includes('data-tile-type="small" x="-5"'));assert.ok(svg.includes('width="10" height="3"'));assert.ok(svg.includes('>2·10</text>'));
});
test('straight, broad curve and micro-wobble favor structural large strips',()=>{
  const straight=follow([[40,40],[340,40]]);assert.equal(straight.inventory.largeUsed,10);assert.equal(straight.inventory.smallUsed,0);
  const gentle=follow(Array.from({length:41},(_,i)=>[50+i*7,80+20*Math.sin(i/40*Math.PI)]));assert.ok(gentle.inventory.largeUsed>=8);assert.ok(gentle.inventory.smallUsed<=2);
  const wobble=follow(Array.from({length:51},(_,i)=>[40+i*6,40+(i%2)*.4]));assert.equal(wobble.inventory.smallUsed,0);
});
test('sharp turn mixes sizes and terminal feature uses a real small strip',()=>{
  const l=follow([[40,40],[135,40],[150,55],[150,200]]);assert.ok(l.inventory.largeUsed>0&&l.inventory.smallUsed>0);assert.ok(T.validate(l).valid);
  const terminal=follow([[40,40],[100,40],[100,52]]);assert.equal(terminal.inventory.smallUsed,1);assert.equal(terminal.tiles.at(-1).decisionReason,'SMALL_SELECTED_ENDPOINT');
});
test('remaining small inventory changes decisions without creating stock',()=>{
  const path=[[40,250],[135,250],[150,265],[150,360]],rich=follow(path),fixed=packed(0,50),scarce=follow(path,{},fixed);
  assert.ok(rich.inventory.smallUsed>0);assert.equal(scarce.inventory.smallUsed,50);assert.ok(scarce.tiles.slice(50).every(t=>t.type==='large'));assert.ok(T.validate(scarce).valid);
});
test('schema accepts size intent; invalid types and inventory are rejected',()=>{
  const context={version:1,canvas,inventory:T.INVENTORY,paths:[{id:'r2_0',source:'result2',role:'outer',points:[[.1,.1],[.8,.8]]}]};
  for(const hint of ['LARGE','SMALL_FOR_TURN','MIXED']){const plan=C.example(context);plan.routes[0].piecePreference=hint;assert.equal(H.validatePlan(plan,context).routes[0].piecePreference,hint);}
  const bad=C.example(context);bad.routes[0].piecePreference='CUT_TO_12_MM';assert.throws(()=>H.validatePlan(bad,context));
  assert.throws(()=>H.validateContext({...context,inventory:{...T.INVENTORY,small:{...T.INVENTORY.small,available:100}}}));
  assert.throws(()=>H.validateContext({...context,inventory:{...T.INVENTORY,medium:{available:50}}}));
  assert.ok(T.validate(follow([[40,40],[100,40],[100,52]],{piecePreference:'SMALL_FOR_TURN'})).valid);
});
test('local size repair reuses common solver and never exceeds inventory',()=>{
  const l=follow([[40,40],[135,40],[150,55],[150,200]],{piecePreference:'LARGE'});
  for(const action of ['REBUILD_WITH_SMALL','REBUILD_WITH_LARGE']){const repaired=H.repair(l,{repairs:[{routeId:0,action}]},150);assert.ok(T.validate(repaired).valid);assert.equal(repaired.target[0].piecePreference,action==='REBUILD_WITH_SMALL'?'SMALL_FOR_TURN':'LARGE');}
});
test('new customer strings exist in RU/EN/ZH and UI renders actual dimensions',()=>{
  const box={};vm.runInNewContext(fs.readFileSync('tile-i18n.js','utf8'),box);
  for(const lang of ['ru','en','zh'])for(const key of ['addLarge','addSmall','pieceSize','LARGE_LIMIT','SMALL_LIMIT','count','mountHeader','mountFooter'])assert.ok(box.TileMessages[lang]['tile.'+key]);
  for(const file of ['tile-ui.js','result3-worker.js','result3-lab.js'])assert.ok(!fs.readFileSync(file,'utf8').includes('fillRect(-15,-1.5,30,3)'));
});
