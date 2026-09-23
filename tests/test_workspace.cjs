'use strict';
const fs=require('node:fs'),assert=require('node:assert/strict'),crypto=require('node:crypto');
require('../workspace-i18n');
require('../workspace-refinement');
const messages=globalThis.WorkspaceMessages;
assert.deepEqual(Object.keys(messages.ru).sort(),Object.keys(messages.en).sort());
assert.deepEqual(Object.keys(messages.ru).sort(),Object.keys(messages.zh).sort());
const js=fs.readFileSync('workspace.js','utf8');
for(const [,key]of js.matchAll(/\b(?:text|tr)\('([^']+)'\)/g))for(const lang of ['ru','en','zh'])assert.ok(messages[lang]['ws.'+key],lang+':'+key);
for(const file of ['workspace.js','workspace-i18n.js','workspace-refinement.js','tile-ui.js','optimized-ui.js'])new Function(fs.readFileSync(file,'utf8'));
const refinement=fs.readFileSync('workspace-refinement.js','utf8');
for(const [,key]of refinement.matchAll(/\btr\('([^']+)'\)/g))for(const lang of ['ru','en','zh'])assert.ok(messages[lang]['ux.'+key],lang+':'+key);
assert.ok(!refinement.includes('fetch(')&&!refinement.includes('new Worker('));
assert.ok(!js.includes('fetch('),'workspace must not call processing APIs independently');
assert.ok(!js.includes('new Worker('),'workspace must not duplicate workers');
for(const [file,hash]of Object.entries({
 'tile-layout.js':'558b50a2ba1446f5e800db2c3abf1317fd59720abd5ed61b07265687373649e5',
 'result3-hybrid.js':'f0cfbd1697c48abc17f36ada0023f38e568f04d10177079e2ccfd9245be47422',
 'result3-contract.js':'8f2e6e4e4d813410b1c2101cdee10576406fe2ccbdf0035f7936417b8114e7c6',
 'server/deepseek-config.cjs':'4dd469e3e0b5a974cd9d960ef257e9447f05cb6e9d37bc41790ca2754fbb0f1e',
 'server/deepseek-client.cjs':'4d431c3ad49667fb4b0c40e71c01aa7bdb0b3c01192ad3e415c55130698bd71f',
 'server/result3-prompts.cjs':'a0cc8e534819b92dcafb1719a1985d0dec48e758ae0f8813275ead266aad253e'
}))assert.equal(crypto.createHash('sha256').update(fs.readFileSync(file)).digest('hex'),hash,file+' changed outside the authorized Result 3 guarantee');
console.log('PASS workspace syntax, RU/EN/ZH, no duplicate computation, authorized Result 3 solver and frozen hybrid/DeepSeek');
