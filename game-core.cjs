'use strict';
const GLYPH={heart:'♥',heart0:'♥',diamond:'◆',cross:'×',star:'★',spade:'♠',circle:'●'},PNAME={heart:'ハート',heart0:'ハート（初期配置）',diamond:'ダイヤ',cross:'バツ印',star:'星',spade:'スペード',circle:'丸'};
const ROD_EMERGE_MS=3000;
const INFO={cuffs:['手錠','◯◯'],ankles:['足枷','∪∪'],rod:['細長い棒','╱'],tank:['水槽','▱'],key:['木の鍵','⚿']};
function japanDate(){return new Intl.DateTimeFormat('sv-SE',{timeZone:'Asia/Tokyo',year:'numeric',month:'2-digit',day:'2-digit'}).format(new Date());}
function initial(){return {version:1,rev:1,room:'start',started:false,identityKnown:false,rodOfferedAt:0,sessionDate:japanDate(),handsFree:false,feetFree:false,rugLifted:false,hatchOpen:false,bColors:[0,1,2],rodLocation:'B',aHolding:false,bHolding:false,tankLocation:'floor',waterPoured:false,keyLocation:'tube',chestOpen:false,aPieces:[],bPieces:['heart0'],aSlots:[null,null],bSlots:['heart0',null],aSubmitted:false,bSubmitted:false,gateFailed:false,cooperationOpen:false,scopeCompleted:false,aSolution:['cross','diamond'],bSolution:['heart','circle'],items:[],wins:[],seen:[],message:{text:'白い部屋で目が覚めた。目の前に、扉がある。',speaker:'OBSERVATION'},log:[]};}
function valid(s){if(!s||s.version!==1||!['start','cooperate'].includes(s.room))throw Error('この探索版のセーブデータではありません。');let d=initial();const bools=['identityKnown','started','handsFree','feetFree','rugLifted','hatchOpen','aHolding','bHolding','waterPoured','chestOpen','aSubmitted','bSubmitted','gateFailed','cooperationOpen','scopeCompleted'];bools.forEach(k=>d[k]=!!s[k]);['sessionDate','rodLocation','tankLocation','keyLocation'].forEach(k=>{if(typeof s[k]==='string')d[k]=s[k];});if(!/^\d{4}-\d{2}-\d{2}$/.test(d.sessionDate))d.sessionDate=japanDate();d.identityKnown=d.identityKnown||(Array.isArray(s.seen)&&s.seen.some(x=>typeof x==='string'&&x.endsWith(':body')));d.rodOfferedAt=Number.isFinite(s.rodOfferedAt)?s.rodOfferedAt:0;if(!['B','hatch','A'].includes(d.rodLocation))d.rodLocation='B';d.rev=Number.isFinite(s.rev)?s.rev:1;d.room=s.room;for(const k of ['aPieces','bPieces'])d[k]=Array.isArray(s[k])?s[k].filter(x=>Object.hasOwn(GLYPH,x)).slice(0,8):d[k];for(const k of ['aSlots','bSlots','aSolution','bSolution'])d[k]=[0,1].map(i=>Object.hasOwn(GLYPH,s[k]?.[i])?s[k][i]:null);if(d.aSolution.some(x=>!x))d.aSolution=['cross','diamond'];if(d.bSolution.some(x=>!x))d.bSolution=['heart','circle'];d.bColors=[0,1,2].map((_,i)=>[0,1,2].includes(s.bColors?.[i])?s.bColors[i]:i);d.items=Array.isArray(s.items)?[...new Set(s.items.filter(x=>Object.hasOwn(INFO,x)))]:[];d.seen=Array.isArray(s.seen)?s.seen.filter(x=>typeof x==='string').slice(0,200):[];d.log=Array.isArray(s.log)?s.log.filter(x=>typeof x?.text==='string').slice(-200).map(x=>({text:x.text.slice(0,3000),speaker:String(x.speaker||'OBSERVATION').slice(0,50),at:Number(x.at)||0})):[];d.wins=Array.isArray(s.wins)?s.wins.filter(x=>x?.winner==='A'||x?.winner==='B').slice(-100):[];if(typeof s.message?.text==='string')d.message={text:s.message.text.slice(0,3000),speaker:String(s.message.speaker||'OBSERVATION').slice(0,50)};return d;}
function log(s,text,speaker='OBSERVATION'){s.message={text,speaker};s.log.push({text,speaker,at:Date.now()});if(s.log.length>200)s.log.shift();}
function addItem(s,id){if(!s.items.includes(id))s.items.push(id);}function removeItem(s,id){s.items=s.items.filter(x=>x!==id);}
function evaluate(s){
 if(!s.handsFree&&s.bColors.join(',')==='1,2,0'){s.handsFree=true;addItem(s,'cuffs');log(s,'カチリ、と音がした。\n両手の拘束が外れた。外れた手錠が手元にある。','SOMETHING CHANGED');}
 if(!s.feetFree&&s.aHolding&&s.bHolding&&s.rodLocation==='A'&&s.handsFree&&s.room==='cooperate'){s.feetFree=true;s.aHolding=false;addItem(s,'ankles');log(s,'3つのボタンが同時に押された。\n足の拘束が外れ、モニターの表示が切り替わった。','SOMETHING CHANGED');}
 if(s.aSubmitted&&s.bSubmitted&&!s.cooperationOpen&&!s.gateFailed){const normalize=x=>x==='heart0'?'heart':x;const ok=s.aSlots.every((x,i)=>normalize(x)===s.aSolution[i])&&s.bSlots.every((x,i)=>normalize(x)===s.bSolution[i]);if(!ok){s.gateFailed=true;log(s,'短い電子音が鳴った。\n扉は開かない。ピースはもう動かせない。','SOMETHING CHANGED');}else if(s.handsFree&&s.feetFree&&s.chestOpen){s.cooperationOpen=true;log(s,'重い錠が外れる音が響いた。\n対決の間への扉が、ゆっくりと開いた。','SOMETHING CHANGED');}}
}
function act(s,type,p={}){
 const requireHands=()=>{if(!s.handsFree){log(s,'両手はまだ拘束されている。この状態ではうまく扱えそうにない。');return false;}return true;};
 switch(type){
 case 'start':s.started=true;log(s,'目の前には扉があるのみ。\n手足は拘束されている。\n足元には、やわらかなじゅうたんが敷かれている。');break;
 case 'inspect':if(typeof p.id==='string'&&p.id.endsWith(':body'))s.identityKnown=true;if(!s.seen.includes(p.id))s.seen.push(p.id);if(p.text&&!s.log.some(x=>x.text===p.text))log(s,p.text);else if(p.text)s.message={text:p.text,speaker:'OBSERVATION'};break;
 case 'room':if(p.room==='cooperate'||p.room==='start'){s.room=p.room;s.aHolding=false;log(s,p.room==='cooperate'?'扉をくぐると、全体的に白い部屋だった。\n奥に扉があり、その右にモニターがある。':'始まりの部屋に戻った。\n足元には、最初に目覚めたときのじゅうたんがある。');}break;
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
 case 'meta':if(p.actor==='A'||p.actor==='B'){const winner=p.actor==='A'?'B':'A';s.wins.push({winner,reason:'協力の間で'+p.actor+'がメタ発言',at:Date.now()});log(s,'参加者'+winner+'が、対決に勝利した。','KPの裁定');}break;
 case 'scopeEnd':if(s.cooperationOpen){s.scopeCompleted=true;s.aHolding=false;}break;
 case 'resume':s.scopeCompleted=false;break;
 case 'config':if(/^\d{4}-\d{2}-\d{2}$/.test(p.date||''))s.sessionDate=p.date;for(const k of ['aSolution','bSolution'])if(Array.isArray(p[k])&&p[k].length===2&&p[k].every(x=>Object.hasOwn(GLYPH,x)&&x!=='heart0'))s[k]=p[k];break;
 case 'retryGate':s.aSubmitted=false;s.bSubmitted=false;s.gateFailed=false;s.cooperationOpen=false;s.scopeCompleted=false;log(s,'KPの裁定により、ピースの配置をやり直せる状態になった。','KPの裁定');break;
 case 'override':if(['handsFree','feetFree','hatchOpen','cooperationOpen'].includes(p.key)){s[p.key]=!!p.value;if(p.key==='handsFree'&&p.value)addItem(s,'cuffs');if(p.key==='feetFree'&&p.value){addItem(s,'ankles');s.aHolding=false;}log(s,'KPの裁定により、部屋の状態が変化した。','KPの裁定');}break;
 default:return false;
 }evaluate(s);return true;
}

module.exports={initial,valid,act,evaluate};
