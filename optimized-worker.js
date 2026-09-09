importScripts('tile-layout.js','optimized-contour.js');
self.onmessage=({data})=>{try{self.postMessage({id:data.id,result:OptimizedContour.generate(data.source,{canvas:data.canvas})});}catch(error){console.error('optimized_contour_failure',{requestId:data.requestId,stage:'optimized_geometry',stack:error.stack});self.postMessage({id:data.id,error:{code:'OPTIMIZATION_ERROR'}});}};
