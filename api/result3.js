'use strict';
const configuration=require('../server/deepseek-config.cjs');
const {complete,AIError}=require('../server/deepseek-client.cjs');
const prompts=require('../server/result3-prompts.cjs');
const H=require('../result3-hybrid.js');
const {randomUUID}=require('node:crypto');
const recent=new Map();
function image(value){
  if(typeof value!=='string'||value.length>700000||!/^data:image\/(png|jpeg);base64,[A-Za-z0-9+/]+=*$/.test(value))throw new AIError('IMAGE_INVALID',400);
  return {type:'image_url',image_url:{url:value,detail:'low'}};
}
function messages(body){
  H.validateContext(body.context);if(!['plan','qa'].includes(body.phase))throw new AIError('REQUEST_INVALID',400);
  const content=[{type:'text',text:'Original source image'},image(body.images?.source),{type:'text',text:'Result 2 optimized geometry'},image(body.images?.result2)];
  if(body.phase==='plan'&&body.images?.pathMap)content.push({type:'text',text:'Technical numbered Result 1 and Result 2 path map'},image(body.images.pathMap));
  if(body.phase==='qa'){H.validatePlan(body.plan,body.context);content.push({type:'text',text:'Actual physical layout for visual review'},image(body.images?.review));}
  content.push({type:'text',text:JSON.stringify({context:body.context,...(body.phase==='qa'?{plan:body.plan}:{})})});
  return [{role:'system',content:prompts[body.phase]},{role:'user',content}];
}
module.exports=async function handler(req,res){
  const requestId=randomUUID(),began=Date.now(),config=configuration();let phase='request',modelStatus=null;
  res.setHeader('X-Request-ID',requestId);res.setHeader('Cache-Control','no-store');
  try{
    if(req.method!=='POST')throw new AIError('METHOD_NOT_ALLOWED',405);
    // Experimental gate: do not turn a newly deployed paid API into a public
    // default before visual quality and account configuration are verified.
    if(!config.enabled)throw new AIError('AI_EXPERIMENT_DISABLED',503);
    if(!config.apiKey)throw new AIError('AI_CONFIG_MISSING',503);
    if(Number(req.headers['content-length']||0)>2300000)throw new AIError('IMAGE_TOO_LARGE',413);
    let body=req.body;
    if(body===undefined){let raw='';for await(const chunk of req){raw+=chunk;if(Buffer.byteLength(raw)>2300000)throw new AIError('IMAGE_TOO_LARGE',413);}body=raw;}
    if(typeof body==='string'){if(Buffer.byteLength(body)>2300000)throw new AIError('IMAGE_TOO_LARGE',413);try{body=JSON.parse(body);}catch{throw new AIError('REQUEST_INVALID',400);}}
    if(!body||Buffer.byteLength(JSON.stringify(body))>2300000)throw new AIError('IMAGE_TOO_LARGE',413);
    // Best-effort per-instance burst protection, not a distributed quota.
    const ip=String(req.headers['x-forwarded-for']||req.socket?.remoteAddress||'unknown').split(',')[0],now=Date.now();
    for(const [key,value]of recent)if(now-value.start>60000)recent.delete(key);
    const quota=recent.get(ip)||{start:now,count:0};if(quota.count>=12)throw new AIError('AI_RATE_LIMIT',429);quota.count++;recent.set(ip,quota);
    phase='input_validation';let input;try{input=messages(body);}catch(error){throw error instanceof AIError?error:new AIError('PLAN_INVALID',400);}
    phase=body.phase;const result=await complete(config,input);modelStatus=result.httpStatus;
    phase='response_validation';let value;try{value=body.phase==='plan'?H.validatePlan(result.value,body.context):H.validateQA(result.value,body.plan);}catch{throw new AIError('AI_PLAN_INVALID');}
    const durationMs=Date.now()-began;
    console.info(JSON.stringify({event:'result3_ai_complete',requestId,phase:body.phase,model:config.model,httpStatus:modelStatus,inputPaths:body.context.paths.length,routes:value.routes?.length,restored:value.routes?.filter(r=>r.source==='result1-restored').length,omitted:value.omissions?.length,durationMs}));
    res.status(200).json({value,requestId,durationMs});
  }catch(error){const code=error.code||'INTERNAL_ERROR',status=error.status||500;console.error(JSON.stringify({event:'result3_ai_failed',requestId,phase,code,httpStatus:error.httpStatus||modelStatus,durationMs:Date.now()-began,...(error instanceof AIError?{stack:error.stack}:{})}));res.status(status).json({error:{code,requestId}});}
};
module.exports.messages=messages;
