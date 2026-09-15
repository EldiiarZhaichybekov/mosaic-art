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
  return {version:1,canvas,paths:selected.map(p=>({...p,points:compact(p.points).map(q=>q.map((v,i)=>Number(Math.max(0,Math.min(1,v/originalCanvas[i])).toFixed(3))))})),inventory:T.INVENTORY,inputMs:Date.now()-began};
}
function validateContext(context){
  keys(context,['version','canvas','paths','inputMs','inventory']);
  if(context.version!==1||!Array.isArray(context.canvas)||![[400,400],[300,400],[400,300]].some(c=>c.every((v,i)=>v===context.canvas[i]))||!Array.isArray(context.paths)||!context.paths.length||context.paths.length>160)fail();
  if(context.inventory!==undefined){const expected=T.INVENTORY;keys(context.inventory,['large','small','totalMaximum']);if(context.inventory.totalMaximum!==expected.totalMaximum)fail();for(const type of ['large','small']){keys(context.inventory[type],['lengthMm','widthMm','available']);for(const field of ['lengthMm','widthMm','available'])if(context.inventory[type][field]!==expected[type][field])fail();}}
  const ids=new Set();for(const p of context.paths){keys(p,['id','source','role','points']);if(!/^r[12]_\d+$/.test(p.id)||ids.has(p.id)||!['result1','result2'].includes(p.source)||!['outer','structural'].includes(p.role)||!Array.isArray(p.points)||p.points.length<2||p.points.length>24||!p.points.every(point))fail();ids.add(p.id);}
  return context;
}
function validatePlan(plan,context){
  validateContext(context);return (typeof module!=='undefined'?require('./result3-contract.js'):root.Result3Contract).plan(plan,context);
}
function validateQA(qa,plan){
  return (typeof module!=='undefined'?require('./result3-contract.js'):root.Result3Contract).qa(qa,plan);
}
function target(plan,context){
  const clean=validatePlan(plan,context),[w,h]=context.canvas;
  return clean.routes.map(r=>{const input=r.viaAnchors.length?r.viaAnchors: r.sourcePathIds.flatMap(id=>context.paths.find(p=>p.id===id).points);
    // Reserve a full half-tile envelope inside the mandatory safe area.
    const points=input.map(([x,y])=>[31+x*(w-62),31+y*(h-62)]);
    return {...r,role:r.role==='outer'?'outer':r.role==='characteristic'?'characteristic':'skeleton',points};});
}
function physical(layout){return T.validate(layout,{continuity:false});}
function follow(routes,canvas,budget=150,fixed=[]){return T.followMixed(routes,canvas,budget,fixed);}
function repair(layout,qa,budget){
  const affected=new Set(qa.repairs.map(r=>r.routeId));
  const sizeHints=new Map(qa.repairs.filter(r=>['REBUILD_WITH_SMALL','REBUILD_WITH_LARGE'].includes(r.action)).map(r=>[r.routeId,r.action==='REBUILD_WITH_SMALL'?'SMALL_FOR_TURN':'LARGE']));
  const routes=layout.target.map(r=>sizeHints.has(r.id)?{...r,piecePreference:sizeHints.get(r.id)}:r).filter(r=>!qa.repairs.some(q=>q.routeId===r.id&&q.action==='OMIT')).map(r=>qa.repairs.some(q=>q.routeId===r.id&&q.action==='SIMPLIFY')?{...r,points:r.role==='outer'?T.simplifyClosed(r.points,8):[r.points[0],r.points.at(-1)]}:r);
  const fixed=layout.tiles.filter(t=>!affected.has(t.sourcePathId));
  const repaired=follow(routes.filter(r=>affected.has(r.id)),layout.canvas,budget,fixed);repaired.target=routes;const rank=r=>r.role==='outer'?0:r.role==='characteristic'?1:2,order=routes.slice().sort((a,b)=>rank(a)-rank(b)||b.priority-a.priority).map(r=>r.id);repaired.tiles.sort((a,b)=>order.indexOf(a.sourcePathId)-order.indexOf(b.sourcePathId)||a.sequenceIndex-b.sequenceIndex);repaired.tiles.forEach((t,i)=>{t.id=i+1;t.sequenceIndex=i;});repaired.routeCoverage={...layout.routeCoverage,...repaired.routeCoverage};repaired.visualStatus='REPAIR_NEEDS_REVIEW';return repaired;
}
function exportSVG(layout){return T.exportSVG(layout);}
async function run({context,images,request,fallback}){
  const started=Date.now();let plan,layout;
  try{const p=await request('plan',{context,images});plan=validatePlan(p.value,context);const targetStart=Date.now(),routes=target(plan,context),targetMs=Date.now()-targetStart;layout=follow(routes,context.canvas,plan.complexityBudget);const initial=JSON.parse(JSON.stringify(layout)),planCalls=p.planning_attempts||1,base={initial,plan,planning_attempts:planCalls,contract:p.contract,validationHistory:p.validationHistory};
    const qaStart=Date.now();let q,qa;
    try{const review=await images.review(layout);q=await request('qa',{context,plan,inventoryUsage:((u)=>({largeUsed:u.largeUsed,smallUsed:u.smallUsed,totalUsed:u.totalUsed}))(T.inventory(layout.tiles)),images:{source:images.source,result2:images.result2,review}});qa=validateQA(q.value,plan);}
    catch(error){layout.visualStatus='AI_QA_INVALID';return {layout,...base,qa:null,calls:2,providerCalls:planCalls+1,repairs:0,errorCode:error.code||error.message,contractFailure:error.contractFailure||{code:error.code||error.message,issues:error.issues,diagnostics:error.diagnostics},timings:{...initial.timings,targetMs,planningMs:p.durationMs,qaMs:Date.now()-qaStart,totalMs:Date.now()-started}};}
    layout.visualStatus=qa.accept?'AI_ACCEPTED':'AI_REJECTED';const repairStart=Date.now();if(!qa.accept&&qa.repairs.length)layout=repair(layout,qa,plan.complexityBudget);
    return {layout,...base,qa,calls:2,providerCalls:planCalls+(q.planning_attempts||1),repairs:!qa.accept&&qa.repairs.length?1:0,timings:{...initial.timings,targetMs,repairMs:Date.now()-repairStart,planningMs:p.durationMs,qaMs:q.durationMs,totalMs:Date.now()-started}};
  }catch(error){const safe=await fallback();if(!physical(safe).valid||safe.status!=='ok')throw Error('FALLBACK_FAILED');return {layout:{...safe,mode:'DETERMINISTIC_FALLBACK',visualStatus:'UNREVIEWED'},errorCode:error.code||error.message,contractFailure:error.contractFailure,timings:{totalMs:Date.now()-started}};}
}
const api={prepare,validateContext,validatePlan,validateQA,target,follow,physical,repair,exportSVG,run};if(typeof module!=='undefined')module.exports=api;root.Result3Hybrid=api;
})(globalThis);
