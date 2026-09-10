'use strict';
class AIError extends Error { constructor(code,status=502){super(code);this.code=code;this.status=status;} }
function parseContent(content){
  if(typeof content!=='string'||!content.trim())throw new AIError('AI_RESPONSE_EMPTY');
  try{return JSON.parse(content);}catch{throw Object.assign(new AIError('AI_JSON_PARSE_ERROR'),{rawContent:content.slice(0,80000),issues:[{path:'',keyword:'json',reason:content.trim().startsWith('```')?'Markdown fences are not JSON':'Invalid or truncated JSON'}]});}
}
function requestBody(config,messages,schema,name){
  if(!schema)return {model:config.model,messages,stream:false,thinking:{type:'disabled'},response_format:{type:'json_object'},max_tokens:config.maxTokens};
  return {model:config.model,stream:false,store:false,reasoning:{effort:'none'},max_output_tokens:config.maxTokens,
    text:{format:{type:'json_schema',name,schema}},input:messages.map(m=>({role:m.role,content:typeof m.content==='string'?m.content:m.content.map(c=>c.type==='image_url'?{type:'input_image',image_url:c.image_url.url,detail:c.image_url.detail||'low'}:{type:'input_text',text:c.text})}))};
}
async function complete(config,messages,{fetchImpl=fetch,schema,name='result3_composition_plan'}={}) {
  if(!config.apiKey)throw new AIError('AI_CONFIG_MISSING',503);
  try {
    const response=await fetchImpl(schema?config.responsesEndpoint:config.endpoint,{method:'POST',signal:AbortSignal.timeout(config.timeoutMs),headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json'},body:JSON.stringify(requestBody(config,messages,schema,name))});
    if(!response.ok)throw Object.assign(new AIError(response.status===401||response.status===403?'AI_AUTH_ERROR':response.status===429?'AI_RATE_LIMIT':response.status===400?'AI_VISION_ERROR':'AI_MODEL_ERROR',response.status===429?429:502),{httpStatus:response.status});
    const raw=await response.text();if(raw.length>100000)throw new AIError('AI_RESPONSE_INVALID');
    let data;try{data=JSON.parse(raw);}catch{throw new AIError('AI_RESPONSE_INVALID');}
    const content=schema?(data.output||[]).filter(item=>item.type==='message'&&item.role==='assistant').flatMap(item=>item.content||[]).filter(c=>c.type==='output_text').map(c=>c.text).join(''):data.choices?.[0]?.message?.content;
    const finish=schema?data.status:data.choices?.[0]?.finish_reason;
    const responseShape={keys:Object.keys(data),finishReason:finish,contentType:typeof content};
    if(!['completed','stop'].includes(finish))throw Object.assign(new AIError('AI_JSON_PARSE_ERROR'),{rawContent:typeof content==='string'?content.slice(0,80000):'',issues:[{path:'',keyword:'completion',reason:'Provider did not complete the response'}],diagnostics:{responseShape}});
    let value;try{value=parseContent(content);}catch(error){error.diagnostics={responseShape,contentLength:content?.length||0};throw error;}
    return {value,rawContent:content,httpStatus:response.status,usage:data.usage,responseShape,contentLength:content.length};
  }catch(error){if(error instanceof AIError)throw error;throw new AIError(['TimeoutError','AbortError'].includes(error.name)?'AI_TIMEOUT':'AI_NETWORK_ERROR',504);}
}
module.exports={complete,AIError,parseContent,requestBody};
