'use strict';
const assert=require('node:assert/strict'),handler=require('../api/result3');
const previousFetch=global.fetch,oldKey=process.env.DEEPSEEK_API_KEY,oldEnabled=process.env.DEEPSEEK_RESULT3_ENABLED;
const context={version:1,canvas:[400,400],paths:[{id:'r2_0',source:'result2',role:'outer',points:[[.1,.1],[.9,.9]]}]};
const plan={version:1,objectAnalysis:'fixture',essentialFeatures:[],globalIntent:'test',complexityBudget:30,routes:[{id:'outer',role:'outer',priority:1,sourcePathIds:['r2_0'],source:'result2',strategy:'FOLLOW',viaAnchors:[],reason:''}],omissions:[]};
const images={source:'data:image/png;base64,YQ==',result2:'data:image/png;base64,YQ=='};
let seq=0;
function call(body,method='POST',headers={}){return new Promise((resolve,reject)=>{const req={method,body,headers:{'x-forwarded-for':'test-'+seq++,...headers}},res={setHeader(){},status(s){this.code=s;return this;},json(value){resolve({status:this.code,value});}};Promise.resolve(handler(req,res)).catch(reject);});}
(async()=>{
  process.env.DEEPSEEK_RESULT3_ENABLED='1';process.env.DEEPSEEK_API_KEY='test-placeholder-not-a-real-key';
  global.fetch=async()=>({ok:true,status:200,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:JSON.stringify(plan)}}]})});
  let response=await call({phase:'plan',context,images});assert.equal(response.status,200);assert.deepEqual(response.value.value,plan);assert.ok(response.value.requestId);assert.ok(!JSON.stringify(response.value).includes(process.env.DEEPSEEK_API_KEY));
  assert.equal((await call('{bad json')).status,400);
  assert.equal((await call({phase:'unknown',context,images})).status,400);
  assert.equal((await call({phase:'plan',context,images:{}})).status,400);
  assert.equal((await call({},'POST',{'content-length':'2300001'})).status,413);
  assert.equal((await call({},'GET')).status,405);
  global.fetch=async()=>({ok:false,status:401});response=await call({phase:'plan',context,images});assert.equal(response.value.error.code,'AI_AUTH_ERROR');assert.equal(response.status,502);
  global.fetch=async()=>({ok:true,status:200,text:async()=>JSON.stringify({choices:[{finish_reason:'stop',message:{content:'{"arbitrary":"svg"}'}}]})});response=await call({phase:'plan',context,images});assert.equal(response.value.error.code,'AI_PLAN_INVALID');
  delete process.env.DEEPSEEK_API_KEY;assert.equal((await call({})).value.error.code,'AI_CONFIG_MISSING');
  process.env.DEEPSEEK_RESULT3_ENABLED='0';assert.equal((await call({})).value.error.code,'AI_EXPERIMENT_DISABLED');
  console.log('PASS Result 3 API: mocked success, redacted response, validation, body limits, auth, missing configuration, rollout gate');
})().catch(error=>{console.error(error);process.exitCode=1;}).finally(()=>{global.fetch=previousFetch;if(oldKey===undefined)delete process.env.DEEPSEEK_API_KEY;else process.env.DEEPSEEK_API_KEY=oldKey;if(oldEnabled===undefined)delete process.env.DEEPSEEK_RESULT3_ENABLED;else process.env.DEEPSEEK_RESULT3_ENABLED=oldEnabled;});
