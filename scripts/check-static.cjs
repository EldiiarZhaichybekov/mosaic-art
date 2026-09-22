// This is an unbundled static application. Validate its production inputs in place;
// Vercel still builds the existing Python/Node functions and serves the same root.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict'),crypto=require('node:crypto');
const library=require('../asset-library'),{processingVersion}=require('./library-version.cjs');
process.chdir(path.resolve(__dirname,'..'));
const html=fs.readFileSync('index.html','utf8');
for(const [,url]of html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)){if(/^(https?:)?\/\//.test(url))continue;assert.ok(fs.existsSync(url),url);if(url.endsWith('.js'))new vm.Script(fs.readFileSync(url,'utf8'),{filename:url});}
new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1],{filename:'index.html inline'});
const catalog=library.validateManifest(JSON.parse(fs.readFileSync('library/manifest.json','utf8')));
for(const asset of catalog.assets)for(const url of [asset.thumbnailUrl,asset.sourceUrl,asset.precomputed?.url].filter(Boolean))assert.ok(fs.existsSync('.'+url),url);
assert.equal(JSON.parse(fs.readFileSync('library/processing-version.json','utf8')).processingVersion,processingVersion(),'Refresh the algorithm fingerprint; stale caches must fall back.');
const result3=JSON.parse(fs.readFileSync('library/result3-validation.json','utf8')),manifestHash=crypto.createHash('sha256').update(fs.readFileSync('library/manifest.json')).digest('hex');
assert.equal(result3.solverVersion,require('../tile-layout').version,'Result 3 validation report must use the production solver.');
assert.equal(result3.manifestSha256,manifestHash,'Every active library asset must be revalidated after catalog changes.');
assert.equal(result3.summary.assets,catalog.assets.length);assert.equal(result3.summary.failed,0);assert.equal(result3.assets.length,catalog.assets.length);
assert.deepEqual(new Set(result3.assets.map(a=>a.id)),new Set(catalog.assets.map(a=>a.id)));assert.ok(result3.assets.every(a=>a.status==='pass'&&a.canvases.length===3&&a.canvases.every(c=>c.status==='pass')));
console.log('PASS static production validation: scripts parse; catalog, processing fingerprint and Result 3 readiness report are current.');
