// Local experimental server; /api/contour proxies the existing local Flask app.
'use strict';
const http=require('node:http'),fs=require('node:fs'),path=require('node:path'),handler=require('../api/result3');
const root=path.resolve(__dirname,'..');
http.createServer(async(req,res)=>{res.status=n=>{res.statusCode=n;return res;};res.json=value=>{res.setHeader('Content-Type','application/json');res.end(JSON.stringify(value));};
try{const url=new URL(req.url,'http://localhost');if(url.pathname==='/api/result3')return await handler(req,res);
if(url.pathname==='/api/contour'){const chunks=[];for await(const c of req)chunks.push(c);const r=await fetch('http://127.0.0.1:5059/api/contour',{method:req.method,headers:{'Content-Type':'application/json'},body:req.method==='POST'?Buffer.concat(chunks):undefined});res.statusCode=r.status;res.setHeader('Content-Type','application/json');return res.end(await r.text());}
const filePath=url.pathname==='/'?'/index.html':url.pathname;
const allowed=new Set(['/index.html','/tests/hybrid_inspector.html','/result3-lab.js','/result3-hybrid.js','/result3-worker.js','/tile-layout.js','/tile-ui.js','/tile-i18n.js','/tile-worker.js','/optimized-contour.js','/optimized-ui.js','/optimized-worker.js']);if(!allowed.has(filePath)){res.statusCode=404;return res.end();}res.setHeader('Content-Type',filePath.endsWith('.html')?'text/html':'text/javascript');res.end(fs.readFileSync(path.join(root,filePath)));}
catch{res.statusCode=500;res.end('Local server error');}}).listen(8088,'127.0.0.1',()=>console.log('Hybrid lab: http://127.0.0.1:8088/tests/hybrid_inspector.html'));
