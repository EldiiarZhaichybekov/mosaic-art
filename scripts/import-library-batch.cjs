/* Bulk library importer. One JSON batch can add silhouettes and licensed photos.
 * The curated-photo mode imports the owner's local collection deterministically. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),os=require('node:os'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process'),library=require('../asset-library'),T=require('../tile-layout'),Optimized=require('../optimized-contour');
const {SUBJECTS,FILE_OVERRIDES,CATEGORY_TAGS}=require('./curated-photo-catalog.cjs');
const root=path.resolve(__dirname,'..');
const slug=/^[a-z0-9][a-z0-9-]*$/;
const supportedPhotoExtensions=new Set(['.jpg','.jpeg','.png','.webp','.avif','.psd']);
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
function normalizeName(value){return value.normalize('NFKD').replace(/[\u0300-\u036f]/g,'').toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'');}
function walk(folder){return fs.readdirSync(folder,{withFileTypes:true}).flatMap(entry=>{const absolute=path.join(folder,entry.name);return entry.isDirectory()?walk(absolute):[absolute];});}
function sha256(file){return crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex');}
function run(binary,args){const result=spawnSync(binary,args,{encoding:'utf8',maxBuffer:10*1024*1024});if(result.status!==0)throw Error(`TOOL_FAILED_${path.basename(binary)}: ${result.stderr||result.stdout}`);return result.stdout;}
function probe(file){const data=JSON.parse(run('ffprobe',['-v','error','-select_streams','v:0','-show_entries','stream=width,height','-of','json',file]));const stream=data.streams?.[0];if(!stream?.width||!stream?.height)throw Error('INVALID_IMAGE_'+path.basename(file));return {width:stream.width,height:stream.height};}
function transcodeWebP(input,output,{thumbnail=false}={}){
 const temp=fs.mkdtempSync(path.join(os.tmpdir(),'prismosaic-photo-'));const png=path.join(temp,'decoded.png');
 try{
  const args=['-v','error','-y','-i',input,'-frames:v','1'];if(thumbnail)args.push('-vf',"scale=w='min(640,iw)':h='min(640,ih)':force_original_aspect_ratio=decrease");args.push(png);run('ffmpeg',args);
  const webpArgs=['-quiet','-metadata','none','-q',thumbnail?'80':'88'];if(thumbnail)webpArgs.push('-m','6');webpArgs.push(png,'-o',output);run('cwebp',webpArgs);
 }finally{fs.rmSync(temp,{recursive:true,force:true});}
}
function sourceDescriptor(file){
 const name=path.basename(file),override=FILE_OVERRIDES[name];if(override){const subject=SUBJECTS[override.subject];if(!subject)throw Error('UNKNOWN_OVERRIDE_SUBJECT_'+name);return {subjectId:override.id||subject.id,id:override.id||subject.id,title:override.title||subject.title,categoryId:subject.categoryId,variant:0};}
 const stem=normalizeName(path.parse(name).name),variantMatch=stem.match(/(?:-copy(?:-(\d+))?|-([2-9]\d*))$/),subjectId=stem.replace(/-copy(?:-\d+)?$/,'').replace(/-([2-9]\d*)$/,'');const subject=SUBJECTS[subjectId];if(!subject)throw Error('UNKNOWN_CURATED_PHOTO_'+name);
 const variant=variantMatch?(variantMatch[1]?Number(variantMatch[1])+1:Number(variantMatch[2]||2)):0;return {subjectId,id:subject.id,title:subject.title,categoryId:subject.categoryId,variant};
}
function numberedTitle(title,number){if(number<=1)return {...title};return {en:`${title.en} ${number}`,ru:`${title.ru} ${number}`,zh:`${title.zh} ${number}`};}
function planCuratedPhotos(folder,manifest){
 const absolute=path.resolve(folder),files=walk(absolute).filter(file=>supportedPhotoExtensions.has(path.extname(file).toLowerCase())).sort((a,b)=>path.relative(absolute,a).localeCompare(path.relative(absolute,b),'en'));
 if(!files.length)throw Error('NO_SUPPORTED_PHOTOS');const allFiles=walk(absolute),unsupported=allFiles.filter(file=>!supportedPhotoExtensions.has(path.extname(file).toLowerCase()));
 const hashes=new Map(),described=files.map(file=>{try{const digest=sha256(file);if(hashes.has(digest))return {file,digest,duplicateOf:hashes.get(digest)};hashes.set(digest,file);return {file,digest,...sourceDescriptor(file)};}catch(error){return {file,status:'failed',error:error.message};}});
 const existingIds=new Set(manifest.assets.map(a=>a.id)),usedIds=new Set(),groups=new Map();for(const item of described.filter(x=>!x.duplicateOf&&x.status!=='failed')){const list=groups.get(item.subjectId)||[];list.push(item);groups.set(item.subjectId,list);}
 for(const list of groups.values()){
  list.sort((a,b)=>(a.variant||0)-(b.variant||0)||path.basename(a.file).localeCompare(path.basename(b.file),'en'));
  list.forEach((item,index)=>{const number=list.length>1?index+1:0;let base=item.id;if(existingIds.has(base)&&!manifest.assets.some(a=>a.type==='photo'&&a.sourceSha256===item.digest))base+='-photo';let candidate=base+(number>1?`-${number}`:'');let suffix=2;while(existingIds.has(candidate)||usedIds.has(candidate))candidate=`${base}-${suffix++}`;item.id=candidate;item.title=numberedTitle(item.title,number);usedIds.add(candidate);});
 }
 return {absolute,files:described,unsupported};
}
function ensureLandmarksCategory(manifest){if(!manifest.categories.some(c=>c.id==='landmarks')){const index=manifest.categories.findIndex(c=>c.id==='architecture');manifest.categories.splice(index<0?manifest.categories.length:index+1,0,{id:'landmarks',title:{ru:'Достопримечательности',en:'Landmarks',zh:'地标'}});}}
function importCuratedPhotos(folder,{reportPath=path.join(root,'library/curated-photo-import-report.json'),replace=false}={}){
 const manifestPath=path.join(root,'library/manifest.json'),manifest=JSON.parse(fs.readFileSync(manifestPath,'utf8'));ensureLandmarksCategory(manifest);const plan=planCuratedPhotos(folder,manifest),records=[],imported=[];
 for(const item of plan.files){
  const relative=path.relative(plan.absolute,item.file),extension=path.extname(item.file).toLowerCase();
  if(item.status==='failed'){records.push({sourceFile:relative,status:'failed',error:item.error});continue;}
  if(item.duplicateOf){records.push({sourceFile:relative,status:'duplicate',duplicateOf:path.relative(plan.absolute,item.duplicateOf),sourceSha256:item.digest});continue;}
  const prior=manifest.assets.find(a=>a.type==='photo'&&a.collection==='prismosaic-curated'&&a.sourceFileName===relative);
  const hashDuplicate=manifest.assets.find(a=>a.type==='photo'&&a.sourceSha256===item.digest&&a.sourceFileName!==relative);if(hashDuplicate){records.push({sourceFile:relative,status:'duplicate',duplicateOf:hashDuplicate.sourceFileName||hashDuplicate.id,sourceSha256:item.digest});continue;}
  if(prior&&prior.sourceSha256===item.digest&&!replace){records.push({sourceFile:relative,id:prior.id,status:'unchanged',sourceSha256:item.digest});continue;}
  try{
   const dimensions=probe(item.file),assetId=prior?.id||item.id,folderPath=path.join(root,'library/photos',assetId),originalName='original'+extension;fs.mkdirSync(folderPath,{recursive:true});
   const originalPath=path.join(folderPath,originalName);if(fs.existsSync(originalPath))fs.chmodSync(originalPath,0o644);fs.copyFileSync(item.file,originalPath);fs.chmodSync(originalPath,0o644);transcodeWebP(item.file,path.join(folderPath,'source.webp'));transcodeWebP(item.file,path.join(folderPath,'thumb.webp'),{thumbnail:true});
   const subjectTags=item.subjectId.split('-'),categoryTags=CATEGORY_TAGS[item.categoryId]||[];
   const asset={id:assetId,type:'photo',title:item.title,categoryId:item.categoryId,tags:[...new Set([...subjectTags,...categoryTags,item.title.en.toLowerCase(),item.title.ru.toLowerCase(),item.title.zh])],thumbnailUrl:`/library/photos/${assetId}/thumb.webp`,sourceUrl:`/library/photos/${assetId}/source.webp`,originalUrl:`/library/photos/${assetId}/${originalName}`,featured:false,sortOrder:100,sourceName:`Prismosaic curated collection — ${relative}`,author:'Unknown (provided by project owner)',license:'Provided by project owner',licenseUrl:'/library/provenance/project-owner.txt',sourceFileName:relative,sourceSha256:item.digest,collection:'prismosaic-curated',sourceDimensions:dimensions};
   manifest.assets=manifest.assets.filter(a=>a.id!==assetId&&!(a.type==='photo'&&a.collection==='prismosaic-curated'&&a.sourceFileName===relative));manifest.assets.push(asset);imported.push(assetId);records.push({sourceFile:relative,id:assetId,status:'imported',categoryId:item.categoryId,sourceSha256:item.digest,sourceDimensions:dimensions,originalUrl:asset.originalUrl,sourceUrl:asset.sourceUrl,thumbnailUrl:asset.thumbnailUrl});
  }catch(error){records.push({sourceFile:relative,status:'failed',error:error.message});}
 }
 library.validateManifest(manifest);manifest.assets.sort((a,b)=>a.type.localeCompare(b.type)||(a.sortOrder||0)-(b.sortOrder||0)||a.id.localeCompare(b.id));fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2)+'\n');
 const count=status=>records.filter(x=>x.status===status).length,countsByCategory=records.filter(x=>x.status==='imported').reduce((counts,item)=>(counts[item.categoryId]=(counts[item.categoryId]||0)+1,counts),{}),skipped=count('unchanged')+count('duplicate')+plan.unsupported.length;const report={schemaVersion:1,generatedAt:new Date().toISOString(),sourceRoot:plan.absolute,supportedExtensions:[...supportedPhotoExtensions],summary:{discovered:plan.files.length,imported:count('imported'),skipped,unchanged:count('unchanged'),duplicates:count('duplicate'),failed:count('failed'),unsupported:plan.unsupported.length,countsByCategory,totalCatalogAssets:manifest.assets.length},unsupported:plan.unsupported.map(file=>path.relative(plan.absolute,file)),assets:records};fs.mkdirSync(path.dirname(reportPath),{recursive:true});fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');return report;
}
if(require.main===module){
 const args=process.argv.slice(2),curatedIndex=args.indexOf('--curated-photos');if(curatedIndex>=0){const folder=args[curatedIndex+1];if(!folder)throw Error('Usage: node scripts/import-library-batch.cjs --curated-photos <folder> [--report <file>] [--replace]');const reportIndex=args.indexOf('--report'),reportPath=reportIndex>=0?path.resolve(args[reportIndex+1]):undefined;console.log(importCuratedPhotos(folder,{reportPath,replace:args.includes('--replace')}).summary);}
 else{const file=args[0];if(!file)throw Error('Usage: node scripts/import-library-batch.cjs <batch.json> [--replace]');console.log(importBatch(file,{replace:args.includes('--replace')}));}
}
module.exports={importBatch,importCuratedPhotos,planCuratedPhotos,sourceDescriptor,supportedPhotoExtensions};
