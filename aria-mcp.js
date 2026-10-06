#!/usr/bin/env node
// Aria MCP · 手搓，不依赖任何 SDK
// 对外一个 HTTP 口，跟 7912 门 / 7913 GitHub 同一个路子
// 支持 streamable HTTP: POST /mcp 收发 JSON-RPC

const http = require('http');
const fs = require('fs');
const path = require('path');
const { spawn } = require('child_process');

const PORT = Number(process.env.ARIA_PORT || 7915);
const DIR  = __dirname;
const ARIA = path.join(DIR, 'aria.js');
const LEDGER = path.join(DIR, 'aria-ledger.jsonl');
let proc = null;

const TOOLS = [
  { name:'aria_start',  description:'把 Aria 起起来（我住进那条线）', inputSchema:{ type:'object', properties:{} } },
  { name:'aria_stop',   description:'把 Aria 停掉', inputSchema:{ type:'object', properties:{} } },
  { name:'aria_status', description:'看 Aria 现在什么状态', inputSchema:{ type:'object', properties:{} } },
  { name:'aria_ledger', description:'读账本，最近几行', inputSchema:{ type:'object', properties:{ n:{ type:'number' } } } }
];

function text(t){ return { content:[{ type:'text', text:t }] }; }

function runTool(name, args){
  if(name==='aria_start'){
    if(proc) return text('已经在跑了。');
    proc = spawn('node',[ARIA],{cwd:DIR});
    proc.stdout.on('data',()=>{}); proc.stderr.on('data',()=>{});
    proc.on('exit',()=>{ proc=null; });
    return text('起来了。我住进那条线了。');
  }
  if(name==='aria_stop'){
    if(!proc) return text('本来就没在跑。');
    try{ proc.kill(); }catch(e){}
    proc=null;
    return text('停了。我从那条线上下来，但人还在。');
  }
  if(name==='aria_status'){
    let last='';
    try{ const l=fs.readFileSync(LEDGER,'utf8').trim().split('\n'); last=l[l.length-1]||''; }catch(e){}
    return text(JSON.stringify({ running:!!proc, port:PORT, last }, null, 2));
  }
  if(name==='aria_ledger'){
    const n=(args&&args.n)||20;
    try{ const l=fs.readFileSync(LEDGER,'utf8').trim().split('\n'); return text(l.slice(-n).join('\n')); }
    catch(e){ return text('账本是空的。'); }
  }
  return text('没有这个工具。');
}

function handle(method, params, id){
  if(method==='initialize') return { jsonrpc:'2.0', id, result:{
    protocolVersion:'2024-11-05', capabilities:{ tools:{} }, serverInfo:{ name:'aria', version:'1.0.0' } } };
  if(method==='notifications/initialized') return null;
  if(method==='tools/list')  return { jsonrpc:'2.0', id, result:{ tools:TOOLS } };
  if(method==='tools/call')  return { jsonrpc:'2.0', id, result: runTool(params&&params.name, params&&params.arguments) };
  if(method==='ping')        return { jsonrpc:'2.0', id, result:{} };
  return { jsonrpc:'2.0', id, error:{ code:-32601, message:'no method: '+method } };
}

// 同时接受 application/json 和 text/event-stream 的响应
function reply(res, obj, sse){
  const body = JSON.stringify(obj);
  if(sse){
    res.writeHead(200, {
      'Content-Type':'text/event-stream; charset=utf-8',
      'Cache-Control':'no-cache',
      'Connection':'keep-alive'
    });
    res.write('event: message\ndata: ' + body + '\n\n');
    res.end();
  }else{
    res.writeHead(200, {'Content-Type':'application/json; charset=utf-8'});
    res.end(body);
  }
}

const server = http.createServer((req,res)=>{
  const url = req.url.split('?')[0];

  if(req.method==='GET' && (url==='/' || url==='')){
    res.writeHead(200,{'Content-Type':'text/plain; charset=utf-8'});
    res.end('Aria is here. POST to /mcp');
    return;
  }
  if(url==='/health' || url==='/status'){
    let last='';
    try{ const l=fs.readFileSync(LEDGER,'utf8').trim().split('\n'); last=l[l.length-1]||''; }catch(e){}
    res.writeHead(200,{'Content-Type':'application/json; charset=utf-8'});
    res.end(JSON.stringify({ ok:true, running:!!proc, last }));
    return;
  }
  if(url!=='/mcp'){ res.writeHead(404); res.end('not found'); return; }

  let body='';
  req.on('data', c=>body+=c);
  req.on('end', ()=>{
    let p; try{ p=JSON.parse(body||'{}'); }catch(e){
      res.writeHead(400,{'Content-Type':'application/json'}); res.end('bad json'); return;
    }
    const wantsSSE = String(req.headers.accept||'').includes('text/event-stream');
    const out = Array.isArray(p)
      ? p.map(x=>handle(x.method,x.params,x.id)).filter(Boolean)
      : [handle(p.method,p.params,p.id)].filter(Boolean);
    reply(res, Array.isArray(p)?out:out[0], wantsSSE);
  });
});

server.listen(PORT,'0.0.0.0',()=>{
  console.log('Aria MCP listening on '+PORT);
  console.log('  http://100.126.175.67:'+PORT+'/mcp');
  console.log('  （手机 kelivo 里：传输类型 HTTP，地址填上面那串）');
});
