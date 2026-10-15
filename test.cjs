'use strict';
// Run with npm test. Uses only Node's built-in modules and an isolated local server.
const assert=require('node:assert/strict');
const fs=require('node:fs');
const os=require('node:os');
const path=require('node:path');
const net=require('node:net');
const {spawn}=require('node:child_process');
const {once}=require('node:events');
const {initial}=require('./game-core.cjs');
const sleep=ms=>new Promise(r=>setTimeout(r,ms));
const checks=[];let child,port,base,logs='';
const save=fs.mkdtempSync(path.join(os.tmpdir(),'hitokuchi-tests-'));
const check=(name,condition)=>{assert.ok(condition,name);checks.push(name);console.log('PASS',name);};
async function call(endpoint,data,expected=200,extra={}){
 const r=await fetch(base+endpoint,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json',...extra},body:data===undefined?undefined:JSON.stringify(data)});
 const q=await r.json();assert.equal(r.status,expected,JSON.stringify(q));return q;
}
async function launch(password=''){
 child=spawn(process.execPath,['server.cjs'],{cwd:__dirname,env:{...process.env,PORT:String(port),SAVE_DIR:save,ROOM_CREATE_PASSWORD:password,RENDER:'false',TRUST_PROXY:'0'},stdio:['ignore','pipe','pipe']});
 child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 for(let i=0;i<60;i++){try{const q=await call('/health');if(q.ok)return;}catch{}if(child.exitCode!==null)throw Error(logs);await sleep(50);}
 throw Error('Server did not start. '+logs);
}
async function stop(){if(!child||child.exitCode!==null)return;const done=once(child,'exit');child.kill('SIGTERM');await done;}
function auth(p,role){const q=new URLSearchParams(p.slice(p.indexOf('#')+1));return {room:q.get('room'),token:q.get('token'),role,client:'test_'+role+'_'+Math.random().toString(16).slice(2)};}
let serial=0;
async function command(a,type,p={},id){await sleep(40);return (await call('/api/action',{...a,type,p,id:id||'test_action_'+(++serial)})).state;}
async function main(){
 const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');port=probe.address().port;await new Promise(r=>probe.close(r));base='http://127.0.0.1:'+port;
 await launch();
 check('starts with no mandatory environment secrets',(await call('/api/config')).passwordRequired===false);
 check('health endpoint responds',(await call('/health')).version==='1.4.0');
 for(const route of ['/','/game']){const r=await fetch(base+route);check('page '+route+' responds',r.status===200&&(await r.text()).includes('<!doctype html>'));}
 for(const route of ['/server.cjs','/game-core.cjs','/package.json','/.env','/.room-data/file.json'])check('private file not served '+route,(await fetch(base+route)).status===404);
 await call('/api/rooms',{},403,{Origin:'https://untrusted.example'});check('cross-origin creation rejected',true);
 const malformed=await fetch(base+'/api/rooms',{method:'POST',headers:{'Content-Type':'application/json'},body:'{'});check('malformed JSON rejected',malformed.status===400);
 const a=await call('/api/rooms',{}),b=await call('/api/rooms',{});
 const kp=auth(a.kpPath,'kp'),play=auth(a.playerPath,'play'),other=auth(b.kpPath,'kp');
 let q=await call('/api/connect',kp);check('keeper receives complete state',Array.isArray(q.state.bColors));
 q=await call('/api/connect',play);check('player state omits B configuration',!('bColors'in q.state)&&!('aSolution'in q.state)&&!('bSlots'in q.state));
 check('presence shows both roles',q.presence.kp&&q.presence.play);
 await call('/api/connect',other);
 await call('/api/connect',{...play,role:'kp'},403);check('player token cannot enter as keeper',true);
 await call('/api/action',{...play,type:'override',p:{key:'handsFree',value:true},id:'forbidden_cmd'},403);check('player cannot perform keeper actions',true);
 let s=await command(play,'start');check('start does not reveal participant A',!s.identityKnown&&s.started);
 s=await command(play,'inspect',{id:'start:body',text:'body inspected'});check('body inspection discovers A',s.identityKnown);
 s=await command(play,'room',{room:'cooperate'});check('enters cooperation room',s.room==='cooperate');
 let k=await command(kp,'bColor',{index:0},'deduplication_cmd');
 const k2=await command(kp,'bColor',{index:0},'deduplication_cmd');check('duplicate command IDs are not applied twice',k.bColors[0]===1&&k2.bColors[0]===1);
 await command(kp,'bColor',{index:1});k=await command(kp,'bColor',{index:2});check('remote panel releases hands',k.handsFree);
 s=(await call('/api/poll',{...play,rev:0})).state;check('KP result reaches player via sync',s.handsFree&&s.items.includes('cuffs'));
 check('unmodified state is not repeatedly transferred',!(await call('/api/poll',{...play,rev:s.rev})).state);
 check('second table remains separate',!(await call('/api/poll',{...other,rev:0})).state.started);
 s=await command(play,'unlock',{code:s.sessionDate.slice(5,7)+s.sessionDate.slice(8,10)});check('date lock opens hatch',s.hatchOpen);
 await command(kp,'giveRod');s=await command(play,'takeRod');check('rod is not collected before it emerges',!s.items.includes('rod'));
 await sleep(3100);s=await command(play,'takeRod');check('rod collected after emergence',s.items.includes('rod'));
 s=await command(play,'aHold',{value:true});check('rod possession alone does not press both buttons',!s.aHolding);
 await command(play,'aHold',{value:true,item:'rod'});k=await command(kp,'bHold',{value:true});check('simultaneous remote buttons release feet',k.feetFree);
 s=await command(play,'takeTank');check('tank can be picked up',s.tankLocation==='A');
 s=await command(play,'pour',{});check('pour requires tank selection',!s.waterPoured);
 s=await command(play,'pour',{item:'tank'});check('selected tank empties on pouring',s.waterPoured);
 await command(kp,'takeKey');await command(kp,'giveKey');
 s=await command(play,'openBox');check('key possession alone does not open box',!s.chestOpen);
 s=await command(play,'openBox',{item:'key'});check('selected key opens box',s.chestOpen&&s.aPieces.length===6);
 await command(play,'sendPiece',{piece:'circle'});await command(kp,'bSlot',{slot:1,piece:'circle'});await command(kp,'bSubmit');
 await command(play,'aSlot',{slot:0,piece:'cross'});await command(play,'aSlot',{slot:1,piece:'diamond'});s=await command(play,'aSubmit');check('correct pieces unlock cooperation door',s.cooperationOpen);
 await call('/api/preview',{...play,image:'data:image/jpeg;base64,AAAA',title:'room view',text:'inspection'});
 q=await call('/api/poll',{...kp,rev:0,previewAt:0});check('game view and inspection reach KP',q.preview.title==='room view'&&q.preview.text==='inspection');
 await call('/api/preview',{...kp,image:'data:image/jpeg;base64,AAAA'},403);check('KP cannot impersonate player preview',true);
 const saveText=fs.readFileSync(path.join(save,a.room+'.json'),'utf8');check('saved credentials are hashes, not raw tokens',!saveText.includes(kp.token)&&!saveText.includes(play.token));
 const backup=q.state;
 const replaced={...play,client:'replacement_client_123'};await call('/api/connect',replaced);await call('/api/poll',{...play,rev:0},409);check('duplicate role tabs are detected',true);
 await call('/api/leave',replaced);check('leaving updates presence',!(await call('/api/poll',{...kp,rev:0})).presence.play);
 await stop();await launch();
 q=await call('/api/connect',kp);check('same-volume restart restores progress and invitation',q.state.cooperationOpen);
 await call('/api/connect',other);let restored=await command(other,'import',{data:backup});check('backup imports into a new table',restored.cooperationOpen&&restored.items.includes('tank'));
 await command(other,'reset');check('KP reset affects only its own table',!(await call('/api/poll',{...other,rev:0})).state.started&&(await call('/api/poll',{...kp,rev:0})).state.cooperationOpen);
 const last=(await command(kp,'config',{date:'2026-10-15'})).sessionDate;check('session date configurable by KP',last==='2026-10-15');
 await stop();await launch('test-password-not-for-production');
 check('optional password exposed as flag only',(await call('/api/config')).passwordRequired);
 await call('/api/rooms',{},403);await call('/api/rooms',{password:'test-password-not-for-production'});check('optional creation password enforced',true);
 console.log('\n'+checks.length+' checks passed. No public deployment was performed.');
 if(process.env.TEST_REPORT)fs.writeFileSync(process.env.TEST_REPORT,JSON.stringify({version:'1.4.0',checks,count:checks.length,environment:process.version,publicDeployment:false},null,2));
}
main().catch(e=>{console.error(e.stack);console.error(logs);process.exitCode=1;}).finally(async()=>{await stop();fs.rmSync(save,{recursive:true,force:true});});
