/* Offline content preparation using the SAME R1 handler and R2 implementation.
 * No external model calls. Run from the project root; PYTHON selects a configured venv.
 * This generates only the specified library photo's cache and shared fingerprint.
 */
'use strict';
const fs=require('node:fs'),path=require('node:path'),crypto=require('node:crypto'),{spawnSync}=require('node:child_process');
const {processingVersion}=require('./library-version.cjs'),library=require('../asset-library'),O=require('../optimized-contour');
process.chdir(path.resolve(__dirname,'..'));
const catalog=library.validateManifest(JSON.parse(fs.readFileSync('library/manifest.json','utf8')));
const asset=catalog.assets.find(a=>a.id===process.argv[2]&&a.type==='photo');
if(!asset)throw Error('Usage: PYTHON=/path/to/python node scripts/prepare-library-photo.cjs <photo-id>');
const canvas=[400,400],version=processingVersion(),source=fs.readFileSync('.'+asset.sourceUrl);
const mime={'.jpg':'image/jpeg','.jpeg':'image/jpeg','.png':'image/png','.webp':'image/webp'}[path.extname(asset.sourceUrl)];
if(!mime||source.length>3*1024*1024)throw Error('Unsupported source type or size');
const result=spawnSync(process.env.PYTHON||'python3',['-c',`
import base64,json,sys
from api.contour import app
with app.test_client() as client:
    response=client.post('/api/contour',json={'image':'data:${mime};base64,'+base64.b64encode(sys.stdin.buffer.read()).decode(),'canvas':[400,400]})
    if response.status_code!=200: raise RuntimeError(response.get_data(as_text=True))
    print(response.get_data(as_text=True))
`],{input:source,maxBuffer:8*1024*1024,timeout:120000});
if(result.status!==0)throw Error(result.stderr?.toString()||result.error?.message||'R1 failed');
const result1=JSON.parse(result.stdout.toString()),result2=O.generate(result1,{canvas});
const bundle={schemaVersion:1,assetId:asset.id,processingVersion:version,sourceSha256:crypto.createHash('sha256').update(source).digest('hex'),canvas,result1,result2};
if(!library.validatePrepared(bundle,{assetId:asset.id,version,sourceHash:bundle.sourceSha256,canvas}))throw Error('Invalid prepared output');
if(Buffer.byteLength(JSON.stringify(bundle))>4*1024*1024)throw Error('Prepared output exceeds the browser cache budget; omit cache for this photo');
fs.writeFileSync('library/processing-version.json',JSON.stringify({schemaVersion:1,processingVersion:version},null,2)+'\n');
fs.writeFileSync(path.join(path.dirname('.'+asset.sourceUrl),'precomputed.json'),JSON.stringify(bundle)+'\n');
console.log({asset:asset.id,canvas,version,r1Paths:result1.dashes.length,r2Paths:result2.paths.length});
