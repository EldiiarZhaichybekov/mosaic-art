/* Validate every customer-visible library source through Result 1 -> 2 -> 3. */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto');
const T=require('../tile-layout'),Optimized=require('../optimized-contour');
const root=path.resolve(__dirname,'..'),manifest=require('../library/manifest.json');
const formats=[
  {id:'40x40',options:{format:'40x40',orientation:'auto'}},
  {id:'30x40-portrait',options:{format:'30x40',orientation:'portrait'}},
  {id:'30x40-landscape',options:{format:'30x40',orientation:'landscape'}}
];
function area(poly){let value=0;for(let i=0,j=poly.length-1;i<poly.length;j=i++)value+=poly[j][0]*poly[i][1]-poly[i][0]*poly[j][1];return Math.abs(value/2);}
function publicFile(url){return path.join(root,url.replace(/^\//,''));}
function silhouetteSource(asset){const data=JSON.parse(fs.readFileSync(publicFile(asset.sourceUrl),'utf8'));let outer=0;for(let i=1;i<data.polys.length;i++)if(area(data.polys[i])>area(data.polys[outer]))outer=i;return {contour:data.polys[outer],internal_lines:data.polys.filter((_,i)=>i!==outer)};}
function photoSources(asset){const bundle=JSON.parse(fs.readFileSync(publicFile(asset.precomputed.url),'utf8'));return {result1:bundle.result1,result2:bundle.result2||null};}
function sources(asset){if(asset.type==='photo')return photoSources(asset);const result1=silhouetteSource(asset),result2=Optimized.generate(result1);return {result1,result2};}
function title(asset){return asset.title.en||asset.title.ru||Object.values(asset.title)[0];}
function validateAsset(asset){
  const source=sources(asset),started=Date.now(),canvases=[];
  for(const format of formats){
    const began=Date.now();
    const layout=T.generate(source.result1,{...format.options,optimizedSource:source.result2}),checked=T.validate(layout),stock=T.inventory(layout.tiles||[]);
    canvases.push({format:format.id,status:layout.status==='ok'&&checked.valid?'pass':'fail',initialStatus:layout.status==='ok'&&checked.valid?'pass':'fail',fallbackProfile:layout.fallbackProfile,inputSource:layout.inputSource,targetPolicy:layout.targetPolicy,outerCoveragePercent:layout.metrics?.outerCoveragePercent,internalCoveragePercent:layout.metrics?.internalCoveragePercent,meanDistanceToResult2:layout.metrics?.meanDistanceToResult2,maxDistanceToResult2:layout.metrics?.maxDistanceToResult2,gapCount:layout.metrics?.gapCount,emergencyFallback:false,tiles:layout.tiles?.length||0,largeTiles:stock.largeUsed,smallTiles:stock.smallUsed,durationMs:Date.now()-began,errors:checked.errors});
  }
  return {id:asset.id,title:title(asset),type:asset.type,status:canvases.every(c=>c.status==='pass')?'pass':'fail',durationMs:Date.now()-started,canvases};
}
const assets=[];for(const asset of manifest.assets){const result=validateAsset(asset);assets.push(result);console.log(result.status.toUpperCase(),asset.id,result.canvases.map(c=>`${c.format}:${c.fallbackProfile||c.status}/${c.tiles}`).join(' '));}
const initialFailures=assets.reduce((n,a)=>n+a.canvases.filter(c=>c.initialStatus==='fail').length,0),initialAssetsFailed=assets.filter(a=>a.canvases.some(c=>c.initialStatus==='fail')).length,failures=assets.filter(a=>a.status==='fail');
const report={schemaVersion:1,generatedAt:new Date().toISOString(),solverVersion:T.version,manifestSha256:crypto.createHash('sha256').update(fs.readFileSync(path.join(root,'library/manifest.json'))).digest('hex'),summary:{assets:assets.length,silhouettes:assets.filter(a=>a.type==='silhouette').length,photos:assets.filter(a=>a.type==='photo').length,passed:assets.length-failures.length,failed:failures.length,initialAssetsFailed,initialCanvasFailures:initialFailures,canvasConfigurations:assets.length*formats.length},assets};
if(process.argv.includes('--write'))fs.writeFileSync(path.join(root,'library/result3-validation.json'),JSON.stringify(report,null,2)+'\n');
console.log(JSON.stringify(report.summary));if(failures.length)process.exitCode=1;
