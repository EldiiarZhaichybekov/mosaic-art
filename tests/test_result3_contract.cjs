'use strict';
const assert=require('node:assert/strict'),C=require('../result3-contract'),{parseContent,requestBody}=require('../server/deepseek-client.cjs'),{generate}=require('../server/result3-planner.cjs');
const context={paths:[{id:'r2_0',source:'result2',role:'outer',points:[[0,0],[1,1]]}],version:1,canvas:[400,400]},valid=C.example(context),clone=v=>JSON.parse(JSON.stringify(v));
const check=(name,fn)=>{fn();console.log('PASS',name);};
check('valid composition',()=>assert.deepEqual(C.plan(valid,context),valid));
check('captured production evidence contains completed JSON and precise constraint errors',()=>{const observed=require('./fixtures/deepseek-schema-failure.json');assert.equal(observed.code,'AI_SCHEMA_INVALID');assert.equal(observed.diagnostics.responseShape.finishReason,'stop');assert.ok(observed.issues.some(e=>e.path==='/objectAnalysis'&&e.actualLength===415));assert.ok(observed.issues.some(e=>e.path.endsWith('/priority')&&e.actual===2));});
check('exact schema transmitted equals the locally validated schema',()=>{const request=requestBody({model:'test',maxTokens:10},[{role:'user',content:'JSON'}],C.planSchema,'result3_composition_plan');assert.equal(request.text.format.type,'json_schema');assert.strictEqual(request.text.format.schema,C.planSchema);assert.deepEqual(C.validate(request.text.format.schema,valid),[]);});
for(const [name,mutate,path]of [
 ['missing routes',v=>delete v.routes,'/routes'],['invalid enum',v=>v.routes[0].role='skeleton','/routes/0/role'],['null field',v=>v.routes[0].viaAnchors=null,'/routes/0/viaAnchors'],['extra property',v=>v.extra=true,'/extra'],['numeric string',v=>v.routes[0].priority='1','/routes/0/priority'],['wrong wrapper',v=>{v.plan=v.routes;delete v.routes;},'/routes']])check(name,()=>{const v=clone(valid);mutate(v);assert.ok(C.validate(C.planSchema,v).some(e=>e.path===path));});
check('unknown source ID has semantic error and exact path',()=>{const v=clone(valid);v.routes[0].sourcePathIds=['r2_999'];assert.throws(()=>C.plan(v,context),e=>e.code==='AI_UNKNOWN_PATH_ID'&&e.issues[0].path==='/routes/0/sourcePathIds/0');});
check('duplicate route IDs rejected semantically',()=>{const v=clone(valid);v.routes.push(clone(v.routes[0]));assert.throws(()=>C.plan(v,context),{code:'AI_PLAN_SEMANTIC_INVALID'});});
check('empty content',()=>assert.throws(()=>parseContent('  '),{code:'AI_RESPONSE_EMPTY'}));
check('fenced JSON is diagnosed, not silently stripped',()=>assert.throws(()=>parseContent('```json\n{}\n```'),e=>e.code==='AI_JSON_PARSE_ERROR'&&e.issues[0].reason.includes('Markdown')));
check('truncated JSON',()=>assert.throws(()=>parseContent('{"routes":['),{code:'AI_JSON_PARSE_ERROR'}));
check('sanitized replay of observed production mismatches',()=>{const v=clone(valid);v.objectAnalysis='x'.repeat(415);v.routes[0].priority=2;v.omissions=['x'.repeat(76)];const errors=C.validate(C.planSchema,v);assert.ok(errors.some(e=>e.path==='/objectAnalysis'&&e.actualLength===415));assert.ok(errors.some(e=>e.path==='/routes/0/priority'&&e.actual===2));assert.ok(errors.some(e=>e.path==='/omissions/0'&&e.actualLength===76));});
(async()=>{
let calls=0;const bad=clone(valid);bad.routes[0].priority=2;
const result=await generate({timeoutMs:30000},[{role:'user',content:'original image omitted in fixture'}],{phase:'plan',context},{transport:async(config,messages,options)=>{calls++;assert.strictEqual(options.schema,C.planSchema);if(calls===2){assert.ok(!JSON.stringify(messages).includes('image_url'));assert.ok(JSON.stringify(messages).includes('/routes/0/priority'));assert.equal(config.timeoutMs,10000);}return {value:calls===1?bad:valid,rawContent:JSON.stringify(bad)};}});
assert.equal(calls,2);assert.equal(result.planning_attempts,2);assert.deepEqual(result.value,valid);
calls=0;await assert.rejects(()=>generate({},[],{phase:'plan',context},{transport:async()=>{calls++;return {value:bad,rawContent:JSON.stringify(bad)};}}),{code:'AI_SCHEMA_INVALID'});assert.equal(calls,2);
calls=0;const unknown=clone(valid);unknown.routes[0].sourcePathIds=['absent'];await assert.rejects(()=>generate({},[],{phase:'plan',context},{transport:async()=>{calls++;return {value:unknown};}}),{code:'AI_UNKNOWN_PATH_ID'});assert.equal(calls,1);
console.log('PASS one text-only correction, second failure stops, semantic failures never retry');
})().catch(error=>{console.error(error);process.exitCode=1;});
