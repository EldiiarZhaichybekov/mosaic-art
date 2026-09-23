/* Shared cancellable jobs and sequential orchestration; no geometry decisions. */
(function(root){
  'use strict';
  const aborted=()=>Object.assign(Error('CANCELLED'),{name:'AbortError'});
  function worker(url,data,signal,timeoutMs=120000){return new Promise((resolve,reject)=>{
    if(signal?.aborted){reject(aborted());return;}
    let job,timer;const finish=(error,value)=>{clearTimeout(timer);signal?.removeEventListener('abort',cancel);job?.terminate();error?reject(error):resolve(value);};
    const cancel=()=>finish(aborted());
    try{job=new Worker(url);job.onmessage=({data:reply})=>{if(reply.id!==data.id)return;if(reply.error)finish(Error(reply.error.code));else finish(null,reply.result);};job.onerror=()=>finish(Error('WORKER_ERROR'));signal?.addEventListener('abort',cancel,{once:true});timer=setTimeout(()=>finish(Error('PROCESSING_TIMEOUT')),timeoutMs);job.postMessage(data);}catch(error){finish(error);}
  });}
  function imageURL(image){const cv=document.createElement('canvas'),scale=Math.min(1,768/Math.max(image.naturalWidth||image.width,image.naturalHeight||image.height));cv.width=Math.max(1,Math.round((image.naturalWidth||image.width)*scale));cv.height=Math.max(1,Math.round((image.naturalHeight||image.height)*scale));const ctx=cv.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,cv.width,cv.height);ctx.drawImage(image,0,0,cv.width,cv.height);return cv.toDataURL('image/jpeg',.8);}
  function pathImage(paths,canvas,labels=false){const cv=document.createElement('canvas');cv.width=768;cv.height=Math.round(768*canvas[1]/canvas[0]);const ctx=cv.getContext('2d');ctx.scale(768/canvas[0],768/canvas[0]);ctx.fillStyle='white';ctx.fillRect(0,0,...canvas);ctx.strokeStyle='#111';ctx.lineWidth=.65;ctx.font='5px sans-serif';for(const p of paths){ctx.beginPath();p.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();if(labels){ctx.fillStyle='#111';ctx.fillText(p.id,...p.points[Math.floor(p.points.length/2)]);}}return imageURL(cv);}
  async function adapt({source,baseline,image,options,signal,onPhase=()=>{}}){
    const A=root.Result2Adaptation,started=performance.now();
    try{
      const context=A.context(source,baseline);onPhase('plan');
      const images={source:image?imageURL(image):pathImage([{points:source.contour},...source.internal_lines.map(points=>({points}))],baseline.canvas),result2:pathImage(baseline.paths,baseline.canvas,true)};
      const controller=new AbortController(),cancel=()=>controller.abort(),timer=setTimeout(cancel,40000);signal.addEventListener('abort',cancel,{once:true});
      let response,body;
      try{if(signal.aborted)throw aborted();response=await fetch('/api/result2',{method:'POST',headers:{'Content-Type':'application/json'},signal:controller.signal,body:JSON.stringify({context,images})});try{body=await response.json();}catch{throw Error('AI_RESPONSE_INVALID');}}
      catch(error){if(signal.aborted)throw aborted();if(controller.signal.aborted)throw Error('AI_TIMEOUT');throw error;}
      finally{clearTimeout(timer);signal.removeEventListener('abort',cancel);}
      if(!response.ok)throw Object.assign(Error(body.error?.code||'AI_MODEL_ERROR'),{requestId:body.error?.requestId,httpStatus:response.status});
      A.validatePlan(body.plan,context);onPhase('qa');
      const result=await worker('result2-adaptation-worker.js',{id:1,source,baseline,context,plan:body.plan,options,requestId:body.requestId},signal);
      result.planner.requestId=body.requestId;result.timings.aiMs=performance.now()-started;return result;
    }catch(error){if(signal.aborted||error.name==='AbortError')throw aborted();console.warn('result2_ai_fallback',{requestId:error.requestId,code:error.message,httpStatus:error.httpStatus,durationMs:performance.now()-started});return {...baseline,planner:{status:'fallback',reason:error.message,requestId:error.requestId,geometryPolicy:'DETERMINISTIC_BASELINE'}};}
  }
  function create({optimize,layout,select,emit,cancelJobs,onError}){
    let generation=0,stage=null;
    function cancel(){generation++;stage=null;cancelJobs();emit({id:'pipeline',pending:false});}
    function begin(){cancel();stage=1;emit({id:'pipeline',stage,pending:true});}
    async function start(){const id=++generation;stage=2;emit({id:'pipeline',stage,pending:true});try{await optimize();if(id!==generation)return;stage=3;emit({id:'pipeline',stage,pending:true});await layout();if(id===generation)select();}catch(error){if(id===generation&&error.name!=='AbortError')onError(error);}finally{if(id===generation){stage=null;emit({id:'pipeline',pending:false});}}}
    return {begin,cancel,start,stage:()=>stage};
  }
  const api={worker,adapt,create,aborted};if(typeof module!=='undefined')module.exports=api;root.ResultPipeline=api;
})(globalThis);
