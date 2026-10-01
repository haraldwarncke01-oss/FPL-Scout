const assert=require('node:assert/strict');
const fs=require('node:fs');
const P=require('../site/planner.js');
const A=require('../site/analysis.js');
const data=JSON.parse(fs.readFileSync(__dirname+'/../site/data/fpl.json','utf8'));
const byId=new Map(data.players.map(p=>[p.id,p]));
const vm=require('node:vm');
// A two-transfer package: a cheaper defender funds a premium midfielder.
function transferFixture(){
  const list=[],forecasts={};
  for(const [position,count] of Object.entries(P.quotas))for(let i=0;i<count;i++){
    const id=list.length+1;list.push({id,name:'Own '+id,position,price:5,teamId:id,canSelect:true});
  }
  const mid=list.find(p=>p.position==='MID'),def=list.find(p=>p.position==='DEF');mid.price=10;def.price=6;
  list.push({id:101,name:'Premium MID',position:'MID',price:14,teamId:21,canSelect:true},
    {id:102,name:'Budget DEF',position:'DEF',price:2,teamId:22,canSelect:true});
  for(const p of list)forecasts[p.id]={expectedMinutesPerMatch:90,availability:1,events:[6,7,8].map(gameweek=>({gameweek,points:p.id===101?10:p.id===102?3:4,minutes:90,fixtureCount:1})),totals:{}};
  return {data:{players:list,planning:{events:[6,7,8],forecasts}},own:list.slice(0,15),mid,def};
}
{
  const f=transferFixture(),one=P.transferPlans(f.data,f.own,3,0,{}, {freeTransfers:1});
  assert.equal(one.recommended.count,0,'One free transfer cannot fund the premium player');
  const two=P.transferPlans(f.data,f.own,3,0,{}, {freeTransfers:2});
  assert.equal(two.recommended.count,2);assert.equal(two.recommended.bankAfter,0);
  assert.equal(two.recommended.hit,0);assert.ok(two.recommended.moves.some(m=>m.incoming===101));
  assert.ok(two.recommended.moves.some(m=>m.incoming===102));
  assert.equal(P.validateSquad(two.recommended.squad.map(id=>f.data.players.find(p=>p.id===id))),null);
  assert.ok(Math.abs(two.recommended.points-P.horizonScore(f.data,two.recommended.squad.map(id=>f.data.players.find(p=>p.id===id)),3))<1e-7);
  const paid=P.transferPlans(f.data,f.own,3,0,{}, {freeTransfers:1,allowHit:true});
  assert.equal(paid.recommended.hit,4);assert.equal(paid.recommended.netGain,paid.recommended.grossGain-4);
  const sale=P.transferPlans(f.data,f.own,3,0,{[f.mid.id]:7}, {freeTransfers:2});
  assert.equal(sale.recommended.count,0,'Actual selling price must control affordability');
  const saved=P.transferPlans(f.data,f.own,3,0,{}, {freeTransfers:5});
  assert.ok(saved.alternatives.every(p=>p.count<=5));
  const zero=P.transferPlans(f.data,f.own,3,0,{}, {freeTransfers:0});assert.equal(zero.maxMoves,0);assert.equal(zero.recommended.count,0);
  assert.ok(P.transferPlans(f.data,f.own,3,-1,{}, {freeTransfers:2}).error);
}
{
  const f=transferFixture();f.def.teamId=21;f.own[0].teamId=21;f.own[12].teamId=21;
  const one=P.transferPlans(f.data,f.own,3,4,{}, {freeTransfers:1});assert.equal(one.recommended.count,0,'Cannot buy a fourth club player');
  const two=P.transferPlans(f.data,f.own,3,4,{}, {freeTransfers:2});assert.equal(two.recommended.count,2);
  assert.equal(P.validateSquad(two.recommended.squad.map(id=>f.data.players.find(p=>p.id===id))),null,'Joint club-limit repair is legal');
}
{
  const f=transferFixture();let reply;
  const context={postMessage:value=>{reply=value;}};context.self=context;vm.createContext(context);
  context.importScripts=file=>vm.runInContext(fs.readFileSync(__dirname+'/../site/'+file,'utf8'),context);
  vm.runInContext(fs.readFileSync(__dirname+'/../site/transfer-worker.js','utf8'),context);
  context.onmessage({data:{data:f.data,ids:f.own.map(p=>p.id),horizon:3,bank:0,sales:{},options:{freeTransfers:2}}});
  assert.equal(reply.result.recommended.count,2,'Worker must load planner and return a funded plan');
}
{
  const f=transferFixture(),mainGK=f.own[0],reserve=f.own[1];
  f.data.players=f.own.concat({id:103,name:'Better reserve GK',position:'GKP',teamId:30,price:4,canSelect:true});
  for(const event of f.data.planning.forecasts[mainGK.id].events)event.points=8;
  for(const event of f.data.planning.forecasts[reserve.id].events)event.points=0;
  f.data.planning.forecasts[103]={expectedMinutesPerMatch:90,availability:1,events:[6,7,8].map(gameweek=>({gameweek,points:3,fixtureCount:1}))};
  const result=P.transferPlans(f.data,f.own,3,0,{}, {freeTransfers:1});
  assert.equal(result.recommended.count,0,'A better unused bench keeper adds no starting-XI points');
  assert.equal(result.alternatives.find(p=>p.count===1).grossGain,0);
  const after=result.alternatives.find(p=>p.count===1).lineups[0];assert.equal(after.starters.length,11);assert.equal(after.bench.length,4);
  assert.ok(after.bench.includes(103));assert.ok(!after.starters.includes(103));
  const order=P.benchOrder(f.data,after);assert.equal(order.outfield.length,3);assert.equal(order.goalkeeper,103);assert.ok(after.starters.includes(order.vice));
}
for(const plan of Object.values(data.planning.plans)){
  if(!plan.squad){assert.equal(plan.status,'unavailable');continue;}
  assert.equal(P.validateSquad(plan.squad.map(id=>byId.get(id))),null);
  assert.ok(plan.cost<=100);
  let sum=0;
  for(const l of plan.lineups){
    if(plan.mode==='benchboost')assert.ok(Math.abs(P.bestXI(data,plan.squad.map(id=>byId.get(id)),l.gameweek).points-l.points)<.02);
    const chosen=l.starters.map(id=>byId.get(id));
    assert.equal(chosen.length,11);assert.ok(l.starters.includes(l.captain));
    assert.equal(chosen.filter(p=>p.position==='GKP').length,1);
    assert.ok(chosen.filter(p=>p.position==='DEF').length>=3);
    assert.ok(chosen.filter(p=>p.position==='MID').length>=2);
    assert.ok(chosen.filter(p=>p.position==='FWD').length>=1);
    const score=chosen.reduce((s,p)=>s+P.points(data,p.id,l.gameweek),0)+P.points(data,l.captain,l.gameweek);
    assert.ok(Math.abs(l.points-score)<.02);
    sum+=l.points+(plan.mode==='benchboost'?l.benchPoints:0);
  }
  assert.ok(Math.abs(sum-plan.points)<.03);
}
if(!data.planning.plans['3'].squad){console.log('No playable upcoming squad; model fixture tests still verify optimizer constraints.');process.exit(0);}
const own=data.planning.plans['3'].squad.map(id=>byId.get(id)),gw=data.planning.events[0];
const xi=P.bestXI(data,own,gw);assert.equal(xi.starters.length,11);assert.equal(xi.bench.length,4);
assert.equal(P.validateSquad([...own.slice(0,14),own[0]]),'Du har valgt samme spiller flere gange.');
const transfer=P.bestTransfer(data,own,3,0,Object.fromEntries(own.map(p=>[p.id,p.price])));
if(transfer){
  assert.ok(transfer.cost<=.001);assert.equal(byId.get(transfer.out).position,byId.get(transfer.incoming).position);
  const next=own.map(p=>p.id===transfer.out?byId.get(transfer.incoming):p);assert.equal(P.validateSquad(next),null);
  assert.ok(Math.abs(P.horizonScore(data,next,3)-P.horizonScore(data,own,3)-transfer.gain)<1e-6);
}
assert.ok(P.chipAdvice(data,own,{}).every(row=>!row.use));
const packagePlan=P.transferPlans(data,own,5,2,Object.fromEntries(own.map(p=>[p.id,p.price])),{freeTransfers:3,allowHit:true});
for(const plan of packagePlan.alternatives){
  assert.ok(plan.bankAfter>=0);assert.ok(plan.count<=4);assert.equal(plan.hit,4*Math.max(0,plan.count-3));
  const next=plan.squad.map(id=>byId.get(id));assert.equal(P.validateSquad(next),null);
  assert.ok(Math.abs(P.horizonScore(data,next,5)-packagePlan.baseline-plan.grossGain)<1e-6);
  const afterBank=2+plan.moves.reduce((s,m)=>s+m.sale-m.buy,0);assert.ok(Math.abs(afterBank-plan.bankAfter)<1e-6);
  assert.equal(plan.freeTransfersNextGW,Math.min(5,Math.max(0,3-plan.count)+1));
}
const copy=structuredClone(data);
for(const id of own.map(p=>p.id)){
  copy.planning.forecasts[id].expectedMinutesPerMatch=90;
  for(const event of copy.planning.forecasts[id].events){event.points=event.gameweek===gw?4:3;event.fixtureCount=1;event.minutes=90;}
}
copy.planning.forecasts[xi.captain].events[0].points=10;
const chips=P.chipAdvice(copy,own,{'3xc':true,bboost:true});
assert.equal(chips.filter(row=>row.use).length,1,'Only one chip should be suggested');
assert.equal(chips.find(row=>row.key==='bboost').use,true);
const scouts=A.scoutPlayers(data.players);
for(const p of data.players)for(const high of scouts.get(p.id).highScorers??[]){
  assert.equal(byId.get(high.id).position,p.position);assert.ok(high.distance<=2.25);
  assert.ok(high.points90>=scouts.get(p.id).highThreshold);
}
console.log('Squads, formations, captains, joint transfer budgets/club limits, point hits, chips and similarity passed');
