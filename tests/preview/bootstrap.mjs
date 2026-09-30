import { fixtureClient } from '../helpers/fixture.mjs';
import { presentationSquad } from '../helpers/squad-fixture.mjs';
const fixture=new URLSearchParams(location.search).get('fixture');
window.supabase={createClient:()=>{
  const client=fixtureClient({profile:['admin','owner-stats','squads'].includes(fixture)?'Wael':fixture==='player'?'Omar':null,empty:fixture==='empty',overlappingSquads:fixture==='owner-stats'});
  if(fixture==='squads'){
    const key='efl-qa-squad-presentation-v1';
    client.db.squad_players=presentationSquad();
    try { const saved=JSON.parse(sessionStorage.getItem(key)); if(saved) Object.assign(client.db,saved); } catch {}
    window.addEventListener('pagehide',()=>sessionStorage.setItem(key,JSON.stringify(client.db)));
  }
  return client;
}};
window.addEventListener('error',event=>parent.postMessage({type:'qa-error',message:event.message},location.origin));
window.addEventListener('unhandledrejection',event=>parent.postMessage({type:'qa-error',message:String(event.reason)},location.origin));
