/* One paginated card/search/category UI for both public asset types. */
(function(root){'use strict';
 const keys=['title','silhouettes','photos','choosePhoto','search','loading','unavailable','assetError','retry','more','credit','emptyPhotos'];
 const labels={ru:['Библиотека Prismosaic','Силуэты','Фотографии','Выбрать фотографию','Поиск по названию или тегам','Загрузка коллекции…','Коллекция временно недоступна. Попробуйте ещё раз.','Не удалось загрузить выбранный материал. Попробуйте другой.','Повторить','Показать ещё','Источник','Коллекция фотографий готовится. Пока можно загрузить своё изображение.'],en:['Prismosaic library','Silhouettes','Photos','Choose a photo','Search titles or tags','Loading collection…','The collection is temporarily unavailable. Please retry.','Could not load this asset. Please try another.','Retry','Show more','Source','The photo collection is being prepared. You can upload your own image.'],zh:['Prismosaic 素材库','轮廓','照片','选择照片','搜索名称或标签','正在加载素材…','素材库暂时不可用，请重试。','无法加载此素材，请选择其他素材。','重试','显示更多','来源','照片库正在准备中，您可以上传自己的图像。']};
 for(const [lang,list]of Object.entries(labels))keys.forEach((key,i)=>root.WorkspaceMessages[lang]['lib.'+key]=list[i]);
 for(const [lang,value]of Object.entries({ru:'Ничего не найдено',en:'No assets found',zh:'未找到素材'}))root.WorkspaceMessages[lang]['lib.none']=value;
 for(const [lang,value]of Object.entries({ru:'Сложный образец',en:'Challenging sample',zh:'复杂示例'}))root.WorkspaceMessages[lang]['lib.difficult']=value;
 function create({dialog,t,onSelect,onCancel}){
  const repository=root.AssetLibrary.createRepository(),local=root.AssetLibrary.localized,$=(tag,cls,text)=>{const n=document.createElement(tag);if(cls)n.className=cls;if(text)n.textContent=text;return n;},tr=k=>t('lib.'+k),lang=()=>document.documentElement.lang;
  const button=(text,fn)=>{const n=$('button','',text);n.type='button';n.onclick=fn;return n;};
  const tabs=$('div','library-tabs');tabs.setAttribute('role','group');
  const search=$('input');search.id='silhouette-search';search.type='search';
  const body=$('div','library-body'),categories=$('nav','library-categories'),grid=$('div','library-grid');body.append(categories,grid);
  grid.setAttribute('aria-live','polite');grid.setAttribute('aria-relevant','additions text');
  const footer=$('footer'),cancel=button(t('ux.cancel'),()=>dialog.close()),confirm=button(t('ux.select'),accept);footer.append(cancel,confirm);dialog.append(tabs,search,body,footer);
  let mode='silhouette',category='all',chosen=null,page=1,generation=0,loading=false,origin='home',accepted=false,cancelKey='back';
  const tabButtons={};for(const [value,key]of [['silhouette','silhouettes'],['photo','photos']]){const b=button(tr(key),()=>{mode=value;category='all';chosen=null;search.value='';render();});b.dataset.mode=value;tabButtons[value]=b;tabs.append(b);}
  function labels(){dialog.querySelector('h2').textContent=tr('title');search.placeholder=tr('search');search.setAttribute('aria-label',tr('search'));tabs.setAttribute('aria-label',tr('title'));categories.setAttribute('aria-label',tr('title'));cancel.textContent=t('ux.'+cancelKey);confirm.textContent=t('ux.select');tabButtons.silhouette.textContent=tr('silhouettes');tabButtons.photo.textContent=tr('photos');Object.entries(tabButtons).forEach(([key,b])=>b.setAttribute('aria-pressed',String(key===mode)));}
  function selected(){grid.querySelectorAll('.silhouette-card').forEach(b=>b.setAttribute('aria-pressed',String(b.dataset.value===chosen)));confirm.disabled=loading||!chosen;}
  function card(asset){const b=button('',()=>{chosen=asset.id;selected();});b.className='silhouette-card';b.dataset.value=asset.id;const title=root.AssetLibrary.localized(asset.title,lang());b.setAttribute('aria-label',title);
   const img=$('img');img.src=asset.thumbnailUrl;img.alt='';img.loading='lazy';img.decoding='async';img.width=480;img.height=300;img.onerror=()=>{b.disabled=true;img.hidden=true;b.append($('small','',tr('assetError')));if(chosen===asset.id){chosen=null;selected();}};b.append(img);
   b.append($('span','',title));if(asset.type==='photo'&&asset.conversionQuality==='difficult')b.append($('small','',tr('difficult')));return b;
  }
  async function render(append=false){const request=++generation;if(!append){page=1;grid.replaceChildren($('p','',tr('loading')));grid.scrollTop=0;}loading=true;selected();labels();
   try{const [list,cats]=await Promise.all([repository.getAssets({type:mode,category,search:search.value,page,lang:lang()}),repository.getCategories(mode)]);if(request!==generation)return;
    categories.replaceChildren();const makeCategory=(id,title)=>{const b=button(title,()=>{category=id;chosen=null;render();});b.dataset.category=id;b.setAttribute('aria-pressed',String(category===id));categories.append(b);};makeCategory('all',t('ux.all'));for(const c of cats)makeCategory(c.id,local(c.title,lang()));
    if(!append)grid.replaceChildren();grid.querySelector('.library-more')?.remove();for(const a of list.items)grid.append(card(a));
    if(!grid.children.length)grid.append($('p','',mode==='photo'&&category==='all'&&!search.value&&list.total===0?tr('emptyPhotos'):tr('none')));
    if(list.hasMore){const more=button(tr('more'),()=>{if(loading)return;more.disabled=true;page++;render(true);});more.className='library-more';grid.append(more);}loading=false;selected();
   }catch(error){if(request!==generation)return;loading=false;chosen=null;categories.replaceChildren();grid.replaceChildren($('p','',tr('unavailable')),button(tr('retry'),()=>render()));selected();console.warn('library_unavailable',{reason:error.name});}
  }
  async function accept(){if(loading||!chosen)return;const id=chosen;loading=true;selected();try{const asset=await repository.getAsset(id);if(!asset)throw Error('UNKNOWN_ASSET');accepted=true;dialog.close();await onSelect(asset);}catch(error){root.WorkspaceDialogs.error(tr('assetError'));console.warn('library_selection_failed',{assetId:id,reason:error.name});}finally{loading=false;selected();}}
  let debounce;search.oninput=()=>{clearTimeout(debounce);generation++;loading=true;chosen=null;selected();debounce=setTimeout(()=>render(),100);};dialog.addEventListener('close',()=>{clearTimeout(debounce);generation++;if(!accepted)onCancel?.({origin});accepted=false;});
  return {search,open(type='silhouette',options={}){mode=type;origin=options.origin||'home';cancelKey=options.cancelKey||'back';accepted=false;category='all';chosen=null;search.value='';render();},refresh(){labels();if(dialog.open)render();}};
 }
 root.AssetLibraryUI={create};
})(globalThis);
