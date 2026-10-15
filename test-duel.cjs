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
 s=await command(kp,'duelVerdict',{winner:'B'});check('B victory opens RIGHT first exit, B-only access',s.exitOpen.A&&!s.exitOpen.B&&!s.lastOpen.A&&!s.lastOpen.B&&s.duelWinner==='B');
 s=await command(kp,'duelVerdict',{winner:'A'});check('a second duel verdict is ignored',s.duelWinner==='B'&&!s.exitOpen.B);
 s=await command(play,'room',{room:'finalA'});check('A cannot enter B-only RIGHT exit after B wins',s.room==='duel');
 s=await command(play,'finish');check('A cannot skip into ending',!s.ended);
 s=await command(kp,'meta',{actor:'A',confirmed:true});check('nonwinning A cannot unlock a second door',!s.lastOpen.A&&!s.lastOpen.B);
 s=await command(kp,'meta',{actor:'B'});check('B meta verdict requires explicit KP confirmation',!s.lastOpen.A);
 s=await command(kp,'meta',{actor:'B',confirmed:true});check('B meta grants A victory, opens RIGHT final door',s.lastOpen.A&&s.exitOpen.B&&s.wins.at(-1).winner==='A');
 check('RIGHT first exit remains open after meta',s.exitOpen.A);
 check('opening final door does not end automatically',!s.ended);
 s=await command(kp,'finishB');check('KP can advance B through RIGHT double gates',s.ended&&s.endingActor==='B'&&s.endedAt>0);
 s=await command(kp,'resetDuel');check('reset preserves cooperation progress and clears both exits',!s.ended&&!s.duelWinner&&s.cooperationOpen&&s.duelActive&&!s.exitOpen.A&&!s.exitOpen.B);
 s=await command(kp,'duelVerdict',{winner:'A'});check('A victory opens LEFT first exit, A-only access',s.exitOpen.B&&!s.exitOpen.A&&!s.lastOpen.B);
 s=await command(play,'room',{room:'finalA'});check('A can enter LEFT passage after A wins',s.room==='finalA');
 s=await command(play,'finish');check('closed LEFT second door prevents ending',!s.ended);
 s=await command(kp,'meta',{actor:'A',confirmed:true});check('A meta outside cooperation room is ineffective',!s.lastOpen.B);
 await command(play,'room',{room:'duel'});s=await command(play,'room',{room:'cooperate'});check('A may return to cooperation before meta ruling',s.room==='cooperate');
 s=await command(kp,'meta',{actor:'A',confirmed:true});check('A meta awards B victory and opens LEFT final door',s.lastOpen.B&&s.exitOpen.A&&s.wins.at(-1).winner==='B');
 check('LEFT first exit stays open after meta',s.exitOpen.B);
 await command(play,'room',{room:'duel'});s=await command(play,'room',{room:'finalA'});check('A enters LEFT passage after return',s.room==='finalA');
 s=await command(play,'finish');check('A advancing through LEFT final door finishes',s.ended&&s.endingActor==='A'&&s.endedAt>0);
 const complete=valid(s);check('ending survives save validation',complete.ended&&complete.lastOpen.B);
 s=await command(play,'room',{room:'duel'});check('finished A cannot resume exploration',s.ended&&s.room==='finalA');
 s=await command(kp,'resetDuel');s=await command(kp,'duelConfig',{mode:'opponent'});check('final inscription cannot be switched away from specified mapping',s.lastDoorTextMode==='requested');
 s=await command(kp,'doorVerdict',{group:'lastOpen',side:'A',open:true});check('independent manual final door override',s.lastOpen.A&&!s.lastOpen.B);
 s=await command(kp,'doorVerdict',{group:'lastOpen',side:'A',open:false});check('manual final door may be reclosed',!s.lastOpen.A);
 // v1.4 flags refer to opposite indices; convert them to positions in v1.6.
 const old=initial();delete old.gateSchema;old.duelActive=true;old.duelWinner='A';old.exitOpen={A:true,B:false};old.lastOpen={A:true,B:false};
 const fixed=valid(old);check('v1.4 flags migrate to v1.6 gate positions',fixed.gateSchema===3&&fixed.exitOpen.B&&!fixed.exitOpen.A&&fixed.lastOpen.B&&!fixed.lastOpen.A);
 const fresh=valid(fixed);check('upgraded save keeps correct gate positions',fresh.exitOpen.B&&!fresh.exitOpen.A&&fresh.lastOpen.B&&!fresh.lastOpen.A);
 const v15=initial();v15.gateSchema=2;v15.room='finalA';v15.exitOpen={A:true,B:false};v15.duelWinner='B';
 const v16=valid(v15);check('v1.5 save in previously accessible right vestibule returns to duel',v16.gateSchema===3&&v16.room==='duel'&&v16.exitOpen.A&&!v16.exitOpen.B);
 const outerText=html.match(/function outerText\(side\)\{[^\n]+\}/)?.[0];
 check('game includes inspectable door rule formatter',!!outerText);
 const [leftFirst,rightFirst]=vm.runInNewContext(outerText+';[outerText("B"),outerText("A")]');
 check('LEFT first door exact winning/pass participant A',leftFirst.includes('参加者Aが対決に勝利')&&leftFirst.includes('参加者Aしか通ることはできない')&&!leftFirst.includes('参加者Bしか'));
 check('RIGHT first door exact winning/pass participant B',rightFirst.includes('参加者Bが対決に勝利')&&rightFirst.includes('参加者Bしか通ることはできない')&&!rightFirst.includes('参加者Aしか'));
 check('3D plaque uses the actual winner as its passage restriction',html.includes("'\\u53c2\\u52a0\\u8005'+winner+'\\u3057\\u304b"));
 // Return sign's texture and physical mesh must match so the characters remain undistorted.
 const returnLabel=html.match(/const back=this\.textTexture\('cooperation-return',\[[^\n]+?,\{font:(\d+),[^\n]*?w:(\d+),h:(\d+)\}\);this\.panel\(0,2\.77,5\.42,([\d.]+),([\d.]+),back,'duelBack',Math\.PI\);/);
 check('duel return sign has normal character aspect ratio',!!returnLabel&&Math.abs((+returnLabel[2]/+returnLabel[3])/(+returnLabel[4]/+returnLabel[5])-1)<.08);
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
 await K.t.action('duelVerdict',{winner:'A'});await waitFor(()=>A.seen.state?.exitOpen.B,'gate sync');check('A victory opens LEFT remotely',A.seen.state.exitOpen.B&&!A.seen.state.exitOpen.A);
 await A.t.preview({image:'data:image/jpeg;base64,AAAA',title:'Confrontation',text:'rule inspection'});await waitFor(()=>K.seen.preview?.title==='Confrontation','preview sync');check('game preview still reaches remote keeper',true);
 clearTimeout(A.t.pollTimer);A.t.ready=false;await A.t.connect();check('real transport reconnect retains progress',A.t.ready&&A.seen.state.duelWinner==='A');
 console.log('\n'+checks.length+' additional checks passed. No public deployment was performed.');
 if(process.env.DUEL_TEST_REPORT)fs.writeFileSync(process.env.DUEL_TEST_REPORT,JSON.stringify({version:'1.6.1',count:checks.length,checks,publicDeployment:false},null,2));
}
main().catch(e=>{console.error(e.stack);console.error(logs);process.exitCode=1;}).finally(async()=>{for(const t of clients){t.stopped=true;clearTimeout(t.pollTimer);clearTimeout(t.timer);}if(child&&child.exitCode===null){const done=once(child,'exit');child.kill('SIGTERM');await done;}fs.rmSync(save,{recursive:true,force:true});});
