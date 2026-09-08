importScripts('tile-layout.js');
self.onmessage=event=>{
  try {self.postMessage({id:event.data.id,result:TileLayout.generate(event.data.source,event.data.options)});}
  catch(error){self.postMessage({id:event.data.id,result:{status:'LAYOUT_NOT_FEASIBLE',tiles:[],reason:'OPTIMIZER_ERROR',requestId:event.data.requestId}});console.error('Physical layout failed',{requestId:event.data.requestId,stage:'physical_optimizer',name:error.name,stack:error.stack});}
};
