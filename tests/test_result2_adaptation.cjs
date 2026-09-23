'use strict';
const {test}=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const A=require('../result2-adaptation'),T=require('../tile-layout'),O=require('../optimized-contour'),P=require('../result-pipeline');
const {createHandler}=require('../api/result2'),{AIError}=require('../server/deepseek-client.cjs');
const outer=[[20,20],[380,20],[380,380],[20,380],[20,20]];
const paths=[{id:'outer',role:'outer',points:outer},{id:'structure-0',role:'internal',importance:.2,points:[[60,100],[65,100.3],[75,100],[80,100]]},{id:'structure-1',role:'internal',importance:.9,points:[[60,150],[300,150]]}];
const baseline={status:'ok',canvas:[400,400],paths,contour:outer,internal_lines:paths.slice(1).map(p=>p.points),timings:{},diagnostics:{}};
const source={contour:outer,internal_lines:[...baseline.internal_lines,[[60,220],[300,220]]]};
const context=A.context(source,baseline),edit=(action,pathId,otherId='',toleranceMm=0)=>({action,pathId,otherId,toleranceMm});
test('bounded context and plans reject invented geometry, outer edits and conflicting IDs',()=>{
  assert.ok(A.validateContext(context));
  for(const plan of [{edits:[edit('remove','outer')]},{edits:[edit('remove','unknown')]},{edits:[{...edit('simplify','structure-0'),points:[[1,2]]}]},{edits:[edit('restore','structure-0')]},{edits:[edit('bridge','structure-0','structure-1'),edit('remove','structure-1')]},{edits:[edit('simplify','structure-0','',NaN)]}])assert.throws(()=>A.validatePlan(plan,context));
});
test('AI decisions do not mutate source or outer boundary; remove/simplify/restore are observed-only',()=>{
  const snapshot=JSON.stringify({source,baseline});
  const result=A.apply(source,baseline,{edits:[edit('simplify','structure-0','',.5),edit('restore','observed-2')]});
  assert.equal(result.accepted.length,2);assert.deepEqual(result.result.contour,outer);assert.equal(result.result.paths[1].points.length,2);assert.deepEqual(result.result.paths.at(-1).points,source.internal_lines[2]);assert.equal(JSON.stringify({source,baseline}),snapshot);
  assert.equal(A.apply(source,baseline,{edits:[edit('remove','structure-0')]}).accepted.length,1);
  assert.equal(A.apply(source,baseline,{edits:[edit('remove','structure-1')]}).rejected[0].reason,'IMPORTANT_GEOMETRY');
  assert.equal(A.apply(source,baseline,{edits:[edit('restore','observed-1')]}).accepted.length,0);
});
test('supported bridge joins endpoints, unsupported gaps remain unchanged',()=>{
  const b=structuredClone(baseline);b.paths[1].points=[[60,100],[100,100]];b.paths[2].points=[[104,100],[160,100]];b.internal_lines=b.paths.slice(1).map(p=>p.points);
  const accepted=A.apply(source,b,{edits:[edit('bridge','structure-0','structure-1')]});assert.equal(accepted.accepted.length,1);assert.equal(accepted.result.paths.length,2);assert.equal(accepted.result.paths[1].bridges[0].gap,4);
  b.paths[2].points=[[140,100],[180,100]];assert.equal(A.apply(source,b,{edits:[edit('bridge','structure-0','structure-1')]}).accepted.length,0);
});
test('real physical validation compares retained coverage and stock; final target is exact edited geometry',()=>{
  const candidate=A.apply(source,baseline,{edits:[edit('simplify','structure-0','',.5)]}).result;
  const check=A.assess(baseline,candidate,{format:'40x40',orientation:'auto'});assert.equal(check.accepted,true);
  for(const [format,orientation]of [['40x40','auto'],['30x40','auto'],['30x40','portrait'],['30x40','landscape']]){
    const layout=T.generate(source,{format,orientation,optimizedSource:candidate});assert.ok(T.validate(layout).valid);assert.ok(T.inventory(layout.tiles).valid);assert.deepEqual(layout.target.map(p=>p.points),T.result2Routes(candidate,layout.canvas).routes.map(p=>p.points));
  }
});
test('both physical worker entry points consume supplied Result 2, never regenerate it',()=>{
  for(const file of ['tile-worker.js','result3-worker.js']){
    const replies=[],optimized=structuredClone(baseline);optimized.paths[1].points=[[60,100],[80,100]];
    const scope={importScripts(){},performance,console,self:{postMessage:reply=>replies.push(reply)},OptimizedContour:{...O,generate(){throw Error('RESULT2_REGENERATED');}},TileLayout:{generate(input,options){assert.equal(options.optimizedSource,optimized);return {status:'ok',tiles:[],mode:'test'};}}};
    vm.runInNewContext(fs.readFileSync(file,'utf8'),scope);scope.self.onmessage({data:{id:7,source,optimizedSource:optimized,options:{}}});assert.equal(replies[0].result.status,'ok');
  }
});
const images={source:'data:image/png;base64,YQ==',result2:'data:image/png;base64,YQ=='};
let seq=0;async function call(handler,body,method='POST',headers={}){let response;const req={method,body,headers:{'x-forwarded-for':'result2-test-'+seq++,...headers}},res={setHeader(){},status(code){this.code=code;return this;},json(value){response={status:this.code,value};}};await handler(req,res);return response;}
test('Result 2 API MOCKED success, validation, provider failure, body limits and secret redaction',async()=>{
  const env={DEEPSEEK_RESULT2_ENABLED:'1',DEEPSEEK_API_KEY:'mock-key-not-real'};let calls=0;
  const handler=createHandler({env,completeImpl:async()=>{calls++;return {value:{edits:[]},httpStatus:200};}});
  const good=await call(handler,{context,images});assert.equal(good.status,200);assert.deepEqual(good.value.plan,{edits:[]});assert.ok(!JSON.stringify(good).includes(env.DEEPSEEK_API_KEY));
  assert.equal((await call(handler,'{bad')).status,400);assert.equal((await call(handler,{context,images:{} })).status,400);assert.equal((await call(handler,{},'POST',{'content-length':'1800001'})).status,413);assert.equal((await call(handler,{},'GET')).status,405);assert.equal(calls,1);
  for(const code of ['AI_TIMEOUT','AI_AUTH_ERROR','AI_RATE_LIMIT','AI_NETWORK_ERROR']){const failing=createHandler({env,completeImpl:async()=>{throw new AIError(code,502);}});assert.equal((await call(failing,{context,images})).value.error.code,code);}
  const invalid=createHandler({env,completeImpl:async()=>({value:{edits:[edit('remove','outer')]}})});assert.equal((await call(invalid,{context,images})).value.error.code,'AI_PLAN_INVALID');
  assert.equal((await call(createHandler({env:{}}),{})).value.error.code,'AI_EXPERIMENT_DISABLED');
});
test('automatic pipeline awaits R2 then R3, cancels obsolete completions and recovers',async()=>{
  let release,selects=0,layouts=0,errors=0;const events=[];
  const p=P.create({optimize:()=>new Promise(resolve=>{release=resolve;}),layout:async()=>layouts++,select:()=>selects++,emit:e=>events.push(e),cancelJobs(){},onError(){errors++;}});
  const stale=p.start();p.cancel();release();await stale;assert.equal(layouts,0);assert.equal(selects,0);
  const next=p.start();release();await next;assert.equal(layouts,1);assert.equal(selects,1);assert.equal(errors,0);assert.equal(events.at(-1).pending,false);
  let failing=true;const recovery=P.create({optimize:async()=>{if(failing)throw Error('test');},layout:async()=>layouts++,select:()=>selects++,emit:e=>events.push(e),cancelJobs(){},onError(){errors++;}});await recovery.start();assert.equal(errors,1);assert.equal(events.at(-1).pending,false);failing=false;await recovery.start();assert.equal(selects,2);
});
test('worker cancellation and timeout settle promises and terminate work',async()=>{
  let terminations=0;const original=global.Worker;global.Worker=class {postMessage(){}terminate(){terminations++;}};
  try{const c=new AbortController(),pending=P.worker('mock',{id:1},c.signal,100);c.abort();await assert.rejects(pending,{name:'AbortError'});await assert.rejects(P.worker('mock',{id:2},null,5),/PROCESSING_TIMEOUT/);assert.equal(terminations,2);}finally{global.Worker=original;}
});
test('browser AI adapter MOCKED errors keep deterministic geometry; recovery and abort do not retry',async()=>{
  const original={document:global.document,fetch:global.fetch,Worker:global.Worker,setTimeout:global.setTimeout};let calls=0;
  const ctx={fillRect(){},drawImage(){},scale(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fillText(){}};
  global.document={createElement:()=>({width:768,height:768,getContext:()=>ctx,toDataURL:()=>images.source})};
  global.Worker=class {terminate(){}postMessage(data){queueMicrotask(()=>this.onmessage({data:{id:data.id,result:{...structuredClone(data.baseline),planner:{status:'unchanged'}}}}));}};
  const run=signal=>P.adapt({source,baseline,image:null,options:{format:'40x40'},signal:signal||new AbortController().signal});
  try{
    for(const failure of ['http','json','invalid','network']){
      global.fetch=async()=>{
        calls++;if(failure==='network')throw new TypeError('Failed to fetch');
        return {ok:failure!=='http',status:503,json:async()=>{
          if(failure==='json')throw Error('json');
          return failure==='http'?{error:{code:'AI_EXPERIMENT_DISABLED',requestId:'mock'}}:{plan:{edits:[edit('remove','outer')]}};
        }};
      };
      const final=await run();assert.equal(final.planner.status,'fallback');assert.deepEqual(final.paths,baseline.paths);
    }
    assert.equal(calls,4);
    global.fetch=async()=>{calls++;return {ok:true,status:200,json:async()=>({plan:{edits:[]},requestId:'MOCK_NOT_AI'})};};assert.equal((await run()).planner.status,'unchanged');assert.equal(calls,5);
    global.fetch=(_url,{signal})=>new Promise((resolve,reject)=>signal.addEventListener('abort',()=>reject(Object.assign(Error('cancel'),{name:'AbortError'})),{once:true}));
    const controller=new AbortController(),pending=run(controller.signal);controller.abort();await assert.rejects(pending,{name:'AbortError'});
    global.setTimeout=(fn,ms)=>original.setTimeout(fn,ms===40000?5:ms);assert.equal((await run()).planner.reason,'AI_TIMEOUT');
  }finally{Object.assign(global,original);}
});
test('real DeepSeek Result 2 request (explicit opt-in; never inferred from mocks)',{skip:!(process.env.RUN_DEEPSEEK_INTEGRATION==='1'&&process.env.DEEPSEEK_API_KEY&&process.env.RESULT2_REQUEST_FIXTURE)},async()=>{
  const request=JSON.parse(fs.readFileSync(process.env.RESULT2_REQUEST_FIXTURE,'utf8'));
  const response=await call(createHandler({env:{...process.env,DEEPSEEK_RESULT2_ENABLED:'1'}}),request);assert.equal(response.status,200);A.validatePlan(response.value.plan,request.context);
});
