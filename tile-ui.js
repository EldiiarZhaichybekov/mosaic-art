/* Isolated physical Result 2 UI. Result 1 canvas and export functions are untouched. */
(function(root){
  'use strict';
  const T=root.TileLayout;
  function create({notify,onDetailed,onPhysical,getFormat}) {
    const $=id=>document.getElementById(id),stage=$('stage');
    const panel=document.createElement('section');panel.id='tile-panel';panel.hidden=true;
    panel.innerHTML=`<div class="tile-tabs" role="group" aria-label="Вид раскладки"><button id="tile-view-layout" aria-pressed="true">РАСКЛАДКА</button><button id="tile-view-plan" aria-pressed="false">ПЛАН МОНТАЖА</button></div>
      <div class="tile-options"><label>Холст <select id="tile-format"><option value="40x40">40 × 40 см</option><option value="30x40">30 × 40 см</option></select></label><div id="tile-orientation"><span>Ориентация холста</span><div class="tile-tabs"><button data-orientation="auto" aria-pressed="true">Авто</button><button data-orientation="portrait" aria-pressed="false">Портрет</button><button data-orientation="landscape" aria-pressed="false">Альбом</button></div></div></div>
      <strong id="tile-count" aria-live="polite">Пластины: — / 150</strong><p id="tile-status" role="status"></p>
      <p class="tile-help">Каждая красная деталь — целая пластина <b>30 × 3 мм</b>. Пунктир — целевой контур. Отступ от краёв — 15 мм. 150 — предел, не цель.</p>
      <div class="tile-tabs"><button id="tile-edit" aria-pressed="false">Редактировать</button><button id="tile-recompute">Пересчитать</button></div>
      <div id="tile-editor" hidden><p class="tile-help">Нажмите на пластину и перетащите её или задайте центр и угол. Alt временно отключает привязку. Недопустимое перемещение отклоняется.</p>
        <label><input type="checkbox" id="tile-snap" checked> Привязка</label>
        <div class="tile-options"><label>X, мм<input type="number" id="tile-x" step="0.1"></label><label>Y, мм<input type="number" id="tile-y" step="0.1"></label><label>Угол, °<input type="number" id="tile-angle" step="0.1"></label></div>
        <div class="tile-tabs"><button id="tile-apply">Применить</button><button id="tile-delete">Удалить</button><button id="tile-add">Добавить</button></div>
        <div class="tile-tabs"><button id="tile-undo">Отменить</button><button id="tile-redo">Повторить</button></div>
      </div>
      <details id="tile-plan-info" hidden><summary>Координаты монтажа: центры пластин</summary><p class="tile-help">Начало координат — левый верхний угол холста. X вправо, Y вниз. Угол по часовой стрелке. Печатать SVG в масштабе 100%, проверить размер 30 мм линейкой.</p><button id="tile-csv">Скачать координаты CSV</button><div id="tile-plan-table"></div></details>`;
    $('sec-actions').before(panel);
    const canvas=document.createElement('canvas');canvas.id='tile-canvas';canvas.hidden=true;canvas.setAttribute('aria-label','Физическая раскладка пластин 30 на 3 миллиметра');stage.append(canvas);
    let source=null,doc=null,active=false,orientation='auto',mounting=false,editing=false,selected=null,adding=false,worker=null,job=0,pending=false,drag=null;
    const errors={OVERLAP:'Пластины пересекаются.',SAFE_AREA:'Пластина выходит за безопасную область 15 мм.',TILE_LIMIT:'Допускается не больше 150 пластин.',OUTER_GAP:'Нарушена непрерывность внешнего контура (зазор больше 2 мм).',TARGET_COVERAGE:'Часть внешнего контура не покрыта пластинами в пределах допуска.',DEVIATION:'Пластина отклоняется от целевой линии больше чем на 3 мм.',NO_OUTER:'Внешний контур отсутствует.',TILE_DIMENSIONS:'Недопустимые размеры или координаты пластины.'};
    const failure='Не удалось найти физически допустимую раскладку для этого холста в пределах 150 пластин. Попробуйте другую ориентацию 30 × 40, холст 40 × 40 или более простой силуэт. Детальный результат сохранён.';
    function message(check){return check.errors.map(e=>errors[e]||'Изменение не прошло проверку.').join(' ');}
    function draw(ctx,layout,mount,selection=null) {
      const [w,h]=layout.canvas;ctx.fillStyle='white';ctx.fillRect(0,0,w,h);
      ctx.strokeStyle='#94a3b8';ctx.lineWidth=.25;ctx.setLineDash([2,2]);ctx.strokeRect(15,15,w-30,h-30);
      ctx.strokeStyle='#475569';ctx.lineWidth=.35;ctx.setLineDash([2,1.5]);
      for(const p of layout.target){ctx.beginPath();p.points.forEach(([x,y],i)=>i?ctx.lineTo(x,y):ctx.moveTo(x,y));ctx.stroke();}ctx.setLineDash([]);
      for(const t of layout.tiles){ctx.save();ctx.translate(t.xMm,t.yMm);ctx.rotate(t.angleDeg*Math.PI/180);ctx.fillStyle='#dc2626';ctx.fillRect(-15,-1.5,30,3);if(selection===t.id){ctx.strokeStyle='#1d4ed8';ctx.lineWidth=.5;ctx.strokeRect(-15,-1.5,30,3);}ctx.restore();if(mount){ctx.fillStyle='white';ctx.font='2.6px sans-serif';ctx.textAlign='center';ctx.textBaseline='middle';ctx.fillText(String(t.id),t.xMm,t.yMm);}}
      if(mount){ctx.fillStyle='#334155';ctx.font='3px sans-serif';ctx.textAlign='left';ctx.textBaseline='alphabetic';ctx.fillText(`${w} × ${h} mm · ${layout.orientation} · ${layout.tiles.length} / 150 · 30 × 3 mm · safe area 15 mm`,15,7);ctx.font='2.5px sans-serif';ctx.fillText('X →, Y ↓ · origin: top left · coordinates: tile centers · print 100%',15,h-5);}
    }
    function render(temporary) {
      if(!doc){canvas.width=800;canvas.height=600;const ctx=canvas.getContext('2d');ctx.fillStyle='white';ctx.fillRect(0,0,800,600);ctx.fillStyle='#475569';ctx.font='18px sans-serif';ctx.fillText(pending?'Расчёт физической раскладки…':'Раскладка недоступна для выбранных условий.',25,60);return;}
      const layout=temporary||doc.layout,[w,h]=layout.canvas,dpr=Math.min(2,window.devicePixelRatio||1),scale=2*dpr;
      canvas.width=w*scale;canvas.height=h*scale;canvas.style.aspectRatio=`${w}/${h}`;const ctx=canvas.getContext('2d');ctx.setTransform(scale,0,0,scale,0,0);draw(ctx,layout,mounting,editing?selected:null);
    }
    function refresh() {
      $('tile-orientation').hidden=$('tile-format').value!=='30x40';$('tile-plan-info').hidden=!mounting||!doc;
      $('tile-add').disabled=!doc||doc.layout.tiles.length>=150||pending;
      $('tile-undo').disabled=!doc?.undoStack.length;$('tile-redo').disabled=!doc?.redoStack.length;
      for(const id of ['tile-x','tile-y','tile-angle','tile-apply','tile-delete'])$(id).disabled=!doc||selected===null;
      $('tile-edit').disabled=!doc||pending;$('tile-recompute').disabled=pending;
      if(doc){const layout=doc.layout,outer=layout.tiles.filter(t=>t.role==='outer').length,check=T.validate(layout),orient=layout.orientation==='landscape'?'Альбом':layout.orientation==='portrait'?'Портрет':'Квадрат';
        $('tile-count').textContent=`Пластины: ${layout.tiles.length} / 150 · Контур: ${outer} · Скелет: ${layout.tiles.length-outer}`;
        $('tile-status').textContent=`${layout.auto?'Авто → ':''}${orient} · ${layout.canvas.join(' × ')} мм. `+(check.valid?'Раскладка проверена.':'Черновик. Экспорт заблокирован: '+message(check));
        if(mounting)$('tile-plan-table').innerHTML='<table><thead><tr><th>№</th><th>X мм</th><th>Y мм</th><th>°</th></tr></thead><tbody>'+layout.tiles.map(t=>`<tr><td>${t.id}</td><td>${t.xMm.toFixed(2)}</td><td>${t.yMm.toFixed(2)}</td><td>${t.angleDeg.toFixed(2)}</td></tr>`).join('')+'</tbody></table>';
        if(active)for(const id of ['btn-svg','btn-jpg'])$(id).disabled=!check.valid||pending;
      }else if(active)for(const id of ['btn-svg','btn-jpg'])$(id).disabled=true;
      render();
    }
    function compute() {
      if(!source)return;
      if(doc?.undoStack.length)notify('Параметры изменены: ручные правки сброшены при пересчёте.','info');
      if(worker)worker.terminate();worker=null;const id=++job;doc=null;selected=null;adding=false;drag=null;$('tile-add').textContent='Добавить';pending=true;
      $('tile-count').textContent='Пластины: — / 150';$('tile-status').textContent='Проверяю геометрию, зазоры и пересечения…';refresh();
      try{worker=new Worker('tile-worker.js');worker.onmessage=event=>{if(event.data.id!==job)return;pending=false;worker.terminate();worker=null;const layout=event.data.result;
        if(layout.status==='ok'&&T.validate(layout).valid){doc=new T.TileDocument(layout);console.info('Physical layout complete',{canvas:layout.canvas,count:layout.tiles.length,timings:layout.timings,evaluated:layout.evaluated});}
        else {$('tile-status').textContent=failure;notify(failure,'warning',0);console.warn('LAYOUT_NOT_FEASIBLE',layout);}
        refresh();};worker.onerror=event=>{if(id!==job)return;pending=false;worker.terminate();worker=null;console.error('Physical worker failed',event.message);$('tile-status').textContent=failure;notify(failure,'error');refresh();};worker.postMessage({id,source,options:{format:$('tile-format').value,orientation}});
      }catch(error){pending=false;console.error('Physical worker unavailable',error);$('tile-status').textContent='Раскладка требует открытия опубликованного сайта через HTTPS.';notify($('tile-status').textContent,'error');refresh();}
    }
    function choose(physical) {
      active=physical;document.body.classList.toggle('tile-active',active);panel.hidden=!active;canvas.hidden=!active;$('cv').hidden=active;
      $('result-detailed').setAttribute('aria-pressed',String(!active));$('result-tiles').setAttribute('aria-pressed',String(active));
      $('result-description').textContent=active?'Физическая раскладка из целых пластин 30 × 3 мм.':'Детальный контур и все принятые структурные линии.';
      if(active){onPhysical();document.title='DrawACRL — раскладка 30 × 3 мм';if(!doc&&!pending)compute();else refresh();}
      else {onDetailed();for(const id of ['btn-svg','btn-jpg'])$(id).disabled=false;}
    }
    function select(id){selected=id;const t=doc?.layout.tiles.find(t=>t.id===id);if(t){$('tile-x').value=t.xMm.toFixed(2);$('tile-y').value=t.yMm.toFixed(2);$('tile-angle').value=t.angleDeg.toFixed(2);}refresh();}
    function apply(tile,bypass=false){if(!doc)return;const proposed=T.snap(tile,doc.layout,bypass||!$('tile-snap').checked);if(tile.role==='skeleton'){const paths=doc.layout.target.map(p=>({p,d:T.nearestOnPath([proposed.xMm,proposed.yMm],p.points).distance})).sort((a,b)=>a.d-b.d);const found=paths.slice(0,4).find(({p})=>T.deviation(proposed,new T.SegmentGrid([p.points])).max<=3);if(found)proposed.sourcePathId=found.p.id;}const check=doc.update(tile.id,proposed);if(!check.valid)notify(message(check),'error');select(tile.id);}
    function point(event){const r=canvas.getBoundingClientRect(),[w,h]=doc.layout.canvas,scale=Math.min(r.width/w,r.height/h);return [(event.clientX-r.left-(r.width-w*scale)/2)/scale,(event.clientY-r.top-(r.height-h*scale)/2)/scale];}
    canvas.addEventListener('pointerdown',e=>{if(!editing||!doc)return;const p=point(e);
      if(adding){const nearest=doc.layout.target.map(path=>({path,...T.nearestOnPath(p,path.points)})).sort((a,b)=>a.distance-b.distance)[0];const t=T.makeTile(...p,nearest?.angle||0,nearest?.path.role||'skeleton',nearest?.path.id||0);
        if(t.role==='outer'){const outer=doc.layout.tiles.filter(t=>t.role==='outer').sort((a,b)=>a.sequenceIndex-b.sequenceIndex);let best=Infinity;for(let i=0;i<outer.length;i++){const a=outer[i],b=outer[(i+1)%outer.length],d=Math.hypot(p[0]-a.xMm,p[1]-a.yMm)+Math.hypot(p[0]-b.xMm,p[1]-b.yMm)-Math.hypot(a.xMm-b.xMm,a.yMm-b.yMm);if(d<best){best=d;t.sequenceIndex=b.sequenceIndex>a.sequenceIndex?(a.sequenceIndex+b.sequenceIndex)/2:a.sequenceIndex+.5;}}}
        const check=doc.add(T.snap(t,doc.layout,e.altKey||!$('tile-snap').checked));adding=false;$('tile-add').textContent='Добавить';if(!check.valid)notify(message(check),'error');else select(doc.layout.tiles[doc.layout.tiles.length-1].id);refresh();return;}
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
    $('tile-add').onclick=()=>{if(!doc||doc.layout.tiles.length>=150)return;adding=!adding;$('tile-add').textContent=adding?'Нажмите на холст':'Добавить';};
    $('tile-undo').onclick=()=>{doc?.undo();select(null);};$('tile-redo').onclick=()=>{doc?.redo();select(null);};
    function download(name,body,mime){const blob=new Blob([body],{type:mime}),url=URL.createObjectURL(blob),a=document.createElement('a');a.href=url;a.download=name;document.body.appendChild(a);a.click();setTimeout(()=>{URL.revokeObjectURL(url);a.remove();},2000);}
    $('tile-csv').onclick=()=>{if(!doc||!T.validate(doc.layout).valid){notify('Сначала исправьте раскладку.','error');return;}download('mounting-coordinates.csv','id,xMm,yMm,angleDeg,lengthMm,widthMm,role\n'+doc.layout.tiles.map(t=>[t.id,t.xMm,t.yMm,t.angleDeg,30,3,t.role].join(',')).join('\n'),'text/csv');};
    return {
      sourceChanged(data){source=data;doc=null;selected=null;if(worker)worker.terminate();job++;pending=false;$('tile-format').value=getFormat();$('result-controls').hidden=!data;choose(false);},
      reset(){source=null;doc=null;if(worker)worker.terminate();job++;pending=false;choose(false);$('result-controls').hidden=true;},
      isActive:()=>active,
      export(kind){if(!doc)return;const check=T.validate(doc.layout);if(!check.valid){notify(message(check),'error');return;}const name=`tiles-${mounting?'mounting':'layout'}-${doc.layout.canvas.join('x')}mm`;
        if(kind==='svg')download(name+'.svg',T.exportSVG(doc.layout,{mounting}),'image/svg+xml');
        else {const out=document.createElement('canvas');out.width=doc.layout.canvas[0]*6;out.height=doc.layout.canvas[1]*6;const ctx=out.getContext('2d');ctx.scale(6,6);draw(ctx,doc.layout,mounting);const a=document.createElement('a');a.download=name+'.jpg';a.href=out.toDataURL('image/jpeg',.95);document.body.appendChild(a);a.click();setTimeout(()=>a.remove(),2000);}
        notify('Файл раскладки подготовлен.','success');
      }
    };
  }
  root.TileUI={create};
})(globalThis);
