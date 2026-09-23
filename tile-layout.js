/* Physical Result 3 and reusable path assembly. Result 1 is never modified. */
(function(root) {
  'use strict';
  const RULES = Object.freeze({length:30,width:3,margin:15,maxTiles:150,maxGap:2,maxDeviation:3});
  const INVENTORY=Object.freeze({large:Object.freeze({lengthMm:30,widthMm:3,available:100}),small:Object.freeze({lengthMm:10,widthMm:3,available:50}),totalMaximum:150});
  function inventory(tiles) {
    const largeUsed=tiles.filter(t=>t.type==='large').length,smallUsed=tiles.filter(t=>t.type==='small').length,totalUsed=tiles.length,errors=[];
    if(largeUsed>INVENTORY.large.available)errors.push('LARGE_LIMIT');
    if(smallUsed>INVENTORY.small.available)errors.push('SMALL_LIMIT');
    if(totalUsed>INVENTORY.totalMaximum)errors.push('TILE_LIMIT');
    if(largeUsed+smallUsed!==totalUsed)errors.push('TILE_TYPE');
    return {largeUsed,smallUsed,totalUsed,largeRemaining:Math.max(0,INVENTORY.large.available-largeUsed),smallRemaining:Math.max(0,INVENTORY.small.available-smallUsed),totalRemaining:Math.max(0,INVENTORY.totalMaximum-totalUsed),valid:!errors.length,errors};
  }
  // Only unambiguous legacy 30 mm placements migrate. Unknown types/sizes fail validation.
  function migrateTile(t){return t.type===undefined&&(t.lengthMm===undefined||t.lengthMm===30)?{...t,type:'large',lengthMm:30,widthMm:t.widthMm??3}:{...t};}
  const EPS=1e-7, rad=Math.PI/180;
  const dist=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const sub=(a,b)=>[a[0]-b[0],a[1]-b[1]], dot=(a,b)=>a[0]*b[0]+a[1]*b[1];
  function pointSegment(p,a,b) {const v=sub(b,a),d=dot(v,v),t=d?Math.max(0,Math.min(1,dot(sub(p,a),v)/d)):0;return dist(p,[a[0]+t*v[0],a[1]+t*v[1]]);}
  function nearestOnPath(point,path) {let best={distance:Infinity,angle:0,station:0},travel=0;for(let i=1;i<path.length;i++){const a=path[i-1],v=sub(path[i],a),length=Math.hypot(...v),f=Math.max(0,Math.min(1,dot(sub(point,a),v)/Math.max(EPS,length*length))),p=[a[0]+f*v[0],a[1]+f*v[1]],d=dist(point,p);if(d<best.distance)best={distance:d,angle:Math.atan2(v[1],v[0])/rad,station:travel+f*length};travel+=length;}return best;}
  function makeTile(x,y,angle,role='outer',path=0,type='large') {
    if(!['large','small'].includes(type))throw Error('TILE_TYPE');
    return {id:0,xMm:x,yMm:y,angleDeg:angle,type,lengthMm:INVENTORY[type].lengthMm,widthMm:INVENTORY[type].widthMm,role,sourcePathId:path,sequenceIndex:0};
  }
  function ends(t) {const x=t.lengthMm/2*Math.cos(t.angleDeg*rad),y=t.lengthMm/2*Math.sin(t.angleDeg*rad);return [[t.xMm-x,t.yMm-y],[t.xMm+x,t.yMm+y]];}
  function corners(t) {const a=t.angleDeg*rad,u=[Math.cos(a),Math.sin(a)],v=[-u[1],u[0]];return [[-1,-1],[1,-1],[1,1],[-1,1]].map(([s,q])=>[t.xMm+s*t.lengthMm/2*u[0]+q*t.widthMm/2*v[0],t.yMm+s*t.lengthMm/2*u[1]+q*t.widthMm/2*v[1]]);}
  function overlap(a,b) {
    // Exact separating-axis test on oriented rigid rectangles. Contact is valid.
    const reach=(Math.hypot(a.lengthMm,a.widthMm)+Math.hypot(b.lengthMm,b.widthMm))/2;
    if (Math.abs(a.xMm-b.xMm)>reach || Math.abs(a.yMm-b.yMm)>reach) return false;
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
    const [a,b]=ends(t);let max=0,sum=0;const n=Math.ceil(t.lengthMm/step);
    for(let i=0;i<=n;i++){const d=grid.distance([a[0]+(b[0]-a[0])*i/n,a[1]+(b[1]-a[1])*i/n]);max=Math.max(max,d);sum+=d;if(max>3)return {max,mean:Infinity};}
    return {max:max+t.lengthMm/(2*n),mean:sum/(n+1)};
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
  function fit(source,canvas,factor=1) {
    const xs=source.contour.map(p=>p[0]),ys=source.contour.map(p=>p[1]),lo=[Math.min(...xs),Math.min(...ys)],hi=[Math.max(...xs),Math.max(...ys)];
    // 15 mm safe area plus half-width and emergency 3 mm centerline offset.
    const s=factor*Math.min((canvas[0]-39)/(hi[0]-lo[0]),(canvas[1]-39)/(hi[1]-lo[1]));
    const offset=[canvas[0]/2-(lo[0]+hi[0])/2*s,canvas[1]/2-(lo[1]+hi[1])/2*s],map=p=>[p[0]*s+offset[0],p[1]*s+offset[1]];
    return {contour:source.contour.map(map),internal:(source.internal_lines||[]).map(p=>p.map(map)),scale:s,offset};
  }
  function regularize(points,radius) {
    // Result 3 target only, 1 mm cells. Rolling-distance opening/closing removes
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
  function candidates(model,grid,station,canvas,role='outer',path=0,wide=false,type='large') {
    const result=[];
    const length=INVENTORY[type].lengthMm,half=length/2;
    const shifts=wide?Array.from({length:type==='small'?17:21},(_,i)=>(i-(type==='small'?8:10))*(type==='small'?.75:1.5)):[0,-3,3,-6,6];
    for(const shift of shifts) {
      const s=station+shift,p=model.at(s),a=model.at(s-half),b=model.at(s+half),base=Math.atan2(b[1]-a[1],b[0]-a[0])/rad;
      const local=sub(model.at(s+1),model.at(s-1)),before=sub(model.at(s-Math.max(2,half-1)),model.at(s-half)),after=sub(model.at(s+half),model.at(s+Math.max(2,half-1)));
      const angles=[...new Set([base,base-7,base+7,...(wide?[local,before,after].map(v=>Math.atan2(v[1],v[0])/rad):[])].map(a=>Math.round(a*10)/10))];
      for(const angle of angles)for(const normal of [0,-1.5,1.5]) {
        const angleOffset=((angle-base+540)%360)-180,t=makeTile(p[0]-Math.sin(angle*rad)*normal,p[1]+Math.cos(angle*rad)*normal,angle,role,path,type);
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
    const stats=options.stats||{};stats.nominal=nominal;stats.emptyLayers=0;stats.closed=0;stats.bestDepth=0;stats.collisionMs=0;stats.collisionChecks=0;
    // The closed outer contour uses rigid 30 mm pieces. Stop before searching
    // a count that can never pass the independent 100-piece stock limit.
    if(nominal>INVENTORY.large.available||nominal<3)return null;
    // Layered beam search: station/normal/orientation alternatives, multiple
    // counts and phases, global collision rejection, final closed-cycle check.
    // Arc sampling only proposes candidates; it never decides a placement.
    for(const countDelta of [0,1,-1,2,-2]) {
      const n=nominal+countDelta;if(n<3||n>INVENTORY.large.available)continue;
      const period=model.length/n;
      if(period<27||period>34)continue;
      for(const phase of [0,.25,.5,.75]) {
        const layers=Array.from({length:n},(_,i)=>candidates(model,grid,startOffset+(i+phase)*period,canvas,'outer',0,!!options.wide));
        stats.largeCandidatesGenerated=(stats.largeCandidatesGenerated||0)+layers.reduce((sum,layer)=>sum+layer.length,0);
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
              let collisionStart=Date.now();const g=gap(prev,t);stats.collisionMs+=Date.now()-collisionStart;stats.collisionChecks++;if(g<0||g>2+EPS)continue;
              collisionStart=Date.now();const blocked=state.tiles.slice(0,-1).some(old=>{stats.collisionChecks++;return overlap(t,old);});stats.collisionMs+=Date.now()-collisionStart;if(blocked)continue;
              if(i===n-1){collisionStart=Date.now();const close=gap(t,first.tile);stats.collisionMs+=Date.now()-collisionStart;stats.collisionChecks++;if(close<0||close>2+EPS)continue;}
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
  function refineOuterWithSmall(outer,target,canvas,options={}) {
    const model=pathModel(target,true),grid=new SegmentGrid([model.points]),tiles=outer.slice(),maxReplacements=Math.min(16,Math.floor(INVENTORY.small.available/3));
    const diagnostics={largeCandidatesGenerated:options.largeCandidatesGenerated||0,smallCandidatesGenerated:0,largeSelected:tiles.length,smallSelected:0,smallRejectedReasons:{},smallSelections:[]};
    const reject=reason=>{diagnostics.smallRejectedReasons[reason]=(diagnostics.smallRejectedReasons[reason]||0)+1;};
    const angleDelta=(a,b)=>Math.abs(((a-b+540)%360)-180);
    const ranked=outer.map((tile,index)=>{const station=nearestOnPath([tile.xMm,tile.yMm],model.points).station,a=model.at(station-12),b=model.at(station),c=model.at(station+12),before=Math.atan2(b[1]-a[1],b[0]-a[0])/rad,after=Math.atan2(c[1]-b[1],c[0]-b[0])/rad,d=deviation(tile,grid);return {tile,index,station,curvature:angleDelta(before,after),oldMean:d.mean,oldMax:d.max};}).sort((a,b)=>b.curvature-a.curvature||b.oldMean-a.oldMean);
    const replaced=new Set();
    for(const item of ranked){
      if(diagnostics.smallSelected+3>INVENTORY.small.available||replaced.size>=maxReplacements){reject('SMALL_INVENTORY_RESERVED');break;}
      if(replaced.has((item.index-1+outer.length)%outer.length)||replaced.has((item.index+1)%outer.length)){reject('ADJACENT_REPLACEMENT');continue;}
      const currentIndex=tiles.indexOf(item.tile);if(currentIndex<0){reject('SOURCE_ALREADY_REPLACED');continue;}
      const prev=tiles[(currentIndex-1+tiles.length)%tiles.length],next=tiles[(currentIndex+1)%tiles.length],fixed=tiles.filter(t=>t!==item.tile),solutions=[];
      for(const spacing of [10,10.5,11]){
        const pools=[item.station-spacing,item.station,item.station+spacing].map(s=>candidates(model,grid,s,canvas,'outer',0,true,'small').slice(0,36));diagnostics.smallCandidatesGenerated+=pools.reduce((sum,p)=>sum+p.length,0);
        if(pools.some(p=>!p.length)){reject('NO_SMALL_CANDIDATE');continue;}
        let beam=[{tiles:[],score:0}];
        for(const pool of pools){const nextBeam=[];for(const state of beam)for(const candidate of pool){const tile=candidate.tile,last=state.tiles.at(-1)||prev,g=gap(last,tile);if(g<0||g>RULES.maxGap+EPS)continue;if(fixed.some(t=>overlap(tile,t))||state.tiles.some(t=>overlap(tile,t)))continue;nextBeam.push({tiles:[...state.tiles,tile],score:state.score+candidate.score+.35*(g-1)**2});}nextBeam.sort((a,b)=>a.score-b.score);beam=nextBeam.slice(0,24);if(!beam.length)break;}
        for(const state of beam){const close=gap(state.tiles.at(-1),next);if(close<0||close>RULES.maxGap+EPS)continue;const trial=[...tiles.slice(0,currentIndex),...state.tiles,...tiles.slice(currentIndex+1)];if(contourCovered(model.points,trial)>RULES.maxDeviation+EPS)continue;const means=state.tiles.map(t=>deviation(t,grid).mean),max=Math.max(...state.tiles.map(t=>deviation(t,grid).max)),mean=means.reduce((a,b)=>a+b,0)/means.length,improvement=item.oldMean-mean;solutions.push({...state,mean,max,improvement,score:state.score+.25*close*close});}
      }
      if(!solutions.length){reject('CONNECTIVITY_OR_COLLISION');continue;}
      solutions.sort((a,b)=>b.improvement-a.improvement||a.max-b.max||a.score-b.score);const best=solutions[0];
      const materiallyBetter=item.curvature>=12&&best.improvement>=.08&&best.max<=item.oldMax+.05||best.improvement>=1;
      if(!materiallyBetter){reject('NO_VISUAL_IMPROVEMENT');continue;}
      tiles.splice(currentIndex,1,...best.tiles);replaced.add(item.index);diagnostics.smallSelected+=3;diagnostics.largeSelected--;diagnostics.smallSelections.push({sourceIndex:item.index,curvatureDeg:Number(item.curvature.toFixed(2)),meanImprovementMm:Number(best.improvement.toFixed(3)),maxDeviationMm:Number(best.max.toFixed(3)),reason:item.curvature>=12?'LOCAL_CURVATURE':'DEVIATION_CORRECTION'});
    }
    tiles.forEach((tile,index)=>{tile.id=index+1;tile.sequenceIndex=index;});
    return {tiles,diagnostics};
  }
  function validate(layout,{continuity=true}={}) {
    const errors=[],tiles=layout.tiles||[],canvas=layout.canvas;
    if(!canvas||![[300,400],[400,300],[400,400]].some(c=>c[0]===canvas[0]&&c[1]===canvas[1]))errors.push('CANVAS_INVALID');
    errors.push(...inventory(tiles).errors);
    const ids=new Set();
    for(const t of tiles){if(![t.xMm,t.yMm,t.angleDeg].every(Number.isFinite)||!['large','small'].includes(t.type)||t.lengthMm!==INVENTORY[t.type]?.lengthMm||t.widthMm!==3)errors.push('TILE_DIMENSIONS');if(!Number.isInteger(t.id)||t.id<1||!['outer','skeleton','characteristic'].includes(t.role))errors.push('TILE_MODEL');if(ids.has(t.id))errors.push('DUPLICATE_ID');ids.add(t.id);if(canvas&&!inside(t,canvas))errors.push('SAFE_AREA');}
    for(let i=0;i<tiles.length;i++)for(let j=i+1;j<tiles.length;j++)if(overlap(tiles[i],tiles[j]))errors.push('OVERLAP');
    if(continuity&&(!Array.isArray(layout.target)||!layout.target.every(p=>Array.isArray(p.points)&&p.points.length>=2&&p.points.every(q=>Array.isArray(q)&&q.length===2&&q.every(Number.isFinite)))))return {valid:false,errors:[...errors,'TARGET_INVALID']};
    // AI compositions use independent manufacturable routes, not the old
    // single closed observed boundary. All rectangle constraints above remain.
    if(continuity&&(layout.mode==='AI_HYBRID'||layout.routeMode)){
      if(!tiles.some(t=>t.role==='outer')||!layout.target.some(p=>p.role==='outer'))errors.push('NO_OUTER');
      for(const t of tiles)if(!layout.target.some(p=>p.id===t.sourcePathId))errors.push('TARGET_INVALID');
    }
    if(continuity&&layout.mode!=='AI_HYBRID'&&!layout.routeMode){const outer=tiles.filter(t=>t.role==='outer').sort((a,b)=>a.sequenceIndex-b.sequenceIndex),target=layout.target?.find(p=>p.role==='outer');
      if(outer.length<3||!target)errors.push('NO_OUTER');
      else {const grid=new SegmentGrid([target.points]);for(let i=0;i<outer.length;i++){const g=gap(outer[i],outer[(i+1)%outer.length]);if(g<0||g>2+EPS)errors.push('OUTER_GAP');if(deviation(outer[i],grid).max>3+EPS)errors.push('DEVIATION');}if(contourCovered(target.points,outer)>3+EPS)errors.push('TARGET_COVERAGE');}
      for(const t of tiles.filter(t=>t.role==='skeleton')){const p=layout.target?.find(p=>p.id===t.sourcePathId);if(!p||deviation(t,new SegmentGrid([p.points])).max>3+EPS)errors.push('DEVIATION');}
    }
    return {valid:errors.length===0,errors:[...new Set(errors)]};
  }
  function inPolygon(p,poly) {
    let hit=false;for(let i=0,j=poly.length-1;i<poly.length;j=i++) {const a=poly[i],b=poly[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])hit=!hit;}return hit;
  }
  function symmetryAxis(contour) {
    if(!contour?.length)return {confidence:0};
    const model=pathModel(contour,true),samples=Array.from({length:160},(_,i)=>model.at(model.length*i/160));
    const center=[0,1].map(k=>samples.reduce((s,p)=>s+p[k],0)/samples.length);
    let xx=0,yy=0,xy=0;for(const p of samples){const x=p[0]-center[0],y=p[1]-center[1];xx+=x*x;yy+=y*y;xy+=x*y;}
    const principal=.5*Math.atan2(2*xy,xx-yy),grid=new SegmentGrid([model.points]);
    let best={confidence:0};
    for(const angle of [0,Math.PI/2,principal,principal+Math.PI/2]) {
      const u=[Math.cos(angle),Math.sin(angle)],reflect=p=>{const d=sub(p,center),along=dot(d,u);return [center[0]+2*along*u[0]-d[0],center[1]+2*along*u[1]-d[1]];};
      const boundary=samples.filter(p=>grid.distance(reflect(p))<4).length/samples.length;
      let union=0,intersection=0;const xs=samples.map(p=>p[0]),ys=samples.map(p=>p[1]);
      for(let x=Math.min(...xs);x<=Math.max(...xs);x+=8)for(let y=Math.min(...ys);y<=Math.max(...ys);y+=8){const a=inPolygon([x,y],contour),b=inPolygon(reflect([x,y]),contour);union+=+(a||b);intersection+=+(a&&b);}
      const confidence=Math.min(boundary,intersection/Math.max(1,union));
      if(confidence>best.confidence)best={confidence,center,angle,reflect};
    }
    return best;
  }
  function buildStructures(internal,contour=[],options={}) {
    const start=Date.now(),observed=internal.filter(p=>p.length>=2&&p.every(q=>q.length===2&&q.every(Number.isFinite))).map(p=>p.map(q=>[...q]));
    const symmetryStart=Date.now(),symmetry=symmetryAxis(contour),symmetryMs=Date.now()-symmetryStart;
    const evidence=new SegmentGrid(observed),boundary=contour.length?new SegmentGrid([pathModel(contour,true).points]):null;
    const insideMask=p=>!boundary||inPolygon(p,contour)||boundary.distance(p)<.75;
    const support=points=>points.filter(p=>evidence.distance(p)<2).length/points.length;
    let paths=observed.map((points,id)=>({points,ids:[id],bridges:[],origin:'OBSERVED'}));
    const rejected=[],reconstructionStart=Date.now();
    // Pair the best tangent continuation at graph junctions BEFORE rejecting
    // fragments. An endpoint can be consumed once; no branching is invented.
    for(let pass=0;pass<observed.length;pass++) {
      const entries=[];paths.forEach((p,i)=>{const m=pathModel(p.points);if(m.length<EPS||dist(p.points[0],p.points.at(-1))<.5)return;for(const side of [0,1]){const q=side?m.at(m.length):m.at(0),inner=side?m.at(Math.max(0,m.length-5)):m.at(Math.min(5,m.length)),v=sub(q,inner),length=Math.hypot(...v);if(length>EPS)entries.push({i,side,q,u:v.map(x=>x/length),length:m.length});}});
      const cells=new Map(),key=p=>Math.floor(p[0]/8)+','+Math.floor(p[1]/8);
      for(const e of entries){const k=key(e.q);if(!cells.has(k))cells.set(k,[]);cells.get(k).push(e);}
      let best=null;
      for(const a of entries)for(let dx=-1;dx<=1;dx++)for(let dy=-1;dy<=1;dy++)for(const b of cells.get((Math.floor(a.q[0]/8)+dx)+','+(Math.floor(a.q[1]/8)+dy))||[]) {
        if(a.i>=b.i)continue;const gapMm=dist(a.q,b.q),alignment=-dot(a.u,b.u);if(gapMm>7||alignment<.86)continue;
        const between=Array.from({length:9},(_,i)=>[a.q[0]+(b.q[0]-a.q[0])*i/8,a.q[1]+(b.q[1]-a.q[1])*i/8]);
        if(!between.every(insideMask))continue;
        if(gapMm>.75){const v=sub(b.q,a.q).map(x=>x/gapMm);if(dot(v,a.u)<.85||-dot(v,b.u)<.85||Math.min(a.length,b.length)<4||a.length+b.length<gapMm*5)continue;}
        const mirrorSupport=symmetry.confidence>=.85?support(between.map(symmetry.reflect)):0;
        const edgeSupport=support(between),assisted=gapMm>4&&mirrorSupport>=.75;
        if(gapMm>4&&!assisted&&edgeSupport<.75)continue;
        const score=gapMm+12*(1-alignment)-.5*mirrorSupport;
        if(!best||score<best.score)best={a,b,gapMm,between,assisted,edgeSupport,mirrorSupport,score};
      }
      if(!best)break;
      const {a,b,gapMm,between,assisted,edgeSupport,mirrorSupport}=best,A=paths[a.i],B=paths[b.i];
      const left=a.side?A.points:A.points.slice().reverse(),right=b.side?B.points.slice().reverse():B.points;
      const bridge=gapMm>.75?[{points:between,origin:assisted?'SYMMETRY_ASSISTED':'RECONSTRUCTED',reason:assisted?'SUPPORTED_REFLECTED_CONTINUATION':'ALIGNED_ENDPOINTS',gapMm,edgeSupport,mirrorSupport}]:[];
      paths[a.i]={points:[...left,...(gapMm>EPS?right:right.slice(1))],ids:[...A.ids,...B.ids],bridges:[...A.bridges,...B.bridges,...bridge],origin:assisted||A.origin==='SYMMETRY_ASSISTED'||B.origin==='SYMMETRY_ASSISTED'?'SYMMETRY_ASSISTED':bridge.length||A.bridges.length||B.bridges.length?'RECONSTRUCTED':'OBSERVED'};
      paths.splice(b.i,1);
    }
    const reconstructionMs=Date.now()-reconstructionStart,selectionStart=Date.now(),selected=[];
    for(const item of paths) {
      const p=item.points,m=pathModel(p),xs=p.map(q=>q[0]),ys=p.map(q=>q[1]),width=Math.max(...xs)-Math.min(...xs),height=Math.max(...ys)-Math.min(...ys),extent=Math.hypot(width,height),closed=dist(p[0],p.at(-1))<1;
      const samples=Array.from({length:32},(_,i)=>m.at(m.length*i/31)),mirrorSupport=symmetry.confidence>=.85?support(samples.map(symmetry.reflect)):0;
      const tileCost=Math.max(1,Math.ceil(m.length/31)),structuralValue=extent*(1+.25*mirrorSupport),score=structuralValue/tileCost;
      const reason=closed&&Math.min(width,height)<(options.smallLoop??35)?'SMALL_LOOP':m.length<(options.minLength??45)||extent<(options.minExtent??30)?'MINOR_FRAGMENT':extent/m.length<.3?'LOW_SPATIAL_EXTENT':null;
      const out={...item,points:simplifyOpen(p,options.simplification??.6),lengthMm:m.length,extentMm:extent,tileCost,structuralValue,score,mirrorSupport,symmetryConfidence:symmetry.confidence,reason:reason||'COHERENT_MAJOR_PATH'};
      if(reason)rejected.push(out);else selected.push(out);
    }
    selected.sort((a,b)=>b.score-a.score||b.lengthMm-a.lengthMm||a.ids[0]-b.ids[0]);
    const {reflect,...axis}=symmetry;
    return {paths:selected,observed,rejected,symmetry:axis,timings:{symmetryMs,reconstructionMs,selectionMs:Date.now()-selectionStart,structuralMs:Date.now()-start}};
  }
  function skeletonPaths(internal) {return buildStructures(internal).paths.map(p=>p.points);}
  function followMixed(routes,canvas,budget=RULES.maxTiles,fixed=[],options={}) {
    const began=Date.now(),tiles=fixed.map(migrateTile),routeCoverage={},stats={collisionRejections:0,skippedStations:0,largeCandidatesGenerated:0,smallCandidatesGenerated:0,smallRejectedReasons:{}};
    const rejectSmall=reason=>{stats.smallRejectedReasons[reason]=(stats.smallRejectedReasons[reason]||0)+1;};
    const rank=r=>r.role==='outer'?0:r.role==='characteristic'?1:2;
    for(const route of routes.slice().sort((a,b)=>rank(a)-rank(b)||(b.priority||0)-(a.priority||0))){
      // Remove sub-millimeter noise only in the physical target executor.
      // Result 2 is the immutable rail. Candidate placement follows its exact
      // ordered points; no second simplification or geometric rewrite occurs.
      const points=route.points.map(p=>p.slice()),model=pathModel(points),startCount=tiles.length;
      let station=0,largeBlockedByCollision=false;
      function candidatesAt(state){
        const used=inventory([...tiles,...state.newTiles]),pool=[];
        for(const type of options.largeOnly?['large']:['large','small']){
          const length=INVENTORY[type].lengthMm;
          if(used[type+'Remaining']<1||used.totalUsed>=Math.min(budget,INVENTORY.totalMaximum)){if(type==='small')rejectSmall('INVENTORY_OR_BUDGET');continue;}
          for(const shift of [0,.8,1.6,2.4]){
            const s=state.station+shift;if(s+length>model.length+.1){if(type==='small')rejectSmall('ROUTE_END');continue;}
            stats[type+'CandidatesGenerated']++;
            const a=model.at(s),b=model.at(s+length),angle=Math.atan2(b[1]-a[1],b[0]-a[0])/rad;
            // Center the exact rectangle on its chord; never stretch to arc length.
            const tile=makeTile((a[0]+b[0])/2,(a[1]+b[1])/2,angle,route.role,route.id,type);
            let max=0,squared=0;const end=ends(tile);
            for(let j=0;j<=12;j++){const p=model.at(s+length*j/12),q=[end[0][0]+(end[1][0]-end[0][0])*j/12,end[0][1]+(end[1][1]-end[0][1])*j/12],d=dist(p,q);max=Math.max(max,d);squared+=d*d/13;}
            if(max>RULES.maxDeviation-.25){if(type==='small')rejectSmall('MAX_DEVIATION');continue;}
            if(!inside(tile,canvas)){if(type==='small')rejectSmall('SAFE_AREA');continue;}
            if([...tiles,...state.newTiles].some(t=>overlap(t,tile))){stats.collisionRejections++;if(type==='small')rejectSmall('COLLISION');if(type==='large'&&!state.newTiles.length)largeBlockedByCollision=true;continue;}
            const scarcity=1+(INVENTORY.small.available-used.smallRemaining)/INVENTORY.small.available;
            const smallCost=type==='small'?(route.piecePreference==='LARGE'?.4:.16)*scarcity:0;
            const hint=type==='small'&&route.piecePreference==='SMALL_FOR_TURN'?.08:0;
            const cost=squared*length/30*.9+shift*.12+smallCost-hint;
            pool.push({tile,next:s+length,quality:squared,max,score:length/30-cost});
          }
        }
        return pool;
      }
      while(station+10<=model.length+.1&&tiles.length<Math.min(budget,INVENTORY.totalMaximum)){
        let beam=[{station,newTiles:[],steps:[],score:0}];
        largeBlockedByCollision=false;const firstPool=candidatesAt(beam[0]),collisionAtStart=largeBlockedByCollision;
        for(let depth=0;depth<4;depth++){
          const next=[];
          for(const state of beam){const pool=depth===0?firstPool:candidatesAt(state);
            if(!pool.length){next.push(state);continue;}
            for(const c of pool)next.push({station:c.next,newTiles:[...state.newTiles,c.tile],steps:[...state.steps,c],score:state.score+c.score});
          }
          next.sort((a,b)=>b.score-a.score||b.station-a.station);const seen=new Set();beam=[];
          for(const state of next){const key=state.newTiles.map(t=>t.type[0]).join('')+':'+state.station.toFixed(1);if(seen.has(key))continue;seen.add(key);beam.push(state);if(beam.length===6)break;}
        }
        const best=beam.filter(b=>b.steps.length).sort((a,b)=>b.score-a.score||b.station-a.station)[0];
        if(!best){station+=2;stats.skippedStations++;continue;}
        const c=best.steps[0],t=c.tile,large=firstPool.find(p=>p.tile.type==='large');
        t.decisionReason=t.type==='large'?'LARGE_SELECTED_EQUIVALENT_QUALITY':model.length-station<30?'SMALL_SELECTED_ENDPOINT':route.role==='characteristic'?'SMALL_SELECTED_CHARACTERISTIC_FEATURE':route.piecePreference==='SMALL_FOR_TURN'?'SMALL_SELECTED_AI_HINT':!large&&collisionAtStart?'SMALL_SELECTED_COLLISION_AVOIDANCE':'SMALL_SELECTED_CURVATURE';
        t.id=tiles.length+1;t.sequenceIndex=tiles.length;t.routeId=route.id;tiles.push(t);station=c.next;
      }
      const placed=tiles.slice(startCount),count=inventory(placed);
      const gaps=placed.slice(1).map((t,i)=>gap(placed[i],t));if(placed.length>1&&dist(points[0],points.at(-1))<.1)gaps.push(gap(placed.at(-1),placed[0]));
      routeCoverage[route.id]={placed:placed.length,length:model.length,largeUsed:count.largeUsed,smallUsed:count.smallUsed,total:count.totalUsed,reasons:placed.reduce((r,t)=>(r[t.decisionReason]=(r[t.decisionReason]||0)+1,r),{}),remaining:inventory(tiles),coveredMm:placed.reduce((n,t)=>n+t.lengthMm,0),maxGapMm:Math.max(0,...gaps),gapsOver2mm:gaps.filter(g=>g>RULES.maxGap).length};
    }
    tiles.forEach((t,i)=>{t.id=i+1;t.sequenceIndex=i;});
    const finalInventory=inventory(tiles);stats.smallRejectedReasons.NOT_SELECTED=Math.max(0,stats.smallCandidatesGenerated-finalInventory.smallUsed-Object.values(stats.smallRejectedReasons).reduce((a,b)=>a+b,0));
    const mixedDiagnostics={largeCandidatesGenerated:stats.largeCandidatesGenerated,smallCandidatesGenerated:stats.smallCandidatesGenerated,largeSelected:finalInventory.largeUsed,smallSelected:finalInventory.smallUsed,smallRejectedReasons:stats.smallRejectedReasons,selectionReasons:Object.fromEntries(Object.values(routeCoverage).flatMap(r=>Object.entries(r.reasons)).reduce((map,[key,value])=>map.set(key,(map.get(key)||0)+value),new Map()))};
    const layout={schemaVersion:3,status:'ok',mode:'AI_HYBRID',canvas,tiles,target:routes,routeCoverage,inventory:finalInventory,stats,mixedDiagnostics,timings:{followerMs:Date.now()-began},visualStatus:'UNREVIEWED'};
    const validationStart=Date.now(),checked=validate(layout,{continuity:false});layout.timings.validationMs=Date.now()-validationStart;
    if(!tiles.length||!checked.valid)throw Error('GEOMETRY_FAILED');
    return layout;
  }
  const FALLBACK_PROFILES=Object.freeze([
    Object.freeze({id:'normal',scale:1,direct:Object.freeze([1,3]),regularized:Object.freeze([]),structureLimit:Infinity,minLength:45,minExtent:30}),
    Object.freeze({id:'reduced-detail',scale:1,direct:Object.freeze([]),regularized:Object.freeze([[20,18]]),structureLimit:8,minLength:58,minExtent:38}),
    Object.freeze({id:'major-structure',scale:1,direct:Object.freeze([]),regularized:Object.freeze([[26,18]]),structureLimit:3,minLength:75,minExtent:50}),
    Object.freeze({id:'outer-priority',scale:.94,direct:Object.freeze([]),regularized:Object.freeze([[20,18]]),structureLimit:0,minLength:Infinity,minExtent:Infinity}),
    Object.freeze({id:'outer-simplified',scale:.86,direct:Object.freeze([]),regularized:Object.freeze([[26,18]]),structureLimit:0,minLength:Infinity,minExtent:Infinity}),
    Object.freeze({id:'minimal-silhouette',scale:.78,direct:Object.freeze([6,10]),regularized:Object.freeze([[20,18],[26,18]]),structureLimit:0,minLength:Infinity,minExtent:Infinity})
  ]);
  function generateMixedForCanvas(source,canvas,profile=FALLBACK_PROFILES[0]){
    const began=Date.now(),fitted=fit(source,canvas,profile.scale),clean=profile.regularize?regularize(fitted.contour,profile.regularize):null,contour=clean||fitted.contour;
    const structures=buildStructures(fitted.internal,contour,{minLength:profile.minLength,minExtent:profile.minExtent,simplification:Math.max(.6,profile.tolerance/3)});
    const outer=simplifyClosed(contour,profile.tolerance);if(outer.length<3)throw Error('INVALID_TARGET');outer.push(outer[0]);
    const selected=structures.paths.slice(0,profile.structureLimit);
    const routes=[{id:0,role:'outer',priority:1,points:outer,piecePreference:'MIXED'},...selected.map((p,i)=>({id:i+1,role:'skeleton',priority:.5,points:p.points,piecePreference:'LARGE',sourceIds:p.ids}))];
    const result=followMixed(routes,canvas);
    if((result.routeCoverage[0]?.placed||0)<3)throw Error('OUTER_NOT_REPRESENTED');
    for(const t of result.tiles)t.sourceGroupId=routes.find(r=>r.id===t.sourcePathId)?.sourceIds?.[0];
    return {...result,mode:'DETERMINISTIC_FALLBACK',routeMode:true,structures,fitScale:fitted.scale,simplificationMm:profile.tolerance,fallbackProfile:profile.id,score:0,orientation:canvas[0]===canvas[1]?'square':canvas[0]>canvas[1]?'landscape':'portrait',timings:{...structures.timings,...result.timings,totalMs:Date.now()-began}};
  }
  function generateForCanvas(source,canvas,options={}) {
    if(typeof options==='number')options={scale:options};
    const profile={scale:1,direct:[1,3,6,10],regularized:[[4,3],[7,3],[10,3],[10,8],[14,8],[14,12],[20,12],[20,18],[26,18]],structureLimit:Infinity,minLength:45,minExtent:30,...options};
    const start=Date.now(),fitted=fit(source,canvas,profile.scale),timings={};let outer=null,target=null,tolerance=0;
    const optimizationStart=Date.now();let simplificationMs=0;const searches=[];
    for(const tol of profile.direct) {const s=Date.now();target=simplifyClosed(fitted.contour,tol);simplificationMs+=Date.now()-s;const stats={tolerance:tol};searches.push(stats);outer=solveOuter(target,canvas,{wide:tol>=6,stats});if(outer){tolerance=tol;break;}}
    if(!outer)for(const [radius,tol] of profile.regularized){const s=Date.now(),clean=regularize(fitted.contour,radius);target=clean?simplifyClosed(clean,tol):null;simplificationMs+=Date.now()-s;if(!target)continue;const stats={radius,tolerance:tol};searches.push(stats);outer=solveOuter(target,canvas,{wide:true,stats});if(outer){tolerance=radius+tol;break;}}
    timings.simplificationMs=simplificationMs;
    if(!outer){
      return {status:'LAYOUT_NOT_FEASIBLE',canvas,tiles:[],target:[],searches,timings:{...timings,optimizationMs:Date.now()-optimizationStart-simplificationMs,totalMs:Date.now()-start}};
    }
    let structures={paths:[],observed:[],rejected:[],symmetry:{confidence:0},timings:{}};
    if(profile.structureLimit>0)try{structures=buildStructures(fitted.internal,fitted.contour,{minLength:profile.minLength,minExtent:profile.minExtent});}catch(error){console.error('optional_structure_failure',error);structures={paths:[],observed:[],rejected:[],symmetry:{confidence:0},timings:{},failure:{stage:'structural_paths',name:error.name}};}
    Object.assign(timings,structures.timings);
    const refinement=profile.enableSmallRefinement===false?{tiles:outer.tiles,diagnostics:{largeCandidatesGenerated:searches.reduce((n,s)=>n+(s.largeCandidatesGenerated||0),0),smallCandidatesGenerated:0,largeSelected:outer.tiles.length,smallSelected:0,smallRejectedReasons:{DISABLED:outer.tiles.length}}}:refineOuterWithSmall(outer.tiles,outer.target,canvas,{largeCandidatesGenerated:searches.reduce((n,s)=>n+(s.largeCandidatesGenerated||0),0)});
    const tiles=refinement.tiles,targetPaths=[{id:0,role:'outer',points:outer.target}];
    // Add only long reproducible portions. Local bends with no valid full tile
    // simply have no candidate. Sorted by value/cost (stable length per tile).
    const collisionRejections=[];let collisionMs=0;
    for(const item of structures.paths.slice(0,profile.structureLimit)){if(inventory(tiles).largeUsed>=INVENTORY.large.available)break;const id=targetPaths.length,model=pathModel(item.points),grid=new SegmentGrid([item.points]);
      // Bounded path-level search: reward coverage and consecutive physical
      // contacts. Retain full target paths, never clip them to individual tiles.
      let best=[];let bestScore=-Infinity;
      for(const phase of [0,8,16]){
        let beam=[{tiles:[],score:0,last:null}];
        for(let s=15+phase;s<=model.length-12;s+=31){
          const pool=candidates(model,grid,s,canvas,'skeleton',id,true).slice(0,70),safe=[];
          for(const c of pool){const time=Date.now(),collision=tiles.some(t=>overlap(c.tile,t)),redundant=tiles.some(t=>Math.abs(Math.cos((t.angleDeg-c.tile.angleDeg)*rad))>.97&&pointSegment([c.tile.xMm,c.tile.yMm],...ends(t))<5);collisionMs+=Date.now()-time;
            if(!collision&&!redundant)safe.push(c);else if(collisionRejections.length<160)collisionRejections.push({tile:c.tile,reason:collision?'OVERLAP':'PARALLEL_REDUNDANCY'});
          }
          const next=beam.map(b=>({...b,score:b.score-5}));
          for(const b of beam)for(const c of safe){if(b.tiles.length+inventory(tiles).largeUsed>=INVENTORY.large.available||b.tiles.some(t=>overlap(t,c.tile)))continue;const prev=b.tiles.at(-1),g=prev?gap(prev,c.tile):0,connected=prev&&g>=0&&g<=2;
            next.push({tiles:[...b.tiles,c.tile],last:c.station,score:b.score+30-Math.min(12,c.score)+(connected?12:prev?-5:0)});
          }
          next.sort((a,b)=>b.score-a.score);const seen=new Set();beam=[];
          for(const b of next){const end=b.tiles.at(-1),key=end?[end.xMm.toFixed(1),end.yMm.toFixed(1),end.angleDeg.toFixed(1),b.tiles.length].join(','):'empty';if(seen.has(key))continue;seen.add(key);beam.push(b);if(beam.length===8)break;}
        }
        if(beam[0]?.score>bestScore){bestScore=beam[0].score;best=beam[0].tiles;}
      }
      item.placedTiles=best.length;item.placementReason=best.length?'PLACED_MAJOR_PATH':'NO_NONCOLLIDING_FULL_TILE';
      if(!best.length)continue;
      best.forEach(t=>{t.sourceGroupId=item.ids[0];});tiles.push(...best);
      targetPaths.push({id,role:'skeleton',points:item.points,origin:item.origin,bridges:item.bridges,score:item.score,sourceIds:item.ids});
    }
    timings.collisionMs=collisionMs+searches.reduce((s,p)=>s+(p.collisionMs||0),0);
    tiles.forEach((t,i)=>{t.id=i+1;t.sequenceIndex=i;});timings.optimizationMs=Date.now()-optimizationStart-simplificationMs;
    const finalInventory=inventory(tiles);refinement.diagnostics.largeSelected=finalInventory.largeUsed;refinement.diagnostics.smallSelected=finalInventory.smallUsed;
    const layout={status:'ok',canvas,tiles,target:targetPaths,structures,collisionRejections,searches,mixedDiagnostics:refinement.diagnostics,orientation:canvas[0]===canvas[1]?'square':canvas[0]>canvas[1]?'landscape':'portrait',simplificationMm:tolerance,fitScale:fitted.scale,score:outer.score,timings};
    const checkStart=Date.now(),checked=validate(layout);timings.validationMs=Date.now()-checkStart;timings.totalMs=Date.now()-start;
    return checked.valid?layout:{status:'LAYOUT_NOT_FEASIBLE',canvas,tiles:[],target:[],diagnostics:checked,timings};
  }
  function result2Geometry(source) {
    const valid=p=>Array.isArray(p)&&p.length>=2&&p.every(q=>Array.isArray(q)&&q.length===2&&q.every(Number.isFinite));
    if(!source||typeof source!=='object')throw Error('INVALID_RESULT2');
    const paths=Array.isArray(source.paths)?source.paths:[],outerPath=paths.find(p=>p.role==='outer'&&valid(p.points));
    const contour=(outerPath?.points||source.contour);if(!valid(contour)||contour.length<3)throw Error('INVALID_RESULT2');
    const internals=paths.length?paths.filter(p=>p!==outerPath&&valid(p.points)).map((p,index)=>({id:String(p.id??`internal-${index}`),points:p.points,importance:Number.isFinite(p.importance)?p.importance:null,origin:p.origin})):((source.internal_lines||[]).filter(valid).map((points,index)=>({id:`internal-${index}`,points,importance:null})));
    return {outer:{id:String(outerPath?.id??'outer'),points:contour},internals};
  }
  function result2Routes(source,canvas) {
    const geometry=result2Geometry(source),fitted=fit({contour:geometry.outer.points,internal_lines:geometry.internals.map(p=>p.points)},canvas),outer=fitted.contour.map(p=>p.slice());
    if(dist(outer[0],outer.at(-1))>EPS)outer.push(outer[0].slice());
    const internals=geometry.internals.map((path,index)=>{const points=fitted.internal[index].map(p=>p.slice()),length=pathModel(points).length;return {id:path.id,role:'skeleton',priority:path.importance??length,piecePreference:'MIXED',points,result2Index:index+1,origin:path.origin||'RESULT2'};});
    const routes=[{id:geometry.outer.id,role:'outer',priority:Number.MAX_SAFE_INTEGER,piecePreference:'MIXED',points:outer,result2Index:0,origin:'RESULT2'},...internals];
    return {routes,transform:{scale:fitted.scale,offset:fitted.offset.slice()}};
  }
  function railMetrics(layout) {
    const groups={outer:{covered:0,count:0},internal:{covered:0,count:0}},perPath={};let distanceSum=0,distanceWeight=0,maxDistance=0;
    for(const route of layout.target){const model=pathModel(route.points),n=Math.max(1,Math.ceil(model.length/2)),placed=layout.tiles.filter(t=>t.sourcePathId===route.id),segments=placed.map(ends),kind=route.role==='outer'?'outer':'internal',group=groups[kind];let covered=0,pathDistanceSum=0,pathWeight=0,pathMax=0;
      for(let i=0;i<=n;i++){const point=model.at(model.length*i/n),distance=segments.length?Math.min(...segments.map(segment=>pointSegment(point,segment[0],segment[1]))):Infinity;covered+=+(distance<=RULES.maxDeviation+EPS);}
      for(const tile of placed){const measured=deviation(tile,new SegmentGrid([route.points])),weight=tile.lengthMm;pathDistanceSum+=measured.mean*weight;pathWeight+=weight;pathMax=Math.max(pathMax,measured.max);}
      const count=n+1;group.covered+=covered;group.count+=count;distanceSum+=pathDistanceSum;distanceWeight+=pathWeight;maxDistance=Math.max(maxDistance,pathMax);perPath[route.id]={role:route.role,coveragePercent:Number((100*covered/count).toFixed(2)),meanDistanceMm:pathWeight?Number((pathDistanceSum/pathWeight).toFixed(3)):null,maxDistanceMm:pathWeight?Number(pathMax.toFixed(3)):null,placed:placed.length};
    }
    const stock=inventory(layout.tiles);
    return {outerCoveragePercent:Number((100*groups.outer.covered/Math.max(1,groups.outer.count)).toFixed(2)),internalCoveragePercent:Number((groups.internal.count?100*groups.internal.covered/groups.internal.count:100).toFixed(2)),meanDistanceToResult2:Number((distanceSum/Math.max(1,distanceWeight)).toFixed(3)),maxDistanceToResult2:Number(maxDistance.toFixed(3)),gapCount:Object.values(layout.routeCoverage||{}).reduce((sum,route)=>sum+(route.gapsOver2mm||0),0),largeUsed:stock.largeUsed,smallUsed:stock.smallUsed,totalUsed:stock.totalUsed,paths:perPath};
  }
  function generateResult2ForCanvas(source,canvas) {
    const began=Date.now(),prepared=result2Routes(source,canvas),layout=followMixed(prepared.routes,canvas,RULES.maxTiles);
    layout.mode='DETERMINISTIC_FALLBACK';layout.routeMode=true;layout.targetPolicy='IMMUTABLE_RESULT2';layout.visualStatus='PHYSICALLY_VALID';layout.inputSource='result2';layout.fallbackProfile='result2-rail';layout.simplified=false;layout.fitScale=prepared.transform.scale;layout.result2Transform=prepared.transform;layout.orientation=canvas[0]===canvas[1]?'square':canvas[0]>canvas[1]?'landscape':'portrait';layout.metrics=railMetrics(layout);layout.timings={...layout.timings,totalMs:Date.now()-began};return layout;
  }
  function generate(source,{format='40x40',orientation='auto',optimizedSource=null}={}) {
    const target=optimizedSource||source,canvases=format==='40x40'?[[400,400]]:orientation==='portrait'?[[300,400]]:orientation==='landscape'?[[400,300]]:[[300,400],[400,300]],results=canvases.map(canvas=>{try{return generateResult2ForCanvas(target,canvas);}catch(error){return {status:'LAYOUT_NOT_FEASIBLE',canvas,tiles:[],target:[],reason:error.message,targetPolicy:'IMMUTABLE_RESULT2'};}}),valid=results.filter(result=>result.status==='ok');
    valid.sort((a,b)=>b.metrics.outerCoveragePercent-a.metrics.outerCoveragePercent||a.metrics.meanDistanceToResult2-b.metrics.meanDistanceToResult2||b.metrics.internalCoveragePercent-a.metrics.internalCoveragePercent);const result=valid[0]||results[0];result.evaluated=results.map(r=>({canvas:r.canvas,status:r.status,tiles:r.tiles.length,metrics:r.metrics,timings:r.timings}));result.auto=orientation==='auto'&&format==='30x40';return result;
  }
  function exportSVG(layout,{mounting=false,labels={}}={}) {
    const checked=validate(layout);if(!checked.valid)throw new Error(checked.errors.join(', '));
    const [w,h]=layout.canvas,lines=[`<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">`,`<rect width="${w}" height="${h}" fill="white"/>`,`<rect x="15" y="15" width="${w-30}" height="${h-30}" fill="none" stroke="#94a3b8" stroke-width="0.25" stroke-dasharray="2 2"/>`];
    for(const p of layout.target)lines.push(`<path d="M ${p.points.map(q=>q.join(',')).join(' L ')}" fill="none" stroke="#475569" stroke-width="0.35" stroke-dasharray="2 1.5"/>`);
    for(const t of layout.tiles){lines.push(`<rect data-tile-id="${t.id}" data-tile-type="${t.type}" x="${-t.lengthMm/2}" y="${-t.widthMm/2}" width="${t.lengthMm}" height="${t.widthMm}" transform="translate(${t.xMm} ${t.yMm}) rotate(${t.angleDeg})" fill="#dc2626"/>`);if(mounting)lines.push(`<text x="0" y="0" transform="translate(${t.xMm} ${t.yMm}) rotate(${t.angleDeg})" font-family="sans-serif" font-size="${t.type==='small'?1.8:2.6}" text-anchor="middle" dominant-baseline="middle" fill="white">${t.id}·${t.lengthMm}</text>`);}
    const xml=s=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;');
    if(mounting)lines.push(`<text x="15" y="7" font-family="sans-serif" font-size="3">${xml(labels.header||`${w} × ${h} mm · ${layout.tiles.length} / 150 tiles · 30 mm: ${inventory(layout.tiles).largeUsed}/100 · 10 mm: ${inventory(layout.tiles).smallUsed}/50`)}</text>`,`<text x="15" y="${h-5}" font-family="sans-serif" font-size="2.5">${xml(labels.footer||'Label: number·length mm. Origin: upper left. Coordinates: centers. Print at 100%.')}</text>`);
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
      const support=tile.lengthMm/2*Math.abs(dot(u,normal))+tile.widthMm/2*Math.abs(dot([-u[1],u[0]],normal));
      for(const g of [0,1,2]){
        for(const e of ends(other))for(const sign of [-1,1])proposals.push({...tile,xMm:e[0]+sign*(tile.lengthMm/2+g)*u[0],yMm:e[1]+sign*(tile.lengthMm/2+g)*u[1]});
        const along=Math.max(-other.lengthMm/2,Math.min(other.lengthMm/2,dot(sub([tile.xMm,tile.yMm],[other.xMm,other.yMm]),v)));
        for(const sign of [-1,1])proposals.push({...tile,xMm:other.xMm+along*v[0]+sign*(1.5+support+g)*normal[0],yMm:other.yMm+along*v[1]+sign*(1.5+support+g)*normal[1]});
      }
    }
    const near=proposals.slice(1).filter(t=>dist([tile.xMm,tile.yMm],[t.xMm,t.yMm])<=2&&inside(t,layout.canvas)&&!layout.tiles.some(o=>o.id!==tile.id&&overlap(t,o)));
    near.sort((a,b)=>dist([a.xMm,a.yMm],[tile.xMm,tile.yMm])-dist([b.xMm,b.yMm],[tile.xMm,tile.yMm]));return near[0]||tile;
  }
  class TileDocument {
    constructor(layout){layout={...layout,schemaVersion:3,tiles:(layout.tiles||[]).map(migrateTile)};layout.inventory=inventory(layout.tiles);if(!validate(layout,{continuity:false}).valid)throw new Error('INVALID_LAYOUT');this.layout=JSON.parse(JSON.stringify(layout));this.undoStack=[];this.redoStack=[];}
    commit(tiles){const next={...this.layout,tiles,inventory:inventory(tiles),visualStatus:'MANUALLY_EDITED'};const check=validate(next,{continuity:false});if(!check.valid)return check;this.undoStack.push(this.layout);if(this.undoStack.length>100)this.undoStack.shift();this.redoStack=[];this.layout=next;return check;}
    update(id,patch){const t=this.layout.tiles.find(t=>t.id===id);if(!t)return {valid:false,errors:['NO_SELECTION']};return this.commit(this.layout.tiles.map(t=>t.id===id?{...t,...patch,id:t.id}:t));}
    add(tile){const id=Math.max(0,...this.layout.tiles.map(t=>t.id))+1;return this.commit([...this.layout.tiles,{...migrateTile(tile),id,sequenceIndex:Number.isFinite(tile.sequenceIndex)?tile.sequenceIndex:id-1}]);}
    remove(id){return this.commit(this.layout.tiles.filter(t=>t.id!==id));}
    undo(){if(!this.undoStack.length)return;this.redoStack.push(this.layout);this.layout=this.undoStack.pop();}
    redo(){if(!this.redoStack.length)return;this.undoStack.push(this.layout);this.layout=this.redoStack.pop();}
  }
  const api={version:'physical-tiles-v6',RULES,INVENTORY,FALLBACK_PROFILES,inventory,migrateTile,followMixed,makeTile,ends,corners,overlap,gap,inside,pathModel,SegmentGrid,deviation,contourCovered,validate,generate,generateResult2ForCanvas,result2Routes,railMetrics,generateForCanvas,generateMixedForCanvas,solveOuter,refineOuterWithSmall,skeletonPaths,buildStructures,symmetryAxis,exportSVG,snap,TileDocument,fit,regularize,simplifyClosed,nearestOnPath};
  if(typeof module!=='undefined')module.exports=api;root.TileLayout=api;
})(typeof globalThis!=='undefined'?globalThis:this);
