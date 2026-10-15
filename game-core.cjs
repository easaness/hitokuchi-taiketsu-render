'use strict';
const GLYPH={heart:'♥',heart0:'♥',diamond:'◆',cross:'×',star:'★',spade:'♠',circle:'●'},PNAME={heart:'ハート',heart0:'ハート（初期配置）',diamond:'ダイヤ',cross:'バツ印',star:'星',spade:'スペード',circle:'丸'};
const ROD_EMERGE_MS=3000;
const INFO={cuffs:['手錠','◯◯'],ankles:['足枷','∪∪'],rod:['細長い棒','╱'],tank:['水槽','▱'],key:['木の鍵','⚿']};
function japanDate(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function initial(){return {version:1,rev:1,room:'start',started:false,identityKnown:false,rodOfferedAt:0,sessionDate:japanDate(),handsFree:false,feetFree:false,rugLifted:false,hatchOpen:false,bColors:[0,1,2],rodLocation:'B',aHolding:false,bHolding:false,tankLocation:'floor',waterPoured:false,keyLocation:'tube',chestOpen:false,aPieces:[],bPieces:['heart0'],aSlots:[null,null],bSlots:['heart0',null],aSubmitted:false,bSubmitted:false,gateFailed:false,cooperationOpen:false,scopeCompleted:false,duelActive:false,duelActivatedAt:0,duelWinner:null,duelResolvedAt:0,exitOpen:{A:false,B:false},lastOpen:{A:false,B:false},lastDoorTextMode:'requested',gateSchema:4,ended:false,endedAt:0,endingActor:null,aSolution:['cross','diamond'],bSolution:['heart','circle'],items:[],wins:[],seen:[],message:{text:'白い部屋で目が覚めた。目の前に、扉がある。',speaker:'OBSERVATION'},log:[]};}
function valid(s){if(!s||s.version!==1||!['start','cooperate','duel','finalA'].includes(s.room))throw Error('この探索版のセーブデータではありません。');let d=initial();const bools=['identityKnown','started','handsFree','feetFree','rugLifted','hatchOpen','aHolding','bHolding','waterPoured','chestOpen','aSubmitted','bSubmitted','gateFailed','cooperationOpen','scopeCompleted','duelActive','ended'];bools.forEach(k=>d[k]=!!s[k]);['sessionDate','rodLocation','tankLocation','keyLocation'].forEach(k=>{if(typeof s[k]==='string')d[k]=s[k];});if(!/^\d{4}-\d{2}-\d{2}$/.test(d.sessionDate))d.sessionDate=japanDate();d.identityKnown=d.identityKnown||(Array.isArray(s.seen)&&s.seen.some(x=>typeof x==='string'&&x.endsWith(':body')));d.rodOfferedAt=Number.isFinite(s.rodOfferedAt)?s.rodOfferedAt:0;if(!['B','hatch','A'].includes(d.rodLocation))d.rodLocation='B';d.rev=Number.isFinite(s.rev)?s.rev:1;d.room=s.room;for(const k of ['aPieces','bPieces'])d[k]=Array.isArray(s[k])?s[k].filter(x=>Object.hasOwn(GLYPH,x)).slice(0,8):d[k];for(const k of ['aSlots','bSlots','aSolution','bSolution'])d[k]=[0,1].map(i=>Object.hasOwn(GLYPH,s[k]?.[i])?s[k][i]:null);if(d.aSolution.some(x=>!x))d.aSolution=['cross','diamond'];if(d.bSolution.some(x=>!x))d.bSolution=['heart','circle'];d.bColors=[0,1,2].map((_,i)=>[0,1,2].includes(s.bColors?.[i])?s.bColors[i]:i);d.items=Array.isArray(s.items)?[...new Set(s.items.filter(x=>Object.hasOwn(INFO,x)))]:[];d.seen=Array.isArray(s.seen)?s.seen.filter(x=>typeof x==='string').slice(0,200):[];d.log=Array.isArray(s.log)?s.log.filter(x=>typeof x?.text==='string').slice(-200).map(x=>({text:x.text.slice(0,3000),speaker:String(x.speaker||'OBSERVATION').slice(0,50),at:Number(x.at)||0})):[];d.wins=Array.isArray(s.wins)?s.wins.filter(x=>x?.winner==='A'||x?.winner==='B').slice(-100):[];if(typeof s.message?.text==='string')d.message={text:s.message.text.slice(0,3000),speaker:String(s.message.speaker||'OBSERVATION').slice(0,50)};for(const k of ['duelActivatedAt','duelResolvedAt','endedAt'])d[k]=Number.isFinite(s[k])?s[k]:0;
for(const k of ['duelWinner','endingActor'])d[k]=['A','B'].includes(s[k])?s[k]:null;
for(const k of ['exitOpen','lastOpen'])d[k]={A:!!s[k]?.A,B:!!s[k]?.B};
// The older v1.4 save used reversed gate indices. v1.5 had correct open conditions,
// but allowed A through the wrong side. In both cases, move A back to the round room
// when importing an unfinished save from the previous vestibule location.
if(![2,3,4].includes(s.gateSchema)){
 for(const k of ['exitOpen','lastOpen'])d[k]={A:!!s[k]?.B,B:!!s[k]?.A};
}
// One continuous confrontation room, including the short passages behind EXIT.
// Older saves did not always open the diagonal last door on a victory.
if(s.gateSchema!==4){
 const previousWinners=[...d.wins.map(x=>x.winner),d.duelWinner];
 for(const winner of previousWinners){
  if(winner==='A'||winner==='B'){
   d.exitOpen[winner==='A'?'B':'A']=true;
   d.lastOpen[winner]=true;
  }
 }
}
if(d.room==='finalA')d.room='duel';
d.lastDoorTextMode='requested';d.gateSchema=4;
// v1.3 ended at the threshold. Importing it now resumes in the expanded game.
d.scopeCompleted=false;
return d;}
function log(s,text,speaker='OBSERVATION'){s.message={text,speaker};s.log.push({text,speaker,at:Date.now()});if(s.log.length>200)s.log.shift();}
function addItem(s,id){if(!s.items.includes(id))s.items.push(id);}function removeItem(s,id){s.items=s.items.filter(x=>x!==id);}
function evaluate(s){
 if(!s.handsFree&&s.bColors.join(',')==='1,2,0'){s.handsFree=true;addItem(s,'cuffs');log(s,'カチリ、と音がした。\n両手の拘束が外れた。外れた手錠が手元にある。','SOMETHING CHANGED');}
 if(!s.feetFree&&s.aHolding&&s.bHolding&&s.rodLocation==='A'&&s.handsFree&&s.room==='cooperate'){s.feetFree=true;s.aHolding=false;addItem(s,'ankles');log(s,'3つのボタンが同時に押された。\n足の拘束が外れ、モニターの表示が切り替わった。','SOMETHING CHANGED');}
 if(s.aSubmitted&&s.bSubmitted&&!s.cooperationOpen&&!s.gateFailed){const normalize=x=>x==='heart0'?'heart':x;const ok=s.aSlots.every((x,i)=>normalize(x)===s.aSolution[i])&&s.bSlots.every((x,i)=>normalize(x)===s.bSolution[i]);if(!ok){s.gateFailed=true;log(s,'短い電子音が鳴った。\n扉は開かない。ピースはもう動かせない。','SOMETHING CHANGED');}else if(s.handsFree&&s.feetFree&&s.chestOpen){s.cooperationOpen=true;log(s,'重い錠が外れる音が響いた。\n対決の間への扉が、ゆっくりと開いた。','SOMETHING CHANGED');}}
}
function act(s,type,p={}){
 if(s.ended&&!['resetDuel','config','duelConfig','kpMessage'].includes(type))return true;
 const requireHands=()=>{if(!s.handsFree){log(s,'両手はまだ拘束されている。この状態ではうまく扱えそうにない。');return false;}return true;};
 switch(type){
 case 'start':s.started=true;log(s,'目の前には扉があるのみ。\n手足は拘束されている。\n足元には、やわらかなじゅうたんが敷かれている。');break;
 case 'inspect':if(typeof p.id==='string'&&p.id.endsWith(':body'))s.identityKnown=true;if(!s.seen.includes(p.id))s.seen.push(p.id);if(p.text&&!s.log.some(x=>x.text===p.text))log(s,p.text);else if(p.text)s.message={text:p.text,speaker:'OBSERVATION'};break;
 case 'room': {
   if(s.ended)break;
   const adjacency={start:['cooperate'],cooperate:['start','duel'],duel:['cooperate']};
   if(!adjacency[s.room]?.includes(p.room))break;
   if(p.room==='duel'&&!s.cooperationOpen)break;
   s.room=p.room;s.aHolding=false;s.scopeCompleted=false;
   const texts={start:'\u59cb\u307e\u308a\u306e\u90e8\u5c4b\u306b\u623b\u3063\u305f\u3002',cooperate:'\u6249\u3092\u304f\u3050\u308b\u3068\u3001\u767d\u3044\u90e8\u5c4b\u3060\u3063\u305f\u3002\n\u5965\u306b\u6249\u304c\u3042\u308a\u3001\u305d\u306e\u53f3\u306b\u30e2\u30cb\u30bf\u30fc\u304c\u3042\u308b\u3002',duel:'\u6249\u306e\u5148\u306f\u3001\u767d\u3044\u5186\u5f62\u306e\u90e8\u5c4b\u3060\u3063\u305f\u3002\n\u4e2d\u592e\u306b\u7aef\u672b\u3002\u5965\u306b\u306f\u300cEXIT\u300d\u3068\u66f8\u304b\u308c\u305f\u4e8c\u3064\u306e\u6249\u304c\u3042\u308b\u3002',finalA:'\u5de6\u306eEXIT\u3092\u304f\u3050\u3063\u305f\u3002\n\u77ed\u3044\u901a\u8def\u306e\u5148\u306b\u3001\u3082\u3046\u4e00\u679a\u306e\u6249\u304c\u3042\u308b\u3002'};
   log(s,texts[p.room]);break;
 }
 case 'activateDuel':
   if(s.room==='duel'&&!s.ended&&!s.duelActive){
     if(typeof p.password==='string'&&p.password.trim().toLowerCase()==='confrontation'){
       s.duelActive=true;s.duelActivatedAt=Date.now();
       for(const win of s.wins)if(['A','B'].includes(win.winner)){s.exitOpen[win.winner==='A'?'B':'A']=true;s.lastOpen[win.winner]=true;}
       log(s,'\u7aef\u672b\u304c\u9759\u304b\u306b\u8d77\u52d5\u3057\u305f\u3002\n\u4e2d\u592e\u306b\u5149\u306e\u6587\u5b57\u304c\u6d6e\u304b\u3073\u3001\u5bfe\u6c7a\u306e\u30eb\u30fc\u30eb\u304c\u8868\u793a\u3055\u308c\u305f\u3002','SOMETHING CHANGED');
     }else log(s,'\u8d77\u52d5\u30d1\u30b9\u30ef\u30fc\u30c9\u304c\u9055\u3046\u3002\n\u7aef\u672b\u306f\u3001\u9759\u304b\u306a\u307e\u307e\u3060\u3002');
   }break;
 case 'duelVerdict':
   if(s.duelActive&&!s.duelWinner&&!s.ended&&['A','B'].includes(p.winner)){
     s.duelWinner=p.winner;s.duelResolvedAt=Date.now();s.exitOpen[p.winner==='A'?'B':'A']=true;s.lastOpen[p.winner]=true;
     s.wins.push({winner:p.winner,reason:'\u5bfe\u6c7a\u306e\u9593\u3067\u306e\u5bfe\u6c7a',at:Date.now()});
     log(s,'\u53c2\u52a0\u8005'+p.winner+'\u306e\u52dd\u5229\u304c\u78ba\u5b9a\u3057\u305f\u3002\n'+(p.winner==='A'?'\u5de6EXIT\u3068\u53f3\u306e\u6700\u5f8c\u306e\u6249':'\u53f3EXIT\u3068\u5de6\u306e\u6700\u5f8c\u306e\u6249')+'\u304c\u3001\u540c\u6642\u306b\u958b\u3044\u3066\u3044\u304f\u3002','KP\u306e\u88c1\u5b9a');
   }break;
 case 'doorVerdict':
   if(['exitOpen','lastOpen'].includes(p.group)&&['A','B'].includes(p.side)&&!s.ended){
     s[p.group][p.side]=!!p.open;
     log(s,'\u9060\u304f\u3067\u3001\u6249\u306e\u4f5c\u52d5\u3059\u308b\u97f3\u304c\u3057\u305f\u3002','SOMETHING CHANGED');
   }break;
 case 'duelConfig':
   s.lastDoorTextMode='requested';break;
 case 'resetDuel':
   s.duelWinner=null;s.duelResolvedAt=0;s.exitOpen={A:false,B:false};s.lastOpen={A:false,B:false};s.ended=false;s.endedAt=0;s.endingActor=null;
   s.wins=[];
   log(s,'\u5bfe\u6c7a\u306e\u52dd\u6557\u3068\u51fa\u53e3\u306e\u72b6\u614b\u3092\u30ea\u30bb\u30c3\u30c8\u3057\u305f\u3002','KP\u306e\u88c1\u5b9a');break;
 case 'finish':
   if(!s.ended&&s.room==='duel'&&s.exitOpen.B&&s.lastOpen.B){s.ended=true;s.endedAt=Date.now();s.endingActor='A';s.aHolding=false;log(s,'\u6249\u306e\u5411\u3053\u3046\u3078\u3001\u4e00\u6b69\u8e0f\u307f\u51fa\u3057\u305f\u3002');}break;
 case 'finishB':
   if(!s.ended&&s.exitOpen.A&&s.lastOpen.A){s.ended=true;s.endedAt=Date.now();s.endingActor='B';s.aHolding=false;log(s,'\u53c2\u52a0\u8005B\u304c\u3001\u6700\u5f8c\u306e\u6249\u306e\u5148\u3078\u9032\u3093\u3060\u3002','KP\u306e\u88c1\u5b9a');}break;
 case 'rug':if(s.room==='start'&&requireHands()){s.rugLifted=true;log(s,'じゅうたんをめくった。\n床に、大きなダイヤの模様が描かれている。');}break;
 case 'unlock':if(s.room==='cooperate'&&requireHands()){const answer=s.sessionDate.slice(5,7)+s.sessionDate.slice(8,10);if(String(p.code)===answer){s.hatchOpen=true;log(s,'番号錠が外れ、小さな扉が開いた。\n向こう側にも、空間が続いている。','SOMETHING CHANGED');}else log(s,'番号錠は動かない。番号が違うようだ。');}break;
 case 'aHold':s.aHolding=!!p.value&&p.item==='rod'&&s.room==='cooperate'&&s.handsFree&&s.rodLocation==='A'&&s.items.includes('rod')&&!s.feetFree;break;
 case 'takeTank':if(s.room==='cooperate'&&requireHands()&&s.tankLocation==='floor'){s.tankLocation='A';addItem(s,'tank');log(s,'水槽を両手で持ち上げた。小さいので、運べそうだ。');}break;
 case 'putTank':if(s.room==='cooperate'&&s.tankLocation==='A'){s.tankLocation='floor';removeItem(s,'tank');log(s,'水槽を、部屋の隅の床に戻した。');}break;
 case 'pour':if(p.item==='tank'&&s.items.includes('tank')&&s.room==='cooperate'&&s.hatchOpen&&s.tankLocation==='A'&&!s.waterPoured&&requireHands()){s.waterPoured=true;log(s,'水槽を傾け、小さな扉の向こうへ水を流した。\n水槽は空になった。');}break;
 case 'openBox':if(p.item==='key'&&s.items.includes('key')&&s.room==='cooperate'&&s.keyLocation==='A'&&requireHands()&&!s.chestOpen){s.chestOpen=true;s.keyLocation='box';removeItem(s,'key');s.aPieces=['heart','diamond','cross','star','spade','circle'];log(s,'木の鍵を差し込むと、箱が開いた。\n中から、マークのついた6つのピースが出てきた。','SOMETHING CHANGED');}break;
 case 'sendPiece':if(s.hatchOpen&&s.room==='cooperate'&&requireHands()&&s.aPieces.includes(p.piece)&&!s.aSubmitted){s.aPieces=s.aPieces.filter(x=>x!==p.piece);s.aSlots=s.aSlots.map(x=>x===p.piece?null:x);s.bPieces.push(p.piece);log(s,PNAME[p.piece]+'のピースを、小さな扉の向こうへ渡した。');}break;
 case 'aSlot':if(s.room==='cooperate'&&requireHands()&&!s.aSubmitted&&[0,1].includes(p.slot)&&(p.piece===null||s.aPieces.includes(p.piece))){if(p.piece)s.aSlots=s.aSlots.map(x=>x===p.piece?null:x);s.aSlots[p.slot]=p.piece;}break;
 case 'aSubmit':if(s.room==='cooperate'&&s.aSlots.every(Boolean)&&!s.aSubmitted&&requireHands()){s.aSubmitted=true;log(s,'扉にはめるピースの配置を確定した。'+(!s.bSubmitted?'\n今のところ、扉に変化はない。':''));}break;
 case 'bColor':if(!s.handsFree&&[0,1,2].includes(p.index))s.bColors[p.index]=(s.bColors[p.index]+1)%3;break;
 case 'giveRod':if(s.hatchOpen&&s.rodLocation==='B'){s.rodLocation='hatch';s.rodOfferedAt=Date.now();log(s,'小さな扉の奥から、細長い棒がゆっくりと差し出されてくる。','SOMETHING CHANGED');}break;
 case 'takeRod':if(s.room==='cooperate'&&s.hatchOpen&&s.rodLocation==='hatch'&&Date.now()-s.rodOfferedAt>=ROD_EMERGE_MS&&requireHands()){s.rodLocation='A';addItem(s,'rod');log(s,'差し出された棒を受け取った。\n長さは3メートルほどある。');}break;
 case 'bHold':s.bHolding=!!p.value;break;
 case 'takeKey':if(s.waterPoured&&s.keyLocation==='tube')s.keyLocation='B';break;
 case 'giveKey':if(s.hatchOpen&&s.keyLocation==='B'){s.keyLocation='A';addItem(s,'key');log(s,'小さな扉から、木製の鍵が差し出された。','Bから受け取った');}break;
 case 'bSlot':if(!s.bSubmitted&&[0,1].includes(p.slot)&&(p.piece===null||s.bPieces.includes(p.piece))){if(p.piece)s.bSlots=s.bSlots.map(x=>x===p.piece?null:x);s.bSlots[p.slot]=p.piece;}break;
 case 'bSubmit':if(s.bSlots.every(Boolean)&&!s.bSubmitted)s.bSubmitted=true;break;
 case 'returnPiece':if(s.hatchOpen&&!s.bSubmitted&&p.piece!=='heart0'&&s.bPieces.includes(p.piece)){s.bPieces=s.bPieces.filter(x=>x!==p.piece);s.bSlots=s.bSlots.map(x=>x===p.piece?null:x);s.aPieces.push(p.piece);log(s,PNAME[p.piece]+'のピースを、小さな扉から受け取った。','Bから受け取った');}break;
 case 'kpMessage':if(typeof p.text==='string'&&p.text.trim())log(s,p.text.trim().slice(0,3000),p.asB?'Bの声':'KPからの描写');break;
 case 'meta':
   if(!s.ended&&s.duelActive&&s.duelWinner===p.actor&&['A','B'].includes(p.actor)&&p.confirmed===true){
     // In the cooperation room, a meta statement grants victory to the OTHER
     // participant. KP validates B's location; the server validates A's.
     if(p.actor==='A'&&s.room!=='cooperate')break;
     const winner=p.actor==='A'?'B':'A';
     if(s.lastOpen[winner])break; // prevent adjudicating the same statement twice
     s.wins.push({winner,actor:p.actor,reason:'\u5354\u529b\u306e\u9593\u3067'+p.actor+'\u304c\u30e1\u30bf\u767a\u8a00',at:Date.now()});
     // First EXIT: LEFT requires A's victory; RIGHT requires B's victory.
     // Final door: LEFT requires B's victory; RIGHT requires A's victory.
     s.exitOpen[winner==='A'?'B':'A']=true;
     s.lastOpen[winner]=true;
     log(s,'\u53c2\u52a0\u8005'+winner+'\u304c\u3001\u5bfe\u6c7a\u306b\u52dd\u5229\u3057\u305f\u3002\n\u6249\u306e\u9320\u304c\u5916\u308c\u308b\u97f3\u304c\u97ff\u3044\u305f\u3002','KP\u306e\u88c1\u5b9a');
   }break;
 case 'scopeEnd':if(s.cooperationOpen&&s.room==='cooperate'){s.room='duel';s.scopeCompleted=false;s.aHolding=false;}break;
 case 'resume':s.scopeCompleted=false;break;
 case 'config':if(/^\d{4}-\d{2}-\d{2}$/.test(p.date||''))s.sessionDate=p.date;for(const k of ['aSolution','bSolution'])if(Array.isArray(p[k])&&p[k].length===2&&p[k].every(x=>Object.hasOwn(GLYPH,x)&&x!=='heart0'))s[k]=p[k];break;
 case 'retryGate':s.aSubmitted=false;s.bSubmitted=false;s.gateFailed=false;s.cooperationOpen=false;s.scopeCompleted=false;log(s,'KPの裁定により、ピースの配置をやり直せる状態になった。','KPの裁定');break;
 case 'override':if(['handsFree','feetFree','hatchOpen','cooperationOpen'].includes(p.key)){s[p.key]=!!p.value;if(p.key==='handsFree'&&p.value)addItem(s,'cuffs');if(p.key==='feetFree'&&p.value){addItem(s,'ankles');s.aHolding=false;}log(s,'KPの裁定により、部屋の状態が変化した。','KPの裁定');}break;
 default:return false;
 }evaluate(s);return true;
}

module.exports={initial,valid,act,evaluate};
