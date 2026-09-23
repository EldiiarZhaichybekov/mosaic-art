importScripts('tile-layout.js','result2-adaptation.js');
self.onmessage=({data})=>{
  try{
    const started=performance.now(),applied=Result2Adaptation.apply(data.source,data.baseline,data.plan,data.context);
    const check=applied.accepted.length?Result2Adaptation.assess(data.baseline,applied.result,data.options):null;
    const result=check?.accepted?applied.result:data.baseline;
    result.planner={status:check?.accepted?'accepted':applied.accepted.length?'fallback':applied.rejected.length?'fallback':'unchanged',geometryPolicy:'OBSERVED_PATH_EDITS',accepted:check?.accepted?applied.accepted:[],rejected:applied.rejected,physicalCheck:check,localRepairPasses:applied.rejected.length?1:0};
    result.timings.adaptationMs=performance.now()-started;
    self.postMessage({id:data.id,result});
  }catch(error){self.postMessage({id:data.id,error:{code:'AI_PLAN_INVALID'}});console.warn('result2_adaptation_failed',{requestId:data.requestId,stack:error.stack});}
};
