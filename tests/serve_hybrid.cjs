// Local experimental server; /api/contour proxies the existing local Flask app.
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),handler=require('../api/result3');
const root=path.resolve(__dirname,'..');
http.createServer(async(req,res)=>{res.status=n=>{res.statusCode=n;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/result3')return await handler(req,res);
if(url.pathname==='/api/result2'){
  if(process.env.RESULT2_TEST_MODE==='delayed-noop'){
    // Explicit LOCAL test transport only. Never bundled into api/result2.
    for await(const chunk of req){void chunk;}
    await new Promise(resolve=>setTimeout(resolve,5000));
    res.setHeader('X-Prismosaic-Test-Mode','MOCK_NOT_AI');return res.status(200).json({plan:{edits:[]},requestId:'MOCK_NOT_AI'});
  }
  return await require('../api/result2')(req,res);
}
if(['/result-pipeline.js','/result2-adaptation.js','/result2-adaptation-worker.js'].includes(url.pathname)){res.setHeader('Content-Type','text/javascript');return res.end(fs.readFileSync(path.join(root,url.pathname)));}
if(url.pathname==='/api/contour'){const chunks=[];for await(const c of req)chunks.push(c);const r=await fetch('http://127.0.0.1:5059/api/contour',{method:req.method,headers:{'Content-Type':'application/json'},body:req.method==='POST'?Buffer.concat(chunks):undefined});res.statusCode=r.status;res.setHeader('Content-Type','application/json');return res.end(await r.text());}
const filePath=url.pathname==='/'?'/index.html':url.pathname;
if(filePath==='/index.html'&&process.env.RESULT2_TEST_MODE){res.setHeader('Content-Type','text/html');return res.end(fs.readFileSync(path.join(root,filePath),'utf8').replace('<body>','<body><aside style="position:fixed;bottom:0;left:0;z-index:999999;background:#fff;color:#111;padding:4px;border:1px solid #111">LOCAL TEST TRANSPORT — NO REAL AI</aside>'));}
if(['/asset-library.js','/asset-library-ui.js'].includes(filePath)||(/^\/library\/[a-zA-Z0-9_./-]+$/.test(filePath)&&!filePath.includes('..'))){const file=path.join(root,filePath);if(!fs.existsSync(file)||!fs.statSync(file).isFile()){res.statusCode=404;return res.end();}const mime={'.js':'text/javascript','.json':'application/json','.svg':'image/svg+xml','.jpg':'image/jpeg','.webp':'image/webp','.png':'image/png'};res.setHeader('Content-Type',mime[path.extname(file)]||'application/octet-stream');return res.end(fs.readFileSync(file));}
const allowed=new Set(['/workspace-refinement.js','/workspace-refinement.css','/assets/prismosaic-logo.png','/workspace.css','/workspace.js','/workspace-i18n.js','/index.html','/tests/hybrid_inspector.html','/result3-lab.js','/result3-hybrid.js','/result3-contract.js','/result3-worker.js','/tile-layout.js','/tile-ui.js','/tile-i18n.js','/tile-worker.js','/optimized-contour.js','/optimized-ui.js','/optimized-worker.js']);if(!allowed.has(filePath)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',filePath.endsWith('.html')?'text/html':filePath.endsWith('.css')?'text/css':filePath.endsWith('.png')?'image/png':'text/javascript');res.end(fs.readFileSync(path.join(root,filePath)));}
catch{res.statusCode=500;res.end('Local server error');}}).listen(Number(process.env.PORT)||8088,'127.0.0.1',()=>console.log('Hybrid lab: http://127.0.0.1:8088/tests/hybrid_inspector.html'));
