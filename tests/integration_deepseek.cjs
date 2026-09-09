// Explicit live opt-in. No secret loading or logging; no fake latency.
'use strict';
const config=require('../server/deepseek-config.cjs')(),{complete}=require('../server/deepseek-client.cjs');
if(process.env.RUN_DEEPSEEK_INTEGRATION!=='1'||!config.apiKey){console.log('SKIP real DeepSeek: requires RUN_DEEPSEEK_INTEGRATION=1 and securely supplied DEEPSEEK_API_KEY');process.exit(0);}
(async()=>{const started=Date.now();const result=await complete(config,[{role:'system',content:'Return JSON only: {"ok":true}.'},{role:'user',content:'Check API connectivity. Return JSON.'}]);if(result.value.ok!==true)throw Error('LIVE_RESPONSE_INVALID');console.log(JSON.stringify({live:true,model:config.model,durationMs:Date.now()-started,httpStatus:result.httpStatus,scope:'connectivity only; NOT visual composition verification'}));})().catch(error=>{console.error({code:error.code||'LIVE_TEST_FAILED'});process.exitCode=1;});
