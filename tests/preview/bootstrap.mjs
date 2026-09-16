import { fixtureClient } from '../helpers/fixture.mjs';
const fixture=new URLSearchParams(location.search).get('fixture');
window.supabase={createClient:()=>fixtureClient({profile:fixture==='admin'?'Wael':fixture==='player'?'Omar':null,empty:fixture==='empty'})};
window.addEventListener('error',event=>parent.postMessage({type:'qa-error',message:event.message},location.origin));
window.addEventListener('unhandledrejection',event=>parent.postMessage({type:'qa-error',message:String(event.reason)},location.origin));
