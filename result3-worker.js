/* Opt-in experimental Result 3. All CPU work stays off the main UI thread. */
importScripts('tile-layout.js','optimized-contour.js','result3-hybrid.js');
function render(paths,canvas,layout,labels=false){
  const out=new OffscreenCanvas(canvas[0]*2,canvas[1]*2),ctx=out.getContext('2d');ctx.scale(2,2);ctx.fillStyle='white';ctx.fillRect(0,0,...canvas);ctx.strokeStyle='#475569';ctx.lineWidth=.5;
  for(const path of paths){ctx.beginPath();path.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();if(labels){ctx.font='4px sans-serif';ctx.fillStyle='#4338ca';ctx.fillText(path.id,...path.points[0]);}}
  for(const t of layout?.tiles||[]){ctx.save();ctx.translate(t.xMm,t.yMm);ctx.rotate(t.angleDeg*Math.PI/180);ctx.fillStyle='#dc2626';ctx.fillRect(-15,-1.5,30,3);ctx.restore();}
  return out.convertToBlob({type:'image/jpeg',quality:.8}).then(blob=>{const reader=new FileReaderSync();return reader.readAsDataURL(blob);});
}
self.onmessage=async({data})=>{
  const {id,source,options,sourceImage,sourceCanvas,requestId}=data,started=performance.now();
  const fallback=()=>TileLayout.generate(source,options);
  try{
    let canvas=options.format==='40x40'?[400,400]:options.orientation==='landscape'?[400,300]:[300,400];
    if(options.format==='30x40'&&options.orientation==='auto'){
      const x=source.contour.map(p=>p[0]),y=source.contour.map(p=>p[1]);if(Math.max(...x)-Math.min(...x)>Math.max(...y)-Math.min(...y))canvas=[400,300];
    }
    const optimized=OptimizedContour.generate(source,{canvas:sourceCanvas}),context=Result3Hybrid.prepare(source,optimized,canvas);
    const r2=await render(optimized.paths,sourceCanvas),map=await render(context.paths.map(p=>({...p,points:p.points.map(q=>q.map((v,i)=>v*canvas[i]))})),canvas,null,true),prepareMs=performance.now()-started;
    const request=async(phase,payload)=>{
      self.postMessage({id,progress:phase});let response;
      try{response=await fetch('/api/result3',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({phase,...payload}),signal:AbortSignal.timeout(16000)});}catch(error){throw Object.assign(Error(),{code:['AbortError','TimeoutError'].includes(error.name)?'AI_TIMEOUT':'AI_NETWORK_ERROR'});}
      let answer;try{answer=await response.json();}catch{throw Object.assign(Error(),{code:'AI_RESPONSE_INVALID'});}
      if(!response.ok)throw Object.assign(Error(),{code:answer.error?.code||'AI_MODEL_ERROR'});return answer;
    };
    const result=await Result3Hybrid.run({context,images:{source:sourceImage,result2:r2,pathMap:map,review:layout=>render([],canvas,layout)},request,fallback});
    result.layout.orientation=result.layout.canvas[0]===result.layout.canvas[1]?'square':result.layout.canvas[0]>result.layout.canvas[1]?'landscape':'portrait';
    result.layout.auto=options.format==='30x40'&&options.orientation==='auto';result.timings.prepareMs=prepareMs;
    result.layout.hybridDiagnostics={...result,layout:undefined,context};
    console.info('result3_complete',{requestId,mode:result.layout.mode,tiles:result.layout.tiles.length,visualStatus:result.layout.visualStatus,timings:result.timings,collisionRejections:result.layout.stats?.collisionRejections,errorCode:result.errorCode});
    self.postMessage({id,result:result.layout});
  }catch(error){
    const layout=fallback();layout.mode='DETERMINISTIC_FALLBACK';layout.hybridDiagnostics={errorCode:error.code||'GEOMETRY_FAILED',timings:{totalMs:performance.now()-started}};self.postMessage({id,result:layout});
  }
};
