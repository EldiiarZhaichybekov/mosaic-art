'use strict';
class AIError extends Error { constructor(code,status=502){super(code);this.code=code;this.status=status;} }
async function complete(config,messages,{fetchImpl=fetch}={}) {
  if(!config.apiKey)throw new AIError('AI_CONFIG_MISSING',503);
  let response;
  try {
    response=await fetchImpl(config.endpoint,{method:'POST',signal:AbortSignal.timeout(config.timeoutMs),headers:{Authorization:'Bearer '+config.apiKey,'Content-Type':'application/json'},body:JSON.stringify({model:config.model,messages,stream:false,thinking:{type:'disabled'},response_format:{type:'json_object'},max_tokens:config.maxTokens})});
    if(!response.ok)throw Object.assign(new AIError(response.status===401||response.status===403?'AI_AUTH_ERROR':response.status===429?'AI_RATE_LIMIT':response.status===400?'AI_VISION_ERROR':'AI_MODEL_ERROR',response.status===429?429:502),{httpStatus:response.status});
    const raw=await response.text();if(raw.length>100000)throw new AIError('AI_RESPONSE_INVALID');
    let data;try{data=JSON.parse(raw);}catch{throw new AIError('AI_RESPONSE_INVALID');}
    const answer=data.choices?.[0];if(answer?.finish_reason!=='stop'||typeof answer?.message?.content!=='string')throw new AIError('AI_RESPONSE_INVALID');
    try{return {value:JSON.parse(answer.message.content),httpStatus:response.status,usage:data.usage,responseShape:{keys:Object.keys(data),finishReason:answer.finish_reason,contentType:typeof answer.message.content},contentLength:answer.message.content.length};}catch{throw new AIError('AI_RESPONSE_INVALID');}
  }catch(error){if(error instanceof AIError)throw error;throw new AIError(['TimeoutError','AbortError'].includes(error.name)?'AI_TIMEOUT':'AI_NETWORK_ERROR',504);}
}
module.exports={complete,AIError};
