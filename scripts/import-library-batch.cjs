/* Bulk library importer. One JSON batch can add silhouettes and licensed photos. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),library=require('../asset-library'),T=require('../tile-layout'),Optimized=require('../optimized-contour');
const root=path.resolve(__dirname,'..');
const slug=/^[a-z0-9][a-z0-9-]*$/;
const point=p=>Array.isArray(p)&&p.length===2&&p.every(Number.isFinite);
function area(poly){let value=0;for(let i=0,j=poly.length-1;i<poly.length;j=i++)value+=poly[j][0]*poly[i][1]-poly[i][0]*poly[j][1];return Math.abs(value/2);}
function physicalSource(polys){let outer=0;for(let i=1;i<polys.length;i++)if(area(polys[i])>area(polys[outer]))outer=i;return {contour:polys[outer],internal_lines:polys.filter((_,i)=>i!==outer)};}
function requireResult3(id,result1,result2){for(const options of [{format:'40x40',orientation:'auto'},{format:'30x40',orientation:'portrait'},{format:'30x40',orientation:'landscape'}]){const layout=T.generate(result1,{...options,optimizedSource:result2});if(layout.status!=='ok'||layout.emergencyFallback||!T.validate(layout).valid)throw Error('RESULT3_NOT_READY_'+id+'_'+options.format+'_'+options.orientation);}}
function svg(polys){
 const points=polys.flat(),xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),minX=Math.min(...xs),minY=Math.min(...ys),maxX=Math.max(...xs),maxY=Math.max(...ys),pad=Math.max(maxX-minX,maxY-minY)*.08||1;
 const body=polys.map(p=>`<polygon points="${p.map(q=>q.join(',')).join(' ')}"/>`).join('');
 return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="${minX-pad} ${minY-pad} ${maxX-minX+2*pad} ${maxY-minY+2*pad}"><rect width="100%" height="100%" fill="#fafafa"/><g fill="#151515">${body}</g></svg>\n`;
}
function importBatch(batchPath,{replace=false}={}){
 const absolute=path.resolve(batchPath),batch=JSON.parse(fs.readFileSync(absolute,'utf8')),base=path.dirname(absolute);
 if(batch?.schemaVersion!==1||!Array.isArray(batch.assets)||!batch.assets.length)throw Error('INVALID_BATCH');
 const manifestPath=path.join(root,'library/manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8')),incoming=new Set();
 for(const entry of batch.assets){
  if(!slug.test(entry.id)||incoming.has(entry.id)||!['silhouette','photo'].includes(entry.type))throw Error('INVALID_BATCH_ASSET_'+entry.id);incoming.add(entry.id);
  const existing=manifest.assets.find(a=>a.id===entry.id);if(existing&&!replace)throw Error('ASSET_EXISTS_'+entry.id);
  const folder=path.join(root,'library',entry.type==='photo'?'photos':'silhouettes',entry.id);fs.mkdirSync(folder,{recursive:true});
  let sourceUrl,thumbnailUrl;
  if(entry.type==='silhouette'){
   if(!Array.isArray(entry.polys)||!entry.polys.length||!entry.polys.every(p=>Array.isArray(p)&&p.length>=3&&p.every(point)))throw Error('INVALID_SILHOUETTE_'+entry.id);
   const result1=physicalSource(entry.polys),result2=Optimized.asPhysicalInput(Optimized.generate(result1));requireResult3(entry.id,result1,result2);
   fs.writeFileSync(path.join(folder,'source.json'),JSON.stringify({schemaVersion:1,polys:entry.polys})+'\n');fs.writeFileSync(path.join(folder,'thumb.svg'),svg(entry.polys));
   sourceUrl=`/library/silhouettes/${entry.id}/source.json`;thumbnailUrl=`/library/silhouettes/${entry.id}/thumb.svg`;
  }else{
   for(const key of ['sourceFile','thumbnailFile','precomputedFile','sourceName','author','license','licenseUrl'])if(!entry[key])throw Error('PHOTO_FIELD_'+key+'_'+entry.id);
   const source=path.resolve(base,entry.sourceFile),thumbnail=path.resolve(base,entry.thumbnailFile),precomputed=path.resolve(base,entry.precomputedFile);if(!fs.statSync(source).isFile()||!fs.statSync(thumbnail).isFile()||!fs.statSync(precomputed).isFile())throw Error('PHOTO_FILE_'+entry.id);
   const bundle=JSON.parse(fs.readFileSync(precomputed,'utf8'));if(bundle.assetId!==entry.id||!bundle.result1||!bundle.result2)throw Error('PHOTO_PRECOMPUTED_'+entry.id);requireResult3(entry.id,bundle.result1,Optimized.asPhysicalInput(bundle.result2));
   const sourceExt=path.extname(source).toLowerCase(),thumbExt=path.extname(thumbnail).toLowerCase();if(!['.jpg','.jpeg','.png','.webp'].includes(sourceExt)||!['.jpg','.jpeg','.png','.webp'].includes(thumbExt))throw Error('PHOTO_FORMAT_'+entry.id);
   fs.copyFileSync(source,path.join(folder,'source'+sourceExt));fs.copyFileSync(thumbnail,path.join(folder,'thumb'+thumbExt));fs.copyFileSync(precomputed,path.join(folder,'precomputed.json'));sourceUrl=`/library/photos/${entry.id}/source${sourceExt}`;thumbnailUrl=`/library/photos/${entry.id}/thumb${thumbExt}`;entry.precomputed={url:`/library/photos/${entry.id}/precomputed.json`};
  }
  const clean={...entry,sourceUrl,thumbnailUrl};delete clean.polys;delete clean.sourceFile;delete clean.thumbnailFile;delete clean.precomputedFile;
  manifest.assets=manifest.assets.filter(a=>a.id!==entry.id);manifest.assets.push(clean);
 }
 library.validateManifest(manifest);manifest.assets.sort((a,b)=>a.type.localeCompare(b.type)||(a.sortOrder||0)-(b.sortOrder||0)||a.id.localeCompare(b.id));fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 return {imported:batch.assets.length,total:manifest.assets.length};
}
if(require.main===module){const file=process.argv[2];if(!file)throw Error('Usage: node scripts/import-library-batch.cjs <batch.json> [--replace]');console.log(importBatch(file,{replace:process.argv.includes('--replace')}));}
module.exports={importBatch};
