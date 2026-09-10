// Explicit live experiment: plan + QA, with at most one text-only format correction.
// Requires local Sharp solely for rendering compact image inputs/review.
'use strict';
const fs=require('node:fs'),sharp=require('sharp'),H=require('../result3-hybrid'),O=require('../optimized-contour'),T=require('../tile-layout');
(async()=>{
  const [base,file]=process.argv.slice(2);if(!base||!file)throw Error('URL and user-authorized fixture path required');
  const source=JSON.parse(fs.readFileSync('tests/fixtures/optimized-cases.json','utf8')).reference;
  const optimized=O.generate(source),context=H.prepare(source,optimized);
  const jpeg=async input=>'data:image/jpeg;base64,'+(await sharp(input).resize({width:768,height:768,fit:'inside'}).flatten({background:'white'}).jpeg({quality:80}).toBuffer()).toString('base64');
  const images={source:await jpeg(file),result2:await jpeg(Buffer.from(O.exportSVG(optimized))),review:layout=>jpeg(Buffer.from(H.exportSVG(layout)))};
  const request=async(phase,payload)=>{const start=Date.now(),response=await fetch(base+'/api/result3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phase,...payload}),signal:AbortSignal.timeout(45000)});const data=await response.json();console.log(JSON.stringify({phase,status:response.status,requestId:data.requestId||data.error?.requestId,wallMs:Date.now()-start,serverMs:data.durationMs,planning_attempts:data.planning_attempts,contract:data.contract,errorCode:data.error?.code,issues:data.error?.issues,diagnostics:data.error?.diagnostics}));fs.writeFileSync('/private/tmp/drawacrl-live-'+phase+'-response.json',JSON.stringify(data));if(!response.ok)throw Object.assign(Error(),{code:data.error?.code||'HTTP_ERROR',contractFailure:data.error});return data;};
  const result=await H.run({context,images,request,fallback:()=>T.generate(source)});
  fs.writeFileSync('/private/tmp/drawacrl-live-hybrid-result.json',JSON.stringify(result));
  console.log(JSON.stringify({mode:result.layout.mode,visualStatus:result.layout.visualStatus,tiles:result.layout.tiles.length,calls:result.calls,providerCalls:result.providerCalls,planning_attempts:result.planning_attempts,contract:result.contract,errorCode:result.errorCode,timings:result.timings}));
  if(result.errorCode)process.exitCode=1;
})().catch(error=>{console.error({code:error.code||error.message});process.exitCode=1;});
