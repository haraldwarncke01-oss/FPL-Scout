(function(){
  'use strict';
  const P=window.FPLPlanner,A=window.FPLAnalysis,$=id=>document.getElementById(id);
  const el=(tag,cls='',text='')=>{const e=document.createElement(tag);e.className=cls;e.textContent=text;return e;};
  const fmt=(x,n=1)=>x==null?'—':Number(x).toLocaleString('da-DK',{minimumFractionDigits:n,maximumFractionDigits:n});
  const labels={GKP:'Målmænd',DEF:'Forsvarere',MID:'Midtbane',FWD:'Angribere'};
  let data,selectPlayer,refresh,players,teams,optionPlayers=new Map(),state={ids:[],sales:{},bank:0,freeTransfers:1,chips:{},previousFreeHit:false,transferHorizon:3,allowHit:false,example:false};
  let worker=null,runId=0,running=false,lastResult=null,lastKey='',selectedCount=0;
  let ownWeek=null,resultWeek=null,resultView='after';
  const horizon=()=>Math.min(Number($('horizon').value),data.planning.events.length);
  const currentPlan=()=>data.planning.plans[$('squad-mode').value==='benchboost'?'benchboost':$('horizon').value];
  const ownPlayers=()=>state.ids.map(id=>players.get(id)).filter(Boolean);
  const ownHorizon=()=>Math.min(Number($('own-horizon').value),data.planning.events.length);
  const transferKey=()=>JSON.stringify([state.ids,state.sales,state.bank,state.freeTransfers,ownHorizon(),state.allowHit,data.updatedAt]);
  const chipHalf=()=>data.rules.chips.find(c=>c.name==='3xc'&&c.start_event<=data.planning.events[0]&&c.stop_event>=data.planning.events[0])?.start_event;
  const save=()=>{try{localStorage.setItem('fpl-scout-team-v3',JSON.stringify({...state,season:data.season,chipHalf:chipHalf(),savedGW:data.planning.events[0]}));}catch{}};
  function playerLink(id,cls=''){const p=players.get(id),b=el('button','player-button '+cls,p?.name??'Ukendt');b.type='button';b.addEventListener('click',()=>selectPlayer(id));return b;}
  function init(snapshot,onSelect,onRefresh){
    data=snapshot;selectPlayer=onSelect;refresh=onRefresh;players=new Map(data.players.map(p=>[p.id,p]));teams=new Map(data.teams.map(t=>[t.id,t]));
    try{const saved=JSON.parse(localStorage.getItem('fpl-scout-team-v3')||'null');if(saved?.season===data.season){state={...state,...saved};state.ids=(saved.ids??[]).filter(id=>players.has(id));
      if(saved.chipHalf!==chipHalf())state.chips={};if(saved.savedGW!==data.planning.events[0])state.previousFreeHit=false;}}catch{}
    for(const id of ['horizon','own-horizon'])for(const option of $(id).options){const h=Number(option.value);if(h>1)option.textContent='Næste '+Math.min(h,data.planning.events.length)+' GW'+(h>data.planning.events.length?' · resten af sæsonen':'');}
    rebuildPlayerOptions();$('own-position').addEventListener('change',()=>{rebuildPlayerOptions();$('own-player').value='';});
    $('bank').value=state.bank;$('free-transfers').value=state.freeTransfers;$('previous-freehit').checked=state.previousFreeHit;
    $('own-horizon').value=state.transferHorizon;$('allow-hit').checked=state.allowHit;
    for(const input of document.querySelectorAll('[data-chip]')){input.checked=!!state.chips[input.dataset.chip];input.addEventListener('change',()=>{state.chips[input.dataset.chip]=input.checked;save();renderOwnAnalysis();});}
    $('horizon').addEventListener('change',()=>{updateWeekOptions();renderSquad();refresh();});
    $('squad-mode').addEventListener('change',()=>{updateWeekOptions();renderSquad();});
    for(const id of ['squad-view','lineup-week'])$(id).addEventListener('change',renderSquad);
    $('add-own').addEventListener('click',()=>{
      const text=$('own-player').value.trim();let p=optionPlayers.get(text);
      if(!p){const found=data.players.filter(p=>(!$('own-position').value||p.position===$('own-position').value)&&
        (p.name.toLocaleLowerCase('da')===text.toLocaleLowerCase('da')||p.fullName?.toLocaleLowerCase('da')===text.toLocaleLowerCase('da')));if(found.length===1)p=found[0];}
      if(!p){$('own-status').textContent='Vælg en spiller fra forslagene i søgefeltet.';return;}
      const next=[...ownPlayers(),p],error=P.validateSquad(next,false);if(error){$('own-status').textContent=error;return;}
      state.ids.push(p.id);state.example=false;$('own-player').value='';save();renderOwn();
    });
    $('own-player').addEventListener('keydown',e=>{if(e.key==='Enter'){e.preventDefault();$('add-own').click();}});
    $('use-plan').addEventListener('click',()=>{const plan=currentPlan();if(!plan.squad)return;state.ids=[...plan.squad];state.sales={};state.example=true;state.bank=Math.round((100-plan.cost)*10)/10;$('bank').value=state.bank;save();renderOwn();});
    $('clear-own').addEventListener('click',()=>{state.ids=[];state.sales={};state.example=false;save();renderOwn();});
    for(const id of ['bank','free-transfers','own-horizon','allow-hit','previous-freehit'])$(id).addEventListener(id==='bank'?'input':'change',()=>{readSettings();save();renderOwnAnalysis();});
    $('calculate-transfers').addEventListener('click',calculateTransfers);
    updateWeekOptions();renderSquad();renderOwn();
  }
  function readSettings(){
    if($('bank').checkValidity())state.bank=Math.round(Math.max(0,Number($('bank').value)||0)*10)/10;
    state.freeTransfers=Math.min(5,Math.max(0,Number($('free-transfers').value)||0));state.transferHorizon=Number($('own-horizon').value);
    state.allowHit=$('allow-hit').checked;state.previousFreeHit=$('previous-freehit').checked;
  }
  function rebuildPlayerOptions(){
    const pos=$('own-position').value;$('player-options').replaceChildren();optionPlayers=new Map();
    for(const p of [...data.players].filter(p=>!pos||p.position===pos).sort((a,b)=>a.name.localeCompare(b.name,'da'))){
      const option=el('option');let text=(p.fullName||p.name)+' · '+teams.get(p.teamId)?.shortName+' · '+p.position;
      if(optionPlayers.has(text))text+=' · £'+fmt(p.price)+'m';option.value=text;option.label=p.name+' · £'+fmt(p.price)+'m';optionPlayers.set(text,p);$('player-options').append(option);
    }
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
    const recent=data.planning.forecasts[id]?.recentForm?.last3Points;
    if(recent?.length)b.append(el('small','pitch-form','Seneste '+recent.length+' GW: '+recent.join(' / ')));
    b.addEventListener('click',()=>selectPlayer(id));return b;
  }
  function personalLineup(title,lineup){
    const card=el('section','personal-lineup'),order=P.benchOrder(data,lineup);
    const formation=['DEF','MID','FWD'].map(pos=>lineup.starters.filter(id=>players.get(id).position===pos).length).join('–');
    card.append(el('h4','',title),el('p','lineup-meta',formation+' · '+fmt(lineup.points)+' forventede point fra start-11 inkl. dobbelt kaptajn'),
      el('p','detail-copy','Kaptajn: '+players.get(lineup.captain).name+' · Vice: '+players.get(order.vice).name));
    const pitch=el('div','pitch personal-pitch');
    for(const pos of P.positions){const row=el('div','pitch-row');for(const id of lineup.starters.filter(id=>players.get(id).position===pos))row.append(pitchCard(id,lineup));pitch.append(row);}
    card.append(pitch,el('p','bench-title','Bænk · tæller ikke i prognosen for en normal GW. Forslag til rækkefølge:'));
    const bench=el('div','bench-players personal-bench');
    for(const [index,id] of order.outfield.entries()){const item=el('div','bench-slot');item.append(el('span','',String(index+1)),pitchCard(id,lineup));bench.append(item);}
    if(order.goalkeeper){const item=el('div','bench-slot');item.append(el('span','','Reserve-GK'),pitchCard(order.goalkeeper,lineup));bench.append(item);}
    card.append(bench,el('p','method-note','Bedste lovlige start-11 blandt dine 15 med modellens pointprognoser. Autosubs og vice ved kaptajnfravær er ikke indregnet. Bænkrækkefølgen sorteres på prognosen; FPL skal også kunne bevare en lovlig formation ved indskiftning.'));
    return card;
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
    $('own-status').textContent=(state.example?'Eksempelhold · ':'')+own.length+'/15 valgt · '+counts;
    for(const pos of P.positions){
      const group=el('div','own-position-group'),heading=el('div','own-group-heading'),list=own.filter(p=>p.position===pos);
      heading.append(el('h4','',labels[pos]),el('span','',list.length+'/'+P.quotas[pos]));group.append(heading);
      if(list.length<P.quotas[pos]){const add=el('button','add-position','+ Tilføj '+(P.quotas[pos]-list.length));add.type='button';add.addEventListener('click',()=>{$('own-position').value=pos;rebuildPlayerOptions();$('own-player').focus();});group.append(add);}
      for(const p of list){
      const row=el('div','own-player-row'),name=el('div');name.append(playerLink(p.id),el('small','muted',p.position+' · '+teams.get(p.teamId)?.shortName));
      const label=el('label','','Salg £m'),input=el('input','sale-value');input.type='number';input.min='0';input.step='.1';input.placeholder=String(p.price);input.value=state.sales[p.id]??'';
      input.setAttribute('aria-label','Salgsværdi for '+p.name);input.addEventListener('input',()=>{if(input.value===''||Number(input.value)<0)delete state.sales[p.id];else state.sales[p.id]=Number(input.value);save();renderOwnAnalysis();});label.append(input);
      const remove=el('button','remove-player','×');remove.type='button';remove.setAttribute('aria-label','Fjern '+p.name);remove.addEventListener('click',()=>{state.ids=state.ids.filter(id=>id!==p.id);delete state.sales[p.id];state.example=false;save();renderOwn();});
      row.append(name,label,remove);group.append(row);
      }
      $('own-roster').append(group);
    }
    renderOwnAnalysis();
  }
  function financeError(){
    if(!$('bank').checkValidity())return 'Bank skal være 0 eller mere med én decimal, fx 1,5.';
    if([...document.querySelectorAll('.sale-value')].some(input=>!input.checkValidity()))return 'Salgsværdier skal være 0 eller mere med én decimal.';
    return null;
  }
  function renderOwnAnalysis(){
    const own=ownPlayers(),error=P.validateSquad(own),box=$('own-analysis');box.replaceChildren();
    if(!data.planning.events.length)box.append(el('p','detail-copy','Ingen kommende gameweek registreret.'));
    else if(error)box.append(el('p','detail-copy',error));
    else{
      if(!data.planning.events.includes(ownWeek))ownWeek=data.planning.events[0];
      const lineup=P.bestXI(data,own,ownWeek),headline=el('div','own-lineup'),heading=el('div','own-lineup-heading');
      heading.append(el('h3','','Dit hold · optimal start-11'));
      const label=el('label','','Se gameweek'),select=el('select');select.setAttribute('aria-label','Gameweek for dit optimale hold');
      for(const gw of data.planning.events){const o=el('option','','GW '+gw);o.value=gw;select.append(o);}select.value=ownWeek;
      select.addEventListener('change',()=>{ownWeek=Number(select.value);renderOwnAnalysis();});label.append(select);heading.append(label);headline.append(heading,
        personalLineup('Startopstilling · GW '+ownWeek,lineup),el('p','method-note',fmt(P.horizonScore(data,own,ownHorizon()))+' forventede holdpoint over '+ownHorizon()+' GW fra kommende GW, uden transfers.'));
      box.append(headline);
      const summary=el('div','own-budget-card');summary.append(el('h3','','Din økonomi'),el('strong','','£'+fmt(state.bank)+'m i banken'),
        el('p','detail-copy',state.freeTransfers+' gratis transfer'+(state.freeTransfers===1?'':'s')+' · vurderer de næste '+ownHorizon()+' GW.'),
        el('p','method-note','Holdet gemmes her i browseren. Brug navnene på dine faktiske spillere og deres salgsværdier fra FPL.'));
      box.append(summary);
      const watch=own.filter(p=>{const f=data.planning.forecasts[p.id]?.recentForm;return p.price>=8&&f?.last3Points?.length===3&&f.seasonAverage-f.last3Average>=1.5;})
        .sort((a,b)=>{const x=data.planning.forecasts[a.id].recentForm,y=data.planning.forecasts[b.id].recentForm;return (y.seasonAverage-y.last3Average)-(x.seasonAverage-x.last3Average);});
      if(watch.length){const section=el('div','form-watch');section.append(el('h3','','Formfald på dit hold · vurder nærmere'));
        for(const p of watch){const f=data.planning.forecasts[p.id].recentForm,card=el('div','form-watch-card');card.append(playerLink(p.id),
          el('span','','£'+fmt(p.price)+'m · seneste 3 GW: '+f.last3Points.join(' / ')+' pts'),
          el('p','detail-copy',fmt(f.last3Average)+' pts/GW senest mod '+fmt(f.seasonAverage)+' i sæsonens afsluttede GW med holdkamp.'));
          const recentGI=(f.recentXG90??0)+(f.recentXA90??0),seasonGI=f.seasonXG90+f.seasonXA90;
          card.append(el('small','',f.recentXG90==null||f.recentXA90==null?'Seneste xG/xA mangler; pointene alene afgør ikke et salg.':
            'Seneste vægtede xGI/90: '+fmt(recentGI,2)+' · sæson: '+fmt(seasonGI,2)+'. '+(recentGI<.8*seasonGI?'Chanceproduktionen er også lavere.':'Chanceproduktionen kan stadig tale for at beholde spilleren.')));section.append(card);
        }section.append(el('p','method-note','Viser spillere til mindst £8m med tre kendte GW og mindst 1,5 færre pts/GW end sæsongennemsnittet. Dette er opmærksomhedspunkter; transferforslaget afhænger af din start-11, modstandere, budget og alternativer.'));box.append(section);
      }
    }
    const invalid=error||financeError()||(!data.planning.events.length?'Ingen kommende gameweek registreret.':null),key=transferKey();
    if(invalid||key!==lastKey){if(running)stopSearch();lastResult=null;$('transfer-results').replaceChildren();lastKey=key;}
    $('calculate-transfers').disabled=!!invalid||running;
    if(!running&&!lastResult)$('transfer-status').textContent=invalid||'Klar · tryk på Find transferforslag.';
    $('chip-cards').replaceChildren();
    for(const row of P.chipAdvice(data,own,state.chips,state.freeTransfers,state.bank,state.sales,state.previousFreeHit)){
      const card=el('article','chip-card'+(row.use?' recommended':''));card.append(el('span','chip-status',row.status),el('h3','',row.name),el('p','detail-copy',row.text));
      if(row.stop)card.append(el('small','muted','Aktuelt chip-vindue slutter efter GW '+row.stop));$('chip-cards').append(card);
    }
  }
  function stopSearch(){runId++;worker?.terminate();worker=null;running=false;}
  function calculateTransfers(){
    readSettings();save();renderOwnAnalysis();if($('calculate-transfers').disabled)return;
    stopSearch();const generation=runId,key=transferKey();running=true;lastResult=null;
    $('calculate-transfers').disabled=true;$('transfer-status').textContent='Beregner kombinationer af transfers…';$('transfer-results').replaceChildren();
    const payload={data,ids:[...state.ids],horizon:ownHorizon(),bank:state.bank,sales:{...state.sales},options:{freeTransfers:state.freeTransfers,allowHit:state.allowHit}};
    const done=(result,error)=>{
      if(generation!==runId||!running||key!==transferKey())return;
      worker?.terminate();worker=null;running=false;$('calculate-transfers').disabled=false;
      if(error||result?.error){$('transfer-status').textContent='Beregningen kunne ikke gennemføres: '+(error||result.error);return;}
      lastResult=result;lastKey=key;selectedCount=result.recommended.count;
      resultWeek=result.events[0];resultView='after';
      $('transfer-status').textContent=fmt(result.evaluated,0)+' kombinationer afprøvet · '+result.horizon+' GW.';renderTransferResults();
    };
    const local=()=>setTimeout(()=>{if(generation!==runId)return;try{done(P.transferPlans(data,ownPlayers(),payload.horizon,payload.bank,payload.sales,payload.options));}catch(e){done(null,e.message);}},0);
    if(typeof Worker==='function')try{
      worker=new Worker('./transfer-worker.js');worker.onmessage=e=>done(e.data.result,e.data.error);
      worker.onerror=()=>{if(generation!==runId||!running)return;worker?.terminate();worker=null;local();};worker.postMessage(payload);
    }catch{worker?.terminate();worker=null;local();}else local();
  }
  function renderTransferResults(){
    const result=lastResult;if(!result)return;const plan=result.alternatives.find(p=>p.count===selectedCount)??result.recommended;
    const container=$('transfer-results');container.replaceChildren();
    const header=el('div','transfer-result-heading'),intro=el('div');
    intro.append(el('span','section-kicker',plan.count===result.recommended.count?'ANBEFALET PLAN':'ALTERNATIV PLAN'),
      el('h3','',plan.count===0?'Gem dine transfers':plan.count+' transfer'+(plan.count===1?'':'s')+' i kommende GW'),
      el('p','detail-copy',plan.count?((plan.netGain>=0?'+':'')+fmt(plan.netGain)+' forventede holdpoint over '+result.horizon+' GW efter '+plan.hit+' point i fradrag.'):
        'Ingen af de afprøvede ændringer gav mindst 2 ekstra forventede point efter eventuelle fradrag.'));
    const picker=el('label','plan-picker','Sammenlign planer'),select=el('select');select.setAttribute('aria-label','Vælg antal transfers i planen');
    for(const alternative of result.alternatives){const option=el('option','',(alternative.count===0?'0 · gem transfers':alternative.count+' transfer'+(alternative.count===1?'':'s'))+
      ' · '+(alternative.netGain>=0?'+':'')+fmt(alternative.netGain)+' pts'+(alternative.hit?' · -'+alternative.hit+' fradrag':'')+(alternative.count===result.recommended.count?' · anbefalet':''));option.value=alternative.count;select.append(option);}
    select.value=plan.count;select.addEventListener('change',()=>{selectedCount=Number(select.value);renderTransferResults();});picker.append(select);header.append(intro,picker);container.append(header);
    if(plan.count===0){
      const alternative=result.alternatives.filter(p=>p.count>0).sort((a,b)=>b.netGain-a.netGain||a.count-b.count)[0];
      if(alternative){const summary=el('div','keep-explanation');summary.append(el('h4','','Hvorfor gemme transfers?'),
        el('p','detail-copy','Bedste afprøvede ændring: '+alternative.moves.map(m=>players.get(m.out).name+' → '+players.get(m.incoming).name).join(', ')+
          '. Nettogevinst: '+(alternative.netGain>=0?'+':'')+fmt(alternative.netGain)+' point. Bank efter: £'+fmt(alternative.bankAfter)+'m.'));
        if(alternative.moves.every(m=>result.beforeLineups.every(l=>!l.starters.includes(m.out))&&alternative.lineups.every(l=>!l.starters.includes(m.incoming))))summary.append(el('p','detail-copy',
          'De berørte spillere er på bænken i hele perioden i begge opstillinger. Skiftet forbedrer derfor ikke dine start-11-point. Den frigjorte bank kan være nyttig til en senere transfer, som modellen ikke planlægger.'));
        container.append(summary);
      }
    }
    if(state.example)container.append(el('p','result-caution','Dette er et eksempelhold. Indtast dit faktiske hold for at få personlige forslag.'));
    if(plan.estimatedSales)container.append(el('p','result-caution','Nogle salgsværdier er estimeret fra købsprisen. Indtast de rigtige salgsværdier fra FPL og beregn igen for at kontrollere økonomien.'));
    const overview=el('div','transfer-overview');for(const [label,value] of [['BANK NU','£'+fmt(result.bank)+'m'],['BANK EFTER','£'+fmt(plan.bankAfter)+'m'],['GRATIS TILBAGE',String(plan.freeTransfersLeft)],['POINTFRADRAG',plan.hit?'-'+plan.hit:'0']]){
      const box=el('div');box.append(el('span','stat-label',label),el('strong','',value));overview.append(box);
    }container.append(overview);
    const moves=el('div','transfer-moves');
    for(const move of plan.moves){
      const out=players.get(move.out),incoming=players.get(move.incoming),oldForecast=data.planning.forecasts[move.out],newForecast=data.planning.forecasts[move.incoming];
      const card=el('article','transfer-move'),pair=el('div','transfer-pair'),left=el('div'),right=el('div');
      left.append(el('span','move-direction','UD'),playerLink(move.out),el('small','muted','Salg £'+fmt(move.sale)+'m · '+teams.get(out.teamId)?.shortName));
      right.append(el('span','move-direction in','IND'),playerLink(move.incoming),el('small','muted','Køb £'+fmt(move.buy)+'m · '+teams.get(incoming.teamId)?.shortName));
      pair.append(left,el('span','move-arrow','→'),right);card.append(pair);
      const oldPoints=P.total(data,move.out,result.horizon),newPoints=P.total(data,move.incoming,result.horizon),saving=move.sale-move.buy;
      let reason='Stærkere pointprognose i perioden.';
      if(saving>0&&newPoints<=oldPoints)reason='Frigør £'+fmt(saving)+'m til andre forbedringer i den samlede plan.';
      else if((newForecast?.expectedMinutesPerMatch??0)>(oldForecast?.expectedMinutesPerMatch??0)+15)reason='Mere forventet spilletid i den kommende periode.';
      else if(!(oldForecast?.events[0]?.fixtureCount??0)&&(newForecast?.events[0]?.fixtureCount??0))reason='Giver en kamp i kommende GW, hvor den nuværende spiller har blankt GW.';
      card.append(el('p','detail-copy',reason),el('p','move-stats','Spillerprognose: '+fmt(oldPoints)+' → '+fmt(newPoints)+' pts / '+result.horizon+' GW. '+
        'Forventede minutter/kamp: '+fmt(oldForecast?.expectedMinutesPerMatch,0)+' → '+fmt(newForecast?.expectedMinutesPerMatch,0)+'.'),
        el('p','move-starts','Start-11: '+result.beforeLineups.filter(l=>l.starters.includes(move.out)).length+'/'+result.horizon+' GW for spilleren ud → '+plan.lineups.filter(l=>l.starters.includes(move.incoming)).length+'/'+result.horizon+' GW for spilleren ind.'));
      const recentOut=oldForecast?.recentForm?.last3Points,recentIn=newForecast?.recentForm?.last3Points;
      if(recentOut?.length||recentIn?.length)card.append(el('p','move-stats','Seneste 3 GW-point: '+(recentOut?.join(' / ')||'—')+' → '+(recentIn?.join(' / ')||'—')+'.'));moves.append(card);
    }container.append(moves);
    if(plan.count===0&&result.maxMoves===0)container.append(el('p','method-note','Du har 0 gratis transfers. Du kan markere muligheden for én ekstra transfer med 4 point i fradrag for at afprøve et point-hit.'));
    const scroll=el('div','table-scroll'),table=el('table','transfer-impact'),thead=el('thead'),tr=el('tr');
    for(const text of ['GW','DIT HOLD NU','MED PLANEN¹','FORSKEL','KAPTAJN EFTER'])tr.append(el('th','',text));thead.append(tr);table.append(thead);
    const tbody=el('tbody');for(let i=0;i<plan.lineups.length;i++){
      const before=result.beforeLineups[i],after=plan.lineups[i],afterPoints=after.points-(i===0?plan.hit:0),delta=afterPoints-before.points,row=el('tr');
      for(const text of ['GW '+after.gameweek,fmt(before.points),fmt(afterPoints),(delta>=0?'+':'')+fmt(delta),players.get(after.captain)?.name??'—'])row.append(el('td','',text));tbody.append(row);
    }table.append(tbody);scroll.append(table);container.append(scroll,
      el('p','method-note','¹ Inkl. dobbelt kaptajn; eventuelt pointfradrag trækkes én gang i den kommende GW. Spillerprognoserne på kortene kan ikke lægges direkte sammen til holdgevinsten, fordi startopstilling og kaptajn også ændres.'),
      el('p','method-note','Planen bruger '+plan.count+' transfers nu. Med almindelig opsparing vil du have '+plan.freeTransfersNextGW+' gratis transfers ved næste GW. Hele planen skal bekræftes samlet i FPL; den udfører ingen transfers på din konto. Opdatér dit hold her, når du har gennemført ændringerne.'));
    const controls=el('div','result-lineup-controls');
    const weekLabel=el('label','','Se opstilling i'),weekSelect=el('select');weekSelect.setAttribute('aria-label','Gameweek for transferopstilling');
    for(const gw of result.events){const o=el('option','','GW '+gw);o.value=gw;weekSelect.append(o);}if(!result.events.includes(resultWeek))resultWeek=result.events[0];weekSelect.value=resultWeek;
    weekSelect.addEventListener('change',()=>{resultWeek=Number(weekSelect.value);renderTransferResults();});weekLabel.append(weekSelect);
    const viewLabel=el('label','','Sammenlign'),viewSelect=el('select');viewSelect.setAttribute('aria-label','Opstilling før eller efter transfers');
    for(const [value,text] of [['after','Efter denne plan'],['before','Uden transfers']]){const o=el('option','',text);o.value=value;viewSelect.append(o);}viewSelect.value=resultView;
    viewSelect.addEventListener('change',()=>{resultView=viewSelect.value;renderTransferResults();});viewLabel.append(viewSelect);controls.append(weekLabel,viewLabel);container.append(controls);
    const lineup=(resultView==='after'?plan.lineups:result.beforeLineups).find(l=>l.gameweek===resultWeek);
    container.append(personalLineup((resultView==='after'?'Start-11 efter planen':'Start-11 uden transfers')+' · GW '+resultWeek,lineup));
    if(resultView==='after'&&resultWeek===result.events[0]&&plan.hit)container.append(el('p','method-note','Opstillingen viser spillerpoint. I GW '+resultWeek+' er holdets netto '+fmt(lineup.points-plan.hit)+' point efter '+plan.hit+' i transferfradrag.'));
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
          el('span','card-sub','Seneste 3 GW: '+(f.recentForm?.last3Points?.join(' / ')||'—')+' pts'),
          el('span','card-sub','Gab: '+(s?.peerGap==null?'—':(s.peerGap>=0?'+':'')+fmt(s.peerGap,2))+' pts/90'),
          el('span','card-sub',high?'Tæt på '+high.name+' · afstand '+fmt(high.distance,2):'Ingen tæt topscorer inden for afstand 2,25'),el('span','card-link','Se tal & begrundelse ↗'));
        card.addEventListener('click',()=>selectPlayer(p.id));group.append(card);
      }
      container.append(group);
    }
  }
  function addPlayerDetails(panel,p,scout){
    const info=p.minutesInfo??{},f=data.planning.forecasts[p.id],block=el('div','detail-block');block.append(el('h3','','Spilletid & næste fem gameweeks'));
    const form=f?.recentForm;
    if(form){const summary=el('div','recent-form-summary');summary.append(el('h4','','Seneste form · nyeste GW først'));
      const metrics=el('div','form-metrics');const xgi=form.recentXG90==null||form.recentXA90==null?null:form.recentXG90+form.recentXA90;
      for(const [label,value] of [['POINT I SENESTE 3 GW',form.last3Points.join(' / ')||'—'],['PTS/GW · SENESTE 3',fmt(form.last3Average)],['PTS/GW · SÆSON',fmt(form.seasonAverage)],['MEDIAN · SENESTE 5',fmt(form.last5Median)],['xGI/90 · SENESTE',fmt(xgi,2)],['xGI/90 · SÆSON',fmt(form.seasonXG90+form.seasonXA90,2)]]){
        const metric=el('div','detail-metric');metric.append(el('span','stat-label',label),el('strong','',value));metrics.append(metric);
      }summary.append(metrics);
      const rows=el('div','recent-gw-list');for(const gw of form.gameweeks){const item=el('div','recent-gw');item.append(el('strong','','GW '+gw.gameweek+' · '+gw.points+' pts'),
        el('span','',gw.minutes+' min · '+gw.fixtureCount+' kamp'+(gw.fixtureCount===1?'':'e')),
        el('small','','xG '+fmt(gw.xG,2)+' · xA '+fmt(gw.xA,2)));rows.append(item);}summary.append(rows,
        el('p','method-note','Der bruges afsluttede GW med holdkamp; en dobbelt-GW tæller som én GW, og xG/xA normaliseres pr. 90 minutter. Ukendte stats bliver ikke til 0. Seneste xG/xA og bonus vægtes op til 60%, sæsonen 40%. En formkorrektion giver op til 20% vægt til seneste point ud over spilletid; enkelte store pointuger begrænses i forhold til medianen. Små stikprøver reducerer vægten.'));block.append(summary);
    }
    const metrics=el('div','detail-metrics');for(const [label,value] of [['MIN/KAMP · INKL. 0',fmt(info.avgMinutesPerMatch)],['MIN NÅR HAN SPILLER',fmt(info.avgMinutes)],['FORVENTET MIN/KAMP',fmt(f?.expectedMinutesPerMatch)]]){
      const box=el('div','detail-metric');box.append(el('span','stat-label',label),el('strong','',value));metrics.append(box);
    }block.append(metrics,el('p','method-note','Sæsongennemsnit: '+(info.matchesKnown??0)+' holdkampe med kendte data, '+(info.appearances??0)+' med spilletid. Sidste tre vises nyeste først; 0 er en kamp uden spilletid, — er ukendt.'));
    const recent=el('div','recent-minutes');for(const match of info.last3??[]){const item=el('div','minute-match'+(match.minutes===0?' no-minutes':''));
      item.append(el('strong','',(match.minutes??'—')+' min'),el('span','','GW '+match.gameweek+' · '+(teams.get(match.opponent)?.shortName??'Tidligere klub')+(match.home==null?'':match.home?' (H)':' (U)')),
        el('small','muted',match.date?new Date(match.date).toLocaleDateString('da-DK'):''));recent.append(item);}block.append(recent);
    const wrap=el('div','table-scroll'),table=el('table','forecast-table'),head=el('thead'),tr=el('tr');
    for(const label of ['GW','MODSTANDER','MIN','POINT','SPILLETID','MÅL','ASSISTS','CS','BONUS','DEF.','REDN.','FRADRAG','FORM'])tr.append(el('th','',label));head.append(tr);table.append(head);
    const body=el('tbody');for(const event of f?.events??[]){const row=el('tr'),c=event.components;
      const values=['GW '+event.gameweek,event.fixtures.map(x=>teams.get(x.opponent)?.shortName+(x.home?' (H)':' (U)')).join(' / ')||'Blank',fmt(event.minutes,0),fmt(event.points,2),
        ...['appearance','goals','assists','cleanSheet','bonus','defensive','saves','deductions','recentForm'].map(key=>fmt(c[key],2))];
      for(const value of values)row.append(el('td','',value));body.append(row);
    }table.append(body);wrap.append(table);block.append(wrap,el('p','method-note','Forventede minutter = 75% af sidste tre kendte kampes vægtede minutter (50/30/20) + 25% af sæsongennemsnittet inklusive 0, ganget med FPL’s tilgængelighed. Pointkolonnerne er modellens bidrag pr. GW. FORM viser ændringen fra seneste realiserede point; den kan være negativ.'));
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
