/* Independent Result 2 preview/export. Physical controls remain in Result 3. */
(function(root){'use strict';
  function create({t,notify,onSelect,getImage,getOptions,onResult,onRecompute}){
    const $=id=>document.getElementById(id),tr=k=>t('opt.'+k),canvas=document.createElement('canvas'),panel=document.createElement('section');
    canvas.id='optimized-canvas';canvas.hidden=true;canvas.setAttribute('data-i18n-attr','aria-label:opt.name');canvas.setAttribute('aria-label',tr('name'));$('stage').append(canvas);panel.id='optimized-panel';panel.hidden=true;
    panel.innerHTML=`<p id="optimized-status" role="status"></p><button id="optimized-recompute" data-i18n="opt.recompute">${tr('recompute')}</button>`;$('sec-actions').before(panel);
    const debugEnabled=new URLSearchParams(location.search).get('debug')==='1',details=document.createElement('details');details.hidden=!debugEnabled;
    const stages=['final','input','candidates','merged','rejected','reconstructed','symmetry'];details.innerHTML=`<summary data-i18n="opt.debug">${tr('debug')}</summary><select id="optimized-layer" data-i18n-attr="aria-label:opt.debug" aria-label="${tr('debug')}">${stages.map(k=>`<option value="${k}" data-i18n="opt.${k}">${tr(k)}</option>`).join('')}</select><pre id="optimized-metadata" style="max-height:220px;overflow:auto;font-size:10px;white-space:pre-wrap"></pre>`;panel.append(details);
    let source=null,sheet=[400,400],result=null,baseline=null,active=false,controller=null,task=null,job=0,pending=false,failed=false;
    function draw(ctx,data,layer='final'){
      const [w,h]=data.canvas;ctx.fillStyle='white';ctx.fillRect(0,0,w,h);ctx.lineWidth=.45;ctx.strokeStyle='#111827';ctx.lineCap='round';ctx.lineJoin='round';
      const paths=layer==='input'?[source.contour,...source.internal_lines]:layer==='candidates'?source.internal_lines:layer==='merged'?data.diagnostics.merged.map(p=>p.points):layer==='rejected'?data.diagnostics.rejected.map(p=>p.points):layer==='reconstructed'?data.paths.flatMap(p=>(p.bridges||[]).map(b=>b.points)):layer==='symmetry'?data.paths.filter(p=>p.mirrorSupport>=.75).map(p=>p.points):data.paths.map(p=>p.points);
      for(const path of paths){ctx.beginPath();path.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
    }
    function refresh(){
      $('optimized-status').textContent=pending?tr('pending'):failed?tr('failure'):result?tr('ready')+' '+t('pipeline.'+(result.planner.status==='accepted'?'accepted':result.planner.status==='unchanged'?'unchanged':'fallback')):source?t('pipeline.notReady'):tr('empty');$('optimized-recompute').disabled=pending||!source;
      if(active){document.title=tr('title');$('result-description').textContent=tr('help');for(const id of ['btn-svg','btn-jpg'])$(id).disabled=!result||pending;}
      const began=performance.now();canvas.width=sheet[0]*3;canvas.height=sheet[1]*3;const ctx=canvas.getContext('2d');ctx.scale(3,3);
      if(result){draw(ctx,result,debugEnabled?$('optimized-layer').value:'final');result.timings.renderMs=performance.now()-began;}
      else {ctx.fillStyle='white';ctx.fillRect(0,0,...sheet);}
      root.WorkspaceUI?.emit({id:2,active,pending,failed,ready:!!result,canvas:sheet,canvasElement:canvas});
    }
    function stop(){controller?.abort();controller=null;job++;pending=false;task=null;}
    function compute(){
      if(result)return Promise.resolve(result);if(task)return task;if(!source)return Promise.reject(Error('SOURCE_MISSING'));
      controller=new AbortController();const signal=controller.signal,id=++job,input=source;pending=true;failed=false;refresh();
      task=(async()=>{
        try{
          const initial=baseline||await root.ResultPipeline.worker('optimized-worker.js',{id,source:{contour:input.contour,internal_lines:input.internal_lines},canvas:sheet,requestId:input.request_id},signal);
          root.OptimizedContour.assertResult(initial);
          const final=await root.ResultPipeline.adapt({source:input,baseline:initial,image:getImage?.(),options:getOptions?.(),signal,onPhase:phase=>root.WorkspaceUI?.emit({id:2,pending:true,phase})});
          if(id!==job)throw root.ResultPipeline.aborted();
          root.OptimizedContour.assertResult(final);result=final;onResult?.(result);
          if(result.planner.status==='fallback')notify(t('pipeline.fallback'),'warning',9000);
          console.info('optimized_complete',{requestId:input.request_id,planner:result.planner,timings:result.timings,paths:result.paths.length});
          if(debugEnabled)$('optimized-metadata').textContent=JSON.stringify({planner:result.planner,timings:result.timings},null,2);
          return result;
        }catch(error){if(id===job&&error.name!=='AbortError'){failed=true;console.error('optimized_result_failure',{requestId:input.request_id,error:error.message});}throw error;}
        finally{if(id===job){pending=false;task=null;controller=null;refresh();}}
      })();return task;
    }
    const launch=()=>compute().catch(error=>{if(error.name!=='AbortError')notify(tr('failure'),'error');});
    function hide(){active=false;canvas.hidden=true;panel.hidden=true;document.body.classList.remove('optimized-active');$('result-optimized').setAttribute('aria-pressed','false');}
    $('result-optimized').onclick=()=>{if(!source)return;onSelect();active=true;canvas.hidden=false;panel.hidden=false;document.body.classList.add('optimized-active');$('cv').hidden=true;for(const id of ['result-detailed','result-tiles'])$(id).setAttribute('aria-pressed','false');$('result-optimized').setAttribute('aria-pressed','true');if(!result&&!pending)launch();else refresh();};
    $('optimized-recompute').onclick=()=>{stop();result=null;onRecompute?onRecompute():launch();};$('optimized-layer').onchange=refresh;
    root.OptimizedUI.refreshLanguage=refresh;
    // Catalog integration only; generated geometry and rendering remain unchanged.
    function loadPrecomputed(data){if(!source||JSON.stringify(data.canvas)!==JSON.stringify(sheet))return false;root.OptimizedContour.assertResult(data);stop();baseline=structuredClone(data);result=null;failed=false;refresh();return true;}
    return {hide,loadPrecomputed,ensure:compute,cancel(){stop();refresh();},isActive:()=>active,sourceChanged(data,canvasSize){stop();hide();source=data;sheet=canvasSize.slice();result=null;baseline=null;failed=false;},reset(){stop();hide();source=null;result=null;baseline=null;},export(kind){if(!result||pending)return;try{root.OptimizedContour.assertResult(result);const a=document.createElement('a');a.download=`contour-optimized-${sheet.join('x')}mm.${kind}`;let url=null;if(kind==='svg'){url=URL.createObjectURL(new Blob([root.OptimizedContour.exportSVG(result)],{type:'image/svg+xml'}));a.href=url;}else{const out=document.createElement('canvas');out.width=sheet[0]*6;out.height=sheet[1]*6;const ctx=out.getContext('2d');ctx.scale(6,6);draw(ctx,result);a.href=out.toDataURL('image/jpeg',.95);}document.body.append(a);a.click();setTimeout(()=>{a.remove();if(url)URL.revokeObjectURL(url);},2000);notify(tr('exported'),'success');}catch(error){notify(tr('failure'),'error');console.error('optimized_export_failure',error);}}};
  }
  root.OptimizedUI={create};
})(globalThis);
