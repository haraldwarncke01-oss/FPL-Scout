(function(){
  'use strict';
  const P=window.FPLPlanner,A=window.FPLAnalysis,$=id=>document.getElementById(id);
  const el=(tag,cls='',text='')=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
  const fmt=(x,n=1)=>x==null?'—':Number(x).toLocaleString('da-DK',{minimumFractionDigits:n,maximumFractionDigits:n});
  const labels={GKP:'Målmænd',DEF:'Forsvarere',MID:'Midtbane',FWD:'Angribere'};
  let data,selectPlayer,refresh,players,teams,state={ids:[],sales:{},bank:0,freeTransfers:1,chips:{},previousFreeHit:false};
  const horizon=()=>Math.min(Number($('horizon').value),data.planning.events.length);
  const currentPlan=()=>data.planning.plans[$('squad-mode').value==='benchboost'?'benchboost':$('horizon').value];
  const ownPlayers=()=>state.ids.map(id=>players.get(id)).filter(Boolean);
  const chipHalf=()=>data.rules.chips.find(c=>c.name==='3xc'&&c.start_event<=data.planning.events[0]&&c.stop_event>=data.planning.events[0])?.start_event;
  const save=()=>{try{localStorage.setItem('fpl-scout-team-v3',JSON.stringify({...state,season:data.season,chipHalf:chipHalf(),savedGW:data.planning.events[0]}));}catch{}};
  function playerLink(id,cls=''){const p=players.get(id),b=el('button','player-button '+cls,p?.name??'Ukendt');b.type='button';b.addEventListener('click',()=>selectPlayer(id));return b;}
  function init(snapshot,onSelect,onRefresh){
    data=snapshot;selectPlayer=onSelect;refresh=onRefresh;players=new Map(data.players.map(p=>[p.id,p]));teams=new Map(data.teams.map(t=>[t.id,t]));
    try{const saved=JSON.parse(localStorage.getItem('fpl-scout-team-v3')||'null');if(saved?.season===data.season){state={...state,...saved};state.ids=(saved.ids??[]).filter(id=>players.has(id));
      if(saved.chipHalf!==chipHalf())state.chips={};if(saved.savedGW!==data.planning.events[0])state.previousFreeHit=false;}}catch{}
    for(const option of $('horizon').options){const h=Number(option.value);if(h>1)option.textContent='Næste '+Math.min(h,data.planning.events.length)+' GW'+(h>data.planning.events.length?' · resten af sæsonen':'');}
    for(const p of data.players){const o=el('option');o.value=p.name+' · '+teams.get(p.teamId)?.shortName+' · '+p.position+' #'+p.id;$('player-options').append(o);}
    $('bank').value=state.bank;$('free-transfers').value=state.freeTransfers;$('previous-freehit').checked=state.previousFreeHit;
    for(const input of document.querySelectorAll('[data-chip]')){input.checked=!!state.chips[input.dataset.chip];input.addEventListener('change',()=>{state.chips[input.dataset.chip]=input.checked;save();renderOwnAnalysis();});}
    $('horizon').addEventListener('change',()=>{updateWeekOptions();renderSquad();renderOwnAnalysis();refresh();});
    $('squad-mode').addEventListener('change',()=>{updateWeekOptions();renderSquad();});
    for(const id of ['squad-view','lineup-week'])$(id).addEventListener('change',renderSquad);
    $('add-own').addEventListener('click',()=>{
      const text=$('own-player').value.trim(),match=text.match(/#(\d+)$/);let p=match?players.get(Number(match[1])):null;
      if(!p){const found=data.players.filter(p=>p.name.toLocaleLowerCase('da')===text.toLocaleLowerCase('da'));if(found.length===1)p=found[0];}
      if(!p){$('own-status').textContent='Vælg en spiller fra forslagene i søgefeltet.';return;}
      const next=[...ownPlayers(),p],error=P.validateSquad(next,false);if(error){$('own-status').textContent=error;return;}
      state.ids.push(p.id);$('own-player').value='';save();renderOwn();
    });
    $('own-player').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('add-own').click();}});
    $('use-plan').addEventListener('click',()=>{const plan=currentPlan();if(!plan.squad)return;state.ids=[...plan.squad];state.sales={};save();renderOwn();});
    $('clear-own').addEventListener('click',()=>{state.ids=[];state.sales={};save();renderOwn();});
    for(const id of ['bank','free-transfers','previous-freehit'])$(id).addEventListener('change',()=>{
      state.bank=Math.max(0,Number($('bank').value)||0);state.freeTransfers=Math.min(5,Math.max(0,Number($('free-transfers').value)||0));
      state.previousFreeHit=$('previous-freehit').checked;save();renderOwnAnalysis();
    });
    updateWeekOptions();renderSquad();renderOwn();
  }
  function updateWeekOptions(){
    const selected=Number($('lineup-week').value);$('lineup-week').replaceChildren();
    for(const lineup of currentPlan().lineups??[]){const o=el('option','','GW '+lineup.gameweek);o.value=lineup.gameweek;$('lineup-week').append(o);}
    if([...$('lineup-week').options].some(o=>Number(o.value)===selected))$('lineup-week').value=selected;
  }
  function pitchCard(id,lineup){
    const p=players.get(id),f=P.forecast(data,id,lineup.gameweek),b=el('button','pitch-player'+(lineup.captain===id?' captain':''));b.type='button';
    b.append(el('span','shirt-number',teams.get(p.teamId)?.shortName??''),el('strong','',p.name+(lineup.captain===id?' · C':'')),
      el('span','pitch-points',fmt(f?.points)+' pts · £'+fmt(p.price)+'m'),el('small','',f?.fixtures.map(x=>(teams.get(x.opponent)?.shortName??'?')+(x.home?' H':' U')).join(' / ')||'Blank GW'));
    b.addEventListener('click',()=>selectPlayer(id));return b;
  }
  function renderSquad(){
    const plan=currentPlan(),lineup=plan.lineups?.find(l=>l.gameweek===Number($('lineup-week').value))??plan.lineups?.[0];
    $('pitch').replaceChildren();$('bench').replaceChildren();$('squad-summary').replaceChildren();
    if(!lineup){$('pitch').append(el('p','loading-note','Et lovligt hold kunne ikke beregnes med de tilgængelige data.'));return;}
    const bb=plan.mode==='benchboost',starters=lineup.starters.map(id=>players.get(id));
    const formation=['DEF','MID','FWD'].map(pos=>starters.filter(p=>p.position===pos).length).join('–');
    const meta=[['BUDGET','£'+fmt(plan.cost)+' / £100m'],['GW '+lineup.gameweek,fmt(lineup.points+(bb?lineup.benchPoints:0))+' forventede pts'],
      ['FORMATION',formation],['HELE PERIODEN',fmt(plan.points)+' pts / '+plan.horizon+' GW']];
    for(const [title,value] of meta){const box=el('div');box.append(el('span','stat-label',title),el('strong','',value));$('squad-summary').append(box);}
    for(const pos of P.positions){const line=el('div','pitch-row');for(const p of starters.filter(p=>p.position===pos))line.append(pitchCard(p.id,lineup));$('pitch').append(line);}
    const vice=[...lineup.starters].filter(id=>id!==lineup.captain).sort((a,b)=>P.points(data,b,lineup.gameweek)-P.points(data,a,lineup.gameweek))[0];
    $('bench').append(el('p','bench-title','Kaptajn: '+players.get(lineup.captain).name+' · Vice: '+players.get(vice).name+
      '. Bænk: '+fmt(lineup.benchPoints)+' forventede point'+(bb?' · tæller med i Bench Boost.':' · tæller ved normal strategi kun, hvis spillere bliver skiftet ind.')));
    if($('squad-view').value==='15'){
      const bench=el('div','bench-players'),ordered=[...lineup.bench].sort((a,b)=>
        (players.get(a).position==='GKP')-(players.get(b).position==='GKP')||P.points(data,b,lineup.gameweek)-P.points(data,a,lineup.gameweek));
      for(const id of ordered)bench.append(pitchCard(id,lineup));$('bench').append(bench);
    }
    $('bench').append(el('p','method-note','Optimeringsmargin: '+fmt(100*(plan.mipGap??0),2)+'%. De 15 spillere er valgt samlet, så startopstillingen har også en lovlig bænk inden for budgettet. Prognosen regner med, at kaptajnen spiller; vice- og autosub-effekter er ikke modelleret.'));
  }
  function renderOwn(){
    const own=ownPlayers();$('own-roster').replaceChildren();
    const counts=P.positions.map(pos=>labels[pos]+': '+own.filter(p=>p.position===pos).length+'/'+P.quotas[pos]).join(' · ');
    $('own-status').textContent=own.length+'/15 valgt · '+counts;
    for(const p of [...own].sort((a,b)=>P.positions.indexOf(a.position)-P.positions.indexOf(b.position))){
      const row=el('div','own-player-row'),name=el('div');name.append(playerLink(p.id),el('small','muted',p.position+' · '+teams.get(p.teamId)?.shortName));
      const label=el('label','','Salg £m'),input=el('input');input.type='number';input.min='0';input.step='.1';input.placeholder=String(p.price);input.value=state.sales[p.id]??'';
      input.setAttribute('aria-label','Salgsværdi for '+p.name);input.addEventListener('change',()=>{if(input.value===''||Number(input.value)<0)delete state.sales[p.id];else state.sales[p.id]=Number(input.value);save();renderOwnAnalysis();});label.append(input);
      const remove=el('button','remove-player','×');remove.type='button';remove.setAttribute('aria-label','Fjern '+p.name);remove.addEventListener('click',()=>{state.ids=state.ids.filter(id=>id!==p.id);delete state.sales[p.id];save();renderOwn();});
      row.append(name,label,remove);$('own-roster').append(row);
    }
    renderOwnAnalysis();
  }
  function renderOwnAnalysis(){
    const own=ownPlayers(),error=P.validateSquad(own),box=$('own-analysis');box.replaceChildren();
    if(!data.planning.events.length)box.append(el('p','detail-copy','Ingen kommende gameweek registreret.'));
    else if(error)box.append(el('p','detail-copy',error));
    else{
      const gw=data.planning.events[0],lineup=P.bestXI(data,own,gw),headline=el('div','own-lineup');headline.append(el('h3','','Dit hold · GW '+gw),
        el('p','detail-copy',fmt(lineup.points)+' forventede point med '+players.get(lineup.captain).name+' som kaptajn · '+fmt(P.horizonScore(data,own,horizon()))+' over '+horizon()+' GW.'));
      for(const pos of P.positions){const line=el('div','own-position-line');line.append(el('span','position-pill',pos));for(const id of lineup.starters.filter(id=>players.get(id).position===pos))line.append(playerLink(id));headline.append(line);}
      headline.append(el('p','method-note','Bænk: '+lineup.bench.map(id=>players.get(id).name).join(', ')+'.'));
      box.append(headline);
      const transfer=P.bestTransfer(data,own,horizon(),state.bank,state.sales),card=el('div','transfer-card');card.append(el('h3','','Næste transfer · '+horizon()+' GW'));
      if(!transfer)card.append(el('p','detail-copy','Ingen betalelig forbedring blandt de 30 højeste prognoser på hver position.'));
      else{
        const hit=state.freeTransfers===0?4:0,net=transfer.gain-hit;
        if(net<2)card.append(el('p','detail-copy','Gem foreløbig din transfer. Den bedste af de afprøvede udskiftninger giver kun '+fmt(net)+' ekstra forventede point efter evt. pointfradrag.'));
        else{const line=el('div','transfer-pair');line.append(playerLink(transfer.out),el('span','','→'),playerLink(transfer.incoming));card.append(line,
          el('p','detail-copy','Ca. +'+fmt(net)+' forventede holdpoint over '+horizon()+' GW'+(hit?' efter 4 point i fradrag':' med én gratis transfer')+'. Ændring i bank: '+fmt(-transfer.cost)+'m.'));
        }
        card.append(el('p','method-note',(transfer.usesEstimatedSale?'Salgsværdien er estimeret ud fra dagens købspris. ':'')+
          'Vi prøver én udskiftning ad gangen blandt op til 30 kandidater pr. position og vælger startopstillingen på ny. Dette er ikke en fuld flertransfer-plan.'));
      }
      box.append(card);
    }
    $('chip-cards').replaceChildren();
    for(const row of P.chipAdvice(data,own,state.chips,state.freeTransfers,state.bank,state.sales,state.previousFreeHit)){
      const card=el('article','chip-card'+(row.use?' recommended':''));card.append(el('span','chip-status',row.status),el('h3','',row.name),el('p','detail-copy',row.text));
      if(row.stop)card.append(el('small','muted','Aktuelt chip-vindue slutter efter GW '+row.stop));$('chip-cards').append(card);
    }
  }
  function recommendations(scouting){
    const container=$('opportunity-cards');container.replaceChildren();
    for(const pos of P.positions){
      const group=el('div','position-candidates');group.append(el('h3','position-title',labels[pos]));
      const eligible=data.players.filter(p=>p.position===pos&&p.canSelect!==false&&p.minutes>=270&&
        (data.planning.forecasts[p.id]?.expectedMinutesPerMatch??0)>=50&&(data.planning.forecasts[p.id]?.availability??0)>=.75);
      const score=p=>{const s=scouting.get(p.id),d=s?.highScorers?.[0]?.distance;
        return P.total(data,p.id,horizon())+(d==null?0:.5*Math.min(3,Math.max(0,s.peerGap??0))/(1+d));};
      const ordered=eligible.sort((a,b)=>Number((scouting.get(b.id)?.peerGap??0)>0)-Number((scouting.get(a.id)?.peerGap??0)>0)||score(b)-score(a)).slice(0,3);
      if(!ordered.length)group.append(el('p','loading-note','Ingen kandidater med nok minutdata.'));
      for(const p of ordered){
        const s=scouting.get(p.id),f=data.planning.forecasts[p.id],high=s?.highScorers?.[0],card=el('button','opportunity-card');card.type='button';
        card.append(el('span','card-tag',teams.get(p.teamId)?.shortName+' · £'+fmt(p.price)+'m · '+((s?.peerGap??0)>0?'Positivt gab':'Høj prognose')),
          el('strong','card-name',p.name),el('span','card-main',fmt(P.total(data,p.id,horizon()))+' forventede pts'),
          el('span','card-sub',horizon()+' GW · '+fmt(f.expectedMinutesPerMatch,0)+' forventede min/kamp'),
          el('span','card-sub','Sidste 3: '+(p.minutesInfo?.last3.map(x=>x.minutes??'—').join(' / ')||'—')+' min'),
          el('span','card-sub','Gab: '+(s?.peerGap==null?'—':(s.peerGap>=0?'+':'')+fmt(s.peerGap,2))+' pts/90'),
          el('span','card-sub',high?'Tæt på '+high.name+' · afstand '+fmt(high.distance,2):'Ingen tæt topscorer inden for afstand 2,25'),el('span','card-link','Se tal & begrundelse ↗'));
        card.addEventListener('click',()=>selectPlayer(p.id));group.append(card);
      }
      container.append(group);
    }
  }
  function addPlayerDetails(panel,p,scout){
    const info=p.minutesInfo??{},f=data.planning.forecasts[p.id],block=el('div','detail-block');block.append(el('h3','','Spilletid & næste fem gameweeks'));
    const metrics=el('div','detail-metrics');for(const [label,value] of [['MIN/KAMP · INKL. 0',fmt(info.avgMinutesPerMatch)],['MIN NÅR HAN SPILLER',fmt(info.avgMinutes)],['FORVENTET MIN/KAMP',fmt(f?.expectedMinutesPerMatch)]]){
      const box=el('div','detail-metric');box.append(el('span','stat-label',label),el('strong','',value));metrics.append(box);
    }block.append(metrics,el('p','method-note','Sæsongennemsnit: '+(info.matchesKnown??0)+' holdkampe med kendte data, '+(info.appearances??0)+' med spilletid. Sidste tre vises nyeste først; 0 er en kamp uden spilletid, — er ukendt.'));
    const recent=el('div','recent-minutes');for(const match of info.last3??[]){const item=el('div','minute-match'+(match.minutes===0?' no-minutes':''));
      item.append(el('strong','',(match.minutes??'—')+' min'),el('span','','GW '+match.gameweek+' · '+(teams.get(match.opponent)?.shortName??'Tidligere klub')+(match.home==null?'':match.home?' (H)':' (U)')),
        el('small','muted',match.date?new Date(match.date).toLocaleDateString('da-DK'):''));recent.append(item);}block.append(recent);
    const wrap=el('div','table-scroll'),table=el('table','forecast-table'),head=el('thead'),tr=el('tr');
    for(const label of ['GW','MODSTANDER','MIN','POINT','SPILLETID','MÅL','ASSISTS','CS','BONUS','DEF.','REDN.','FRADRAG'])tr.append(el('th','',label));head.append(tr);table.append(head);
    const body=el('tbody');for(const event of f?.events??[]){const row=el('tr'),c=event.components;
      const values=['GW '+event.gameweek,event.fixtures.map(x=>teams.get(x.opponent)?.shortName+(x.home?' (H)':' (U)')).join(' / ')||'Blank',fmt(event.minutes,0),fmt(event.points,2),
        ...['appearance','goals','assists','cleanSheet','bonus','defensive','saves','deductions'].map(key=>fmt(c[key],2))];
      for(const value of values)row.append(el('td','',value));body.append(row);
    }table.append(body);wrap.append(table);block.append(wrap,el('p','method-note','Forventede minutter = 75% af sidste tre kendte kampes vægtede minutter (50/30/20) + 25% af sæsongennemsnittet inklusive 0, ganget med FPL’s tilgængelighed. Pointkolonnerne er modellens bidrag pr. GW.'));
    block.append(el('p','method-note','Ved klubskifte kan kampe uden spilletid fra en tidligere klub mangle i gennemsnittet.'));
    panel.append(block);
    const comp=el('div','detail-block');comp.append(el('h3','','Hvor tæt er tallene på topscorerne?'));
    const fields=A.FEATURES[p.position]??[],high=scout.highScorers??[];
    if(!high.length)comp.append(el('p','detail-copy','Ingen topscorer på samme position ligger inden for afstand 2,25 med tilstrækkelige data.'));
    else{
      comp.append(el('p','detail-copy','Topscorere = øverste fjerdedel på '+p.position+' med mindst 270 minutter: mindst '+fmt(scout.highThreshold,2)+' pts/90. Her er de op til tre nærmeste.'));
      const scroll=el('div','table-scroll'),t=el('table','comparison-table'),thead=el('thead'),header=el('tr');
      for(const label of ['SPILLER','PTS/90',...fields.map(([key])=>({saves:'REDN.',defCon:'DEF.'}[key]??key)+'/90'),'AFSTAND'])header.append(el('th','',label));thead.append(header);t.append(thead);
      const tbody=el('tbody');for(const id of [p.id,...high.map(x=>x.id)]){const other=players.get(id),row=el('tr',id===p.id?'selected-comparison':'');
        const name=el('td');name.append(playerLink(id));row.append(name,el('td','',fmt(A.points90(other),2)));
        for(const [key] of fields)row.append(el('td','',fmt(A.per90(other,key),2)));row.append(el('td','',id===p.id?'—':fmt(A.distance(p,other),2)));tbody.append(row);
      }t.append(tbody);scroll.append(t);comp.append(scroll);
    }
    comp.append(el('p','method-note','Afstand = kvadratroden af gennemsnittet af de kvadrerede forskelle pr. 90, efter skalering ('+
      fields.map(([key,scale])=>key+': '+scale).join(', ')+'). Hver skaleret forskel begrænses til 5. 0 er identiske tal; lavere er tættere. De valgte skalaer er heuristiske, og afstand er ikke en pointprognose eller en procentchance.'));
    panel.append(comp);
  }
  window.FPLPlanUI={init,recommendations,addPlayerDetails};
})();
