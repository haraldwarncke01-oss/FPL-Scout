const assert=require('node:assert/strict');
const fs=require('node:fs');
const P=require('../site/planner.js');
const A=require('../site/analysis.js');
const data=JSON.parse(fs.readFileSync(__dirname+'/../site/data/fpl.json','utf8'));
const byId=new Map(data.players.map(p=>[p.id,p]));
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
console.log('Published squads, formations, captains, transfers, chip rules and peer similarity passed');
