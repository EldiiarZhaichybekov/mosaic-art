'use strict';
// Offline edit-application regression, explicitly NOT DeepSeek quality evidence.
const fs=require('node:fs'),path=require('node:path'),assert=require('node:assert/strict');
const A=require('../result2-adaptation'),O=require('../optimized-contour'),T=require('../tile-layout');
const fixtures=require('../tests/fixtures/optimized-cases.json');
const directory='/private/tmp/prismosaic-result2-regression';fs.mkdirSync(directory,{recursive:true});
const records=[];let html='<meta charset="utf-8"><title>Result 2 offline regression — NOT AI results</title><style>body{font:14px system-ui;margin:24px}article{display:grid;grid-template-columns:repeat(4,minmax(0,1fr));gap:12px}svg{width:100%;height:auto;border:1px solid #ddd}pre{white-space:pre-wrap} @media(max-width:700px){article{grid-template-columns:repeat(2,minmax(0,1fr))}}</style><h1>Result 2 offline edit regression</h1><p>Synthetic simplify decisions, not DeepSeek responses. This validates geometry preservation and physical rails, not AI visual judgment.</p>';
for(const [name,source]of Object.entries(fixtures)){
  const baseline=O.generate(source),plan={edits:baseline.paths.filter(p=>p.role==='internal').slice(0,4).map(p=>({action:'simplify',pathId:p.id,otherId:'',toleranceMm:.6}))};
  const applied=A.apply(source,baseline,plan),check=A.assess(baseline,applied.result,{format:'40x40',orientation:'auto'}),final=check.accepted?applied.result:baseline;
  const before=T.generate(source,{optimizedSource:baseline}),after=T.generate(source,{optimizedSource:final});assert.ok(T.validate(after).valid);assert.deepEqual(after.target.map(p=>p.points),T.result2Routes(final,after.canvas).routes.map(p=>p.points));
  const record={fixture:name,synthetic:true,accepted:check.accepted,edits:applied.accepted.length,rejected:applied.rejected,check};records.push(record);
  html+=`<h2>${name}</h2><article>${[['Mathematical Result 2',O.exportSVG(baseline)],['Validated edited Result 2',O.exportSVG(final)],['Baseline layout',T.exportSVG(before)],['Exact edited rail layout',T.exportSVG(after)]].map(([title,svg])=>`<section><h3>${title}</h3>${svg}</section>`).join('')}</article><pre>${JSON.stringify(record,null,2)}</pre>`;
}
fs.writeFileSync(path.join(directory,'index.html'),html);fs.writeFileSync(path.join(directory,'metrics.json'),JSON.stringify(records,null,2));console.log('Offline regression (NOT real AI): '+path.join(directory,'index.html'));console.log(records.map(r=>({fixture:r.fixture,accepted:r.accepted,edits:r.edits,reasons:r.check.reasons})));
