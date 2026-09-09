/* Result 2: deterministic vector abstraction. No tile placement or AI drawing. */
(function(root){
  'use strict';
  const G=typeof module!=='undefined'?require('./tile-layout.js'):root.TileLayout;
  const validPath=p=>Array.isArray(p)&&p.length>=2&&p.every(q=>Array.isArray(q)&&q.length===2&&q.every(Number.isFinite));
  function validatePlan(plan,ids){
    if(!plan||typeof plan!=='object'||Array.isArray(plan))throw Error('INVALID_PLAN');
    const allowed=new Set(['keepPaths','removePaths','mergeGroups','continuations','symmetryPairs','importance']);
    if(Object.keys(plan).some(k=>!allowed.has(k)))throw Error('INVALID_PLAN_FIELD');
    const known=new Set(ids),list=a=>Array.isArray(a)&&a.length<=ids.length&&a.every(id=>Number.isInteger(id)&&known.has(id));
    for(const k of ['keepPaths','removePaths'])if(plan[k]!==undefined&&!list(plan[k]))throw Error('INVALID_PLAN_IDS');
    if((plan.keepPaths||[]).some(id=>(plan.removePaths||[]).includes(id)))throw Error('CONFLICTING_PLAN');
    for(const k of ['mergeGroups','continuations','symmetryPairs'])if(plan[k]!==undefined&&(!Array.isArray(plan[k])||plan[k].length>ids.length||!plan[k].every(a=>list(a)&&a.length>=2&&new Set(a).size===a.length)))throw Error('INVALID_PLAN_RELATION');
    if(plan.importance!==undefined&&(!plan.importance||typeof plan.importance!=='object'||Object.entries(plan.importance).some(([id,v])=>!known.has(Number(id))||!Number.isFinite(v)||v<0||v>1)))throw Error('INVALID_PLAN_IMPORTANCE');
    return JSON.parse(JSON.stringify(plan));
  }
  // Extension point for a server-side semantic planner. It receives numbered
  // paths and returns decisions ONLY; never credentials or arbitrary points.
  async function requestPlan(graph,provider){if(!provider)return {status:'disabled',plan:null};try{return {status:'ok',plan:validatePlan(await provider(graph),graph.paths.map(p=>p.id))};}catch(error){return {status:'fallback',plan:null,reason:error.message};}}
  function generate(source,{canvas=[400,400],plan=null}={}){
    const start=Date.now();if(!validPath(source?.contour)||!Array.isArray(source.internal_lines)||!source.internal_lines.every(validPath))throw Error('INVALID_OPTIMIZED_INPUT');
    const xs=source.contour.map(p=>p[0]),ys=source.contour.map(p=>p[1]),size=Math.max(Math.max(...xs)-Math.min(...xs),Math.max(...ys)-Math.min(...ys));
    if(!(size>0))throw Error('INVALID_OPTIMIZED_INPUT');
    // Normalize only for scale-relative structural decisions; restore the
    // original coordinate system for every preview/export. No physical fit.
    const scale=361/size,to=p=>p.map(v=>v*scale),from=p=>p.map(v=>v/scale);
    const contour=source.contour.map(to),input=source.internal_lines.map(p=>p.map(to)),candidateStart=Date.now();
    const graph={version:1,paths:input.map((points,id)=>({id,points,length:G.pathModel(points).length}))};
    const candidateMs=Date.now()-candidateStart;
    const assembled=G.buildStructures(input,contour,{minLength:14,minExtent:10,smallLoop:0,simplification:.4});
    let decision=null,plannerStatus='disabled';if(plan){try{decision=validatePlan(plan,graph.paths.map(p=>p.id));plannerStatus='validated';}catch(error){plannerStatus='rejected';}}
    const selectionStart=Date.now(),kept=[],rejected=[...assembled.rejected];
    const candidates=assembled.paths.slice().sort((a,b)=>b.extentMm-a.extentMm||b.lengthMm-a.lengthMm);
    for(const path of candidates){
      const model=G.pathModel(path.points),samples=Array.from({length:24},(_,i)=>model.at(model.length*i/23)),xs=path.points.map(p=>p[0]),ys=path.points.map(p=>p[1]),width=Math.max(...xs)-Math.min(...xs),height=Math.max(...ys)-Math.min(...ys),chord=Math.hypot(...path.points[0].map((v,k)=>v-path.points.at(-1)[k]));
      const loopGrid=new G.SegmentGrid([path.points]);
      const attached=candidates.some(other=>other!==path&&other.extentMm>35&&[other.points[0],other.points.at(-1)].some(p=>loopGrid.distance(p)<1.2));
      const compactLoop=!attached&&chord/Math.max(1,model.length)<.15&&Math.min(width,height)>0&&Math.max(width,height)/Math.min(width,height)<2.3&&path.extentMm<45;
      const center=model.at(model.length/2),direction=G.nearestOnPath(center,path.points).angle;
      const hatch=path.lengthMm<25&&candidates.filter(other=>{if(other===path||other.lengthMm>=25)return false;const m=G.pathModel(other.points),c=m.at(m.length/2),angle=G.nearestOnPath(c,other.points).angle;return Math.hypot(c[0]-center[0],c[1]-center[1])<15&&Math.abs(Math.cos((angle-direction)*Math.PI/180))>.9;}).length>=2;
      // Suppress nearly coincident evidence without erasing nearby major
      // parallel divisions. Check support over the whole path, not one point.
      const duplicate=kept.some(p=>p.lengthMm>=path.lengthMm*.8&&samples.filter(q=>p.grid.distance(q)<1).length/samples.length>.88);
      const removed=decision&&path.ids.every(id=>(decision.removePaths||[]).includes(id));
      if(compactLoop||hatch||duplicate||removed){rejected.push({...path,reason:compactLoop?'COMPACT_MICRO_LOOP':hatch?'REPEATED_SHORT_HATCH':duplicate?'REDUNDANT_PATH':'PLANNER_REMOVE'});continue;}
      kept.push({...path,grid:new G.SegmentGrid([path.points]),continuityScore:Math.min(1,path.extentMm/Math.max(1,path.lengthMm)),importance:Math.min(1,path.extentMm/80)*(1+.15*path.mirrorSupport)});
    }
    // Plan merge/continuation/symmetry suggestions cannot bypass assembly's
    // geometric checks. Existing accepted continuations are the only geometry.
    const convert=p=>{const {grid,lengthMm,extentMm,tileCost,score,structuralValue,...metadata}=p;return {...metadata,points:p.points.map(from),length:lengthMm/scale,extent:extentMm/scale,importance:p.importance??Math.min(1,extentMm/80),continuityScore:p.continuityScore??extentMm/Math.max(1,lengthMm),bridges:p.bridges.map(b=>({...b,points:b.points.map(from),gap:b.gapMm/scale}))};};
    const internal=kept.map(convert),outer=G.simplifyClosed(source.contour,size*.0007);
    if(outer[0].some((v,k)=>v!==outer.at(-1)[k]))outer.push(outer[0].slice());
    const paths=[{id:'outer',role:'outer',origin:'OBSERVED',points:outer},...internal.map((p,i)=>({...p,id:'structure-'+i,role:'internal'}))];
    return {status:'ok',version:'optimized-vector-v1',canvas:canvas.slice(),paths,contour:outer,internal_lines:internal.map(p=>p.points),planner:{status:plannerStatus,geometryPolicy:'VALIDATED_EXISTING_GEOMETRY_ONLY'},diagnostics:{input:source.internal_lines,merged:assembled.paths.map(convert),rejected:rejected.map(convert),symmetry:assembled.symmetry},timings:{candidateMs,...assembled.timings,selectionMs:Date.now()-selectionStart,totalMs:Date.now()-start}};
  }
  function assertResult(result){if(result?.status!=='ok'||!Array.isArray(result.paths)||!result.paths.every(p=>validPath(p.points))||!Array.isArray(result.canvas)||result.canvas.length!==2||!result.canvas.every(v=>Number.isFinite(v)&&v>0))throw Error('INVALID_OPTIMIZED_RESULT');}
  function exportSVG(result){assertResult(result);const [w,h]=result.canvas;return `<svg xmlns="http://www.w3.org/2000/svg" width="${w}mm" height="${h}mm" viewBox="0 0 ${w} ${h}">\n<rect width="${w}" height="${h}" fill="white"/>\n`+result.paths.map(p=>`<path d="M ${p.points.map(q=>q.join(',')).join(' L ')}" fill="none" stroke="#111827" stroke-width="0.45" stroke-linecap="round" stroke-linejoin="round"/>`).join('\n')+'\n</svg>';}
  function asPhysicalInput(result){assertResult(result);return {contour:result.contour.map(p=>p.slice()),internal_lines:result.internal_lines.map(p=>p.map(q=>q.slice()))};}
  const api={generate,exportSVG,assertResult,validatePlan,requestPlan,asPhysicalInput};if(typeof module!=='undefined')module.exports=api;root.OptimizedContour=api;
})(globalThis);
