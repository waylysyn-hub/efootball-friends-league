const frame=document.getElementById('preview'),status=document.getElementById('status'),report=document.getElementById('report');
let errors=[];window.addEventListener('message',event=>{if(event.origin===location.origin && event.data.type==='qa-error')errors.push(event.data.message);});
async function until(predicate){for(let i=0;i<150;i++){if(predicate())return;await new Promise(resolve=>setTimeout(resolve,30));}throw new Error('Page did not become ready');}
async function show(screen,width){
 errors=[];frame.width=width;frame.height=width===1920?1080:width>=768?768:844;
 const chat=['chat','conversation','invites','group-dialog','chat-login'].includes(screen),login=screen==='login'||screen==='chat-login';
 const url=screen==='hub'?'/index.html?fixture=public':chat?'/groups-chat/index.html?fixture='+(login?'public':'admin'):'/league/index.html?fixture='+(login?'public':'admin');
 frame.src=url;await new Promise(resolve=>frame.onload=resolve);
 const w=frame.contentWindow,d=w.document;
 if(screen==='hub')await until(()=>!d.getElementById('hubContent').classList.contains('hidden'));
 else if(login)await until(()=>d.getElementById('loginUsername')?.options.length===7);
 else if(chat){
  await until(()=>!d.getElementById('appRoot').classList.contains('hidden') && d.querySelector('.open-btn'));
  if(screen==='conversation'){d.querySelector('.open-btn').click();await until(()=>d.querySelector('.msg'));}
  if(screen==='invites')d.querySelector('[data-view="invites"]').click();
  if(screen==='group-dialog')d.getElementById('createGroupBtn').click();
 } else {
  await until(()=>w.League && !d.getElementById('mainApp').classList.contains('hidden'));
  w.League.navigateTo(screen==='edit'?'matchHistory':screen);
  if(screen==='matchDetails')w.League.openMatchDetails('20000000-0000-4000-8000-000000000001');
  if(screen==='edit')w.League.openEditModal('20000000-0000-4000-8000-000000000001');
  if(screen==='recordMatch'){d.getElementById('matchPlayer1').value='Wael';d.getElementById('matchPlayer2').value='Omar';d.getElementById('matchGoals1').value='1';w.League.updateMatchPreview();w.League.addGoalEventRow('goalEventsList');}
 }
 await new Promise(resolve=>w.requestAnimationFrame(()=>w.requestAnimationFrame(resolve)));
 const overflow=d.documentElement.scrollWidth>d.documentElement.clientWidth+1;
 return {screen,width,overflow,errors:[...errors],scrollWidth:d.documentElement.scrollWidth};
}
document.getElementById('load').onclick=async()=>{
 try{const result=await show(document.getElementById('screen').value,Number(document.getElementById('width').value));status.textContent=result.errors.length||result.overflow?'Issue found':'Ready';report.textContent=JSON.stringify(result,null,2);}catch(error){status.textContent=error.message;}
};
document.getElementById('matrix').onclick=async()=>{
 const results=[];document.getElementById('matrix').disabled=true;
 try{
 for(const width of [1920,1366,1024,768,430,390,360])for(const screen of [...document.getElementById('screen').options].map(o=>o.value)){
  status.textContent=`Checking ${screen} · ${width}px`;try{results.push(await show(screen,width));}catch(error){results.push({screen,width,errors:[error.message]});}
 }
 report.textContent=JSON.stringify(results,null,2);const failures=results.filter(r=>r.overflow||r.errors.length);status.textContent=`${results.length} screens checked · ${failures.length} failures`;
 }finally{document.getElementById('matrix').disabled=false;}
};
document.getElementById('load').click();
