const fs = require('node:fs');
const vm = require('node:vm');
const assert = require('node:assert/strict');
const html = fs.readFileSync('index.html', 'utf8');
new Function(html.match(/<script>([\s\S]*)<\/script>/)[1]);
const exported = {module:{exports:{}}};
vm.runInNewContext(html.match(/<script>([\s\S]*)<\/script>/)[1],exported);
const model={contour:[[0,0],[10,0],[10,10]],internal_lines:[[[2,2],[8,8]]]};
const paths=exported.module.exports.finalLineArt(model);
model.refined={status:'ok',indices:[]};
const refined=exported.module.exports.finalLineArt(model,'refined');
assert.equal(refined.length,1);
assert.deepEqual(refined[0],paths[0]);
assert.equal((exported.module.exports.exportDashesSVG(refined,400,400).match(/<path /g)||[]).length,1);
assert.equal(paths.length,2);
assert.deepEqual(paths[0][paths[0].length-1],model.contour[0]);
assert.equal(paths[1],model.internal_lines[0]);
const svg=exported.module.exports.exportDashesSVG(paths,400,400);
assert.equal((svg.match(/<path /g)||[]).length,2);
assert.ok(svg.includes('2.000,2.000 L 8.000,8.000'));
const source = html.slice(html.indexOf('const MAX_CONTOUR_UPLOAD_BYTES'), html.indexOf('\nfunction draw(rects'));
let response;
const context = vm.createContext({crypto: require('node:crypto').webcrypto, AbortController,
  setTimeout, clearTimeout, FileReader: class { readAsDataURL() { this.result = 'data:image/png;base64,AA=='; this.onload(); } },
  fetch: async () => { if (response instanceof Error) throw response; return response; }});
vm.runInContext(source + '\nglobalThis.requestContour = fetchServerDashes;', context);
const call = () => context.requestContour({size:10, type:'image/png'}, 400,400);
(async () => {
  for (const [status, code] of [[413,'IMAGE_TOO_LARGE'],[504,'PROCESSING_TIMEOUT'],[500,'HTTP_ERROR']]) {
    response = {status,ok:false,headers:new Map(),json:async()=>{throw new SyntaxError('HTML')}};
    await assert.rejects(call, e => e.code === code);
  }
  response = {status:200,ok:true,headers:new Map(),json:async()=>null};
  await assert.rejects(call, e=>e.code==='INVALID_RESPONSE');
  response.json = async()=>{const e=new Error();e.name='AbortError';throw e};
  await assert.rejects(call,e=>e.code==='PROCESSING_TIMEOUT');
  response = new TypeError('Failed to fetch');
  await assert.rejects(call,e=>e.code==='NETWORK_ERROR');
  response = new Error('Unexpected client failure');
  await assert.rejects(call,e=>e.code==='CLIENT_ERROR');
  await assert.rejects(()=>context.requestContour({size:4e6},400,400),e=>e.code==='IMAGE_TOO_LARGE');
  response = {status:200,ok:true,headers:new Map(),json:async()=>({dashes:[[[0,0],[1,1]]],contour:[[0,0],[1,1],[0,1]],internal_lines:[[[.2,.2],[.8,.8]]]})};
  assert.equal((await call()).dashes.length,1);
  const oldJson=response.json;
  response.json=async()=>({...await oldJson(),refined:{status:'ok',indices:[999]}});
  assert.equal((await call()).refined.status,'unavailable');
  for (const code of ['NO_FOREGROUND','NO_VALID_CONTOUR','INVALID_IMAGE','RESOURCE_LIMIT','OPENCV_ERROR']) {
    response={status:422,ok:false,headers:new Map(),json:async()=>({error:{code}})};
    await assert.rejects(call,e=>e.code===code);
  }
  console.log('Client: HTTP, JSON, body abort, network, size and recovery passed');
})().catch(e=>{console.error(e);process.exitCode=1});
