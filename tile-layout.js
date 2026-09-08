/* Physical Result 2 only. No dependency on Result 1 rendering or detector. */
(function(root) {
  'use strict';
  const RULES = Object.freeze({length:30,width:3,margin:15,maxTiles:150,maxGap:2,maxDeviation:3});
  const EPS=1e-7, rad=Math.PI/180;
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]], dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
  function pointSegment(p,a,b) {const v=sub(b,a),d=dot(v,v),t=d?Math.max(0,Math.min(1,dot(sub(p,a),v)/d)):0;return dist(p,[a[0]+t*v[0],a[1]+t*v[1]]);}
  function nearestOnPath(point,path) {let best={distance:Infinity,angle:0,station:0},travel=0;for(let i=1;i<path.length;i++){const a=path[i-1],v=sub(path[i],a),length=Math.hypot(...v),f=Math.max(0,Math.min(1,dot(sub(point,a),v)/Math.max(EPS,length*length))),p=[a[0]+f*v[0],a[1]+f*v[1]],d=dist(point,p);if(d<best.distance)best={distance:d,angle:Math.atan2(v[1],v[0])/rad,station:travel+f*length};travel+=length;}return best;}
  function makeTile(x,y,angle,role='outer',path=0) {
    return {id:0,xMm:x,yMm:y,angleDeg:angle,lengthMm:30,widthMm:3,role,sourcePathId:path,sequenceIndex:0};
  }
  function ends(t) {const x=15*Math.cos(t.angleDeg*rad),y=15*Math.sin(t.angleDeg*rad);return [[t.xMm-x,t.yMm-y],[t.xMm+x,t.yMm+y]];}
  function corners(t) {const a=t.angleDeg*rad,u=[Math.cos(a),Math.sin(a)],v=[-u[1],u[0]];return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([s,q])=>[t.xMm+s*15*u[0]+q*1.5*v[0],t.yMm+s*15*u[1]+q*1.5*v[1]]);}
  function overlap(a,b) {
    // Exact separating-axis test on oriented rigid rectangles. Contact is valid.
    if (Math.abs(a.xMm-b.xMm)>31 || Math.abs(a.yMm-b.yMm)>31) return false;
    const A=corners(a),B=corners(b);
    for(const t of [a,b]) for(const angle of [t.angleDeg,t.angleDeg+90]) {
      const u=[Math.cos(angle*rad),Math.sin(angle*rad)],pa=A.map(p=>dot(p,u)),pb=B.map(p=>dot(p,u));
      if(Math.min(Math.max(...pa),Math.max(...pb))-Math.max(Math.min(...pa),Math.min(...pb))<=EPS)return false;
    }
    return true;
  }
  function gap(a,b) {
    if(overlap(a,b)) return -1;
    const A=corners(a),B=corners(b);let best=Infinity;
    for(let i=0;i<4;i++)for(let j=0;j<4;j++)best=Math.min(best,pointSegment(A[i],B[j],B[(j+1)%4]),pointSegment(B[j],A[i],A[(i+1)%4]));
    return best;
  }
  function inside(t,canvas) {return corners(t).every(([x,y])=>x>=15-EPS&&y>=15-EPS&&x<=canvas[0]-15+EPS&&y<=canvas[1]-15+EPS);}
  function pathModel(points,closed=false) {
    let p=points.map(q=>[...q]);if(closed&&dist(p[0],p[p.length-1])>EPS)p.push([...p[0]]);
    const lengths=[0];for(let i=1;i<p.length;i++)lengths.push(lengths[i-1]+dist(p[i-1],p[i]));
    const length=lengths[lengths.length-1];
    return {points:p,length,at(s){s=closed?((s%length)+length)%length:Math.max(0,Math.min(length,s));let lo=0,hi=lengths.length-1;while(lo+1<hi){const m=(lo+hi)>>1;if(lengths[m]<=s)lo=m;else hi=m;}const f=(s-lengths[lo])/Math.max(EPS,lengths[hi]-lengths[lo]);return [p[lo][0]+f*(p[hi][0]-p[lo][0]),p[lo][1]+f*(p[hi][1]-p[lo][1])];}};
  }
  class SegmentGrid {
    constructor(paths,cell=8) {this.cell=cell;this.grid=new Map();for(const path of paths)for(let i=1;i<path.length;i++){const a=path[i-1],b=path[i];for(let x=Math.floor(Math.min(a[0],b[0])/cell);x<=Math.floor(Math.max(a[0],b[0])/cell);x++)for(let y=Math.floor(Math.min(a[1],b[1])/cell);y<=Math.floor(Math.max(a[1],b[1])/cell);y++){const key=x+','+y;if(!this.grid.has(key))this.grid.set(key,[]);this.grid.get(key).push([a,b]);}}}
    distance(p,range=6) {let best=Infinity;const n=Math.ceil(range/this.cell),x=Math.floor(p[0]/this.cell),y=Math.floor(p[1]/this.cell);for(let dx=-n;dx<=n;dx++)for(let dy=-n;dy<=n;dy++)for(const [a,b] of this.grid.get((x+dx)+','+(y+dy))||[])best=Math.min(best,pointSegment(p,a,b));return best;}
  }
  function deviation(t,grid,step=.5) {
    // Distance-to-set is 1-Lipschitz. Adding half a sample interval bounds
    // the unsampled centerline too; this is not just an endpoint check.
    const [a,b]=ends(t);let max=0,sum=0;const n=Math.ceil(30/step);
    for(let i=0;i<=n;i++){const d=grid.distance([a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n]);max=Math.max(max,d);sum+=d;if(max>3)return {max,mean:Infinity};}
    return {max:max+15/n,mean:sum/(n+1)};
  }
  function simplifyOpen(p,tol) {
    if(p.length<=2)return p.map(q=>[...q]);let best=tol,index=-1;
    for(let i=1;i<p.length-1;i++){const d=pointSegment(p[i],p[0],p[p.length-1]);if(d>best){best=d;index=i;}}
    return index<0?[[...p[0]],[...p[p.length-1]]]:[...simplifyOpen(p.slice(0,index+1),tol).slice(0,-1),...simplifyOpen(p.slice(index),tol)];
  }
  function simplifyClosed(p,tol) {
    p=p.slice();if(dist(p[0],p[p.length-1])<EPS)p.pop();let far=1;for(let i=2;i<p.length;i++)if(dist(p[0],p[i])>dist(p[0],p[far]))far=i;
    const a=simplifyOpen(p.slice(0,far+1),tol),b=simplifyOpen([...p.slice(far),p[0]],tol);
    return [...a.slice(0,-1),...b];
  }
  function fit(source,canvas) {
    const xs=source.contour.map(p=>p[0]),ys=source.contour.map(p=>p[1]),lo=[Math.min(...xs),Math.min(...ys)],hi=[Math.max(...xs),Math.max(...ys)];
    // 15 mm safe area plus half-width and emergency 3 mm centerline offset.
    const s=Math.min((canvas[0]-39)/(hi[0]-lo[0]),(canvas[1]-39)/(hi[1]-lo[1]));
    const map=p=>[(p[0]-(lo[0]+hi[0])/2)*s+canvas[0]/2,(p[1]-(lo[1]+hi[1])/2)*s+canvas[1]/2];
    return {contour:source.contour.map(map),internal:(source.internal_lines||[]).map(p=>p.map(map)),scale:s};
  }
  function regularize(points,radius) {
    // Result 2 target only, 1 mm cells. Rolling-distance opening/closing removes
    // sub-tile spikes and slots; no photograph or Result 1 pixels are changed.
    const xs=points.map(p=>p[0]),ys=points.map(p=>p[1]),ox=Math.floor(Math.min(...xs))-radius-3,oy=Math.floor(Math.min(...ys))-radius-3;
    const w=Math.ceil(Math.max(...xs)-ox)+radius+4,h=Math.ceil(Math.max(...ys)-oy)+radius+4;
    let mask=new Uint8Array(w*h);
    for(let y=0;y<h;y++){const yy=oy+y+.5,cross=[];for(let i=0,j=points.length-1;i<points.length;j=i++){const a=points[i],b=points[j];if((a[1]>yy)!==(b[1]>yy))cross.push(a[0]+(yy-a[1])*(b[0]-a[0])/(b[1]-a[1])-ox);}cross.sort((a,b)=>a-b);for(let i=0;i+1<cross.length;i+=2)for(let x=Math.max(0,Math.ceil(cross[i]-.5));x<Math.min(w,Math.ceil(cross[i+1]-.5));x++)mask[y*w+x]=1;}
    const originalArea=mask.reduce((a,b)=>a+b,0);
    function offset(input,grow) {
      const d=new Float32Array(w*h);for(let i=0;i<d.length;i++)d[i]=(grow?input[i]:!input[i])?0:1e6;
      for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;d[i]=Math.min(d[i],d[i-1]+1,d[i-w]+1,d[i-w-1]+Math.SQRT2,d[i-w+1]+Math.SQRT2);}
      for(let y=h-2;y>0;y--)for(let x=w-2;x>0;x--){const i=y*w+x;d[i]=Math.min(d[i],d[i+1]+1,d[i+w]+1,d[i+w-1]+Math.SQRT2,d[i+w+1]+Math.SQRT2);}
      return Uint8Array.from(d,v=>grow?+(v<=radius):+(v>radius));
    }
    mask=offset(offset(offset(offset(mask,false),true),true),false);
    const area=mask.reduce((a,b)=>a+b,0);if(area<originalArea*.8||area>originalArea*1.2)return null;
    const edges=new Map(),key=(x,y)=>x+','+y,add=(x,y,a,b)=>{const k=key(x,y);if(!edges.has(k))edges.set(k,[]);edges.get(k).push([a,b]);};
    for(let y=1;y<h-1;y++)for(let x=1;x<w-1;x++){const i=y*w+x;if(!mask[i])continue;if(!mask[i-w])add(x,y,x+1,y);if(!mask[i+1])add(x+1,y,x+1,y+1);if(!mask[i+w])add(x+1,y+1,x,y+1);if(!mask[i-1])add(x,y+1,x,y);}
    let best=[],bestArea=0;
    while(edges.size){const first=edges.keys().next().value,start=first.split(',').map(Number);let p=start,path=[],guard=0;do{path.push([p[0]+ox,p[1]+oy]);const k=key(...p),options=edges.get(k);if(!options)break;p=options.pop();if(!options.length)edges.delete(k);}while(key(...p)!==first&&guard++<w*h);path.push(path[0]);let a=0;for(let i=1;i<path.length;i++)a+=path[i-1][0]*path[i][1]-path[i][0]*path[i-1][1];if(Math.abs(a)>bestArea){bestArea=Math.abs(a);best=path;}}
    return best.length>=4&&bestArea/2>=originalArea*.8?best:null;
  }
  function candidates(model,grid,station,canvas,role='outer',path=0,wide=false) {
    const result=[];
    const shifts=wide?Array.from({length:21},(_,i)=>(i-10)*1.5):[0,-3,3,-6,6];
    for(const shift of shifts) {
      const s=station+shift,p=model.at(s),a=model.at(s-15),b=model.at(s+15),base=Math.atan2(b[1]-a[1],b[0]-a[0])/rad;
      const local=sub(model.at(s+1),model.at(s-1)),before=sub(model.at(s-12),model.at(s-14)),after=sub(model.at(s+14),model.at(s+12));
      const angles=[...new Set([base,base-7,base+7,...(wide?[local,before,after].map(v=>Math.atan2(v[1],v[0])/rad):[])].map(a=>Math.round(a*10)/10))];
      for(const angle of angles)for(const normal of [0,-1.5,1.5]) {
        const angleOffset=((angle-base+540)%360)-180,t=makeTile(p[0]-Math.sin(angle*rad)*normal,p[1]+Math.cos(angle*rad)*normal,angle,role,path);
        if(!inside(t,canvas))continue;
        const d=deviation(t,grid,1);if(d.max>3)continue;
        result.push({tile:t,score:d.mean*d.mean+.006*shift*shift+.01*angleOffset*angleOffset+.04*normal*normal,station:s});
      }
    }
    return result.sort((a,b)=>a.score-b.score);
  }
  function contourCovered(target,tiles) {
    const grid=new SegmentGrid(tiles.map(ends));let max=0;
    for(let i=1;i<target.length;i++){const a=target[i-1],b=target[i],n=Math.max(1,Math.ceil(dist(a,b)/.5));for(let j=0;j<=n;j++){const d=grid.distance([a[0]+(b[0]-a[0])*j/n,a[1]+(b[1]-a[1])*j/n]);max=Math.max(max,d+dist(a,b)/(2*n));if(max>3+EPS)return max;}}
    return max;
  }
  function solveOuter(target,canvas,options={}) {
    const model=pathModel(target,true),grid=new SegmentGrid([model.points]),nominal=Math.round(model.length/31);
    let startOffset=0,travel=0,longest=0;for(let i=1;i<model.points.length;i++){const d=dist(model.points[i-1],model.points[i]);if(d>longest){longest=d;startOffset=travel+d/2;}travel+=d;}
    const stats=options.stats||{};stats.nominal=nominal;stats.emptyLayers=0;stats.closed=0;stats.bestDepth=0;
    if(nominal>153||nominal<3)return null;
    // Layered beam search: station/normal/orientation alternatives, multiple
    // counts and phases, global collision rejection, final closed-cycle check.
    // Arc sampling only proposes candidates; it never decides a placement.
    for(const countDelta of [0,1,-1,2,-2]) {
      const n=nominal+countDelta;if(n<3||n>150)continue;
      const period=model.length/n;
      if(period<27||period>34)continue;
      for(const phase of [0,.25,.5,.75]) {
        const layers=Array.from({length:n},(_,i)=>candidates(model,grid,startOffset+(i+phase)*period,canvas,'outer',0,!!options.wide));
        if(layers.some(p=>!p.length)){stats.emptyLayers++;continue;}
        for(const first of layers[0].slice(0,5)) {
          let beam=[{tiles:[first.tile],score:first.score,last:first.station}];
          for(let i=1;i<n&&beam.length;i++) {
            stats.bestDepth=Math.max(stats.bestDepth,i/n);
            const next=[];
            for(const state of beam)for(const candidate of layers[i]) {
              if(candidate.station-state.last<20||candidate.station-state.last>40)continue;
              const t=candidate.tile,prev=state.tiles[state.tiles.length-1];
              if(Math.hypot(t.xMm-prev.xMm,t.yMm-prev.yMm)>33)continue;
              const g=gap(prev,t);if(g<0||g>2+EPS)continue;
              if(state.tiles.slice(0,-1).some(old=>overlap(t,old)))continue;
              if(i===n-1){const close=gap(t,first.tile);if(close<0||close>2+EPS)continue;}
              next.push({tiles:[...state.tiles,t],last:candidate.station,score:state.score+candidate.score+.4*(g-1)**2});
            }
            next.sort((a,b)=>a.score-b.score);
            // Keep multiple spatially distinct endings rather than 24 copies
            // of one locally good choice that cannot close the outer cycle.
            const seen=new Set();beam=[];
            for(const state of next){const t=state.tiles[state.tiles.length-1],key=[t.xMm.toFixed(1),t.yMm.toFixed(1),t.angleDeg.toFixed(1)].join(',');if(seen.has(key))continue;seen.add(key);beam.push(state);if(beam.length>=(options.wide?48:16))break;}
          }
          for(const state of beam)if(state.tiles.length===n){stats.closed++;if(contourCovered(model.points,state.tiles)<=3+EPS)return {tiles:state.tiles,score:state.score/n,target:model.points};}
        }
      }
    }
    return null;
  }
  function validate(layout,{continuity=true}={}) {
    const errors=[],tiles=layout.tiles||[],canvas=layout.canvas;
    if(!canvas||![[300,400],[400,300],[400,400]].some(c=>c[0]===canvas[0]&&c[1]===canvas[1]))errors.push('CANVAS_INVALID');
    if(tiles.length>150)errors.push('TILE_LIMIT');
    const ids=new Set();
    for(const t of tiles){if(![t.xMm,t.yMm,t.angleDeg].every(Number.isFinite)||t.lengthMm!==30||t.widthMm!==3)errors.push('TILE_DIMENSIONS');if(!Number.isInteger(t.id)||t.id<1||!['outer','skeleton'].includes(t.role))errors.push('TILE_MODEL');if(ids.has(t.id))errors.push('DUPLICATE_ID');ids.add(t.id);if(canvas&&!inside(t,canvas))errors.push('SAFE_AREA');}
    for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++)if(overlap(tiles[i],tiles[j]))errors.push('OVERLAP');
    if(continuity&&(!Array.isArray(layout.target)||!layout.target.every(p=>Array.isArray(p.points)&&p.points.length>=2&&p.points.every(q=>Array.isArray(q)&&q.length===2&&q.every(Number.isFinite)))))return {valid:false,errors:[...errors,'TARGET_INVALID']};
    if(continuity){const outer=tiles.filter(t=>t.role==='outer').sort((a,b)=>a.sequenceIndex-b.sequenceIndex),target=layout.target?.find(p=>p.role==='outer');
      if(outer.length<3||!target)errors.push('NO_OUTER');
      else {const grid=new SegmentGrid([target.points]);for(let i=0;i<outer.length;i++){const g=gap(outer[i],outer[(i+1)%outer.length]);if(g<0||g>2+EPS)errors.push('OUTER_GAP');if(deviation(outer[i],grid).max>3+EPS)errors.push('DEVIATION');}if(contourCovered(target.points,outer)>3+EPS)errors.push('TARGET_COVERAGE');}
      for(const t of tiles.filter(t=>t.role==='skeleton')){const p=layout.target?.find(p=>p.id===t.sourcePathId);if(!p||deviation(t,new SegmentGrid([p.points])).max>3+EPS)errors.push('DEVIATION');}
    }
    return {valid:errors.length===0,errors:[...new Set(errors)]};
  }
  function skeletonPaths(internal) {
    // Rejoin only exact endpoints with compatible directions. Tiny loops are
    // never converted into symbols or arbitrary single tiles.
    let paths=internal.filter(p=>p.length>=2).map(p=>p.map(q=>[...q]));
    const key=p=>p.map(v=>v.toFixed(4)).join(',');let changed=true;
    while(changed){changed=false;const endsMap=new Map();paths.forEach((p,i)=>[p[0],p[p.length-1]].forEach((q,side)=>{const k=key(q);if(!endsMap.has(k))endsMap.set(k,[]);endsMap.get(k).push([i,side]);}));
      for(const entries of endsMap.values()){if(entries.length!==2)continue;const [[i,si],[j,sj]]=entries;if(i===j)continue;const a=si?paths[i]:paths[i].slice().reverse(),b=sj?paths[j].slice().reverse():paths[j];const u=sub(a[a.length-1],a[Math.max(0,a.length-5)]),v=sub(b[Math.min(4,b.length-1)],b[0]);if(dot(u,v)/Math.max(EPS,Math.hypot(...u)*Math.hypot(...v))<.85)continue;paths[i]=[...a,...b.slice(1)];paths.splice(j,1);changed=true;break;}
    }
    return paths.filter(p=>{const model=pathModel(p),closed=dist(p[0],p[p.length-1])<1;const xs=p.map(q=>q[0]),ys=p.map(q=>q[1]);return model.length>=60 && (!closed||Math.min(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys))>=35);}).map(p=>simplifyOpen(p,1));
  }
  function generateForCanvas(source,canvas) {
    const start=Date.now(),fitted=fit(source,canvas),timings={};let outer=null,target=null,tolerance=0;
    const skeletonStart=Date.now(),skeleton=skeletonPaths(fitted.internal);timings.skeletonMs=Date.now()-skeletonStart;
    const optimizationStart=Date.now();let simplificationMs=0;const searches=[];
    for(const tol of [1,3,6,10]) {const s=Date.now();target=simplifyClosed(fitted.contour,tol);simplificationMs+=Date.now()-s;const stats={tolerance:tol};searches.push(stats);outer=solveOuter(target,canvas,{wide:tol>=6,stats});if(outer){tolerance=tol;break;}}
    if(!outer)for(const [radius,tol] of [[4,3],[7,3],[10,3],[10,8]]){const s=Date.now(),clean=regularize(fitted.contour,radius);target=clean?simplifyClosed(clean,tol):null;simplificationMs+=Date.now()-s;if(!target)continue;const stats={radius,tolerance:tol};searches.push(stats);outer=solveOuter(target,canvas,{wide:true,stats});if(outer){tolerance=radius+tol;break;}}
    timings.simplificationMs=simplificationMs;
    if(!outer)return {status:'LAYOUT_NOT_FEASIBLE',canvas,tiles:[],target:[],searches,timings:{...timings,optimizationMs:Date.now()-optimizationStart-simplificationMs,totalMs:Date.now()-start}};
    const tiles=outer.tiles,targetPaths=[{id:0,role:'outer',points:outer.target}];
    // Add only long reproducible portions. Local bends with no valid full tile
    // simply have no candidate. Sorted by value/cost (stable length per tile).
    const ranked=skeleton.map((p,i)=>{const length=pathModel(p).length,x=p.map(q=>q[0]),y=p.map(q=>q[1]),extent=Math.hypot(Math.max(...x)-Math.min(...x),Math.max(...y)-Math.min(...y));return {p,id:i+1,length,valuePerTile:extent/Math.max(1,Math.ceil(length/31))};}).sort((a,b)=>b.valuePerTile-a.valuePerTile||b.length-a.length||a.id-b.id);
    for(const item of ranked){if(tiles.length>=150)break;const model=pathModel(item.p),grid=new SegmentGrid([item.p]);
      for(let s=15;s<=model.length-15&&tiles.length<150;s+=31){const pool=candidates(model,grid,s,canvas,'skeleton',item.id).filter(c=>c.score<2);const choice=pool.find(c=>!tiles.some(t=>overlap(c.tile,t)||gap(c.tile,t)<0));if(!choice)continue;
        // Sparse value gate: close parallel existing structure is redundant.
        if(tiles.some(t=>Math.abs(Math.cos((t.angleDeg-choice.tile.angleDeg)*rad))>.94&&pointSegment([choice.tile.xMm,choice.tile.yMm],...ends(t))<7))continue;
        // Keep only the observed target span supported by this complete tile.
        // Unrepresentable middle portions do not linger as decorative skeleton.
        const span=Array.from({length:73},(_,i)=>model.at(choice.station-18+i*.5)).filter((p,i,a)=>!i||dist(p,a[i-1])>EPS);
        if(span.length<2||deviation(choice.tile,new SegmentGrid([span])).max>3)continue;
        choice.tile.sourceGroupId=item.id;choice.tile.sourcePathId=targetPaths.length;
        targetPaths.push({id:targetPaths.length,role:'skeleton',points:span});tiles.push(choice.tile);
      }
    }
    tiles.forEach((t,i)=>{t.id=i+1;t.sequenceIndex=i;});timings.optimizationMs=Date.now()-optimizationStart-simplificationMs;
    const layout={status:'ok',canvas,tiles,target:targetPaths,orientation:canvas[0]===canvas[1]?'square':canvas[0]>canvas[1]?'landscape':'portrait',simplificationMm:tolerance,fitScale:fitted.scale,score:outer.score,timings};
    const checkStart=Date.now(),checked=validate(layout);timings.validationMs=Date.now()-checkStart;timings.totalMs=Date.now()-start;
    return checked.valid?layout:{status:'LAYOUT_NOT_FEASIBLE',canvas,tiles:[],target:[],diagnostics:checked,timings};
  }
  function generate(source,{format='40x40',orientation='auto'}={}) {
    if(!source?.contour||source.contour.length<3||!source.contour.every(p=>p.length===2&&p.every(Number.isFinite)))return {status:'LAYOUT_NOT_FEASIBLE',tiles:[],reason:'INVALID_TARGET'};
    const canvases=format==='40x40'?[[400,400]]:orientation==='portrait'?[[300,400]]:orientation==='landscape'?[[400,300]]:[[300,400],[400,300]];
    const results=canvases.map(c=>generateForCanvas(source,c));
    const valid=results.filter(r=>r.status==='ok');valid.sort((a,b)=>b.fitScale-a.fitScale||a.simplificationMm-b.simplificationMm||a.score-b.score||a.tiles.length-b.tiles.length);
    const result=valid[0]||results[0];result.evaluated=results.map(r=>({canvas:r.canvas,status:r.status,tiles:r.tiles.length,scale:r.fitScale,simplificationMm:r.simplificationMm,timings:r.timings}));result.auto=orientation==='auto'&&format==='30x40';return result;
  }
  function exportSVG(layout,{mounting=false}={}) {
    const checked=validate(layout);if(!checked.valid)throw new Error(checked.errors.join(', '));
    const [w,h]=layout.canvas,lines=[`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`,`<rect width="${w}" height="${h}" fill="white"/>`,`<rect x="15" y="15" width="${w-30}" height="${h-30}" fill="none" stroke="#94a3b8" stroke-width="0.25" stroke-dasharray="2 2"/>`];
    for(const p of layout.target)lines.push(`<path d="M ${p.points.map(q=>q.join(',')).join(' L ')}" fill="none" stroke="#475569" stroke-width="0.35" stroke-dasharray="2 1.5"/>`);
    for(const t of layout.tiles){lines.push(`<rect data-tile-id="${t.id}" x="-15" y="-1.5" width="30" height="3" transform="translate(${t.xMm} ${t.yMm}) rotate(${t.angleDeg})" fill="#dc2626"/>`);if(mounting)lines.push(`<text x="${t.xMm}" y="${t.yMm}" font-family="sans-serif" font-size="2.6" text-anchor="middle" dominant-baseline="middle" fill="white">${t.id}</text>`);}
    if(mounting)lines.push(`<text x="15" y="7" font-family="sans-serif" font-size="3">${w} × ${h} mm · ${layout.orientation} · ${layout.tiles.length} / 150 tiles · 30 × 3 mm · margin 15 mm</text>`,`<text x="15" y="${h-5}" font-family="sans-serif" font-size="2.5">Origin: upper left. Tile coordinates refer to centers. Red rectangles are full tiles. Print at 100%.</text>`);
    lines.push('</svg>');return lines.join('\n');
  }
  function snap(tile,layout,bypass=false) {
    if(bypass)return tile;
    const proposals=[tile],a=tile.angleDeg*rad,u=[Math.cos(a),Math.sin(a)];
    for(const path of layout.target)for(let i=1;i<path.points.length;i++){
      const p=path.points[i-1],q=path.points[i],v=sub(q,p),f=Math.max(0,Math.min(1,dot(sub([tile.xMm,tile.yMm],p),v)/Math.max(EPS,dot(v,v))));
      const point=[p[0]+v[0]*f,p[1]+v[1]*f];if(dist(point,[tile.xMm,tile.yMm])<2)proposals.push({...tile,xMm:point[0],yMm:point[1]});
    }
    for(const other of layout.tiles){if(other.id===tile.id||dist([other.xMm,other.yMm],[tile.xMm,tile.yMm])>36)continue;
      const b=other.angleDeg*rad,v=[Math.cos(b),Math.sin(b)],normal=[-v[1],v[0]];
      // Endpoint and end-to-side snapping, with the complete rotated rectangle
      // support radius: T contact is with a side, not centerline intersection.
      const support=15*Math.abs(dot(u,normal))+1.5*Math.abs(dot([-u[1],u[0]],normal));
      for(const g of [0,1,2]){
        for(const e of ends(other))for(const sign of [-1,1])proposals.push({...tile,xMm:e[0]+sign*(15+g)*u[0],yMm:e[1]+sign*(15+g)*u[1]});
        const along=Math.max(-15,Math.min(15,dot(sub([tile.xMm,tile.yMm],[other.xMm,other.yMm]),v)));
        for(const sign of [-1,1])proposals.push({...tile,xMm:other.xMm+along*v[0]+sign*(1.5+support+g)*normal[0],yMm:other.yMm+along*v[1]+sign*(1.5+support+g)*normal[1]});
      }
    }
    const near=proposals.slice(1).filter(t=>dist([tile.xMm,tile.yMm],[t.xMm,t.yMm])<=2&&inside(t,layout.canvas)&&!layout.tiles.some(o=>o.id!==tile.id&&overlap(t,o)));
    near.sort((a,b)=>dist([a.xMm,a.yMm],[tile.xMm,tile.yMm])-dist([b.xMm,b.yMm],[tile.xMm,tile.yMm]));return near[0]||tile;
  }
  class TileDocument {
    constructor(layout){if(!validate(layout,{continuity:false}).valid)throw new Error('INVALID_LAYOUT');this.layout=JSON.parse(JSON.stringify(layout));this.undoStack=[];this.redoStack=[];}
    commit(tiles){const next={...this.layout,tiles};const check=validate(next,{continuity:false});if(!check.valid)return check;this.undoStack.push(this.layout);if(this.undoStack.length>100)this.undoStack.shift();this.redoStack=[];this.layout=next;return check;}
    update(id,patch){const t=this.layout.tiles.find(t=>t.id===id);if(!t)return {valid:false,errors:['NO_SELECTION']};return this.commit(this.layout.tiles.map(t=>t.id===id?{...t,...patch,id:t.id,lengthMm:30,widthMm:3}:t));}
    add(tile){if(this.layout.tiles.length>=150)return {valid:false,errors:['TILE_LIMIT']};const id=Math.max(0,...this.layout.tiles.map(t=>t.id))+1;return this.commit([...this.layout.tiles,{...tile,id,sequenceIndex:Number.isFinite(tile.sequenceIndex)?tile.sequenceIndex:id-1,lengthMm:30,widthMm:3}]);}
    remove(id){return this.commit(this.layout.tiles.filter(t=>t.id!==id));}
    undo(){if(!this.undoStack.length)return;this.redoStack.push(this.layout);this.layout=this.undoStack.pop();}
    redo(){if(!this.redoStack.length)return;this.undoStack.push(this.layout);this.layout=this.redoStack.pop();}
  }
  const api={version:'physical-tiles-v1',RULES,makeTile,ends,corners,overlap,gap,inside,pathModel,SegmentGrid,deviation,contourCovered,validate,generate,generateForCanvas,solveOuter,skeletonPaths,exportSVG,snap,TileDocument,fit,regularize,simplifyClosed,nearestOnPath};
  if(typeof module!=='undefined')module.exports=api;root.TileLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this);
