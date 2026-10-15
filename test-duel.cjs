'use strict';
// Server and real transport integration, using built-in Node modules only.
const assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),net=require('node:net'),vm=require('node:vm');
const {spawn}=require('node:child_process'),{once}=require('node:events');
const {initial,valid,act}=require('./game-core.cjs');
const checks=[],sleep=ms=>new Promise(r=>setTimeout(r,ms)),clients=[];
const save=fs.mkdtempSync(path.join(os.tmpdir(),'hitokuchi-duel-'));
let child,base,logs='',serial=0;
function check(name,v){assert.ok(v,name);checks.push(name);console.log('PASS',name);}
async function call(endpoint,data,expected=200){const r=await fetch(base+endpoint,{method:data===undefined?'GET':'POST',headers:{'Content-Type':'application/json'},body:data===undefined?undefined:JSON.stringify(data)});const q=await r.json();assert.equal(r.status,expected,JSON.stringify(q));return q;}
function credentials(url,role){const q=new URLSearchParams(url.split('#')[1]);return {room:q.get('room'),token:q.get('token'),role,client:'duel_'+role+'_'+Math.random().toString(36).slice(2)};}
async function command(auth,type,p={},status=200){await sleep(42);const q=await call('/api/action',{...auth,type,p,id:'duel_action_'+(++serial)},status);return q.state;}
async function waitFor(fn,label){for(let i=0;i<100;i++){if(fn())return;await sleep(60);}throw Error('Timed out: '+label);}
async function main(){
 const probe=net.createServer();probe.listen(0,'127.0.0.1');await once(probe,'listening');const port=probe.address().port;await new Promise(r=>probe.close(r));base='http://127.0.0.1:'+port;
 child=spawn(process.execPath,['server.cjs'],{cwd:__dirname,env:{...process.env,PORT:String(port),SAVE_DIR:save,ROOM_CREATE_PASSWORD:''},stdio:['ignore','pipe','pipe']});child.stdout.on('data',b=>logs+=b);child.stderr.on('data',b=>logs+=b);
 for(let i=0;i<60;i++){try{if((await call('/health')).ok)break;}catch{}await sleep(50);}
 for(const asset of ['duel-title.png','activation-module.png','duel-rules.png','last-door-b.png']){const r=await fetch(base+'/'+asset);check('bundled asset '+asset,r.status===200&&r.headers.get('content-type')==='image/png');}
 const html=await (await fetch(base+'/game')).text();
 const scripts=[...html.matchAll(/<script[^>]*>([\s\S]*?)<\/script>/g)].map(x=>x[1]);
 scripts.forEach((s,i)=>{new vm.Script(s);check('browser script '+i+' parses',true);});
 const core=fs.readFileSync(path.join(__dirname,'game-core.cjs'),'utf8'),app=scripts[3];
 const slice=(s,a,b)=>s.slice(s.indexOf(a),s.indexOf(b,s.indexOf(a))).trim();
 check('browser and server validation are identical',slice(core,'function initial(){','function log')===slice(app,'function initial(){','let S=initial()'));
 check('browser and server reducer are identical',slice(core,'function evaluate(s){','module.exports')===slice(app,'function evaluate(s){','function save()'));
 const legacy=initial();for(const key of ['duelActive','duelWinner','exitOpen','lastOpen','ended','lastDoorTextMode'])delete legacy[key];legacy.scopeCompleted=true;
 const migrated=valid(legacy);check('v1.3 save migrates without ending the expanded game',!migrated.scopeCompleted&&!migrated.duelActive&&!migrated.exitOpen.A);
 const invite=await call('/api/rooms',{}),kp=credentials(invite.kpPath,'kp'),play=credentials(invite.playerPath,'play');
 await call('/api/connect',kp);await call('/api/connect',play);
 let s=await command(play,'room',{room:'duel'});check('cannot skip directly from start to duel',s.room==='start');
 await command(play,'start');await command(play,'room',{room:'cooperate'});
 s=await command(play,'room',{room:'duel'});check('closed cooperation gate blocks duel',s.room==='cooperate');
 await command(kp,'override',{key:'cooperationOpen',value:true});
 s=await command(play,'room',{room:'duel'});check('open cooperation gate leads to circular room',s.room==='duel');
 s=await command(play,'room',{room:'finalA'});check('closed A exit blocks passage',s.room==='duel');
 s=await command(kp,'duelVerdict',{winner:'A'});check('winner cannot be set before module activation',!s.duelWinner);
 s=await command(play,'activateDuel',{password:'wrongpassword'});check('wrong password does not activate hologram',!s.duelActive);
 s=await command(play,'activateDuel',{password:'CONFRONTATION'});check('title spelling activates module (case-insensitive)',s.duelActive&&s.duelActivatedAt>0);
 await command(play,'duelVerdict',{winner:'A'},403);check('player cannot award victory',true);
 await command(play,'doorVerdict',{group:'lastOpen',side:'A',open:true},403);check('player cannot force final door',true);
 await command(play,'meta',{actor:'A',confirmed:true},403);check('player cannot adjudicate a meta statement',true);
 s=await command(kp,'duelVerdict',{winner:'A'});check('A victory opens only right first gate',s.exitOpen.A&&!s.exitOpen.B&&!s.lastOpen.A&&!s.lastOpen.B&&s.duelWinner==='A');
 s=await command(kp,'duelVerdict',{winner:'B'});check('a second duel verdict is ignored',s.duelWinner==='A'&&!s.exitOpen.B);
 s=await command(play,'room',{room:'finalA'});check('A can enter right passage',s.room==='finalA');
 s=await command(play,'finish');check('closed inner door prevents ending',!s.ended);
 s=await command(kp,'meta',{actor:'A',confirmed:true});check('A meta verdict outside cooperation has no effect',!s.lastOpen.A);
 await command(play,'room',{room:'duel'});s=await command(play,'room',{room:'cooperate'});check('player can return to cooperation',s.room==='cooperate');
 s=await command(kp,'meta',{actor:'A'});check('meta verdict requires explicit KP confirmation',!s.lastOpen.A);
 s=await command(kp,'meta',{actor:'A',confirmed:true});check('winning A meta verdict opens A inner door and awards B victory',s.lastOpen.A&&s.exitOpen.B&&s.wins.at(-1).winner==='B');
 check('previously opened first gate stays open',s.exitOpen.A);
 check('opening inner door does not immediately end game',!s.ended);
 await command(play,'room',{room:'duel'});await command(play,'room',{room:'finalA'});
 s=await command(play,'finish');check('advancing through open inner gate finishes',s.ended&&s.endingActor==='A'&&s.endedAt>0);
 const complete=valid(s);check('ending survives save validation',complete.ended&&complete.lastOpen.A);
 s=await command(play,'room',{room:'duel'});check('finished player cannot resume exploration',s.ended&&s.room==='finalA');
 s=await command(kp,'resetDuel');check('keeper reset preserves earlier puzzle progress',!s.ended&&!s.duelWinner&&s.cooperationOpen&&s.duelActive&&!s.exitOpen.A);
 s=await command(kp,'duelVerdict',{winner:'B'});check('B victory opens left first gate',s.exitOpen.B&&!s.exitOpen.A);
 s=await command(play,'room',{room:'finalB'});check('A cannot use B-only exit',s.room==='duel');
 s=await command(kp,'meta',{actor:'B',confirmed:true});check('KP-controlled B meta opens B final door and A first gate',s.lastOpen.B&&s.exitOpen.A&&s.wins.at(-1).winner==='A');
 s=await command(kp,'finishB');check('KP can advance B and broadcast ending',s.ended&&s.endingActor==='B');
 s=await command(kp,'resetDuel');s=await command(kp,'duelConfig',{mode:'opponent'});check('alternate final door wording is saved',s.lastDoorTextMode==='opponent');
 s=await command(kp,'doorVerdict',{group:'lastOpen',side:'A',open:true});check('independent manual inner gate override',s.lastOpen.A&&!s.lastOpen.B);
 s=await command(kp,'doorVerdict',{group:'lastOpen',side:'A',open:false});check('independent manual gate close',!s.lastOpen.A);
 // Run the actual shipped transport in two isolated JS contexts, against HTTP server.
 const inv2=await call('/api/rooms',{});
 function transport(url){
   const seen={state:null,status:null,preview:null};const context=vm.createContext({crypto:globalThis.crypto,Uint8Array,URLSearchParams,AbortController,Blob,console,Math,Map,Promise,JSON,Error,setTimeout,clearTimeout,location:{hash:url.split('#')[1]?'#'+url.split('#')[1]:''},window:{addEventListener(){}},navigator:{sendBeacon(){}},fetch:(u,o)=>fetch(base+u,o)});
   vm.runInContext(scripts[1]+'\nthis.Transport=RemoteRoomLink;',context);
   const t=new context.Transport({onState:s=>seen.state=s,onStatus:s=>seen.status=s,onPresence(){},onError:e=>{seen.error=e;},onPreview:q=>seen.preview=q});clients.push(t);return {t,seen};
 }
 const K=transport(inv2.kpPath),A=transport(inv2.playerPath);await waitFor(()=>K.t.ready&&A.t.ready,'transport connect');check('both real transport clients connect',K.t.ready&&A.t.ready);
 const fixture=initial();Object.assign(fixture,{started:true,room:'duel',cooperationOpen:true,handsFree:true,feetFree:true,identityKnown:true});
 await K.t.action('import',{data:fixture});await waitFor(()=>A.seen.state?.room==='duel','state sync');
 await A.t.action('activateDuel',{password:'confrontation'});await waitFor(()=>K.seen.state?.duelActive,'activation sync');check('player activation reaches remote keeper client',K.seen.state.duelActive);
 await K.t.action('duelVerdict',{winner:'A'});await waitFor(()=>A.seen.state?.exitOpen.A,'gate sync');check('keeper gate change reaches remote player client',A.seen.state.exitOpen.A);
 await A.t.preview({image:'data:image/jpeg;base64,AAAA',title:'Confrontation',text:'rule inspection'});await waitFor(()=>K.seen.preview?.title==='Confrontation','preview sync');check('game preview still reaches remote keeper',true);
 clearTimeout(A.t.pollTimer);A.t.ready=false;await A.t.connect();check('real transport reconnect retains progress',A.t.ready&&A.seen.state.duelWinner==='A');
 console.log('\n'+checks.length+' additional checks passed. No public deployment was performed.');
 if(process.env.DUEL_TEST_REPORT)fs.writeFileSync(process.env.DUEL_TEST_REPORT,JSON.stringify({version:'1.4.0',count:checks.length,checks,publicDeployment:false},null,2));
}
main().catch(e=>{console.error(e.stack);console.error(logs);process.exitCode=1;}).finally(async()=>{for(const t of clients){t.stopped=true;clearTimeout(t.pollTimer);clearTimeout(t.timer);}if(child&&child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}fs.rmSync(save,{recursive:true,force:true});});
