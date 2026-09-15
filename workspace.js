/* Application shell only. No extraction, target geometry or export implementation. */
(function(root){'use strict';
  const emit=detail=>root.dispatchEvent(new CustomEvent('prismosaic:view',{detail}));
  function create({t,handleFile}){
    const $=id=>document.getElementById(id),tr=k=>t('ws.'+k),app=$('app'),stage=$('stage'),panel=$('panel');
    const text=k=>`<span data-i18n="ws.${k}">${tr(k)}</span>`;
    const button=(id,k,icon='')=>`<button type="button" id="${id}" title="${tr(k)}" data-i18n-attr="title:ws.${k}">${icon?`<span aria-hidden="true">${icon}</span>`:''}${text(k)}</button>`;
    let active=1,sourceView=false,empty=true,zoom=1,grid=false;
    const states={1:{},2:{},3:{}},thumbs={};
    document.body.classList.add('professional','workspace-empty');
    const header=document.createElement('header');header.id='app-header';
    header.innerHTML=`<a class="wordmark" href="#workspace-heading" aria-label="Prismosaic"><img class="brand-logo" src="assets/prismosaic-logo.png" width="2172" height="724" alt="Prismosaic" decoding="async"></a><nav aria-label="${tr('workspace')}" data-i18n-attr="aria-label:ws.workspace">${button('nav-project','project')}${button('nav-results','results')}${button('nav-editor','editor')}${button('nav-export','export')}</nav><div class="header-tools"><div id="language-host"></div><details id="workspace-settings"><summary title="${tr('settings')}" data-i18n-attr="title:ws.settings">⚙ <span class="sr-only" data-i18n="ws.settings">${tr('settings')}</span></summary><div id="settings-content"></div></details>${button('header-download','export','↓')}</div>`;
    document.body.prepend(header);$('language-host').append($('lang'));$('settings-content').append(document.querySelector('.hints-toggle'));
    const sidebar=document.createElement('aside');sidebar.id='workflow';sidebar.setAttribute('aria-label',tr('workflow'));sidebar.setAttribute('data-i18n-attr','aria-label:ws.workflow');
    sidebar.innerHTML=`<div class="eyebrow">${text('workflow')}</div><button id="workflow-source" class="workflow-step" type="button"><span class="step-number">1</span><span class="step-label">${text('source')}<small id="source-name"></small></span><canvas id="source-thumb" class="step-thumb" width="240" height="140" aria-hidden="true"></canvas></button>`;
    app.prepend(sidebar);sidebar.append($('result-controls'));
    const resultIds=['result-detailed','result-optimized','result-tiles'];
    const unavailable=Object.fromEntries(resultIds.map(id=>[id,$(id).disabled]));
    resultIds.forEach((id,i)=>{const b=$(id);b.classList.add('workflow-step');const label=document.createElement('span');label.className='step-label';while(b.firstChild)label.append(b.firstChild);const number=document.createElement('span');number.className='step-number';number.textContent=i+2;const thumb=document.createElement('canvas');thumb.width=240;thumb.height=140;thumb.className='step-thumb';thumb.setAttribute('aria-hidden','true');const status=document.createElement('small');status.className='step-state';status.id='step-state-'+(i+1);label.append(status);b.append(number,label,thumb);thumbs[i+1]=thumb;});
    resultIds.forEach((id,i)=>{const short=document.createElement('span');short.className='mobile-step-title';const key=['detailedShort','optimizedShort','physicalShort'][i];short.dataset.i18n='ws.'+key;short.textContent=tr(key);$(id).querySelector('.step-label').append(short);});
    const replace=document.createElement('div');replace.className='workflow-footer';replace.innerHTML=button('replace-image','replace','↑');sidebar.append(replace);
    const top=document.createElement('div');top.id='workspace-top';top.innerHTML=`<div><div class="eyebrow">PRISMOSAIC / ${text('workspace')}</div><h1 id="workspace-heading" tabindex="-1"></h1></div><span id="workspace-status" role="status"></span>`;stage.prepend(top);
    const recovery=document.createElement('div');recovery.id='workspace-recovery';recovery.hidden=true;recovery.innerHTML=button('retry-processing','retry');top.after(recovery);
    const viewport=document.createElement('div');viewport.id='canvas-viewport';viewport.tabIndex=0;viewport.setAttribute('aria-label',tr('workspace'));viewport.setAttribute('data-i18n-attr','aria-label:ws.workspace');
    const sheet=document.createElement('div');sheet.id='canvas-sheet';
    ['cv','optimized-canvas','tile-canvas'].forEach(id=>{if($(id))sheet.append($(id));});
    const original=document.createElement('canvas');original.id='source-canvas';original.hidden=true;sheet.append(original);
    const ruler=document.createElement('div');ruler.id='sheet-measure';ruler.innerHTML=`<span id="sheet-width"></span><span id="sheet-safe">${text('safe')}</span><span id="sheet-height"></span>`;sheet.append(ruler);viewport.append(sheet);stage.append(viewport);
    const start=document.createElement('section');start.id='workspace-start';start.innerHTML=`<div class="upload-symbol" aria-hidden="true">↥</div><div class="eyebrow">${text('newProject')}</div><h2 data-i18n="ws.dropTitle">${tr('dropTitle')}</h2><p data-i18n="ws.dropHelp">${tr('dropHelp')}</p>`;
    const drop=$('drop');drop.replaceChildren();drop.innerHTML=`<b data-i18n="ws.choose">${tr('choose')}</b>`;drop.setAttribute('role','button');drop.tabIndex=0;drop.onkeydown=e=>{if(e.key==='Enter'||e.key===' '){e.preventDefault();drop.click();}};start.append(drop);
    const presets=document.createElement('div');presets.className='start-presets';presets.innerHTML=button('start-presets','orPreset');start.append(presets);viewport.append(start);
    const toolbar=document.createElement('div');toolbar.id='canvas-toolbar';toolbar.setAttribute('role','group');toolbar.setAttribute('aria-label',tr('workspace'));toolbar.setAttribute('data-i18n-attr','aria-label:ws.workspace');toolbar.innerHTML=`${button('view-out','zoomOut','−')}<output id="view-zoom">100%</output>${button('view-in','zoomIn','+')}${button('view-fit','fit','⊙')}<span class="toolbar-divider"></span>${button('view-grid','grid','▦')}<span class="view-note" data-i18n="ws.viewOnly">${tr('viewOnly')}</span>`;stage.append(toolbar);
    const props=document.createElement('div');props.id='properties-heading';props.innerHTML=`<h2 data-i18n="ws.parameters">${tr('parameters')}</h2>${button('properties-close','close','×')}`;panel.prepend(props);
    const replaceInPanel=document.createElement('div');replaceInPanel.innerHTML=button('properties-replace','replace','↑');$('sec-shape').querySelector('.section-title').after(replaceInPanel);
    const mobile=document.createElement('button');mobile.id='mobile-properties';mobile.type='button';mobile.innerHTML=`<span aria-hidden="true">☷</span> ${text('properties')}`;mobile.setAttribute('aria-controls','panel');mobile.setAttribute('aria-expanded','false');stage.append(mobile);
    const inventory=document.createElement('section');inventory.id='piece-inventory';inventory.innerHTML=`<h3 data-i18n="ws.kit">${tr('kit')}</h3>`+['large','small','total'].map((type,i)=>`<div class="inventory-row"><label for="inventory-${type}" data-i18n="ws.${type}">${tr(type)}</label><output id="inventory-${type}-text">— / ${[100,50,150][i]}</output><progress id="inventory-${type}" max="${[100,50,150][i]}" value="0"></progress>${i<2?`<small data-i18n="ws.${type}Source">${tr(type+'Source')}</small>`:''}</div>`).join('');$('tile-count')?.after(inventory);
    // Existing section toggles keep their handlers, now operable by keyboard.
    document.querySelectorAll('.section-title').forEach(title=>{title.tabIndex=0;title.setAttribute('role','button');const update=()=>title.setAttribute('aria-expanded',String(!title.parentElement.classList.contains('collapsed')));update();title.addEventListener('click',update);title.addEventListener('keydown',e=>{if(['Enter',' '].includes(e.key)){e.preventDefault();title.click();}});});
    function properties(open=true){document.body.classList.toggle('properties-open',open);mobile.setAttribute('aria-expanded',String(open));if(open)panel.scrollTop=0;else mobile.focus();}
    function expand(id){$(id)?.classList.remove('collapsed');$(id)?.querySelector('.section-title')?.setAttribute('aria-expanded','true');}
    function showImage(){if(!states.source)return;sourceView=true;empty=false;refresh();}
    function frame(){
      const state=states[active],cv=sourceView?original:$(active===3?'tile-canvas':active===2?'optimized-canvas':'cv');
      const ratio=cv.width/cv.height||1,w=Math.max(160,viewport.clientWidth-64),h=Math.max(180,viewport.clientHeight-64),base=Math.min(w,h*ratio);
      sheet.style.width=Math.round(base*zoom)+'px';sheet.style.aspectRatio=String(ratio);
      $('view-zoom').textContent=Math.round(zoom*100)+'%';$('view-grid').setAttribute('aria-pressed',String(grid));sheet.classList.toggle('grid-visible',grid&&!sourceView);
      ruler.hidden=sourceView||active!==3||!state.ready;
      if(state.canvas){$('sheet-width').textContent=state.canvas[0]+' '+t('unit.mm');$('sheet-height').textContent=state.canvas[1]+' '+t('unit.mm');}
    }
    function thumbnail(src,dest){if(!src?.width||!src?.height)return;const c=dest.getContext('2d');c.fillStyle='#fff';c.fillRect(0,0,dest.width,dest.height);const scale=Math.min((dest.width-16)/src.width,(dest.height-16)/src.height);c.drawImage(src,(dest.width-src.width*scale)/2,(dest.height-src.height*scale)/2,src.width*scale,src.height*scale);}
    function refresh(){
      document.documentElement.lang=$('lang').value;document.title='Prismosaic — '+tr(sourceView?'source':empty?'newProject':active===3?'physical':active===2?'optimized':'detailed');
      document.body.classList.toggle('workspace-empty',empty);document.body.classList.toggle('source-view',sourceView);original.hidden=!sourceView;
      recovery.hidden=!states[1].failed||states[1].pending||active!==1;
      $('workspace-heading').textContent=tr(empty?'newProject':sourceView?'source':active===3?'physical':active===2?'optimized':states[1].ready?'detailed':'preset');
      const s=states[active];$('workspace-status').textContent=empty?'':sourceView?(s.failed?tr('error'):s.pending?tr('processing'):tr('source')):s.pending?tr(s.phase==='plan'?'planning':s.phase==='qa'?'qa':'processing'):s.failed?tr('error'):s.ready?tr(active===3?(s.mode==='DETERMINISTIC_FALLBACK'?'fallback':s.visualStatus==='AI_ACCEPTED'?'aiApproved':'aiReview'):'ready'):tr('preset');$('workspace-status').className=s.failed?'error':s.pending?'pending':active===3&&s.mode==='DETERMINISTIC_FALLBACK'?'fallback':'';
      $('workflow-source').setAttribute('aria-pressed',String(sourceView||empty));
      resultIds.forEach((id,i)=>{const state=states[i+1];$(id).disabled=unavailable[id]||!states[1].ready;$(id).classList.toggle('step-active',!sourceView&&!empty&&active===i+1);$('step-state-'+(i+1)).textContent=tr(state.pending?'processing':state.failed?'error':state.ready?'ready':'notStarted');$(id).classList.toggle('step-complete',!!state.ready);});
      $('nav-editor').disabled=!states[3].ready||empty;['nav-results','nav-export','header-download'].forEach(id=>$(id).disabled=empty||sourceView||$('btn-svg').disabled);
      $('nav-project').setAttribute('aria-current',empty||sourceView?'page':'false');$('nav-results').setAttribute('aria-current',!empty&&!sourceView?'page':'false');
      const inv=states[3].inventory;for(const [type,max]of [['large',100],['small',50],['total',150]]){const n=inv?.[type+'Used'];if($('inventory-'+type)){$('inventory-'+type).value=n||0;$('inventory-'+type+'-text').textContent=(n??'—')+' / '+max;}}
      document.body.classList.toggle('workspace-editing',!!states[3].editing);frame();
    }
    function update(d){
      if(d.id==='source'){
        states.source=d;states[1]={};states[2]={};states[3]={};active=1;empty=false;sourceView=true;zoom=1;
        for(const thumb of Object.values(thumbs))thumb.getContext('2d').clearRect(0,0,thumb.width,thumb.height);
        const scale=Math.min(1,1600/Math.max(d.image.naturalWidth,d.image.naturalHeight));original.width=d.image.naturalWidth*scale;original.height=d.image.naturalHeight*scale;original.getContext('2d').drawImage(d.image,0,0,original.width,original.height);thumbnail(original,$('source-thumb'));$('source-name').textContent=d.name;refresh();return;
      }
      if(d.id==='preset'){empty=false;sourceView=false;active=1;states[1]={};states[2]={};states[3]={};states.source=null;$('source-name').textContent='';$('source-thumb').getContext('2d').clearRect(0,0,240,140);refresh();return;}
      if(![1,2,3].includes(d.id))return;states[d.id]={...states[d.id],...d};
      if(d.active){if(active!==d.id){zoom=1;active=d.id;sourceView=false;}if(d.reveal)sourceView=false;empty=false;}
      if(d.ready&&d.canvasElement)thumbnail(d.canvasElement,thumbs[d.id]);refresh();
    }
    root.addEventListener('prismosaic:view',e=>update(e.detail));
    resultIds.forEach((id,i)=>$(id).addEventListener('click',()=>{active=i+1;empty=false;sourceView=false;zoom=1;properties(false);refresh();}));
    $('workflow-source').onclick=()=>{if(states.source)showImage();else{empty=true;refresh();}};
    $('nav-project').onclick=()=>{if(states.source)showImage();else{empty=true;refresh();}properties(true);expand('sec-shape');};
    $('nav-results').onclick=()=>{sourceView=false;refresh();};
    $('nav-editor').onclick=()=>{$('result-tiles').click();if($('tile-edit').getAttribute('aria-pressed')!=='true')$('tile-edit').click();properties(true);};
    function exportPanel(){properties(true);expand('sec-actions');$('sec-actions').scrollIntoView({block:'nearest'});$('btn-svg').focus();}
    $('nav-export').onclick=exportPanel;$('header-download').onclick=exportPanel;
    $('replace-image').onclick=()=>$('file-input').click();$('start-presets').onclick=()=>{empty=false;sourceView=false;refresh();properties(true);expand('sec-shape');$('preset').focus();};
    $('properties-replace').onclick=()=>$('file-input').click();
    $('retry-processing').onclick=()=>$('btn-gen').click();
    $('preset').addEventListener('change',()=>{if($('preset').value!=='custom')update({id:'preset'});});
    $('mobile-properties').onclick=()=>properties(!document.body.classList.contains('properties-open'));$('properties-close').onclick=()=>properties(false);
    document.addEventListener('keydown',e=>{if(e.key==='Escape'&&document.body.classList.contains('properties-open'))properties(false);});
    $('view-in').onclick=()=>{zoom=Math.min(3,zoom+.25);frame();};$('view-out').onclick=()=>{zoom=Math.max(.5,zoom-.25);frame();};$('view-fit').onclick=()=>{zoom=1;frame();viewport.scrollTo(0,0);};$('view-grid').onclick=()=>{grid=!grid;frame();};
    viewport.addEventListener('dragover',e=>{e.preventDefault();});viewport.addEventListener('drop',e=>{e.preventDefault();if(e.target.closest('#drop'))return;if(e.dataTransfer.files[0])handleFile(e.dataTransfer.files[0]);});
    new ResizeObserver(()=>frame()).observe(viewport);
    $('lang').addEventListener('change',refresh);
    // Do not expose hidden algorithm diagnostics just because hybrid is enabled.
    if(new URLSearchParams(location.search).get('debug')!=='1'&&$('tile-debug'))$('tile-debug').hidden=true;
    refresh();
    return {refresh,update};
  }
  root.WorkspaceUI={create,emit};
})(globalThis);
