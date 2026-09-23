/* Result 3 experimental entry point. Result 2 is the immutable rail here too. */
importScripts('tile-layout.js','optimized-contour.js');
self.onmessage=({data})=>{
  const {id,source,options,sourceCanvas,requestId}=data,started=performance.now();
  try{
    const optimized=OptimizedContour.generate(source,{canvas:sourceCanvas}),layout=TileLayout.generate(source,{...options,optimizedSource:optimized});
    layout.hybridDiagnostics={geometryPolicy:'IMMUTABLE_RESULT2',aiGeometryPlanning:false,timings:{totalMs:performance.now()-started}};
    console.info('result3_complete',{requestId,mode:layout.mode,targetPolicy:layout.targetPolicy,tiles:layout.tiles.length,metrics:layout.metrics,timings:layout.timings});
    self.postMessage({id,result:layout});
  }catch(error){
    console.error('result3_failure',{requestId,stage:'result2_rail',name:error.name,stack:error.stack});
    self.postMessage({id,result:{status:'LAYOUT_NOT_FEASIBLE',tiles:[],target:[],reason:error.message,targetPolicy:'IMMUTABLE_RESULT2'}});
  }
};
