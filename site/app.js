const A = window.FPLAnalysis;
const $ = id => document.getElementById(id);
const ids = ['search','position','team','sort','min-minutes','max-price','max-ownership','min-xgi','min-xg','min-xa','min-defcon','max-xgc','max-points90','venue','availability'];
let data, teams, scouting, limit = 25;
const integer = new Intl.NumberFormat('da-DK');
const one = new Intl.NumberFormat('da-DK',{minimumFractionDigits:1,maximumFractionDigits:1});
const two = new Intl.NumberFormat('da-DK',{minimumFractionDigits:2,maximumFractionDigits:2});
const fmt = (x,places=2) => x == null || !Number.isFinite(Number(x)) ? '—' : (places===1?one:two).format(Number(x));
const num = x => x == null || x === '' ? null : Number(x);
const make = (tag,cls='',label='') => { const e=document.createElement(tag);e.className=cls;e.textContent=label;return e; };
const metric = (label,value) => { const e=make('div','detail-metric');e.append(make('span','stat-label',label),make('strong','',value));return e; };

function fixture(p) {
  const f=p.nextFixture;if(!f)return make('span','muted','—');
  const e=make('span','fixture'),d=num(f.difficulty);
  e.append(make('span','fixture-badge '+(d>=4?'hard':d===3?'medium':''),teams.get(f.opponent)?.shortName??'—'),make('span','',f.home?'(H)':'(U)'));
  return e;
}
function row(p) {
  const tr=make('tr'),name=make('td'),button=make('button','player-button',p.name);
  button.type='button';button.addEventListener('click',()=>showPlayer(p.id));
  name.append(button,make('span','team-name',teams.get(p.teamId)?.name??'Ukendt hold'));
  const pos=make('td');pos.append(make('span','position-pill',p.position));
  const gap=scouting.get(p.id)?.peerGap;
  const cells=[name,pos,make('td','numeric','£'+fmt(p.price,1)+'m'),make('td','numeric',integer.format(p.minutes)),
    make('td','numeric points',fmt(A.points90(p))),make('td','numeric',fmt(A.per90(p,'xG'))),
    make('td','numeric',fmt(A.per90(p,'xA'))),make('td','numeric',fmt(A.xgi90(p))),
    make('td','numeric gap-cell',gap==null?'—':(gap>=0?'+':'')+fmt(gap)),
    make('td','numeric',num(p.ownership)==null?'—':fmt(p.ownership,1)+'%'),make('td')];
  cells[10].append(fixture(p));tr.append(...cells);return tr;
}
const input = id => {const x=num($(id).value);return Number.isFinite(x)?x:null;};
function fits(p) {
  const query=$('search').value.trim().toLocaleLowerCase('da-DK');
  if(query&&!(p.name+' '+(teams.get(p.teamId)?.name??'')).toLocaleLowerCase('da-DK').includes(query))return false;
  if($('position').value&&p.position!==$('position').value)return false;
  if($('team').value&&String(p.teamId)!==$('team').value)return false;
  if($('availability').value&&p.status!=='a')return false;
  const criteria=[['min-minutes',p.minutes,'min'],['max-price',p.price,'max'],['max-ownership',num(p.ownership),'max'],
    ['min-xgi',A.xgi90(p),'min'],['min-xg',A.per90(p,'xG'),'min'],['min-xa',A.per90(p,'xA'),'min'],
    ['min-defcon',A.per90(p,'defCon'),'min'],['max-xgc',A.per90(p,'xGC'),'max'],
    ['max-points90',A.points90(p),'max']];
  for(const [id,value,direction] of criteria){const bound=input(id);if(bound!=null&&(value==null||(direction==='min'?value<bound:value>bound)))return false;}
  const f=p.nextFixture,v=$('venue').value;
  if(v==='home'&&!f?.home)return false;
  if(v==='away'&&(!f||f.home))return false;
  const difficulty=num(f?.difficulty);
  if(v==='easy'&&(!Number.isFinite(difficulty)||difficulty>2))return false;
  if(v==='medium'&&(!Number.isFinite(difficulty)||difficulty>3))return false;
  return true;
}
function render() {
  if(!data)return;
  const keys={peerGap:p=>scouting.get(p.id)?.peerGap,finishingGap:p=>scouting.get(p.id)?.finishingGap,
    xgi90:A.xgi90,xg90:p=>A.per90(p,'xG'),xa90:p=>A.per90(p,'xA'),points90:A.points90,
    defcon90:p=>A.per90(p,'defCon'),xgc90:p=>A.per90(p,'xGC'),cleanSheets:p=>num(p.cleanSheets),
    form:p=>num(p.form),ownership:p=>num(p.ownership),price:p=>num(p.price)};
  const sort=$('sort').value,filtered=data.players.filter(fits);
  filtered.sort((a,b)=>sort==='name'?a.name.localeCompare(b.name,'da'):
    (sort==='xgc90' ? ((keys[sort](a)??Infinity)-(keys[sort](b)??Infinity))
      : ((keys[sort](b)??-Infinity)-(keys[sort](a)??-Infinity)))||a.name.localeCompare(b.name,'da'));
  $('result-count').textContent=integer.format(filtered.length)+' spillere';
  $('players').replaceChildren(...filtered.slice(0,limit).map(row));
  if(!filtered.length){const tr=make('tr'),td=make('td','empty-cell','Ingen spillere matcher filtrene. Prøv at sænke minimumskravene.');td.colSpan=11;tr.append(td);$('players').append(tr);}
  $('show-more').hidden=filtered.length<=limit;
}
function opportunities() {
  const candidates=data.players.filter(p=>p.status==='a'&&(scouting.get(p.id)?.peerGap??0)>0)
    .sort((a,b)=>scouting.get(b.id).peerGap-scouting.get(a.id).peerGap).slice(0,3);
  $('opportunity-cards').replaceChildren();
  if(!candidates.length){$('opportunity-cards').append(make('p','loading-note','Der er endnu ikke nok sammenlignelige spillere.'));return;}
  for(const p of candidates){const s=scouting.get(p.id),e=make('button','opportunity-card');e.type='button';
    e.append(make('span','card-tag',p.position+' · '+(teams.get(p.teamId)?.shortName??'')),make('strong','card-name',p.name),
      make('span','card-main','+'+fmt(s.peerGap)+' pts/90'),
      make('span','card-sub','under '+s.peers.length+' lignende spillere · '+p.minutes+' min'),
      make('span','card-link','Se sammenligning ↗'));
    e.addEventListener('click',()=>showPlayer(p.id));$('opportunity-cards').append(e);
  }
}
function recordCard(title,r){
  const card=make('div','record-card');card.append(make('h4','',title),make('span','record-sample',r.played+' seneste kampe på denne bane'));
  if(!r.played){card.append(make('p','muted','Ingen registrerede kampe.'));return card;}
  const grid=make('div','record-grid');grid.append(metric('SCORET/KAMP',fmt(r.scoredPerMatch)),
    metric('LUKKET IND/KAMP',fmt(r.concededPerMatch)),metric('CLEAN SHEETS',r.cleanSheets+'/'+r.played));card.append(grid);return card;
}
function showPlayer(id){
  const p=data.players.find(x=>x.id===id);if(!p)return;
  const team=teams.get(p.teamId),opp=teams.get(p.nextFixture?.opponent),s=scouting.get(id),matches=data.history?.matches??[];
  const panel=$('player-detail');panel.replaceChildren();
  const header=make('div','detail-heading'),intro=make('div'),close=make('button','close-button','Luk ×');
  close.type='button';close.addEventListener('click',()=>{panel.hidden=true});
  intro.append(make('span','section-kicker','03 / SPILLERANALYSE'),make('h2','',p.name),
    make('p','',(team?.name??'Ukendt hold')+' · '+p.position+' · £'+fmt(p.price,1)+'m · '+p.minutes+' minutter'));
  header.append(intro,close);panel.append(header);
  const metrics=make('div','detail-metrics');
  metrics.append(metric('POINT/90',fmt(A.points90(p))),metric('xG/90',fmt(A.per90(p,'xG'))),
    metric('xA/90',fmt(A.per90(p,'xA'))),metric('xGI/90',fmt(A.xgi90(p))),
    metric('MÅL + ASSISTS/90',fmt(A.actualGI90(p))),
    metric('xGI-GAB/90',s.finishingGap==null?'—':(s.finishingGap>=0?'+':'')+fmt(s.finishingGap)));
  if(p.position==='DEF'||p.position==='GKP')metrics.append(metric('xGC/90',fmt(A.per90(p,'xGC'))),metric('CLEAN SHEETS',String(p.cleanSheets??'—')));
  if(p.position==='DEF')metrics.append(metric('DEF. BIDRAG/90',fmt(A.per90(p,'defCon'))));
  if(p.position==='GKP')metrics.append(metric('REDNINGER/90',fmt(A.per90(p,'saves'))));
  panel.append(metrics);
  const comparison=make('div','detail-block');comparison.append(make('h3','','Lignende spillere'));
  if(!s.eligible)comparison.append(make('p','detail-copy','Sammenligningen kræver mindst '+A.MIN_MINUTES+' minutter og tre spillere på samme position med lignende underliggende tal.'));
  else{comparison.append(make('p','detail-copy',p.name+' har '+fmt(A.points90(p))+' point/90. De '+s.peers.length+
      ' nærmeste på samme position har i gennemsnit '+fmt(s.peerPoints90)+' point/90. Forskellen kan skyldes tilfældighed, spilletid, bonus eller andre forhold.'));
    const list=make('div','peer-list');for(const peer of s.peers)list.append(make('span','peer-chip',peer.name+' · '+fmt(peer.points90)+' pts/90'));comparison.append(list);}
  panel.append(comparison);
  const matchup=make('div','detail-block');matchup.append(make('h3','','Næste kamp & holdmønstre'));
  if(!opp)matchup.append(make('p','detail-copy','Ingen kommende modstander registreret.'));
  else{const home=p.nextFixture.home,own=home?'home':'away',other=home?'away':'home';
    matchup.append(make('p','detail-copy',team.name+' mod '+opp.name+' '+(home?'hjemme':'ude')+
      (p.nextFixture.gameweek?' · kampuge '+p.nextFixture.gameweek:'')+'. Tallene nedenfor er faktiske resultater, ikke sandsynligheder.'));
    const cards=make('div','record-cards');cards.append(recordCard(team.name+' '+(home?'hjemme':'ude'),A.teamRecord(matches,team.name,own)),
      recordCard(opp.name+' '+(home?'ude':'hjemme'),A.teamRecord(matches,opp.name,other)));matchup.append(cards);
    const ownHome=A.teamRecord(matches,team.name,'home'),ownAway=A.teamRecord(matches,team.name,'away');
    matchup.append(make('p','detail-copy',team.name+' clean sheets: hjemme '+ownHome.cleanSheets+'/'+ownHome.played+
      ', ude '+ownAway.cleanSheets+'/'+ownAway.played+' (seneste op til 10 hvert sted).'));
    const h=A.headToHead(matches,team.name,opp.name);matchup.append(make('h4','h2h-heading','Indbyrdes opgør · '+h.played+' seneste'));
    if(!h.played)matchup.append(make('p','detail-copy','Ingen indbyrdes Premier League-kampe i det tilgængelige datasæt.'));
    else{matchup.append(make('p','detail-copy',team.name+' har scoret '+h.teamGoals+' mål ('+fmt(h.teamGoals/h.played)+' pr. kamp), '+opp.name+' '+h.opponentGoals+' mål i disse '+h.played+' kampe.'));
      const results=make('div','match-list');for(const m of h.matches)results.append(make('span','match-chip',
        m.season+' · '+m.home+' '+m.homeGoals+'–'+m.awayGoals+' '+m.away));matchup.append(results);}
  }
  panel.append(matchup,make('p','method-note','Datadækning: '+(data.history?.seasons?.join(', ')||'ingen historiske sæsoner')+
    '. Oprykkede hold kan have få registrerede kampe. Ældre indbyrdes resultater beskriver andre spillertrupper og er ikke en prognose.'));
  panel.hidden=false;panel.scrollIntoView({behavior:'smooth',block:'start'});
}
async function load(){
  try{const response=await fetch('./data/fpl.json');if(!response.ok)throw Error('HTTP '+response.status);
    const json=await response.json();if(![1,2].includes(json.schemaVersion)||!Array.isArray(json.players)||!Array.isArray(json.teams))throw Error('Ugyldigt dataformat');
    data=json;teams=new Map(data.teams.map(t=>[t.id,t]));scouting=A.scoutPlayers(data.players);
    const updated=new Date(data.updatedAt);
    $('updated').textContent=Number.isNaN(updated.getTime())?'Opdatering ukendt':'Opdateret '+new Intl.DateTimeFormat('da-DK',
      {dateStyle:'medium',timeStyle:'short',timeZone:'Europe/Copenhagen'}).format(updated);
    $('gameweek').textContent=data.nextGameweek?'Næste kampuge '+data.nextGameweek:data.currentGameweek?'Kampuge '+data.currentGameweek:'Kampuge —';
    $('stat-players').textContent=integer.format(data.players.length);$('stat-teams').textContent=integer.format(data.teams.length);
    $('stat-gameweek').textContent=data.nextGameweek??data.currentGameweek??'—';
    for(const t of [...data.teams].sort((a,b)=>a.name.localeCompare(b.name,'da'))){const option=make('option','',t.name);option.value=t.id;$('team').append(option);}
    if(data.history?.warnings?.length){$('notice').textContent='Nogle historiske sæsoner kunne ikke hentes ('+data.history.warnings.join(', ')+'). De tilgængelige kampe vises stadig.';$('notice').hidden=false;}
    opportunities();render();
  }catch(error){const tr=make('tr'),td=make('td','empty-cell','Spillerdata kunne ikke indlæses. Prøv igen senere.');td.colSpan=11;tr.append(td);$('players').replaceChildren(tr);
    $('opportunity-cards').replaceChildren(make('p','loading-note','Data kunne ikke indlæses.'));
    $('notice').textContent='Data er ikke tilgængelige endnu. Tjek om GitHub Actions har udgivet siden.';$('notice').hidden=false;console.error(error);}
}
for(const id of ids){const c=$(id);c.addEventListener(c.tagName==='INPUT'?'input':'change',()=>{limit=25;render()});}
$('reset-filters').addEventListener('click',()=>{for(const id of ['search','position','team','max-price','max-ownership','min-xgi','min-xg','min-xa','min-defcon','max-xgc','max-points90','venue','availability'])$(id).value='';$('min-minutes').value='270';$('sort').value='peerGap';limit=25;render()});
$('show-more').addEventListener('click',()=>{limit+=25;render()});
load();
