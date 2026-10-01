(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.FPLPlanner=api;})(typeof window==='object'?window:globalThis,function(){
  'use strict';
  const positions=['GKP','DEF','MID','FWD'], quotas={GKP:2,DEF:5,MID:5,FWD:3};
  const points=(data,id,gw)=>data.planning?.forecasts[id]?.events.find(e=>e.gameweek===gw)?.points??0;
  const total=(data,id,h)=>data.planning?.forecasts[id]?.events.slice(0,h).reduce((sum,e)=>sum+e.points,0)??0;
  const forecast=(data,id,gw)=>data.planning?.forecasts[id]?.events.find(e=>e.gameweek===gw);
  function validateSquad(players,complete=true){
    if(new Set(players.map(p=>p.id)).size!==players.length)return 'Du har valgt samme spiller flere gange.';
    if(complete&&players.length!==15)return 'Vælg 15 spillere: 2 målmænd, 5 forsvarere, 5 midtbane og 3 angribere.';
    for(const pos of positions){const count=players.filter(p=>p.position===pos).length;
      if(count>quotas[pos]||(complete&&count!==quotas[pos]))return 'Forkert antal spillere på '+pos+'.';}
    const clubs=new Map();for(const p of players)clubs.set(p.teamId,(clubs.get(p.teamId)??0)+1);
    if([...clubs.values()].some(n=>n>3))return 'Du kan højst have tre spillere fra samme klub.';
    return null;
  }
  function bestXI(data,players,gw){
    if(validateSquad(players))return null;
    const groups=Object.fromEntries(positions.map(pos=>[pos,players.filter(p=>p.position===pos).sort((a,b)=>points(data,b.id,gw)-points(data,a.id,gw)||a.id-b.id)]));
    let best=null;
    for(let def=3;def<=5;def++)for(let mid=2;mid<=5;mid++){
      const fwd=10-def-mid;if(fwd<1||fwd>3)continue;
      const starters=[groups.GKP[0],...groups.DEF.slice(0,def),...groups.MID.slice(0,mid),...groups.FWD.slice(0,fwd)];
      const captain=[...starters].sort((a,b)=>points(data,b.id,gw)-points(data,a.id,gw)||a.id-b.id)[0];
      const score=starters.reduce((sum,p)=>sum+points(data,p.id,gw),0)+points(data,captain.id,gw);
      if(!best||score>best.points){const ids=starters.map(p=>p.id),bench=players.filter(p=>!ids.includes(p.id));
        best={gameweek:gw,starters:ids,bench:bench.map(p=>p.id),captain:captain.id,points:score,benchPoints:bench.reduce((sum,p)=>sum+points(data,p.id,gw),0)};}
    }
    return best;
  }
  function horizonScore(data,players,h){return data.planning.events.slice(0,h).reduce((sum,gw)=>sum+(bestXI(data,players,gw)?.points??0),0);}
  function benchOrder(data,lineup){
    const byId=new Map(data.players.map(p=>[p.id,p]));
    const outfield=lineup.bench.filter(id=>byId.get(id).position!=='GKP').sort((a,b)=>points(data,b,lineup.gameweek)-points(data,a,lineup.gameweek)||a-b);
    return {outfield,goalkeeper:lineup.bench.find(id=>byId.get(id).position==='GKP'),
      vice:lineup.starters.filter(id=>id!==lineup.captain).sort((a,b)=>points(data,b,lineup.gameweek)-points(data,a,lineup.gameweek)||a-b)[0]};
  }
  function bestTransfer(data,players,h,bank=0,saleValues={}){
    if(validateSquad(players))return null;
    const current=horizonScore(data,players,h),owned=new Set(players.map(p=>p.id));
    const targets=Object.fromEntries(positions.map(pos=>[pos,data.players.filter(p=>p.position===pos&&!owned.has(p.id)&&p.canSelect!==false&&
      (data.planning.forecasts[p.id]?.expectedMinutesPerMatch??0)>=50&&(data.planning.forecasts[p.id]?.availability??0)>=.75)
      .sort((a,b)=>total(data,b.id,h)-total(data,a.id,h)).slice(0,30)]));
    let best=null;
    for(const out of players)for(const incoming of targets[out.position]){
      const sale=Number(saleValues[out.id]??out.price);if(incoming.price>sale+bank+.001)continue;
      const next=players.map(p=>p.id===out.id?incoming:p);if(validateSquad(next))continue;
      const gain=horizonScore(data,next,h)-current;
      if(!best||gain>best.gain)best={out:out.id,incoming:incoming.id,gain,cost:incoming.price-sale,usesEstimatedSale:saleValues[out.id]==null};
    }
    return best;
  }
  function transferPlans(data,players,h,bank=0,saleValues={},options={}){
    const error=validateSquad(players);if(error)return {error};
    if(!Number.isFinite(bank)||bank<0)return {error:'Banken skal være et positivt beløb eller 0.'};
    h=Math.min(Math.max(1,Math.floor(h)),data.planning.events.length);
    if(!h)return {error:'Ingen kommende gameweek registreret.'};
    const ft=Math.max(0,Math.min(5,Math.floor(options.freeTransfers??1)));
    const maxMoves=Math.min(6,ft+(options.allowHit?1:0)),width=options.beamWidth??28;
    const ownIds=players.map(p=>p.id),owned=new Set(ownIds),all=new Map(data.players.map(p=>[p.id,p]));
    const price=p=>Math.round(p.price*10),sales=players.map(p=>Math.round(Number(saleValues[p.id]??p.price)*10));
    if(sales.some(n=>!Number.isFinite(n)||n<0))return {error:'Kontrollér spillernes salgsværdier.'};
    const bankUnits=Math.round(bank*10),events=data.planning.events.slice(0,h);
    // Preload points; the best captain is always the highest scorer in a position's first slot.
    const playerScores=new Map(data.players.map(p=>[p.id,events.map(gw=>points(data,p.id,gw))]));
    const posIndex=new Map(data.players.map(p=>[p.id,positions.indexOf(p.position)]));
    const scoreCache=new Map();let evaluated=0;
    function squadScore(ids){
      const key=ids.slice().sort((a,b)=>a-b).join(',');if(scoreCache.has(key))return scoreCache.get(key);
      let sum=0;
      for(let g=0;g<h;g++){
        const groups=[[],[],[],[]];for(const id of ids)groups[posIndex.get(id)].push(playerScores.get(id)[g]);
        for(const group of groups)group.sort((a,b)=>b-a);
        const pref=groups.map(group=>{const x=[0];for(const p of group)x.push(x.at(-1)+p);return x;});
        let best=-Infinity;
        for(let d=3;d<=5;d++)for(let m=2;m<=5;m++){const f=10-d-m;if(f>=1&&f<=3)best=Math.max(best,pref[0][1]+pref[1][d]+pref[2][m]+pref[3][f]);}
        sum+=best+Math.max(...groups.map(group=>group[0]));
      }
      evaluated++;scoreCache.set(key,sum);return sum;
    }
    const candidates={},minPrices={};
    for(const pos of positions){
      const pool=data.players.filter(p=>p.position===pos&&!owned.has(p.id)&&p.canSelect!==false&&
        (data.planning.forecasts[p.id]?.expectedMinutesPerMatch??0)>=50&&(data.planning.forecasts[p.id]?.availability??0)>=.75);
      const rank=p=>total(data,p.id,h),top=[...pool].sort((a,b)=>rank(b)-rank(a)||a.id-b.id).slice(0,20);
      const value=[...pool].sort((a,b)=>rank(b)/b.price-rank(a)/a.price||a.id-b.id).slice(0,8);
      const cheap=[...pool].sort((a,b)=>a.price-b.price||rank(b)-rank(a)||a.id-b.id).slice(0,4);
      candidates[pos]=[...new Map([...top,...value,...cheap].map(p=>[p.id,p])).values()];
      minPrices[pos]=pool.length?Math.min(...pool.map(price)):Infinity;
    }
    const initialClubs=new Map();for(const p of players)initialClubs.set(p.teamId,(initialClubs.get(p.teamId)??0)+1);
    const baseline=squadScore(ownIds),first={ids:ownIds,moves:[],mask:0,bank:bankUnits,clubs:initialClubs,score:baseline,rank:baseline};
    const bestByCount=[first];let beam=[first];
    const better=(a,b)=>!b||a.score>b.score+1e-8||(Math.abs(a.score-b.score)<1e-8&&a.bank>b.bank);
    for(let depth=1;depth<=maxMoves&&beam.length;depth++){
      const states=new Map(),remaining=maxMoves-depth;
      for(const state of beam)for(let slot=0;slot<15;slot++){
        if(state.mask&(1<<slot))continue;
        const out=players[slot];
        for(const incoming of candidates[out.position]){
          if(state.ids.includes(incoming.id))continue;
          const nextBank=state.bank+sales[slot]-price(incoming),mask=state.mask|(1<<slot);
          // Intermediate moves may need a second sale to fund them. Final plans must be affordable.
          if(nextBank<0){
            const savings=players.map((p,i)=>mask&(1<<i)?0:Math.max(0,sales[i]-minPrices[p.position])).sort((a,b)=>b-a);
            if(nextBank+savings.slice(0,remaining).reduce((s,v)=>s+v,0)<0)continue;
          }
          const clubs=new Map(state.clubs);clubs.set(out.teamId,(clubs.get(out.teamId)??0)-1);clubs.set(incoming.teamId,(clubs.get(incoming.teamId)??0)+1);
          let debt=0,repairable=true;
          for(const [club,count] of clubs)if(count>3){
            const excess=count-3;debt+=excess;
            if(players.filter((p,i)=>p.teamId===club&&!(mask&(1<<i))).length<excess)repairable=false;
          }
          if(!repairable||debt>remaining)continue;
          const ids=[...state.ids];ids[slot]=incoming.id;
          const key=ids.slice().sort((a,b)=>a-b).join(',');if(states.has(key))continue;
          const score=squadScore(ids),hit=4*Math.max(0,depth-ft);
          const next={ids,moves:[...state.moves,{out:out.id,incoming:incoming.id,sale:sales[slot]/10,buy:incoming.price,
            usesEstimatedSale:saleValues[out.id]==null}],mask,bank:nextBank,clubs,score,
            rank:score-hit-Math.max(0,-nextBank)/10*h*.3-debt*h*.5};
          states.set(key,next);
          if(nextBank>=0&&debt===0&&better(next,bestByCount[depth]))bestByCount[depth]=next;
        }
      }
      // Keep both affordable and funding-dependent branches in a bounded search.
      const ranked=[...states.values()].sort((a,b)=>b.rank-a.rank||b.bank-a.bank);
      const legal=ranked.filter(s=>s.bank>=0&&[...s.clubs.values()].every(n=>n<=3)).slice(0,Math.ceil(width/2));
      beam=[...new Map([...legal,...ranked.slice(0,width)].map(s=>[s.ids.slice().sort((a,b)=>a-b).join(','),s])).values()].slice(0,width);
    }
    function describe(state){
      const count=state.moves.length,hit=4*Math.max(0,count-ft),squad=state.ids.map(id=>all.get(id));
      return {count,moves:state.moves,grossGain:state.score-baseline,hit,netGain:state.score-baseline-hit,
        points:state.score,bankAfter:state.bank/10,freeTransfersLeft:Math.max(0,ft-count),
        freeTransfersNextGW:Math.min(5,Math.max(0,ft-count)+1),squad:state.ids,
        estimatedSales:state.moves.some(m=>m.usesEstimatedSale),
        lineups:events.map(gw=>bestXI(data,squad,gw))};
    }
    const alternatives=bestByCount.filter(Boolean).map(describe);
    let recommended=alternatives[0];
    for(const plan of alternatives.slice(1))if(plan.netGain>=2&&(plan.netGain>recommended.netGain+1e-8||
      (Math.abs(plan.netGain-recommended.netGain)<1e-8&&plan.count<recommended.count)))recommended=plan;
    return {horizon:h,events,baseline,bank:bankUnits/10,freeTransfers:ft,maxMoves,recommended,alternatives,
      beforeLineups:events.map(gw=>bestXI(data,players,gw)),evaluated,
      method:'Bounded beam search: up to 32 targets per position, 28 branches; normal XI/captain, no future transfers or autosubs'};
  }
  function chipAdvice(data,players,remaining={},freeTransfers=1,bank=0,saleValues={},previousFreeHit=false){
    const events=data.planning.events,gw=events[0],own=validateSquad(players)?null:players;
    const lineups=own?events.map(e=>bestXI(data,own,e)):[],byId=new Map(data.players.map(p=>[p.id,p]));
    const budget=own?own.reduce((sum,p)=>sum+Number(saleValues[p.id]??p.price),0)+bank:0;
    const advice=[];
    for(const [key,name] of [['3xc','Triple Captain'],['bboost','Bench Boost'],['wildcard','Wildcard'],['freehit','Free Hit']]){
      const window=data.rules.chips.find(c=>c.name===key&&c.start_event<=gw&&c.stop_event>=gw);
      const row={key,name,use:false,status:'Betingelser',text:'',stop:window?.stop_event};
      if(!window){row.status='Ikke tilgængelig';row.text='Chippen er ikke aktiv i denne GW ifølge FPL-reglerne.';}
      else if(!remaining[key]){row.status='Ikke markeret';row.text='Markér chippen som ubrugt i den aktuelle sæsonhalvdel for at få et råd.';}
      else if(!own){row.text='Tilføj dit 15-mandshold for at få et personligt råd. ';row.text+=
        key==='3xc'?'Vi sammenligner kaptajnens prognose nu med de næste fem GW.':
        key==='bboost'?'Vi kræver mindst 12 forventede bænkpoint og mindst 55 forventede minutter pr. kamp for alle fire.':
        key==='wildcard'?'Vi ser efter mindst fire problemspillere og en stor forbedring over fem GW.':
        'Vi ser efter mindst tre spillere uden en brugbar kamp og et problem, der primært gælder denne GW.';}
      else if(key==='3xc'){
        const cap=lineups[0].captain,score=points(data,cap,gw),peak=Math.max(...lineups.map(l=>points(data,l.captain,l.gameweek)));
        row.use=score>=6&&score>=.95*peak&&(data.planning.forecasts[cap]?.expectedMinutesPerMatch??0)>=75;
        row.text=byId.get(cap).name+': '+score.toFixed(1)+' forventede point; '+peak.toFixed(1)+' er højeste kaptajnprognose i de næste '+events.length+' GW. '+
          'Triple Captain giver ca. '+score.toFixed(1)+' ekstra point i modellen. Tærskel: 6 point, 75 min/kamp og mindst 95% af periodens bedste mulighed.';
      }else if(key==='bboost'){
        const bench=lineups[0].benchPoints,peak=Math.max(...lineups.map(l=>l.benchPoints));
        const minutesOK=lineups[0].bench.every(id=>(data.planning.forecasts[id]?.expectedMinutesPerMatch??0)>=55&&(forecast(data,id,gw)?.fixtureCount??0)>0);
        row.use=bench>=12&&bench>=.9*peak&&minutesOK;
        row.text='Din bænk: '+bench.toFixed(1)+' forventede point; bedste bænk i perioden: '+peak.toFixed(1)+'. '+
          'Tærskel: 12 point, mindst 90% af periodens bedste bænk og alle fire med mindst 55 forventede min/kamp og en kamp.';
      }else if(key==='freehit'){
        const missing=lineups[0].starters.filter(id=>(forecast(data,id,gw)?.minutes??0)<30).length;
        const ideal=data.planning.plans['1'],gain=(ideal.points??0)-lineups[0].points;
        const future=lineups.slice(1),recovery=future.length?future.reduce((s,l)=>s+l.points,0)/future.length-lineups[0].points:0;
        row.use=budget>=100&&missing>=3&&gain>=12&&freeTransfers<missing&&recovery>=10&&!previousFreeHit;
        row.text=missing+' startere har under 30 forventede minutter i denne GW. £100m-holdet har ca. '+gain.toFixed(1)+' flere point før transfers; '+
          'dit hold forbedres ca. '+recovery.toFixed(1)+' point/GW bagefter. Tærskel: mindst 3 problemer, 12 point i gevinst, 10 point i efterfølgende bedring og for få gratis transfers. '+
          (budget<100?'Din beregnede salgsværdi + bank er under £100m, så referencen er ikke nødvendigvis betalelig. ':'')+
          (previousFreeHit?'Du har markeret Free Hit i sidste GW; vi foreslår ikke to i træk. ':'');
      }else{
        const problems=own.filter(p=>(data.planning.forecasts[p.id]?.expectedMinutesPerMatch??0)<45||
          (data.planning.forecasts[p.id]?.availability??0)<.75||events.filter(e=>(forecast(data,p.id,e)?.fixtureCount??0)===0).length>=2).length;
        const ideal=data.planning.plans['5'],ownTotal=lineups.reduce((s,l)=>s+l.points,0),gain=(ideal.points??0)-ownTotal;
        row.use=budget>=100&&problems>=4&&gain>=20&&freeTransfers<problems&&events.length>=3;
        row.text=problems+' spillere har lav spilletid, tvivlsom status eller mindst to blanke GW. £100m-planen har ca. '+gain.toFixed(1)+' flere point over '+events.length+' GW før transfers. '+
          'Tærskel: mindst 4 problemer, 20 point i gevinst og for få gratis transfers. '+(budget<100?'Din beregnede salgsværdi + bank er under £100m, så referencen er ikke nødvendigvis betalelig. ':'');
      }
      if(own&&remaining[key]&&window)row.status=row.use?'Overvej denne GW':'Gem foreløbig';
      advice.push(row);
    }
    // One chip per GW: choose a single candidate by expected extra contribution.
    const scores={'3xc':lineups[0]?points(data,lineups[0].captain,gw):0,'bboost':lineups[0]?.benchPoints??0,
      'freehit':(data.planning.plans['1'].points??0)-(lineups[0]?.points??0),'wildcard':(data.planning.plans['5'].points??0)-lineups.reduce((s,l)=>s+l.points,0)};
    const candidates=advice.filter(a=>a.use).sort((a,b)=>scores[b.key]-scores[a.key]);
    for(const row of candidates.slice(1)){row.use=false;row.status='Alternativ';row.text+=' Kun én chip pr. GW; modellen prioriterer '+candidates[0].name+'.';}
    return advice;
  }
  return {positions,quotas,points,total,forecast,validateSquad,bestXI,horizonScore,benchOrder,bestTransfer,transferPlans,chipAdvice};
});
