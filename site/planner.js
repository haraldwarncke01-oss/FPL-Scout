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
  return {positions,quotas,points,total,forecast,validateSquad,bestXI,horizonScore,bestTransfer,chipAdvice};
});
