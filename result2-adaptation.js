/* Bounded AI edit vocabulary. Geometry is always derived from observed paths. */
(function(root){
  'use strict';
  const T=typeof module!=='undefined'?require('./tile-layout.js'):root.TileLayout;
  const copy=x=>JSON.parse(JSON.stringify(x)),distance=(a,b)=>Math.hypot(a[0]-b[0],a[1]-b[1]);
  const actions=['remove','restore','simplify','bridge'];
  const schema={type:'object',additionalProperties:false,required:['edits'],properties:{edits:{type:'array',maxItems:12,items:{type:'object',additionalProperties:false,required:['action','pathId','otherId','toleranceMm'],properties:{action:{type:'string',enum:actions},pathId:{type:'string'},otherId:{type:'string'},toleranceMm:{type:'number',minimum:0,maximum:1}}}}}};
  function context(source,baseline){
    if(baseline.paths.length>96)throw Error('AI_INPUT_TOO_COMPLEX');
    const sample=p=>{const m=T.pathModel(p),n=Math.min(32,p.length);return Array.from({length:n},(_,i)=>m.at(m.length*i/(n-1)));};
    const paths=baseline.paths.map(p=>({id:p.id,role:p.role,source:'result2',lengthMm:T.pathModel(p.points).length,points:sample(p.points)}));
    source.internal_lines.map((points,i)=>({id:'observed-'+i,role:'internal',source:'result1',lengthMm:T.pathModel(points).length,points:sample(points)})).filter(p=>p.lengthMm>=10).sort((a,b)=>b.lengthMm-a.lengthMm).slice(0,32).forEach(p=>paths.push(p));
    return {version:1,canvas:baseline.canvas.slice(),paths};
  }
  function validateContext(c){
    if(!c||c.version!==1||!Array.isArray(c.canvas)||c.canvas.length!==2||!c.canvas.every(n=>Number.isFinite(n)&&n>=100&&n<=1000)||!Array.isArray(c.paths)||!c.paths.length||c.paths.length>128)throw Error('AI_INPUT_INVALID');
    const ids=new Set();for(const p of c.paths){if(!p||typeof p.id!=='string'||!/^outer$|^structure-\d+$|^observed-\d+$/.test(p.id)||ids.has(p.id)||!['result1','result2'].includes(p.source)||!['outer','internal'].includes(p.role)||!Number.isFinite(p.lengthMm)||p.lengthMm<0||p.lengthMm>50000||!Array.isArray(p.points)||p.points.length<2||p.points.length>32||!p.points.every(q=>Array.isArray(q)&&q.length===2&&q.every(n=>Number.isFinite(n)&&Math.abs(n)<=10000)))throw Error('AI_INPUT_INVALID');ids.add(p.id);}
    if(!c.paths.some(p=>p.id==='outer'&&p.role==='outer'&&p.source==='result2'))throw Error('AI_INPUT_INVALID');
    return c;
  }
  function validatePlan(plan,c){
    validateContext(c);
    if(!plan||Object.keys(plan).join()!=='edits'||!Array.isArray(plan.edits)||plan.edits.length>12)throw Error('AI_PLAN_INVALID');
    const used=new Set();for(const e of plan.edits){const p=c.paths.find(p=>p.id===e.pathId),other=c.paths.find(p=>p.id===e.otherId);
      if(!e||Object.keys(e).sort().join()!=='action,otherId,pathId,toleranceMm'||!actions.includes(e.action)||!p||p.role==='outer'||!Number.isFinite(e.toleranceMm)||e.toleranceMm<0||e.toleranceMm>1||typeof e.otherId!=='string'||used.has(e.pathId))throw Error('AI_PLAN_INVALID');
      if((e.action==='restore')!==(p.source==='result1')||e.action==='bridge'&&(!other||other.role==='outer'||other.source!=='result2'||other.id===p.id||used.has(other.id))||e.action!=='bridge'&&e.otherId!=='')throw Error('AI_PLAN_INVALID');
      used.add(e.pathId);if(e.action==='bridge')used.add(e.otherId);
    }return copy(plan);
  }
  // Iterative RDP, endpoints retained. A second distance check bounds the new rail.
  function simplify(points,tolerance){
    const keep=new Set([0,points.length-1]),stack=[[0,points.length-1]];
    while(stack.length){const [a,b]=stack.pop(),grid=new T.SegmentGrid([[points[a],points[b]]]);let max=tolerance,index=-1;for(let i=a+1;i<b;i++){const d=grid.distance(points[i]);if(d>max){max=d;index=i;}}if(index>=0){keep.add(index);stack.push([a,index],[index,b]);}}
    return [...keep].sort((a,b)=>a-b).map(i=>points[i].slice());
  }
  const samples=points=>{const m=T.pathModel(points),n=Math.min(5000,Math.max(2,Math.ceil(m.length/.5)+1));return Array.from({length:n},(_,i)=>m.at(m.length*i/(n-1)));};
  function within(a,b,max){const grid=new T.SegmentGrid([b]);return samples(a).every(p=>grid.distance(p)<=max+1e-6);}
  function inside(p,polygon){let yes=false;for(let i=0,j=polygon.length-1;i<polygon.length;j=i++){const a=polygon[i],b=polygon[j];if((a[1]>p[1])!==(b[1]>p[1])&&p[0]<(b[0]-a[0])*(p[1]-a[1])/(b[1]-a[1])+a[0])yes=!yes;}return yes;}
  function apply(source,baseline,plan,c=context(source,baseline)){
    validatePlan(plan,c);const result=copy(baseline),accepted=[],rejected=[];
    const total=baseline.internal_lines.reduce((n,p)=>n+T.pathModel(p).length,0);let removed=0;
    for(const edit of plan.edits){try{
      const path=result.paths.find(p=>p.id===edit.pathId);
      if(edit.action==='remove'){
        const length=T.pathModel(path.points).length;
        if(path.importance>.7||length>60||removed+length>total*.15)throw Error('IMPORTANT_GEOMETRY');
        removed+=length;result.paths=result.paths.filter(p=>p!==path);
      }else if(edit.action==='restore'){
        const points=source.internal_lines[Number(edit.pathId.slice(9))];
        if(!points||T.pathModel(points).length<10||!samples(points).every(p=>inside(p,result.contour)||T.nearestOnPath(p,result.contour).distance<=.5)||result.paths.some(p=>within(points,p.points,1)))throw Error('RESTORE_UNSUPPORTED');
        result.paths.push({id:edit.pathId,role:'internal',origin:'OBSERVED_RESTORED',importance:.5,points:copy(points)});
      }else if(edit.action==='simplify'){
        const points=simplify(path.points,edit.toleranceMm);
        if(!within(points,path.points,1)||!within(path.points,points,1)||T.pathModel(points).length<T.pathModel(path.points).length*.9)throw Error('SHAPE_CHANGE');
        if(JSON.stringify(points)===JSON.stringify(path.points))continue;
        path.points=points;
      }else{
        const other=result.paths.find(p=>p.id===edit.otherId);
        const variants=[false,true].flatMap(a=>[false,true].map(b=>{const first=a?[...path.points].reverse():path.points,second=b?[...other.points].reverse():other.points;return {first,second,gap:distance(first.at(-1),second[0])};})).sort((a,b)=>a.gap-b.gap);
        const {first,second,gap}=variants[0],a=first.at(-1),b=second[0],bridge=[a,b];
        const tangent=(u,v)=>((v[0]-u[0])*(b[0]-a[0])+(v[1]-u[1])*(b[1]-a[1]))/Math.max(1e-9,distance(u,v)*gap);
        if(gap<.2||gap>6||tangent(first.at(-2),a)<.7||tangent(b,second[1])<.7||!samples(bridge).every(p=>inside(p,result.contour))||result.paths.filter(p=>p!==path&&p!==other).some(p=>samples(bridge).some(q=>T.nearestOnPath(q,p.points).distance<.5)))throw Error('BRIDGE_UNSUPPORTED');
        path.points=[...first,...second];path.bridges=[...(path.bridges||[]),{points:copy(bridge),origin:'AI_VALIDATED_BRIDGE',gap}];result.paths=result.paths.filter(p=>p!==other);
      }
      accepted.push(edit);
    }catch(error){rejected.push({pathId:edit.pathId,action:edit.action,reason:error.message});}}
    result.contour=result.paths.find(p=>p.role==='outer').points;result.internal_lines=result.paths.filter(p=>p.role!=='outer').map(p=>p.points);
    return {result,accepted,rejected};
  }
  function assess(baseline,candidate,options){
    const before=T.generate(baseline,{...options,optimizedSource:baseline});
    const after=T.generate(candidate,{...options,optimizedSource:candidate});
    const valid=after.status==='ok'&&after.tiles.length>0&&T.validate(after).valid;
    const retained=baseline.paths.filter(p=>candidate.paths.some(q=>q.id===p.id));
    const reasons=[];if(!valid)reasons.push('PHYSICAL_INVALID');
    if(before.status==='ok'&&after.status==='ok'){
      if(after.metrics.outerCoveragePercent<before.metrics.outerCoveragePercent-1)reasons.push('OUTER_COVERAGE_REGRESSION');
      if(retained.some(p=>(after.metrics.paths[p.id]?.coveragePercent||0)<(before.metrics.paths[p.id]?.coveragePercent||0)-10))reasons.push('RETAINED_PATH_REGRESSION');
    }
    return {accepted:!reasons.length,reasons,before:before.metrics,after:after.metrics};
  }
  const api={schema,context,validateContext,validatePlan,apply,assess};if(typeof module!=='undefined')module.exports=api;root.Result2Adaptation=api;
})(globalThis);
