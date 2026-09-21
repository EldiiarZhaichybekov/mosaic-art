// This is an unbundled static application. Validate its production inputs in place;
// Vercel still builds the existing Python/Node functions and serves the same root.
'use strict';
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),assert=require('node:assert/strict');
const library=require('../asset-library'),{processingVersion}=require('./library-version.cjs');
process.chdir(path.resolve(__dirname,'..'));
const html=fs.readFileSync('index.html','utf8');
for(const [,url]of html.matchAll(/(?:src|href)="([^"?#]+\.(?:js|css))"/g)){if(/^(https?:)?\/\//.test(url))continue;assert.ok(fs.existsSync(url),url);if(url.endsWith('.js'))new vm.Script(fs.readFileSync(url,'utf8'),{filename:url});}
new vm.Script(html.match(/<script>([\s\S]*)<\/script>/)[1],{filename:'index.html inline'});
const catalog=library.validateManifest(JSON.parse(fs.readFileSync('library/manifest.json','utf8')));
for(const asset of catalog.assets)for(const url of [asset.thumbnailUrl,asset.sourceUrl,asset.precomputed?.url].filter(Boolean))assert.ok(fs.existsSync('.'+url),url);
assert.equal(JSON.parse(fs.readFileSync('library/processing-version.json','utf8')).processingVersion,processingVersion(),'Refresh the algorithm fingerprint; stale caches must fall back.');
console.log('PASS static production validation: scripts parse; entry assets, catalog and processing fingerprint valid. No bundling required.');
