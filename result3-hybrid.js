/* Experimental Result 3 only: AI plan -> deterministic target -> whole strips. */
(function(root){'use strict';
const T=typeof module!=='undefined'?require('./tile-layout.js'):root.TileLayout;
const strategies=['FOLLOW','FOLLOW_SIMPLIFIED','CUT_CORNER','MERGE_AND_CONTINUE','BRIDGE','REROUTE','SYMMETRY_ASSIST','RESTORE','TERMINATE'];
const fail=()=>{throw Error('PLAN_INVALID');},point=p=>Array.isArray(p)&&p.length===2&&p.every(v=>Number.isFinite(v)&&v>=0&&v<=1);
const text=(s,max=400)=>typeof s==='string'&&s.length<=max;
function keys(value,allowed){if(!value||typeof value!=='object'||Array.isArray(value)||Object.keys(value).some(k=>!allowed.includes(k)))fail();}
function prepare(detailed,optimized,canvas=[400,400]){
  const began=Date.now();if(!detailed?.contour?.length||optimized?.status!=='ok')throw Error('INPUT_INVALID');
  const originalCanvas=optimized.canvas;
  const compact=(points,n=10)=>{const model=T.pathModel(points),count=Math.min(n,Math.max(2,points.length));return Array.from({length:count},(_,i)=>model.at(model.length*i/(count-1)));};
  // Split the long outer boundary into short numbered routes BEFORE compacting.
  // Uniformly reducing a complete silhouette to 18 points loses appendages.
  const primary=optimized.paths.flatMap(p=>{if(p.role!=='outer')return [p];const m=T.pathModel(p.points),n=Math.min(24,Math.max(1,Math.ceil(m.length/90)));return Array.from({length:n},(_,i)=>({role:'outer',points:Array.from({length:24},(_,j)=>m.at(m.length*(i+j/23)/n))}));});
  const paths=[...primary.map((p,i)=>({id:'r2_'+i,source:'result2',role:p.role==='outer'?'outer':'structural',points:p.points})),...detailed.internal_lines.map((points,i)=>({id:'r1_'+i,source:'result1',role:'structural',points}))];
  // Bound model context, retaining the largest secondary paths. IDs stay stable.
  const selected=[...paths.filter(p=>p.source==='result2').slice(0,72),...paths.filter(p=>p.source==='result1').sort((a,b)=>T.pathModel(b.points).length-T.pathModel(a.points).length).slice(0,24)];
  return {version:1,canvas,paths:selected.map(p=>({...p,points:compact(p.points).map(q=>q.map((v,i)=>Number(Math.max(0,Math.min(1,v/originalCanvas[i])).toFixed(3))))})),inputMs:Date.now()-began};
}
function validateContext(context){
  keys(context,['version','canvas','paths','inputMs']);
  if(context.version!==1||!Array.isArray(context.canvas)||![[400,400],[300,400],[400,300]].some(c=>c.every((v,i)=>v===context.canvas[i]))||!Array.isArray(context.paths)||!context.paths.length||context.paths.length>160)fail();
  const ids=new Set();for(const p of context.paths){keys(p,['id','source','role','points']);if(!/^r[12]_\d+$/.test(p.id)||ids.has(p.id)||!['result1','result2'].includes(p.source)||!['outer','structural'].includes(p.role)||!Array.isArray(p.points)||p.points.length<2||p.points.length>24||!p.points.every(point))fail();ids.add(p.id);}
  return context;
}
function validatePlan(plan,context){
  validateContext(context);return (typeof module!=='undefined'?require('./result3-contract.js'):root.Result3Contract).plan(plan,context);
}
function validateQA(qa,plan){
  keys(qa,['version','accept','recognizabilityScore','silhouetteScore','cleanlinessScore','compositionScore','repairs']);
  if(qa.version!==1||typeof qa.accept!=='boolean'||!['recognizabilityScore','silhouetteScore','cleanlinessScore','compositionScore'].every(k=>Number.isFinite(qa[k])&&qa[k]>=0&&qa[k]<=1)||!Array.isArray(qa.repairs)||qa.repairs.length>4)throw Error('QA_INVALID');
  const seen=new Set();for(const r of qa.repairs){keys(r,['routeId','action','reason']);const route=plan.routes.find(p=>p.id===r.routeId);if(!route||seen.has(r.routeId)||!['SIMPLIFY','OMIT'].includes(r.action)||r.action==='OMIT'&&route.role==='outer'||!text(r.reason))throw Error('QA_INVALID');seen.add(r.routeId);}
  if(qa.accept&&qa.repairs.length)throw Error('QA_INVALID');return JSON.parse(JSON.stringify(qa));
}
function target(plan,context){
  const clean=validatePlan(plan,context),[w,h]=context.canvas;
  return clean.routes.map(r=>{const input=r.viaAnchors.length?r.viaAnchors: r.sourcePathIds.flatMap(id=>context.paths.find(p=>p.id===id).points);
    // Reserve a full half-tile envelope inside the mandatory safe area.
    const points=input.map(([x,y])=>[31+x*(w-62),31+y*(h-62)]);
    return {...r,role:r.role==='outer'?'outer':'skeleton',points};});
}
function physical(layout){return T.validate(layout,{continuity:false});}
function follow(routes,canvas,budget=150,fixed=[]){
  const begin=Date.now(),tiles=fixed.map(t=>({...t})),stats={collisionRejections:0,skippedStations:0},routeCoverage={};
  for(const route of routes.slice().sort((a,b)=>(a.role==='outer'?0:1)-(b.role==='outer'?0:1)||b.priority-a.priority)){
    const model=T.pathModel(route.points);let station=0,placed=0;
    while(station+30<=model.length+.001&&tiles.length<Math.min(150,budget)){
      // Three-strip bounded lookahead. Beam width four; never a global search.
      let beam=[{newTiles:[],station,score:0}];
      for(let depth=0;depth<3;depth++){
        const next=[];for(const state of beam){if(state.station+30>model.length){next.push(state);continue;}
          for(const shift of [0,1,2])for(const delta of [0,-4,4]){
            const s=state.station+shift,a=model.at(s),b=model.at(s+30),angle=Math.atan2(b[1]-a[1],b[0]-a[0])*180/Math.PI+delta,rad=angle*Math.PI/180;
            const tile=T.makeTile(a[0]+15*Math.cos(rad),a[1]+15*Math.sin(rad),angle,route.role,route.id);
            if(!T.inside(tile,canvas)||[...tiles,...state.newTiles].some(t=>T.overlap(t,tile))){stats.collisionRejections++;continue;}
            const end=T.ends(tile)[1],cost=Math.hypot(end[0]-b[0],end[1]-b[1])+shift*.15;
            next.push({newTiles:[...state.newTiles,tile],station:s+30,score:state.score+cost});
          }
        }
        if(!next.length)break;next.sort((a,b)=>b.newTiles.length-a.newTiles.length||a.score-b.score);beam=next.slice(0,4);
      }
      const best=beam.filter(b=>b.newTiles.length).sort((a,b)=>b.newTiles.length-a.newTiles.length||a.score-b.score)[0];
      if(!best){station+=3;stats.skippedStations++;continue;}
      // Commit one tile only, then inspect updated surroundings again.
      const previousStation=station,tile=best.newTiles[0];tile.id=tiles.length+1;tile.sequenceIndex=placed++;tiles.push(tile);
      station=T.nearestOnPath(T.ends(tile)[1],route.points).station;
      station=Math.max(station,best.station-(best.newTiles.length-1)*32,0);
      // Guarantee progress even on self-near or folded routes.
      station=Math.max(station,previousStation+30);
    }
    routeCoverage[route.id]={placed,length:model.length,nominalTiles:Math.floor(model.length/30)};
  }
  tiles.forEach((t,i)=>t.id=i+1);
  const layout={status:'ok',mode:'AI_HYBRID',canvas,tiles,target:routes,routeCoverage,stats,timings:{followerMs:Date.now()-begin},visualStatus:'UNREVIEWED'};
  if(!tiles.length||!physical(layout).valid)throw Error('GEOMETRY_FAILED');return layout;
}
function repair(layout,qa,budget){
  const affected=new Set(qa.repairs.map(r=>r.routeId));
  const routes=layout.target.filter(r=>!qa.repairs.some(q=>q.routeId===r.id&&q.action==='OMIT')).map(r=>qa.repairs.some(q=>q.routeId===r.id&&q.action==='SIMPLIFY')?{...r,points:r.role==='outer'?T.simplifyClosed(r.points,8):[r.points[0],r.points.at(-1)]}:r);
  const fixed=layout.tiles.filter(t=>!affected.has(t.sourcePathId));
  const repaired=follow(routes.filter(r=>affected.has(r.id)),layout.canvas,budget,fixed);repaired.target=routes;repaired.visualStatus='REPAIR_NEEDS_REVIEW';return repaired;
}
function exportSVG(layout){if(!physical(layout).valid)throw Error('PHYSICAL_INVALID');return `<svg xmlns="http://www.w3.org/2000/svg" width="${layout.canvas[0]}mm" height="${layout.canvas[1]}mm" viewBox="0 0 ${layout.canvas.join(' ')}"><rect width="100%" height="100%" fill="white"/>`+layout.tiles.map(t=>`<rect x="-15" y="-1.5" width="30" height="3" transform="translate(${t.xMm} ${t.yMm}) rotate(${t.angleDeg})" fill="#dc2626"/>`).join('')+'</svg>';}
async function run({context,images,request,fallback}){
  const started=Date.now();let plan,layout;
  try{const p=await request('plan',{context,images});plan=validatePlan(p.value,context);const targetStart=Date.now(),routes=target(plan,context),targetMs=Date.now()-targetStart;layout=follow(routes,context.canvas,plan.complexityBudget);const initial=JSON.parse(JSON.stringify(layout));
    const review=await images.review(layout);const q=await request('qa',{context,plan,images:{source:images.source,result2:images.result2,review}}),qa=validateQA(q.value,plan);
    layout.visualStatus=qa.accept?'AI_ACCEPTED':'AI_REJECTED';const repairStart=Date.now();if(!qa.accept&&qa.repairs.length)layout=repair(layout,qa,plan.complexityBudget);
    return {layout,initial,plan,qa,calls:2,planning_attempts:p.planning_attempts||1,providerCalls:(p.planning_attempts||1)+(q.planning_attempts||1),contract:p.contract,validationHistory:p.validationHistory,repairs:!qa.accept&&qa.repairs.length?1:0,timings:{...initial.timings,targetMs,repairMs:Date.now()-repairStart,planningMs:p.durationMs,qaMs:q.durationMs,totalMs:Date.now()-started}};
  }catch(error){const safe=await fallback();if(!physical(safe).valid||safe.status!=='ok')throw Error('FALLBACK_FAILED');return {layout:{...safe,mode:'DETERMINISTIC_FALLBACK',visualStatus:'UNREVIEWED'},errorCode:error.code||error.message,contractFailure:error.contractFailure,timings:{totalMs:Date.now()-started}};}
}
const api={prepare,validateContext,validatePlan,validateQA,target,follow,physical,repair,exportSVG,run};if(typeof module!=='undefined')module.exports=api;root.Result3Hybrid=api;
})(globalThis);
