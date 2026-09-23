/* Validate curated photos through the production Result 1 -> 2 -> 3 path.
 * Geometry is intentionally discarded; only fingerprints and compact metrics
 * are committed so every customer request still uses the normal live pipeline. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawn,spawnSync}=require('node:child_process');
const library=require('../asset-library'),O=require('../optimized-contour'),T=require('../tile-layout'),{processingVersion}=require('./library-version.cjs');
const root=path.resolve(__dirname,'..'),reportPath=path.join(root,'library/photo-pipeline-validation.json'),python=process.env.PYTHON||'python3',canvas=[400,400];
const formats=[{id:'40x40',options:{format:'40x40',orientation:'auto'}},{id:'30x40-portrait',options:{format:'30x40',orientation:'portrait'}},{id:'30x40-landscape',options:{format:'30x40',orientation:'landscape'}}];
function hash(bytes){return crypto.createHash('sha256').update(bytes).digest('hex');}
function mimeFor(url){return {'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}[path.extname(url).toLowerCase()];}
function validateResult1(asset,bytes){
 const mime=mimeFor(asset.sourceUrl);if(!mime||bytes.length>3*1024*1024)throw Error('UNSUPPORTED_SOURCE');
 const result=spawnSync(python,['-c',`
import base64,json,sys
from api.contour import app
with app.test_client() as client:
    response=client.post('/api/contour',json={'image':'data:${mime};base64,'+base64.b64encode(sys.stdin.buffer.read()).decode(),'canvas':[400,400]})
    if response.status_code!=200: raise RuntimeError(response.get_data(as_text=True))
    print(response.get_data(as_text=True))
`],{cwd:root,input:bytes,maxBuffer:64*1024*1024,timeout:120000});
 if(result.status!==0)throw Error((result.stderr?.toString()||result.error?.message||'R1_FAILED').trim());return JSON.parse(result.stdout.toString());
}
function validateAsset(asset){
 const started=Date.now(),bytes=fs.readFileSync(path.join(root,asset.sourceUrl.replace(/^\//,''))),sourceSha256=hash(bytes),stages={};let began=Date.now();const result1=validateResult1(asset,bytes);stages.result1Ms=Date.now()-began;
 began=Date.now();const result2=O.generate(result1,{canvas});if(result2.status!=='ok')throw Error('RESULT2_'+result2.status);stages.result2Ms=Date.now()-began;
 const canvases=[];for(const format of formats){began=Date.now();const layout=T.generate(result1,{...format.options,optimizedSource:O.asPhysicalInput(result2)}),checked=T.validate(layout),stock=T.inventory(layout.tiles||[]),status=layout.status==='ok'&&checked.valid?'pass':'fail';canvases.push({format:format.id,status,tiles:layout.tiles?.length||0,largeTiles:stock.largeUsed,smallTiles:stock.smallUsed,fallbackProfile:layout.fallbackProfile,inputSource:layout.inputSource,outerCoveragePercent:layout.metrics?.outerCoveragePercent,internalCoveragePercent:layout.metrics?.internalCoveragePercent,meanDistanceToResult2:layout.metrics?.meanDistanceToResult2,maxDistanceToResult2:layout.metrics?.maxDistanceToResult2,gapCount:layout.metrics?.gapCount,durationMs:Date.now()-began,errors:checked.errors});}
 return {id:asset.id,status:canvases.every(item=>item.status==='pass')?'pass':'fail',sourceSha256,originalSha256:asset.sourceSha256,processingVersion:processingVersion(),solverVersion:T.version,sourceBytes:bytes.length,stages,durationMs:Date.now()-started,result1:{contourPoints:result1.contour?.length||0,dashPaths:result1.dashes?.length||0,internalLines:result1.internal_lines?.length||0},result2:{paths:result2.paths?.length||0},canvases};
}
function writeReport(assets,total){const failed=assets.filter(a=>a.status!=='pass'),report={schemaVersion:1,generatedAt:new Date().toISOString(),processingVersion:processingVersion(),solverVersion:T.version,summary:{requested:total,validated:assets.length,passed:assets.length-failed.length,failed:failed.length},assets};fs.writeFileSync(reportPath,JSON.stringify(report,null,2)+'\n');return report;}
const catalog=library.validateManifest(JSON.parse(fs.readFileSync(path.join(root,'library/manifest.json'),'utf8'))),photos=catalog.assets.filter(a=>a.type==='photo'&&a.collection==='prismosaic-curated');
function runWorker(asset){return new Promise(resolve=>{const output=[],errors=[],child=spawn(process.execPath,[__filename,'--worker',asset.id],{cwd:root,env:process.env});child.stdout.on('data',chunk=>output.push(chunk));child.stderr.on('data',chunk=>errors.push(chunk));child.on('close',()=>{try{resolve(JSON.parse(Buffer.concat(output).toString()));}catch(error){resolve({id:asset.id,status:'fail',sourceSha256:hash(fs.readFileSync(publicFile(asset.sourceUrl))),originalSha256:asset.sourceSha256,processingVersion:processingVersion(),solverVersion:T.version,error:(Buffer.concat(errors).toString()||error.message).trim()});}});});}
function publicFile(url){return path.join(root,url.replace(/^\//,''));}
async function main(){
 const limitArg=process.argv.indexOf('--limit'),selected=limitArg>=0?photos.slice(0,Number(process.argv[limitArg+1])):photos,previous=fs.existsSync(reportPath)?JSON.parse(fs.readFileSync(reportPath,'utf8')):null,assets=[],pending=[];
 for(const asset of selected){const digest=hash(fs.readFileSync(publicFile(asset.sourceUrl))),cached=!process.argv.includes('--force')&&previous?.processingVersion===processingVersion()&&previous?.solverVersion===T.version&&previous.assets?.find(item=>item.id===asset.id&&item.sourceSha256===digest&&item.status==='pass'&&item.canvases?.some(canvas=>canvas.format==='40x40'));
  if(cached&&formats.every(format=>cached.canvases.some(canvas=>canvas.format===format.id)))assets.push(cached);else pending.push(asset);
 }
 let cursor=0,finished=assets.length;async function consume(){while(cursor<pending.length){const asset=pending[cursor++],result=await runWorker(asset);assets.push(result);finished++;console.log(`${result.status.toUpperCase()} ${finished}/${selected.length} ${asset.id}${result.stages?` R1=${result.stages.result1Ms}ms total=${result.durationMs}ms`:''}`);writeReport(assets.sort((a,b)=>a.id.localeCompare(b.id)),selected.length);}}
 await Promise.all(Array.from({length:Math.min(4,pending.length)},consume));const report=writeReport(assets.sort((a,b)=>a.id.localeCompare(b.id)),selected.length);console.log(JSON.stringify(report.summary));if(report.summary.failed||report.summary.validated!==report.summary.requested)process.exitCode=1;
}
const workerIndex=process.argv.indexOf('--worker');if(workerIndex>=0){const asset=photos.find(item=>item.id===process.argv[workerIndex+1]);if(!asset)throw Error('UNKNOWN_PHOTO');try{process.stdout.write(JSON.stringify(validateAsset(asset)));}catch(error){process.stdout.write(JSON.stringify({id:asset.id,status:'fail',sourceSha256:hash(fs.readFileSync(publicFile(asset.sourceUrl))),originalSha256:asset.sourceSha256,processingVersion:processingVersion(),solverVersion:T.version,error:error.message}));process.exitCode=1;}}else main().catch(error=>{console.error(error);process.exitCode=1;});
