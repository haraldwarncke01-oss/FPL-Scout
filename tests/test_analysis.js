const assert = require('node:assert/strict');
const A = require('../site/analysis.js');

const players = [
  {id:1,name:'Unlucky',position:'MID',minutes:450,points:15,xG:'2.5',xA:'1.5',xGI:'4.0',goals:0,assists:0},
  {id:2,name:'Peer A',position:'MID',minutes:450,points:35,xG:'2.5',xA:'1.5',xGI:'4.0',goals:3,assists:2},
  {id:3,name:'Peer B',position:'MID',minutes:450,points:30,xG:'2.4',xA:'1.6',xGI:'4.0',goals:2,assists:2},
  {id:4,name:'Peer C',position:'MID',minutes:450,points:25,xG:'2.6',xA:'1.4',xGI:'4.0',goals:2,assists:1},
  {id:5,name:'Different position',position:'FWD',minutes:450,points:80,xG:'2.5',xA:'1.5',xGI:'4.0',goals:8,assists:2},
  {id:6,name:'Tiny sample',position:'MID',minutes:45,points:9,xG:'1',xA:'0',xGI:'1',goals:1,assists:0},
];
const result=A.scoutPlayers(players);
assert.equal(result.get(1).peerGap, 3);
assert.equal(result.get(1).peers.length, 3);
assert.equal(result.get(1).finishingGap, 0.8);
assert.equal(result.get(6).eligible, false);
assert.equal(result.get(1).peers.some(p=>p.id===5),false);
const matches=[
  {date:'2026-09-03',home:'Arsenal',away:'Chelsea',homeGoals:2,awayGoals:0},
  {date:'2026-08-01',home:'Chelsea',away:'Arsenal',homeGoals:1,awayGoals:1},
  {date:'2025-09-03',home:'Arsenal',away:'Liverpool',homeGoals:0,awayGoals:1},
];
assert.deepEqual([A.teamRecord(matches,'Arsenal','home').played,A.teamRecord(matches,'Arsenal','home').cleanSheets],[2,1]);
assert.deepEqual([A.headToHead(matches,'Arsenal','Chelsea').played,A.headToHead(matches,'Arsenal','Chelsea').teamGoals],[2,3]);
console.log('Scouting and match-history calculations passed');
