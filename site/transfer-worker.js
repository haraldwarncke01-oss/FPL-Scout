/* Search locally without blocking typing and filtering on the main page. */
importScripts('./planner.js');
self.onmessage=event=>{
  const {data,ids,horizon,bank,sales,options}=event.data;
  try{
    const byId=new Map(data.players.map(p=>[p.id,p]));
    const result=self.FPLPlanner.transferPlans(data,ids.map(id=>byId.get(id)),horizon,bank,sales,options);
    self.postMessage({result});
  }catch(error){self.postMessage({error:error.message});}
};
