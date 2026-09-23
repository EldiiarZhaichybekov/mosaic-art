/* Presentation adapters: existing controls remain the processing source of truth. */
(function(root){'use strict';
  const vocabulary={
    ru:['Библиотека силуэтов','Поиск силуэта','Все','Животные','Птицы','Символы','Природа','Транспорт','Другое','Загруженное','Отмена','Выбрать','Ничего не найдено','Действие не выполнено','OK','Обработка изображения','Оптимизация контура','Создание раскладки','AI-планирование','Проверка композиции','Пожалуйста, дождитесь завершения.','Сначала загрузите изображение'],
    en:['Silhouette library','Search silhouettes','All','Animals','Birds','Symbols','Nature','Transport','Other','Uploaded','Cancel','Select','No silhouettes found','Action could not be completed','OK','Processing image','Optimizing contour','Creating layout','AI planning','Composition review','Please wait until processing finishes.','Upload an image first'],
    zh:['轮廓库','搜索轮廓','全部','动物','鸟类','符号','自然','交通','其他','已上传','取消','选择','未找到轮廓','操作未完成','确定','正在处理图像','正在优化轮廓','正在创建排布','AI 规划中','正在审核构图','请等待处理完成。','请先上传图像']
  };
  const keys=['library','search','all','animals','birds','symbols','nature','transport','other','uploaded','cancel','select','none','errorTitle','ok','image','optimize','layout','plan','qa','wait','uploadFirst'];
  for(const [lang,values]of Object.entries(vocabulary))keys.forEach((k,i)=>root.WorkspaceMessages[lang]['ux.'+k]=values[i]);
  for(const [lang,value]of Object.entries({ru:'Назад',en:'Back',zh:'返回'}))root.WorkspaceMessages[lang]['ux.back']=value;
  for(const [lang,values]of Object.entries({
    ru:['AI-доработка не применена. Использован математический контур; раскладка будет проверена отдельно.','Не удалось подготовить все результаты. Готовые этапы сохранены. Повторите обработку на незавершённом этапе.','Подготовка контура','AI-доработка и проверка контура','Создание раскладки','Отменить обработку'],
    en:['AI refinement was not applied. The mathematical contour is retained; the layout is checked separately.','Could not prepare all results. Completed stages are retained. Retry the unfinished stage.','Preparing contour','AI refinement and contour validation','Creating layout','Cancel processing'],
    zh:['未应用 AI 优化。保留数学轮廓，排布将单独验证。','无法完成所有结果。已完成的步骤已保留，请重试未完成的步骤。','正在准备轮廓','AI 优化与轮廓验证','正在创建排布','取消处理']
  }))['fallback','failed','stage1','stage2','stage3','cancel'].forEach((key,i)=>root.WorkspaceMessages[lang]['pipeline.'+key]=values[i]);
  for(const [lang,values]of Object.entries({
    ru:['Обработка остановлена. Можно повторить расчёт или выбрать другой источник.','Контур ещё не рассчитан. Нажмите «Пересчитать контур».','Применены проверенные AI-правки.','AI не предложил изменений: сохранён математический контур.'],
    en:['Processing stopped. Retry or choose another source.','The contour is not ready. Select Recompute contour.','Validated AI edits applied.','AI proposed no changes; the mathematical contour is retained.'],
    zh:['处理已停止。可重试或选择其他来源。','轮廓尚未计算。请选择重新计算轮廓。','已应用通过验证的 AI 修改。','AI 未提出修改，保留数学轮廓。']
  }))['cancelled','notReady','accepted','unchanged'].forEach((key,i)=>root.WorkspaceMessages[lang]['pipeline.'+key]=values[i]);
  function create({t,onLibraryAsset}){
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
    const cancelProcessing=button(t('pipeline.cancel'),()=>root.dispatchEvent(new Event('prismosaic:cancel-processing')));busy.append(cancelProcessing);
    const pending={};let uploaded=null;
    function syncBusy(){const entry=pending.pipeline?.pending?pending.pipeline:Object.values(pending).find(d=>d.pending);if(entry){cancelProcessing.textContent=t('pipeline.cancel');status.textContent=entry.id==='pipeline'?`${entry.stage}/3 · ${t('pipeline.stage'+entry.stage)}`:tr(entry.phase==='plan'?'plan':entry.phase==='qa'?'qa':entry.id===2?'optimize':entry.id===3?'layout':'image');if(!busy.open){resumeFocus=document.activeElement;busy.showModal();}}else if(busy.open){busy.close();if(errors.length)showError();else if(resumeFocus?.isConnected)resumeFocus.focus();}}
    root.addEventListener('prismosaic:view',e=>{const d=e.detail;if(d.id==='source'||d.id==='preset'){if(d.id==='source')uploaded=d.image;for(const k of Object.keys(pending))if(k!=='pipeline')delete pending[k];}else if([1,2,3,'library','pipeline'].includes(d.id))pending[d.id]={...pending[d.id],...d};syncBusy();syncControls();});
    // Replace visible selects, dispatching precisely the same change events as before.
    const groups=[];
    for(const id of ['canvas-format','tile-format']){const select=$(id);if(!select)continue;select.hidden=true;const group=make('div','size-buttons');group.setAttribute('role','group');group.setAttribute('aria-label',t('tile.canvas'));for(const value of ['40x40','30x40']){const b=button('',()=>{select.value=value;select.dispatchEvent(new Event('change',{bubbles:true}));syncControls();});b.dataset.value=value;group.append(b);}select.after(group);select.addEventListener('change',syncControls);groups.push({select,group});}
    const select=$('preset');select.hidden=true;select.tabIndex=-1;select.closest('.ctrl')?.classList.add('legacy-source-picker');
    const field=button('',()=>openLibrary());field.id='silhouette-picker';field.hidden=true;field.setAttribute('aria-haspopup','dialog');field.setAttribute('aria-controls',library.id);select.after(field);
    const shared=root.AssetLibraryUI.create({dialog:library,t,onSelect:async asset=>{root.dispatchEvent(new CustomEvent('prismosaic:source-meta',{detail:{type:asset.type,name:root.AssetLibrary.localized(asset.title,document.documentElement.lang)}}));try{await onLibraryAsset(asset);syncControls();}catch(error){root.dispatchEvent(new CustomEvent('prismosaic:source-meta',{detail:null}));throw error;}},onCancel:detail=>root.dispatchEvent(new CustomEvent('prismosaic:library-cancel',{detail}))});
    const search=shared.search;
    // Search inputs may consume Escape just to clear text. The library must close.
    library.addEventListener('keydown',e=>{if(e.key==='Escape'){e.preventDefault();e.stopPropagation();library.close();}});
    // Presentation lifecycle only: iOS keyboard changes the visual, not layout, viewport.
    const mobileLibrary=matchMedia('(max-width:600px)'),libraryTitle=library.querySelector('h2');
    libraryTitle.tabIndex=-1;
    let scrollLock=null,viewportFrame=0;
    function releaseScroll(){if(!scrollLock)return;const saved=scrollLock;scrollLock=null;for(const [key,value]of Object.entries(saved.styles))document.body.style[key]=value;window.scrollTo(saved.x,saved.y);}
    function syncLibraryViewport(){
      viewportFrame=0;
      if(!library.open||!mobileLibrary.matches){library.style.removeProperty('--library-height');library.style.removeProperty('--library-top');releaseScroll();return;}
      if(!scrollLock){const keys=['position','top','left','width','overflow'];scrollLock={x:scrollX,y:scrollY,styles:Object.fromEntries(keys.map(k=>[k,document.body.style[k]]))};Object.assign(document.body.style,{position:'fixed',top:-scrollLock.y+'px',left:'0',width:'100%',overflow:'hidden'});}
      const viewport=window.visualViewport;
      // Never counteract intentional pinch zoom or scale the user's content.
      if(viewport&&Math.abs(viewport.scale-1)<.01){library.style.setProperty('--library-height',viewport.height+'px');library.style.setProperty('--library-top',viewport.offsetTop+'px');}
    }
    function queueViewport(){if(!viewportFrame)viewportFrame=requestAnimationFrame(syncLibraryViewport);}
    function stopLibraryViewport(){if(library.open)return;cancelAnimationFrame(viewportFrame);viewportFrame=0;window.visualViewport?.removeEventListener('resize',queueViewport);window.visualViewport?.removeEventListener('scroll',queueViewport);window.removeEventListener('resize',queueViewport);syncLibraryViewport();}
    library.addEventListener('close',stopLibraryViewport);
    function openLibrary(mode='silhouette',options={}){shared.open(mode,{origin:options.origin||'home',cancelKey:options.origin==='change'?'cancel':'back'});
      // Focus the heading on phones: opening the library must not summon a keyboard.
      libraryTitle.toggleAttribute('autofocus',mobileLibrary.matches);library.showModal();syncLibraryViewport();
      window.visualViewport?.addEventListener('resize',queueViewport);window.visualViewport?.addEventListener('scroll',queueViewport);window.addEventListener('resize',queueViewport);
      (mobileLibrary.matches?libraryTitle:search).focus({preventScroll:true});
    }
    function syncControls(){for(const {select,group}of groups){group.setAttribute('aria-label',t('tile.canvas'));for(const b of group.children){b.textContent=t(b.dataset.value==='40x40'?'tile.size40':'tile.size30');b.setAttribute('aria-pressed',String(select.value===b.dataset.value));b.disabled=select.disabled;}}field.textContent=(select.selectedOptions[0]?.textContent||tr('select'))+' ›';}
    root.addEventListener('prismosaic:library-open',event=>openLibrary(event.detail?.type||'silhouette',event.detail||{}));
    select.addEventListener('change',syncControls);
    new MutationObserver(syncControls).observe(select,{subtree:true,childList:true,characterData:true,attributes:true,attributeFilter:['disabled','selected']});
    $('lang').addEventListener('change',()=>{shared.refresh();error.querySelector('h2').textContent=tr('errorTitle');errorOK.textContent=tr('ok');wait.textContent=tr('wait');syncBusy();syncControls();});
    syncControls();
  }
  root.WorkspaceRefinement={create};
})(globalThis);
