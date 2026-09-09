/* Independent Result 2 preview/export. Physical controls remain in Result 3. */
(function(root){'use strict';
  function create({t,notify,onSelect}){
    const $=id=>document.getElementById(id),tr=k=>t('opt.'+k),canvas=document.createElement('canvas'),panel=document.createElement('section');
    canvas.id='optimized-canvas';canvas.hidden=true;canvas.setAttribute('data-i18n-attr','aria-label:opt.name');canvas.setAttribute('aria-label',tr('name'));$('stage').append(canvas);panel.id='optimized-panel';panel.hidden=true;
    panel.innerHTML=`<p id="optimized-status" role="status"></p><button id="optimized-recompute" data-i18n="opt.recompute">${tr('recompute')}</button>`;$('sec-actions').before(panel);
    const debugEnabled=new URLSearchParams(location.search).get('debug')==='1',details=document.createElement('details');details.hidden=!debugEnabled;
    const stages=['final','input','candidates','merged','rejected','reconstructed','symmetry'];details.innerHTML=`<summary data-i18n="opt.debug">${tr('debug')}</summary><select id="optimized-layer" data-i18n-attr="aria-label:opt.debug" aria-label="${tr('debug')}">${stages.map(k=>`<option value="${k}" data-i18n="opt.${k}">${tr(k)}</option>`).join('')}</select><pre id="optimized-metadata" style="max-height:220px;overflow:auto;font-size:10px;white-space:pre-wrap"></pre>`;panel.append(details);
    let source=null,sheet=[400,400],result=null,active=false,worker=null,job=0,pending=false,failed=false;
    function draw(ctx,data,layer='final'){
      const [w,h]=data.canvas;ctx.fillStyle='white';ctx.fillRect(0,0,w,h);ctx.lineWidth=.45;ctx.strokeStyle='#111827';ctx.lineCap='round';ctx.lineJoin='round';
      const paths=layer==='input'?[source.contour,...source.internal_lines]:layer==='candidates'?source.internal_lines:layer==='merged'?data.diagnostics.merged.map(p=>p.points):layer==='rejected'?data.diagnostics.rejected.map(p=>p.points):layer==='reconstructed'?data.paths.flatMap(p=>(p.bridges||[]).map(b=>b.points)):layer==='symmetry'?data.paths.filter(p=>p.mirrorSupport>=.75).map(p=>p.points):data.paths.map(p=>p.points);
      for(const path of paths){ctx.beginPath();path.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}
    }
    function refresh(){
      $('optimized-status').textContent=tr(pending?'pending':failed?'failure':result?'ready':'empty');$('optimized-recompute').disabled=pending||!source;
      if(!active)return;
      document.title=tr('title');$('result-description').textContent=tr('help');for(const id of ['btn-svg','btn-jpg'])$(id).disabled=!result||pending;
      const began=performance.now();canvas.width=sheet[0]*3;canvas.height=sheet[1]*3;const ctx=canvas.getContext('2d');ctx.scale(3,3);
      if(result){draw(ctx,result,debugEnabled?$('optimized-layer').value:'final');result.timings.renderMs=performance.now()-began;}
      else {ctx.fillStyle='white';ctx.fillRect(0,0,...sheet);}
    }
    function stop(){if(worker)worker.terminate();worker=null;job++;pending=false;}
    function compute(){if(!source)return;stop();pending=true;failed=false;result=null;const id=job;refresh();
      try{worker=new Worker('optimized-worker.js');worker.onmessage=({data})=>{if(data.id!==job)return;stop();try{if(data.error)throw Error(data.error.code);root.OptimizedContour.assertResult(data.result);result=data.result;console.info('optimized_complete',{requestId:source.request_id,timings:result.timings,paths:result.paths.length});if(debugEnabled)$('optimized-metadata').textContent=JSON.stringify({planner:result.planner,timings:result.timings,paths:result.paths.map(({points,...metadata})=>metadata),rejected:result.diagnostics.rejected.map(({points,...metadata})=>metadata)},null,2);}catch(error){failed=true;notify(tr('failure'),'error');console.error('optimized_result_failure',error);}refresh();};worker.onerror=error=>{if(id!==job)return;stop();failed=true;notify(tr('failure'),'error');console.error('optimized_worker_failure',{requestId:source.request_id,error:error.message});refresh();};worker.postMessage({id,source:{contour:source.contour,internal_lines:source.internal_lines},canvas:sheet,requestId:source.request_id});}
      catch(error){stop();failed=true;notify(tr('failure'),'error');console.error('optimized_start_failure',error);refresh();}
    }
    function hide(){active=false;canvas.hidden=true;panel.hidden=true;document.body.classList.remove('optimized-active');$('result-optimized').setAttribute('aria-pressed','false');}
    $('result-optimized').onclick=()=>{if(!source)return;onSelect();active=true;canvas.hidden=false;panel.hidden=false;document.body.classList.add('optimized-active');$('cv').hidden=true;for(const id of ['result-detailed','result-tiles'])$(id).setAttribute('aria-pressed','false');$('result-optimized').setAttribute('aria-pressed','true');if(!result&&!pending)compute();else refresh();};
    $('optimized-recompute').onclick=compute;$('optimized-layer').onchange=refresh;
    root.OptimizedUI.refreshLanguage=refresh;
    return {hide,isActive:()=>active,sourceChanged(data,canvasSize){stop();hide();source=data;sheet=canvasSize.slice();result=null;failed=false;},reset(){stop();hide();source=null;result=null;},export(kind){if(!result||pending)return;try{root.OptimizedContour.assertResult(result);const a=document.createElement('a');a.download=`contour-optimized-${sheet.join('x')}mm.${kind}`;let url=null;if(kind==='svg'){url=URL.createObjectURL(new Blob([root.OptimizedContour.exportSVG(result)],{type:'image/svg+xml'}));a.href=url;}else{const out=document.createElement('canvas');out.width=sheet[0]*6;out.height=sheet[1]*6;const ctx=out.getContext('2d');ctx.scale(6,6);draw(ctx,result);a.href=out.toDataURL('image/jpeg',.95);}document.body.append(a);a.click();setTimeout(()=>{a.remove();if(url)URL.revokeObjectURL(url);},2000);notify(tr('exported'),'success');}catch(error){notify(tr('failure'),'error');console.error('optimized_export_failure',error);}}};
  }
  root.OptimizedUI={create};
})(globalThis);
