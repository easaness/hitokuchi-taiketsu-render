'use strict';
/**
 * Hitokuchi Taiketsu 1.4 - one Node process, no third-party dependencies.
 * HTTP polling + authenticated commands. The same origin serves both pages.
 * Start: npm start. Render supplies PORT automatically; no required secrets.
 * For private table creation, optionally set ROOM_CREATE_PASSWORD.
 * Local saves are ephemeral on Render Free. Export a save before stopping.
 */
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { initial, valid, act } = require('./game-core.cjs');
const VERSION = '1.7';
const ROOT = __dirname;
const SAVE = path.resolve(process.env.SAVE_DIR || path.join(ROOT, '.room-data'));
const PORT = Number(process.env.PORT || 10000);
const MAX_ROOMS = Math.max(1, Math.min(200, Number(process.env.MAX_ROOMS) || 30));
const PASSWORD = process.env.ROOM_CREATE_PASSWORD || '';
const TTL = 7 * 86400_000;
const PRESENCE_MS = 15_000;
const MAX_BODY = 850_000;
const ALLOW_PLAY = new Set('start inspect room rug unlock aHold takeTank putTank pour openBox sendPiece aSlot aSubmit takeRod scopeEnd resume activateDuel finish'.split(' '));
const ALLOW_KP = new Set('bColor giveRod bHold takeKey giveKey bSlot bSubmit returnPiece kpMessage meta config retryGate override reset import duelVerdict doorVerdict duelConfig resetDuel finishB'.split(' '));
const ROOM_ID = /^[a-f0-9]{24}$/;
const TOKEN = /^[A-Za-z0-9_-]{43}$/;
const CLIENT_ID = /^[A-Za-z0-9_-]{8,100}$/;
const rooms = new Map();
const rates = new Map();
const digest = x => crypto.createHash('sha256').update(String(x)).digest('hex');
const equal = (a,b) => typeof a === 'string' && typeof b === 'string' && a.length === b.length && crypto.timingSafeEqual(Buffer.from(a),Buffer.from(b));
const object = x => x && typeof x === 'object' && !Array.isArray(x);
const headers = {
  'Cache-Control': 'no-store',
  'X-Content-Type-Options': 'nosniff',
  'Referrer-Policy': 'no-referrer',
  'X-Frame-Options': 'DENY',
  'X-Robots-Tag': 'noindex, nofollow',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=()',
  'Content-Security-Policy': "default-src 'self'; script-src 'self' 'unsafe-inline'; style-src 'self' 'unsafe-inline'; img-src 'self' data: blob:; media-src 'self' blob:; connect-src 'self'; object-src 'none'; base-uri 'none'; frame-ancestors 'none'"
};
const pages = new Map();
const assets = new Map();
const ASSET_NAMES=['duel-title.png','activation-module.png','duel-rules.png','last-door-b.png'];
function fail(code,status=400) { return Object.assign(new Error(code),{status,publicCode:code}); }
function reply(res,status,data) {
  if (res.destroyed || res.writableEnded) return;
  res.writeHead(status, {...headers,'Content-Type':'application/json; charset=utf-8'});
  res.end(JSON.stringify(data));
}
function present(room) {
  const now=Date.now();
  return Object.fromEntries(['kp','play'].map(role=>[role,!!room.clients[role] && now-room.clients[role].seen<PRESENCE_MS]));
}
function snapshot(room,role) {
  const s={...room.state};
  if(role==='play') for(const k of ['bColors','bPieces','bSlots','aSolution','bSolution']) delete s[k];
  return s;
}
function message(room,role,withState=true) {
  const m={presence:present(room),serverTime:Date.now()};
  if(withState) m.state=snapshot(room,role);
  return m;
}
function persist(rid,room) {
  const dest=path.join(SAVE,rid+'.json'),tmp=dest+'.tmp';
  const data={version:1,state:room.state,hashes:room.hashes,updated:room.updated,recent:room.recent};
  fs.writeFileSync(tmp,JSON.stringify(data),{encoding:'utf8',mode:0o600});
  fs.renameSync(tmp,dest);
}
function reduce(state,type,p) {
  let s;
  if(type==='reset') s=initial();
  else if(type==='import') s=valid(p.data);
  else { s=valid(state); if(!act(s,type,p)) throw fail('unknown_action'); }
  if(type==='reset'||type==='import') { s.aHolding=false;s.bHolding=false; }
  s.rev=Math.max(state.rev+1,Date.now());
  return s;
}
function commit(rid,room,next,recent=room.recent) {
  const copy={...room,state:next,recent,updated:Date.now()};
  try { persist(rid,copy); } catch(e) { console.error('Save failed:',e.code||e.message);throw fail('save_failed',503); }
  Object.assign(room,copy);
}
function release(rid,room,role) {
  room.clients[role]=null;
  const hold=role==='play'?'aHolding':'bHolding';
  if(room.state[hold]) commit(rid,room,{...room.state,[hold]:false,rev:Math.max(Date.now(),room.state.rev+1)});
  if(role==='play') room.preview=null;
}
function expire() {
  for(const [rid,room] of rooms) {
    for(const role of ['kp','play']) {
      if(room.clients[role] && Date.now()-room.clients[role].seen>=PRESENCE_MS) {
        try { release(rid,room,role); } catch(e) { console.error('Release failed:',e.publicCode); }
      }
    }
    if(Date.now()-room.updated>TTL && !Object.values(present(room)).some(Boolean)) {
      rooms.delete(rid);
      try { fs.rmSync(path.join(SAVE,rid+'.json'),{force:true}); } catch(e) { console.error('Expiry failed:',e.code); }
    }
  }
  for(const [ip,values] of rates) if(!values.some(t=>Date.now()-t<3600_000)) rates.delete(ip);
}
function originOK(req) {
  const origin=req.headers.origin;
  if(!origin) return true;
  try { const u=new URL(origin);return ['http:','https:'].includes(u.protocol) && u.host===req.headers.host; } catch { return false; }
}
async function body(req) {
  if(!String(req.headers['content-type']||'').toLowerCase().startsWith('application/json')) throw fail('json_required',415);
  const parts=[];let size=0;
  for await (const part of req) {
    size+=part.length;
    if(size>MAX_BODY) throw fail('payload_too_large',413);
    parts.push(part);
  }
  let q;try { q=JSON.parse(Buffer.concat(parts).toString('utf8')); } catch { throw fail('invalid_json'); }
  if(!object(q)) throw fail('invalid_request');
  return q;
}
function authenticate(q,requireClient=true) {
  if(!ROOM_ID.test(q.room||'') || !['play','kp'].includes(q.role) || !TOKEN.test(q.token||'') || !CLIENT_ID.test(q.client||'')) throw fail('invalid_invitation',403);
  const room=rooms.get(q.room);
  if(!room || !equal(room.hashes[q.role],digest(q.token))) throw fail('invalid_invitation',403);
  if(requireClient) {
    if(!room.clients[q.role]) throw fail('reconnect',409);
    if(room.clients[q.role].id!==q.client) throw fail('duplicate',409);
    room.clients[q.role].seen=Date.now();
  }
  room.updated=Date.now();
  return room;
}
function clientIP(req) {
  // Render terminates TLS and supplies the forward chain. Do not trust it locally.
  if(process.env.RENDER==='true' || process.env.TRUST_PROXY==='1') {
    const chain=String(req.headers['x-forwarded-for']||'').split(',').map(x=>x.trim()).filter(Boolean);
    if(chain.length) return chain[chain.length-1];
  }
  return req.socket.remoteAddress||'unknown';
}
function create(q,req) {
  expire();
  const ip=clientIP(req),now=Date.now(),list=(rates.get(ip)||[]).filter(t=>now-t<3600_000);
  if(list.length>=12) throw fail('too_many_rooms',429);
  if(rates.size>=1000 && !rates.has(ip)) throw fail('busy',503);
  list.push(now);rates.set(ip,list);
  if(PASSWORD && !equal(digest(q.password||''),digest(PASSWORD))) throw fail('wrong_password',403);
  if(rooms.size>=MAX_ROOMS) throw fail('room_limit',503);
  const rid=crypto.randomBytes(12).toString('hex');
  const kp=crypto.randomBytes(32).toString('base64url'),play=crypto.randomBytes(32).toString('base64url');
  const state=initial();state.rev=now;
  const room={state,hashes:{kp:digest(kp),play:digest(play)},updated:now,recent:[],clients:{kp:null,play:null},preview:null};
  persist(rid,room);rooms.set(rid,room);
  return {room:rid,kpPath:`/game?online=1#kp&room=${rid}&token=${kp}&invite=${play}`,playerPath:`/game?online=1#play&room=${rid}&token=${play}`};
}
function connect(q) {
  const room=authenticate(q,false),role=q.role,old=room.clients[role];
  if(old?.id!==q.client) {
    release(q.room,room,role);
    room.clients[role]={id:q.client,seen:Date.now(),times:[]};
  } else old.seen=Date.now();
  return {...message(room,role),kind:'ready'};
}
function poll(q) {
  const room=authenticate(q);
  const m=message(room,q.role,q.rev!==room.state.rev);
  if(q.role==='kp' && room.preview && q.previewAt!==room.preview.at) m.preview=room.preview;
  return m;
}
function action(q) {
  const room=authenticate(q);
  if(!CLIENT_ID.test(q.id||'')) throw fail('invalid_command');
  if(!(q.role==='play'?ALLOW_PLAY:ALLOW_KP).has(q.type)) throw fail('forbidden',403);
  if(!object(q.p)) throw fail('invalid_payload');
  const peer=room.clients[q.role],now=Date.now();
  peer.times=peer.times.filter(t=>now-t<1000);
  if(peer.times.length>=30) throw fail('slow_down',429);
  peer.times.push(now);
  if(q.type!=='import' && JSON.stringify(q.p).length>18000) throw fail('payload_too_large',413);
  let p=q.p;
  if(q.type==='inspect') {
    if(typeof p.id!=='string' || p.id.length>100) throw fail('invalid_inspection');
    p={id:p.id,text:String(p.text||'').slice(0,3000)};
  }
  const unique=q.role+':'+q.id;
  if(!room.recent.includes(unique)) {
    let next;try { next=reduce(room.state,q.type,p); } catch(e) { throw e.publicCode?e:fail('invalid_save'); }
    commit(q.room,room,next,[...room.recent,unique].slice(-1024));
  }
  return {...message(room,q.role),kind:'ack',id:q.id};
}
function preview(q) {
  const room=authenticate(q);
  if(q.role!=='play') throw fail('forbidden',403);
  if(typeof q.image!=='string' || q.image.length>125000 || !/^data:image\/jpeg;base64,[A-Za-z0-9+/=]+$/.test(q.image)) throw fail('invalid_preview');
  if(Date.now()-(room.preview?.at||0)>650) {
    room.preview={kind:'preview',image:q.image,title:String(q.title||'').slice(0,100),text:String(q.text||'').slice(0,2500),at:Date.now()};
  }
  return {ok:true};
}
function load() {
  for(const name of ASSET_NAMES) assets.set('/'+name,fs.readFileSync(path.join(ROOT,name)));
  for(const name of ['index.html','game.html']) {
    if(!fs.existsSync(path.join(ROOT,name))) throw new Error('Missing '+name+'. Upload every file from the ZIP at the repository root.');
    pages.set(name,fs.readFileSync(path.join(ROOT,name)));
  }
  fs.mkdirSync(SAVE,{recursive:true,mode:0o700});
  for(const name of fs.readdirSync(SAVE)) {
    if(!/^[a-f0-9]{24}\.json$/.test(name)) continue;
    try {
      const r=JSON.parse(fs.readFileSync(path.join(SAVE,name),'utf8'));
      if(!Number.isFinite(r.updated)||Date.now()-r.updated>TTL) {fs.rmSync(path.join(SAVE,name));continue;}
      if(!['kp','play'].every(role=>/^[a-f0-9]{64}$/.test(r.hashes?.[role]||''))) continue;
      const state=valid(r.state);state.aHolding=false;state.bHolding=false;state.rev=Math.max(Date.now(),state.rev+1);
      rooms.set(name.slice(0,-5),{state,hashes:r.hashes,updated:r.updated,recent:Array.isArray(r.recent)?r.recent.filter(x=>typeof x==='string').slice(-1024):[],clients:{kp:null,play:null},preview:null});
    } catch(e) { console.warn('Skipped unreadable save:',name,e.code||e.message); }
  }
}
const server=http.createServer(async(req,res)=>{
  try {
    const url=new URL(req.url,'http://localhost');
    if(req.method==='GET'||req.method==='HEAD') {
      if(url.pathname==='/health') return reply(res,200,{ok:true,version:VERSION});
      if(url.pathname==='/api/config') return reply(res,200,{version:VERSION,passwordRequired:!!PASSWORD,transport:'http-poll',pollMs:1000});
      if(url.pathname==='/robots.txt') {res.writeHead(200,{...headers,'Content-Type':'text/plain'});return res.end('User-agent: *\nDisallow: /\n');}
      if(url.pathname==='/favicon.ico') {res.writeHead(204,headers);return res.end();}
      if(assets.has(url.pathname)){const data=assets.get(url.pathname);res.writeHead(200,{...headers,'Content-Type':'image/png','Content-Length':data.length});return res.end(req.method==='HEAD'?undefined:data);}
      const file=url.pathname==='/'||url.pathname==='/index.html'?'index.html':url.pathname==='/game'||url.pathname==='/game.html'?'game.html':null;
      if(!file) return reply(res,404,{error:'not_found'});
      const data=pages.get(file);res.writeHead(200,{...headers,'Content-Type':'text/html; charset=utf-8','Content-Length':data.length});return res.end(req.method==='HEAD'?undefined:data);
    }
    if(req.method!=='POST') {res.setHeader('Allow','GET, HEAD, POST');return reply(res,405,{error:'method_not_allowed'});}
    if(!originOK(req)) throw fail('origin_not_allowed',403);
    const q=await body(req);
    let result;
    switch(url.pathname) {
      case '/api/rooms':result=create(q,req);break;
      case '/api/connect':result=connect(q);break;
      case '/api/poll':result=poll(q);break;
      case '/api/action':result=action(q);break;
      case '/api/preview':result=preview(q);break;
      case '/api/leave': {
        const room=authenticate(q);release(q.room,room,q.role);result={ok:true};break;
      }
      default:throw fail('not_found',404);
    }
    reply(res,200,result);
  } catch(e) {
    if(!e.publicCode) console.error('Request failed:',e.code||e.message);
    reply(res,e.status||500,{error:e.publicCode||'server_error',code:e.publicCode||'server_error'});
  }
});
server.requestTimeout=12_000;
server.headersTimeout=10_000;
server.keepAliveTimeout=5_000;
server.on('clientError',(err,socket)=>{if(socket.writable) socket.end('HTTP/1.1 400 Bad Request\r\nConnection: close\r\n\r\n');});
try {
  if(!Number.isInteger(PORT)||PORT<1||PORT>65535) throw new Error('PORT must be a number between 1 and 65535.');
  load();
  server.listen(PORT,'0.0.0.0',()=>{
    console.log(`Hitokuchi Taiketsu ${VERSION} is ready on port ${PORT}`);
    console.log(`Health: /health | Local: http://localhost:${PORT}`);
    console.log(`Table creation: ${PASSWORD?'password protected':'invitation-link mode (no creation password)'}`);
  });
} catch(e) { console.error('Startup failed:',e.message);process.exit(1); }
server.on('error',e=>{console.error('Server error:',e.message);process.exit(1);});
const cleanup=setInterval(expire,3000);cleanup.unref();
function stop() {
  clearInterval(cleanup);
  for(const [rid,room] of rooms) {
    try {room.state.aHolding=false;room.state.bHolding=false;persist(rid,room);} catch(e) {console.error('Final save failed:',e.code||e.message);}
  }
  server.close(()=>process.exit(0));
  server.closeIdleConnections();
  setTimeout(()=>process.exit(0),2000).unref();
}
process.on('SIGTERM',stop);process.on('SIGINT',stop);
