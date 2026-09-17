/* Presentation adapters: existing controls remain the processing source of truth. */
(function(root){'use strict';
  const vocabulary={
    ru:['Библиотека силуэтов','Поиск силуэта','Все','Животные','Птицы','Символы','Природа','Транспорт','Другое','Загруженное','Отмена','Выбрать','Ничего не найдено','Действие не выполнено','OK','Обработка изображения','Оптимизация контура','Создание раскладки','AI-планирование','Проверка композиции','Пожалуйста, дождитесь завершения.','Сначала загрузите изображение'],
    en:['Silhouette library','Search silhouettes','All','Animals','Birds','Symbols','Nature','Transport','Other','Uploaded','Cancel','Select','No silhouettes found','Action could not be completed','OK','Processing image','Optimizing contour','Creating layout','AI planning','Composition review','Please wait until processing finishes.','Upload an image first'],
    zh:['轮廓库','搜索轮廓','全部','动物','鸟类','符号','自然','交通','其他','已上传','取消','选择','未找到轮廓','操作未完成','确定','正在处理图像','正在优化轮廓','正在创建排布','AI 规划中','正在审核构图','请等待处理完成。','请先上传图像']
  };
  const keys=['library','search','all','animals','birds','symbols','nature','transport','other','uploaded','cancel','select','none','errorTitle','ok','image','optimize','layout','plan','qa','wait','uploadFirst'];
  for(const [lang,values]of Object.entries(vocabulary))keys.forEach((k,i)=>root.WorkspaceMessages[lang]['ux.'+k]=values[i]);
  function create({t,presets}){
    const $=id=>document.getElementById(id),tr=k=>t('ux.'+k);
    const make=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;};
    const button=(label,fn)=>{const b=make('button','',label);b.type='button';b.onclick=fn;return b;};
    // Native modal dialogs provide focus trapping and inert background on all supported browsers.
    function dialog(id,title){const d=make('dialog','workspace-dialog');d.id=id;d.tabIndex=-1;d.setAttribute('aria-modal','true');const h=make('h2','',title);h.id=id+'-title';d.setAttribute('aria-labelledby',h.id);d.append(h);d.addEventListener('keydown',e=>{if(e.key!=='Tab')return;const nodes=Array.from(d.querySelectorAll('button,input,[tabindex="0"]')).filter(n=>!n.disabled&&n.getClientRects().length);const first=nodes[0],last=nodes.at(-1);if(!first){e.preventDefault();d.focus();}else if(e.shiftKey&&(document.activeElement===first||document.activeElement===d)){e.preventDefault();last.focus();}else if(!e.shiftKey&&(document.activeElement===last||document.activeElement===d)){e.preventDefault();first.focus();}});document.body.append(d);return d;}
    const library=dialog('silhouette-library',tr('library')),error=dialog('workspace-error',tr('errorTitle')),busy=dialog('workspace-busy','');
    error.setAttribute('role','alertdialog');const errorText=make('p');errorText.id='workspace-error-message';error.setAttribute('aria-describedby',errorText.id);error.append(errorText);
    const errorOK=button(tr('ok'),()=>error.close());error.append(errorOK);
    const errors=[];let resumeFocus=null;
    function showError(){if(!errors.length||busy.open||error.open)return;errorText.textContent=errors.shift();error.showModal();errorOK.focus();}
    error.addEventListener('close',()=>{if(errors.length)showError();});
    root.WorkspaceDialogs={error(message){if(!errors.includes(message)&&(!error.open||errorText.textContent!==message))errors.push(message);showError();}};
    busy.setAttribute('aria-busy','true');busy.addEventListener('cancel',e=>e.preventDefault());
    const spinner=make('div','processing-spinner');spinner.setAttribute('aria-hidden','true');busy.prepend(spinner);
    const status=busy.querySelector('h2');status.setAttribute('role','status');status.setAttribute('aria-live','polite');const wait=make('p','',tr('wait'));busy.append(wait);
    const pending={};let uploaded=null;
    function syncBusy(){const entry=Object.values(pending).find(d=>d.pending);if(entry){status.textContent=tr(entry.phase==='plan'?'plan':entry.phase==='qa'?'qa':entry.id===2?'optimize':entry.id===3?'layout':'image');if(!busy.open){resumeFocus=document.activeElement;busy.showModal();}}else if(busy.open){busy.close();if(errors.length)showError();else if(resumeFocus?.isConnected)resumeFocus.focus();}}
    root.addEventListener('prismosaic:view',e=>{const d=e.detail;if(d.id==='source'){uploaded=d.image;for(const k of Object.keys(pending))delete pending[k];}else if(d.id==='preset'){for(const k of Object.keys(pending))delete pending[k];}else if([1,2,3].includes(d.id))pending[d.id]={...pending[d.id],...d};syncBusy();syncControls();});
    // Replace visible selects, dispatching precisely the same change events as before.
    const groups=[];
    for(const id of ['canvas-format','tile-format']){const select=$(id);if(!select)continue;select.hidden=true;const group=make('div','size-buttons');group.setAttribute('role','group');group.setAttribute('aria-label',t('tile.canvas'));for(const value of ['40x40','30x40']){const b=button('',()=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));syncControls();});b.dataset.value=value;group.append(b);}select.after(group);select.addEventListener('change',syncControls);groups.push({select,group});}
    const select=$('preset');select.hidden=true;select.tabIndex=-1;const field=button('',()=>openLibrary());field.id='silhouette-picker';field.setAttribute('aria-haspopup','dialog');field.setAttribute('aria-controls',library.id);select.after(field);select.previousElementSibling?.setAttribute('for',field.id);
    const search=make('input');search.type='search';search.id='silhouette-search';search.placeholder=tr('search');search.setAttribute('aria-label',tr('search'));library.append(search);
    const body=make('div','library-body'),categories=make('nav','library-categories'),cards=make('div','library-grid');categories.setAttribute('aria-label',tr('library'));body.append(categories,cards);library.append(body);
    const footer=make('footer');const cancel=button(tr('cancel'),()=>library.close()),confirm=button(tr('select'),()=>{const option=Array.from(select.options).find(o=>o.value===chosen);if(!option||option.disabled)return;library.close();select.value=chosen;select.dispatchEvent(new Event('change',{bubbles:true}));syncControls();});footer.append(cancel,confirm);library.append(footer);
    const categoryMap={butterfly:'animals',wolf:'animals',cat:'animals',fish:'animals',dragonfly:'animals',bird:'birds',star:'symbols',heart:'symbols',crown:'symbols',moon:'nature',tree:'nature',flower:'nature',rocket:'transport',house:'other',custom:'uploaded'};
    let category='all',chosen=select.value;
    function drawPreview(canvas,key){canvas.width=240;canvas.height=150;const ctx=canvas.getContext('2d');ctx.clearRect(0,0,240,150);if(key==='custom'){if(uploaded){const s=Math.min(220/uploaded.naturalWidth,130/uploaded.naturalHeight);ctx.drawImage(uploaded,(240-uploaded.naturalWidth*s)/2,(150-uploaded.naturalHeight*s)/2,uploaded.naturalWidth*s,uploaded.naturalHeight*s);}return;}const polys=presets[key]?.polys;if(!polys)return;const pts=polys.flat(),xs=pts.map(p=>p[0]),ys=pts.map(p=>p[1]),x=Math.min(...xs),y=Math.min(...ys),w=Math.max(...xs)-x,h=Math.max(...ys)-y,s=Math.min(220/(w||1),130/(h||1));ctx.translate((240-w*s)/2,(150-h*s)/2);ctx.scale(s,s);ctx.translate(-x,-y);ctx.fillStyle='#171717';for(const poly of polys){ctx.beginPath();poly.forEach(([a,b],i)=>i?ctx.lineTo(a,b):ctx.moveTo(a,b));ctx.closePath();ctx.fill();}}
    function renderCards(){cards.replaceChildren();const query=search.value.trim().toLocaleLowerCase();for(const option of select.options){if(category!=='all'&&categoryMap[option.value]!==category)continue;if(!option.textContent.toLocaleLowerCase().includes(query))continue;const card=button('',()=>{chosen=option.value;renderCards();cards.querySelector(`[data-value="${chosen}"]`)?.focus();});card.className='silhouette-card';card.dataset.value=option.value;card.disabled=option.disabled;card.setAttribute('aria-pressed',String(chosen===option.value));const cv=make('canvas');cv.setAttribute('aria-hidden','true');drawPreview(cv,option.value);card.append(cv,make('span','',option.textContent));if(option.disabled)card.append(make('small','',tr('uploadFirst')));cards.append(card);}if(!cards.children.length)cards.append(make('p','',tr('none')));confirm.disabled=!Array.from(select.options).some(o=>o.value===chosen&&!o.disabled);categories.querySelectorAll('button').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.category===category)));}
    for(const key of ['all','animals','birds','symbols','nature','transport','other','uploaded']){const b=button(tr(key),()=>{category=key;renderCards();});b.dataset.category=key;categories.append(b);}
    search.oninput=renderCards;
    function openLibrary(){chosen=select.value;category='all';search.value='';renderCards();library.showModal();search.focus();}
    function syncControls(){for(const {select,group}of groups){group.setAttribute('aria-label',t('tile.canvas'));for(const b of group.children){b.textContent=t(b.dataset.value==='40x40'?'tile.size40':'tile.size30');b.setAttribute('aria-pressed',String(select.value===b.dataset.value));b.disabled=select.disabled;}}field.textContent=(select.selectedOptions[0]?.textContent||tr('select'))+' ›';}
    $('start-presets').addEventListener('click',()=>field.click());
    select.addEventListener('change',syncControls);
    new MutationObserver(syncControls).observe(select,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','selected']});
    $('lang').addEventListener('change',()=>{library.querySelector('h2').textContent=tr('library');error.querySelector('h2').textContent=tr('errorTitle');errorOK.textContent=tr('ok');search.placeholder=tr('search');search.setAttribute('aria-label',tr('search'));categories.setAttribute('aria-label',tr('library'));categories.querySelectorAll('button').forEach(b=>b.textContent=tr(b.dataset.category));cancel.textContent=tr('cancel');confirm.textContent=tr('select');wait.textContent=tr('wait');syncBusy();syncControls();if(library.open)renderCards();});
    syncControls();
  }
  root.WorkspaceRefinement={create};
})(globalThis);
