/* Isolated physical Result 3 UI. Result 1 canvas and export functions are untouched. */
(function(root){
  'use strict';
  const T=root.TileLayout;
  function create({notify,onDetailed,onPhysical,getFormat,t}) {
    const tr=(key,params={})=>t('tile.'+key).replace(/\{(\w+)\}/g,(m,k)=>params[k]??m);
    const $=id=>document.getElementById(id),stage=$('stage');
    const panel=document.createElement('section');panel.id='tile-panel';panel.hidden=true;
    panel.innerHTML=`<div class="tile-tabs" role="group" data-i18n-attr="aria-label:tile.view" aria-label="${tr('view')}"><button id="tile-view-layout" aria-pressed="true"><span data-i18n="tile.layout">${tr('layout')}</span></button><button id="tile-view-plan" aria-pressed="false"><span data-i18n="tile.plan">${tr('plan')}</span></button></div>
      <div class="tile-options"><label><span data-i18n="tile.canvas">${tr('canvas')}</span> <select id="tile-format"><option value="40x40" data-i18n="tile.size40">${tr('size40')}</option><option value="30x40" data-i18n="tile.size30">${tr('size30')}</option></select></label><div id="tile-orientation"><span><span data-i18n="tile.orientation">${tr('orientation')}</span></span><div class="tile-tabs"><button data-orientation="auto" aria-pressed="true"><span data-i18n="tile.auto">${tr('auto')}</span></button><button data-orientation="portrait" aria-pressed="false"><span data-i18n="tile.portrait">${tr('portrait')}</span></button><button data-orientation="landscape" aria-pressed="false"><span data-i18n="tile.landscape">${tr('landscape')}</span></button></div></div></div>
      <strong id="tile-count" aria-live="polite"><span data-i18n="tile.emptyCount">${tr('emptyCount')}</span></strong><p id="tile-status" role="status"></p>
      <p class="tile-help"><span data-i18n="tile.help">${tr('help')}</span></p>
      <div class="tile-tabs"><button id="tile-edit" aria-pressed="false"><span data-i18n="tile.edit">${tr('edit')}</span></button><button id="tile-recompute"><span data-i18n="tile.recompute">${tr('recompute')}</span></button></div>
      <div id="tile-editor" hidden><p class="tile-help"><span data-i18n="tile.editHelp">${tr('editHelp')}</span></p>
        <label><input type="checkbox" id="tile-snap" checked> <span data-i18n="tile.snap">${tr('snap')}</span></label>
        <div class="tile-options"><label><span data-i18n="tile.x">${tr('x')}</span><input type="number" id="tile-x" step="0.1"></label><label><span data-i18n="tile.y">${tr('y')}</span><input type="number" id="tile-y" step="0.1"></label><label><span data-i18n="tile.angle">${tr('angle')}</span><input type="number" id="tile-angle" step="0.1"></label></div>
        <div class="tile-tabs"><button id="tile-apply"><span data-i18n="tile.apply">${tr('apply')}</span></button><button id="tile-delete"><span data-i18n="tile.delete">${tr('delete')}</span></button><button id="tile-add"><span data-i18n="tile.add">${tr('add')}</span></button></div>
        <div class="tile-tabs"><button id="tile-undo"><span data-i18n="tile.undo">${tr('undo')}</span></button><button id="tile-redo"><span data-i18n="tile.redo">${tr('redo')}</span></button></div>
      </div>
      <details id="tile-plan-info" hidden><summary><span data-i18n="tile.coordinates">${tr('coordinates')}</span></summary><p class="tile-help"><span data-i18n="tile.coordinateHelp">${tr('coordinateHelp')}</span></p><button id="tile-csv" data-i18n="tile.csv">${tr('csv')}</button><div id="tile-plan-table"></div></details>`;
    $('sec-actions').before(panel);
    const debugEnabled=new URLSearchParams(location.search).get('debug')==='1';
    const debug=document.createElement('details');debug.hidden=!debugEnabled;debug.id='tile-debug';
    debug.innerHTML=`<summary data-i18n="tile.debug">${tr('debug')}</summary><select id="tile-debug-layer" aria-label="${tr('debug')}" data-i18n-attr="aria-label:tile.debug">${['final','observed','reconstructed','symmetry','rejected','skeleton','outer','tiles','collisions'].map(k=>`<option value="${k}" data-i18n="tile.${k}">${tr(k)}</option>`).join('')}</select><button id="tile-debug-download" data-i18n="tile.debugDownload">${tr('debugDownload')}</button>`;
    panel.append(debug);
    const canvas=document.createElement('canvas');canvas.id='tile-canvas';canvas.hidden=true;canvas.setAttribute('data-i18n-attr','aria-label:tile.canvasAria');canvas.setAttribute('aria-label',tr('canvasAria'));stage.append(canvas);
    let source=null,doc=null,active=false,orientation='auto',mounting=false,editing=false,selected=null,adding=false,worker=null,job=0,pending=false,drag=null,notice='unavailable';
    function message(check){return check.errors.map(e=>{const key='tile.'+e;return t(key)!==key?t(key):tr('invalid');}).join(' ');}
    function draw(ctx,layout,mount,selection=null,layer='final') {
      const [w,h]=layout.canvas;ctx.fillStyle='white';ctx.fillRect(0,0,w,h);
      if(layer!=='final'){
        const structure=layout.structures||{},paths=layer==='observed'?structure.observed||[]:layer==='reconstructed'?(structure.paths||[]).flatMap(p=>p.bridges.filter(b=>b.origin==='RECONSTRUCTED').map(b=>b.points)):layer==='symmetry'?(structure.paths||[]).filter(p=>p.mirrorSupport>=.75).map(p=>p.points):layer==='rejected'?(structure.rejected||[]).map(p=>p.points):layout.target.filter(p=>p.role===(layer==='skeleton'?'skeleton':'outer')).map(p=>p.points);
        if(!['tiles','collisions'].includes(layer)){ctx.strokeStyle=layer==='reconstructed'?'#0891b2':layer==='symmetry'?'#7c3aed':layer==='rejected'?'#d97706':'#475569';ctx.lineWidth=.5;ctx.setLineDash([]);for(const points of paths){ctx.beginPath();points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}return;}
        layout={...layout,target:[],tiles:layer==='collisions'?(layout.collisionRejections||[]).map(c=>c.tile):layout.tiles};
      }
      ctx.strokeStyle='#94a3b8';ctx.lineWidth=.25;ctx.setLineDash([2,2]);ctx.strokeRect(15,15,w-30,h-30);
      ctx.strokeStyle='#475569';ctx.lineWidth=.35;ctx.setLineDash([2,1.5]);
      for(const p of layout.target){ctx.beginPath();p.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}ctx.setLineDash([]);
      for(const t of layout.tiles){ctx.save();ctx.translate(t.xMm,t.yMm);ctx.rotate(t.angleDeg*Math.PI/180);ctx.fillStyle='#dc2626';ctx.fillRect(-15,-1.5,30,3);if(selection===t.id){ctx.strokeStyle='#1d4ed8';ctx.lineWidth=.5;ctx.strokeRect(-15,-1.5,30,3);}ctx.restore();if(mount){ctx.fillStyle='white';ctx.font='2.6px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(t.id),t.xMm,t.yMm);}}
      if(mount){ctx.fillStyle='#334155';ctx.font='3px sans-serif';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText(tr('mountHeader',{w,h,orientation:tr(layout.orientation),count:layout.tiles.length}),15,7);ctx.font='2.5px sans-serif';ctx.fillText(tr('mountFooter'),15,h-5);}
    }
    function render(temporary) {
      if(!doc){canvas.width=800;canvas.height=600;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,600);ctx.fillStyle='#475569';ctx.font='18px sans-serif';ctx.fillText(pending?tr('pending'):tr('unavailable'),25,60);return;}
      const layout=temporary||doc.layout,[w,h]=layout.canvas,dpr=Math.min(2,window.devicePixelRatio||1),scale=2*dpr;
      canvas.width=w*scale;canvas.height=h*scale;canvas.style.aspectRatio=`${w}/${h}`;const ctx=canvas.getContext('2d');ctx.setTransform(scale,0,0,scale,0,0);draw(ctx,layout,mounting,editing?selected:null,debugEnabled?$('tile-debug-layer').value:'final');
    }
    function refresh() {
      $('tile-orientation').hidden=$('tile-format').value!=='30x40';$('tile-plan-info').hidden=!mounting||!doc;
      $('tile-add').disabled=!doc||doc.layout.tiles.length>=150||pending;
      $('tile-undo').disabled=!doc?.undoStack.length;$('tile-redo').disabled=!doc?.redoStack.length;
      for(const id of ['tile-x','tile-y','tile-angle','tile-apply','tile-delete'])$(id).disabled=!doc||selected===null;
      $('tile-edit').disabled=!doc||pending;$('tile-recompute').disabled=pending;
      if(doc){const layout=doc.layout,outer=layout.tiles.filter(t=>t.role==='outer').length,check=T.validate(layout),orient=tr(layout.orientation);
        $('tile-count').textContent=tr('count',{count:layout.tiles.length,outer,inner:layout.tiles.length-outer});
        $('tile-status').textContent=`${layout.auto?tr('auto')+' → ':''}${orient} · ${layout.canvas.join(' × ')} ${t('unit.mm')}. `+(check.valid?tr('checked'):tr('draft')+message(check));
        if(mounting)$('tile-plan-table').innerHTML=`<table><thead><tr><th>№</th><th>${tr('x')}</th><th>${tr('y')}</th><th>°</th></tr></thead><tbody>`+layout.tiles.map(t=>`<tr><td>${t.id}</td><td>${t.xMm.toFixed(2)}</td><td>${t.yMm.toFixed(2)}</td><td>${t.angleDeg.toFixed(2)}</td></tr>`).join('')+'</tbody></table>';
        if(active)for(const id of ['btn-svg','btn-jpg'])$(id).disabled=!check.valid||pending;
      }else { $('tile-count').textContent=tr('emptyCount');$('tile-status').textContent=tr(pending?'checking':notice);if(active)for(const id of ['btn-svg','btn-jpg'])$(id).disabled=true; }
      render();
    }
    function compute() {
      if(!source)return;
      if(doc?.undoStack.length)notify(tr('resetEdits'),'info');
      if(worker)worker.terminate();worker=null;const id=++job;doc=null;selected=null;adding=false;drag=null;$('tile-add').textContent=tr('add');pending=true;
      $('tile-count').textContent=tr('emptyCount');$('tile-status').textContent=tr('checking');refresh();
      try{worker=new Worker('tile-worker.js');worker.onmessage=event=>{if(event.data.id!==job)return;pending=false;worker.terminate();worker=null;const layout=event.data.result;
        if(layout.status==='ok'&&T.validate(layout).valid){doc=new T.TileDocument(layout);console.info('Physical layout complete',{requestId:source.clientDiagnostics?.requestId,canvas:layout.canvas,count:layout.tiles.length,timings:layout.timings,evaluated:layout.evaluated});}
        else {notice='failure';notify(tr('failure'),'warning',0);console.warn('LAYOUT_NOT_FEASIBLE',layout);}
        refresh();};worker.onerror=event=>{if(id!==job)return;pending=false;worker.terminate();worker=null;console.error('Physical worker failed',{requestId:source.clientDiagnostics?.requestId,error:event.message});notice='failure';notify(tr('failure'),'error');refresh();};worker.postMessage({id,requestId:source.clientDiagnostics?.requestId,source:{contour:source.contour,internal_lines:source.internal_lines},options:{format:$('tile-format').value,orientation}});
      }catch(error){pending=false;console.error('Physical worker unavailable',error);notice=location.protocol==='file:'?'https':'optionalUnavailable';notify(tr(notice),'error');refresh();}
    }
    function choose(physical) {
      active=physical;document.body.classList.toggle('tile-active',active);panel.hidden=!active;canvas.hidden=!active;$('cv').hidden=active;
      $('result-detailed').setAttribute('aria-pressed',String(!active));$('result-tiles').setAttribute('aria-pressed',String(active));
      $('result-description').textContent=active?tr('physicalHelp'):tr('detailedHelp');
      if(active){onPhysical();document.title=tr('title');if(!doc&&!pending)compute();else refresh();}
      else {onDetailed();for(const id of ['btn-svg','btn-jpg'])$(id).disabled=false;}
    }
    function select(id){selected=id;const t=doc?.layout.tiles.find(t=>t.id===id);if(t){$('tile-x').value=t.xMm.toFixed(2);$('tile-y').value=t.yMm.toFixed(2);$('tile-angle').value=t.angleDeg.toFixed(2);}refresh();}
    function apply(tile,bypass=false){if(!doc)return;const proposed=T.snap(tile,doc.layout,bypass||!$('tile-snap').checked);if(tile.role==='skeleton'){const paths=doc.layout.target.map(p=>({p,d:T.nearestOnPath([proposed.xMm,proposed.yMm],p.points).distance})).sort((a,b)=>a.d-b.d);const found=paths.slice(0,4).find(({p})=>T.deviation(proposed,new T.SegmentGrid([p.points])).max<=3);if(found)proposed.sourcePathId=found.p.id;}const check=doc.update(tile.id,proposed);if(!check.valid)notify(message(check),'error');select(tile.id);}
    function point(event){const r=canvas.getBoundingClientRect(),[w,h]=doc.layout.canvas,scale=Math.min(r.width/w,r.height/h);return [(event.clientX-r.left-(r.width-w*scale)/2)/scale,(event.clientY-r.top-(r.height-h*scale)/2)/scale];}
    canvas.addEventListener('pointerdown',e=>{if(!editing||!doc)return;const p=point(e);
      if(adding){const nearest=doc.layout.target.map(path=>({path,...T.nearestOnPath(p,path.points)})).sort((a,b)=>a.distance-b.distance)[0];const t=T.makeTile(...p,nearest?.angle||0,nearest?.path.role||'skeleton',nearest?.path.id||0);
        if(t.role==='outer'){const outer=doc.layout.tiles.filter(t=>t.role==='outer').sort((a,b)=>a.sequenceIndex-b.sequenceIndex);let best=Infinity;for(let i=0;i<outer.length;i++){const a=outer[i],b=outer[(i+1)%outer.length],d=Math.hypot(p[0]-a.xMm,p[1]-a.yMm)+Math.hypot(p[0]-b.xMm,p[1]-b.yMm)-Math.hypot(a.xMm-b.xMm,a.yMm-b.yMm);if(d<best){best=d;t.sequenceIndex=b.sequenceIndex>a.sequenceIndex?(a.sequenceIndex+b.sequenceIndex)/2:a.sequenceIndex+.5;}}}
        const check=doc.add(T.snap(t,doc.layout,e.altKey||!$('tile-snap').checked));adding=false;$('tile-add').textContent=tr('add');if(!check.valid)notify(message(check),'error');else select(doc.layout.tiles[doc.layout.tiles.length-1].id);refresh();return;}
      const found=doc.layout.tiles.map(t=>({t,d:(()=>{const a=t.angleDeg*Math.PI/180,dx=p[0]-t.xMm,dy=p[1]-t.yMm;return Math.abs(dx*Math.cos(a)+dy*Math.sin(a))<=17&&Math.abs(-dx*Math.sin(a)+dy*Math.cos(a))<=4?Math.hypot(dx,dy):Infinity;})()})).sort((a,b)=>a.d-b.d)[0];
      if(!found||!Number.isFinite(found.d)){select(null);return;}select(found.t.id);drag={start:p,tile:{...found.t}};canvas.setPointerCapture(e.pointerId);});
    canvas.addEventListener('pointermove',e=>{if(!drag||!doc)return;const p=point(e),tile={...drag.tile,xMm:drag.tile.xMm+p[0]-drag.start[0],yMm:drag.tile.yMm+p[1]-drag.start[1]};render({...doc.layout,tiles:doc.layout.tiles.map(t=>t.id===tile.id?tile:t)});});
    canvas.addEventListener('pointerup',e=>{if(!drag||!doc)return;const p=point(e),moved=Math.hypot(p[0]-drag.start[0],p[1]-drag.start[1])>.2,tile={...drag.tile,xMm:drag.tile.xMm+p[0]-drag.start[0],yMm:drag.tile.yMm+p[1]-drag.start[1]};drag=null;if(moved)apply(tile,e.altKey);else render();});
    canvas.addEventListener('pointercancel',()=>{drag=null;render();});
    $('result-detailed').onclick=()=>choose(false);$('result-tiles').onclick=()=>choose(true);
    $('tile-format').onchange=compute;
    panel.querySelectorAll('[data-orientation]').forEach(b=>b.onclick=()=>{orientation=b.dataset.orientation;panel.querySelectorAll('[data-orientation]').forEach(x=>x.setAttribute('aria-pressed',String(x===b)));compute();});
    $('tile-view-layout').onclick=()=>{mounting=false;$('tile-view-layout').setAttribute('aria-pressed','true');$('tile-view-plan').setAttribute('aria-pressed','false');refresh();};
    $('tile-view-plan').onclick=()=>{mounting=true;$('tile-view-layout').setAttribute('aria-pressed','false');$('tile-view-plan').setAttribute('aria-pressed','true');refresh();};
    $('tile-edit').onclick=()=>{editing=!editing;$('tile-edit').setAttribute('aria-pressed',String(editing));$('tile-editor').hidden=!editing;canvas.style.touchAction=editing?'none':'auto';refresh();};
    $('tile-recompute').onclick=compute;
    $('tile-apply').onclick=()=>{const t=doc?.layout.tiles.find(t=>t.id===selected);if(t){const value=(id,original)=>$(id).value===original.toFixed(2)?original:$(id).value.trim()===''?NaN:Number($(id).value);apply({...t,xMm:value('tile-x',t.xMm),yMm:value('tile-y',t.yMm),angleDeg:value('tile-angle',t.angleDeg)});}};
    $('tile-delete').onclick=()=>{if(doc&&selected!==null){doc.remove(selected);select(null);}};
    $('tile-add').onclick=()=>{if(!doc||doc.layout.tiles.length>=150)return;adding=!adding;$('tile-add').textContent=adding?tr('clickCanvas'):tr('add');};
    $('tile-undo').onclick=()=>{doc?.undo();select(null);};$('tile-redo').onclick=()=>{doc?.redo();select(null);};
    function download(name,body,mime){const blob=new Blob([body],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},2000);}
    $('tile-csv').onclick=()=>{if(!doc||!T.validate(doc.layout).valid){notify(tr('fixFirst'),'error');return;}download('mounting-coordinates.csv','id,xMm,yMm,angleDeg,lengthMm,widthMm,role\n'+doc.layout.tiles.map(t=>[t.id,t.xMm,t.yMm,t.angleDeg,30,3,t.role].join(',')).join('\n'),'text/csv');};
    $('tile-debug-layer').onchange=()=>render();
    $('tile-debug-download').onclick=()=>{if(doc)download('physical-diagnostics.json',JSON.stringify({request:source.clientDiagnostics,layout:doc.layout},null,2),'application/json');};
    root.TileUI.refreshLanguage=()=>{if(active)document.title=tr('title');$('result-description').textContent=tr(active?'physicalHelp':'detailedHelp');$('tile-add').textContent=tr(adding?'clickCanvas':'add');refresh();};
    return {
      deactivate(){choose(false);},
      sourceChanged(data){source=data;doc=null;selected=null;if(worker)worker.terminate();job++;pending=false;$('tile-format').value=getFormat();$('result-controls').hidden=!data;choose(false);},
      reset(){source=null;doc=null;if(worker)worker.terminate();job++;pending=false;choose(false);$('result-controls').hidden=true;},
      isActive:()=>active,
      export(kind){if(!doc)return;const check=T.validate(doc.layout);if(!check.valid){notify(message(check),'error');return;}const name=`tiles-${mounting?'mounting':'layout'}-${doc.layout.canvas.join('x')}mm`;
        if(kind==='svg')download(name+'.svg',T.exportSVG(doc.layout,{mounting,labels:{header:tr('mountHeader',{w:doc.layout.canvas[0],h:doc.layout.canvas[1],orientation:tr(doc.layout.orientation),count:doc.layout.tiles.length}),footer:tr('mountFooter')}}),'image/svg+xml');
        else {const out=document.createElement('canvas');out.width=doc.layout.canvas[0]*6;out.height=doc.layout.canvas[1]*6;const ctx=out.getContext('2d');ctx.scale(6,6);draw(ctx,doc.layout,mounting);const a=document.createElement('a');a.download=name+'.jpg';a.href=out.toDataURL('image/jpeg',.95);document.body.appendChild(a);a.click();setTimeout(()=>a.remove(),2000);}
        notify(tr('exported'),'success');
      }
    };
  }
  root.TileUI={create};
})(globalThis);
