'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),crypto=require('node:crypto');
const L=require('../asset-library'),{processingVersion}=require('../scripts/library-version.cjs');
const catalog=JSON.parse(fs.readFileSync('library/manifest.json','utf8')),repo=L.createRepository({load:()=>catalog});
test('R1 server and refinement source frozen',()=>{
 for(const [file,hash]of Object.entries({'api/contour.py':'c981d0fefaa59a6ec31334d001368d35660cfcf973c5e4c7b847abdb4e49572e','contour_refinement.py':'6389ba6ffc27a9095069e74272fa17f06215cc81ebeccaffab8a8a90dc7f30c9'}))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash);
});
test('catalog, provenance and all 14 original preset geometries preserved',async()=>{
 const context={module:{exports:{}},console};vm.runInNewContext(fs.readFileSync('index.html','utf8').match(/<script>([\s\S]*)<\/script>/)[1],context);
 const presets=context.module.exports.PRESETS;assert.equal(catalog.assets.filter(a=>a.type==='silhouette').length,Object.keys(presets).length);
 for(const [id,p]of Object.entries(presets)){const a=await repo.getAsset(id);assert.ok(a);assert.equal(JSON.stringify(JSON.parse(fs.readFileSync('.'+a.sourceUrl)).polys),JSON.stringify(p.polys));}
 for(const asset of catalog.assets){for(const lang of ['ru','en','zh'])assert.ok(asset.title[lang]);for(const url of [asset.sourceUrl,asset.thumbnailUrl])assert.ok(fs.statSync('.'+url).size>0);if(asset.type==='photo')for(const key of ['sourceName','author','license','licenseUrl'])assert.ok(asset[key]);}
 assert.equal(await repo.getAsset('unknown'),null);assert.deepEqual((await repo.getCategories('photo')).map(c=>c.id),['nature']);
 assert.equal((await repo.getAssets({search:'Волк'})).items[0].id,'wolf');assert.equal((await repo.getAssets({search:'蝴蝶'})).items[0].id,'butterfly');assert.equal((await repo.getAssets({type:'photo',search:'fruit'})).items[0].id,'apple');
 assert.equal((await repo.getAssets({category:'not-a-category'})).total,0);assert.equal(L.localized({en:'Fallback'},'zh'),'Fallback');
});
test('500 metadata assets: pagination/search and empty categories',async()=>{
 const data=structuredClone(catalog);data.assets=Array.from({length:500},(_,i)=>({...data.assets[0],id:'sample-'+i,title:{en:'Sample '+i},tags:['tag'+i]}));const large=L.createRepository({load:()=>data}),start=performance.now();
 for(let i=0;i<100;i++)assert.equal((await large.getAssets({search:'tag499'})).total,1);
 const first=await large.getAssets(),second=await large.getAssets({page:2});assert.equal(first.items.length,24);assert.equal(second.items.length,24);assert.ok(first.hasMore);assert.ok(!second.items.some(a=>first.items.some(b=>a.id===b.id)));assert.equal((await large.getCategories('photo')).length,0);
 console.log('500 assets / 100 searches ms:',Math.round(performance.now()-start));
});
test('manifest fails safely and repository retries a failed load',async()=>{
 for(const change of [d=>d.assets.push(d.assets[0]),d=>d.assets[0].sourceUrl='/library/../secret',d=>d.assets.at(-1).license='',d=>d.schemaVersion=99]){const d=structuredClone(catalog);change(d);assert.throws(()=>L.validateManifest(d));}
 let calls=0;const r=L.createRepository({load:()=>{if(!calls++)throw Error('offline');return catalog;}});await assert.rejects(r.getAsset('wolf'));assert.ok(await r.getAsset('wolf'));
});
test('prepared results validate version, source, asset, canvas and geometry',()=>{
 const b=JSON.parse(fs.readFileSync('library/photos/apple/precomputed.json')),sourceHash=crypto.createHash('sha256').update(fs.readFileSync('library/photos/apple/source.jpg')).digest('hex'),options={assetId:'apple',canvas:[400,400],sourceHash,version:processingVersion()};
 assert.ok(L.validatePrepared(b,options));for(const changed of [{canvas:[300,400]},{sourceHash:'stale'},{version:'stale'},{assetId:'unknown'}])assert.equal(L.validatePrepared(b,{...options,...changed}),null);
 for(const change of [d=>d.result1.contour=[[NaN,0]],d=>d.result1.internal_lines=null,d=>d.result2.paths[0].points=[[Infinity,0]],d=>d.result2.diagnostics.rejected=[{points:null}]]){const d=structuredClone(b);change(d);assert.equal(L.validatePrepared(d,options),null);}
 const onlyR1=structuredClone(b);delete onlyR1.result2;assert.ok(L.validatePrepared(onlyR1,options));
});
test('all shared UI strings have RU/EN/ZH values',()=>{
 require('../workspace-i18n');require('../workspace-refinement');require('../asset-library-ui');const m=globalThis.WorkspaceMessages;
 for(const key of Object.keys(m.en).filter(k=>k.startsWith('lib.')))for(const lang of ['ru','en','zh'])assert.ok(m[lang][key]);
});
test('source loader: absent/corrupt/stale cache safely returns original file',async()=>{
 const originalFetch=globalThis.fetch,asset=catalog.assets.find(a=>a.id==='apple'),bytes=fs.readFileSync('.'+asset.sourceUrl),bundle=JSON.parse(fs.readFileSync('.'+asset.precomputed.url));
 try{for(const scenario of ['absent','valid','corrupt','stale','wrong-canvas','missing']){
  const calls=[];globalThis.fetch=async url=>{calls.push(url);if(url===asset.sourceUrl)return new Response(bytes,{headers:{'Content-Type':'image/jpeg'}});if(url==='/library/processing-version.json')return Response.json({processingVersion:processingVersion()});if(scenario==='missing')return new Response('missing',{status:404});if(scenario==='corrupt')return new Response('not JSON');const b=structuredClone(bundle);if(scenario==='stale')b.processingVersion='old';return Response.json(b);};
  const a={...asset};if(scenario==='absent')delete a.precomputed;const loaded=await L.loadSource(a,scenario==='wrong-canvas'?[300,400]:[400,400]);assert.equal(loaded.file.size,bytes.length);assert.equal(loaded.file.type,'image/jpeg');assert.equal(!!loaded.prepared,scenario==='valid');if(scenario==='absent')assert.deepEqual(calls,[asset.sourceUrl]);
 }}finally{globalThis.fetch=originalFetch;}
});
