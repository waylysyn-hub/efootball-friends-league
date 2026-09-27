import { test as base, expect } from '@playwright/test';
import { randomUUID } from 'node:crypto';
import { localConfig, query } from './local-backend.mjs';

const test = base.extend({
  page: async ({ page }, use) => {
    const errors=[];page.on('pageerror',error=>errors.push(error.message));
    // The production project must never be contacted by this test browser.
    await page.route('**/*.supabase.co/**',route=>route.abort());
    await use(page);expect(errors).toEqual([]);
  },
});
test.beforeEach(async()=>{await query('delete from public.matches where id is not null');});

async function login(page, name='Wael') {
  await page.goto('/league/index.html#recordMatch');
  await expect(page.locator('#loginUsername option')).toHaveCount(7);
  await page.locator('#loginUsername').selectOption(name);
  await page.locator('#loginPassword').fill(localConfig().testPassword);
  const auth=page.waitForResponse(response=>response.url().includes('/auth/v1/token')&&response.request().method()==='POST');
  await page.locator('#loginButton').click();expect((await auth).status()).toBe(200);
  await expect(page.locator('#mainApp')).toBeVisible();
  await expect(page.locator('#loginPassword')).toHaveValue('');
}
async function fill(page, g1, g2) {
  await page.locator('#matchPlayer1').selectOption('Abdul Qader');
  await expect(page.locator('#matchPlayer2 option[value="Abdul Qader"]')).toHaveCount(0);
  await page.locator('#matchPlayer2').selectOption('Mohammad');
  await expect(page.locator('#matchPlayer1 option[value="Mohammad"]')).toHaveCount(0);
  await page.locator('#matchGoals1').fill(String(g1));await page.locator('#matchGoals2').fill(String(g2));
  await page.locator('#matchDate').fill('2026-09-27');
}
async function fit(page, selector='#matchEntryForm') {
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  expect(await page.locator(selector+' button:visible').evaluateAll(buttons=>buttons.every(button=>button.getBoundingClientRect().height>=44))).toBe(true);
}
async function save(page, editing=false) {
  await page.locator(editing?'#saveEditButton':'#saveMatchButton').click();
  await expect(page.locator('#matchReviewSummary')).toContainText('عبد القادر');
  await expect(page.locator('#matchReviewSummary')).toContainText('محمد');
  await expect(page.locator('#matchReviewSummary')).toContainText(/٢٠٢٦|2026/);
  const response=page.waitForResponse(r=>r.url().includes('/rest/v1/rpc/save_league_match')&&r.request().method()==='POST');
  await page.locator('#confirmMatchSaveButton').click();const result=await response;
  expect(result.status()).toBe(200);await expect(page.locator('#matchReviewModal')).toBeHidden();
  return await result.json();
}
async function complete(page, list='#goalEventsList') {
  const rows=page.locator(list+' .ge-row');
  for(let i=0;i<await rows.count();i++) {
    const row=rows.nth(i);await row.locator('.ge-scorer').selectOption(await row.locator('.ge-scorer option[data-name="Zlatan"]').getAttribute('value'));
    if(i<2)await row.locator('.ge-assist').selectOption(await row.locator('.ge-assist option[data-name="Ronaldinho"]').getAttribute('value'));
    await row.locator('.ge-minute').fill(String(12+i*9));
    const owner=await row.locator('.ge-owner').inputValue();
    const expected=await query('select id from public.squad_players where owner=$1 and active',[owner]);
    const actual=await row.locator('.ge-scorer option').evaluateAll(options=>options.map(o=>o.value).filter(Boolean));
    expect(actual.sort()).toEqual(expected.map(p=>p.id).sort());
  }
}
async function api(page, path, body, method='POST') {
  const session=await page.evaluate(async()=>{const {data}=await window.EFLClient.get().auth.getSession();return data.session.access_token;});
  const config=localConfig();
  return page.request.fetch(config.API_URL+'/rest/v1/'+path,{method,headers:{apikey:config.ANON_KEY,Authorization:'Bearer '+session},data:body});
}
async function matchPayload() {
  const roster=Object.fromEntries((await query('select name,id from public.players')).map(row=>[row.name,row.id]));
  const season=(await query('select id from public.seasons where active'))[0].id;
  return {id:randomUUID(),player1_id:roster['Abdul Qader'],player2_id:roster.Mohammad,goals1:1,goals2:0,date:'2026-09-27',season_id:season};
}

for(const [g1,g2] of [[0,0],[1,0],[3,2]])test(`authenticated quick ${g1}–${g2} persists via PostgREST and refreshes history and standings`,async({page},info)=>{
  await login(page);await fill(page,g1,g2);await fit(page);
  await expect(page.locator('#matchQuickTab')).toHaveAttribute('aria-pressed','true');
  await page.locator('#saveMatchButton').click();await fit(page,'#matchReviewModal .modal');
  await expect(page.locator('#matchReviewSummary')).toContainText(g1+g2?'لم تتم الإضافة':'لا توجد أهداف في هذه المباراة.');
  await page.getByRole('button',{name:'تعديل البيانات',exact:true}).click();await expect(page.locator('#matchGoals1')).toHaveValue(String(g1));
  const id=await save(page);await expect(page.locator('#matchEntrySuccessScore')).toContainText('عبد القادر');
  const rows=await query('select goals1,goals2 from public.matches where id=$1',[id]);expect(rows).toEqual([{goals1:g1,goals2:g2}]);
  expect(await query('select id from public.match_goal_events where match_id=$1',[id])).toHaveLength(0);
  await page.evaluate(()=>window.League.navigateTo('matchHistory'));await expect(page.locator('#historyCount')).toContainText('1');
  await expect(page.locator('#match-card-'+id+' .entry-missing-badge')).toHaveCount(g1+g2?1:0);
  await page.evaluate(()=>window.League.navigateTo('leagueTable'));
  const row=page.locator('#leagueTableBody tr').filter({hasText:'عبد القادر'});
  await expect(row.locator('td').nth(2)).toHaveText('1');await expect(row.locator('td').nth(6)).toHaveText(String(g1));await expect(row.locator('td').nth(7)).toHaveText(String(g2));
  expect((await query("select played,goals_for,goals_against from public.standings where player='Abdul Qader' and season='all'"))[0]).toEqual({played:1,goals_for:g1,goals_against:g2});
  // Reload confirms real persistence, not just an optimistic in-memory result.
  await page.reload();await expect(page.locator('#mainApp')).toBeVisible();await page.evaluate(()=>window.League.navigateTo('matchHistory'));await expect(page.locator('.match-card')).toHaveCount(1);
  await page.screenshot({path:info.outputPath(`quick-${g1}-${g2}.png`),fullPage:true});
});

test('authenticated detailed goals, confirmation, later completion and repeated edits retain exact totals',async({page},info)=>{
  await login(page);await fill(page,3,2);const id=await save(page);
  await page.locator('#viewSavedMatch').click();await page.locator('#matchDetailsContent .edit').click();await page.locator('#editDetailedTab').click();
  await expect(page.locator('#editGoalEventsList .ge-row')).toHaveCount(5);await complete(page,'#editGoalEventsList');
  await page.locator('#editGoals1').fill('2');await expect(page.locator('#confirmModal')).toBeVisible();await page.getByRole('button',{name:'متابعة التغيير',exact:true}).click();
  await page.locator('#editGoals2').fill('1');await expect(page.locator('#confirmModal')).toBeVisible();await page.keyboard.press('Escape');await expect(page.locator('#editGoals2')).toHaveValue('2');
  await page.locator('#editGoals2').fill('1');await page.getByRole('button',{name:'متابعة التغيير',exact:true}).click();await expect(page.locator('#editGoalEventsList .ge-row')).toHaveCount(3);
  await page.locator('#editGoalEventsList').locator('..').getByRole('button',{name:'+ إضافة هدف',exact:true}).click();await expect(page.locator('#editGoals1')).toHaveValue('3');await complete(page,'#editGoalEventsList');
  const rows=page.locator('#editGoalEventsList .ge-row'),first=rows.first();
  const wrong=(await query("select id from public.squad_players where owner='Wael' limit 1"))[0].id;
  await expect(first.locator(`.ge-scorer option[value="${wrong}"]`)).toHaveCount(0);
  await first.locator('.ge-owner').selectOption('Mohammad');await expect(first.locator('.ge-scorer')).toHaveValue('');await expect(first.locator('.ge-assist')).toHaveValue('');
  await first.locator('.ge-owner').selectOption('Abdul Qader');await complete(page,'#editGoalEventsList');
  await fit(page,'#editMatchModal .modal');await save(page,true);
  expect(await query('select id from public.matches')).toHaveLength(1);
  const before=await query('select id,scorer_id,assist_id,minute from public.match_goal_events where match_id=$1 order by id',[id]);expect(before).toHaveLength(4);expect(before.filter(e=>e.assist_id)).toHaveLength(2);
  await page.locator('#matchDetailsContent .edit').click();await save(page,true);
  expect(await query('select id,scorer_id,assist_id,minute from public.match_goal_events where match_id=$1 order by id',[id])).toEqual(before);
  await expect(page.locator('#matchDetailsContent .entry-missing-badge')).toHaveCount(0);await expect(page.locator('.goal-timeline-item')).toHaveCount(4);
  await page.evaluate(()=>window.League.navigateTo('footballStats'));
  await expect(page.locator('#fbStatsTable tbody tr').filter({hasText:'Zlatan'})).toHaveCount(2);
  await page.screenshot({path:info.outputPath('owner-statistics.png'),fullPage:true});
});

test('real API rejects forged teams and squads, while failed and duplicate saves preserve the draft',async({page})=>{
  await login(page);await fill(page,1,0);await page.locator('#matchAddDetails').click();await complete(page);
  const minute=page.locator('#goalEventsList .ge-minute');
  for(const value of ['-1','121']) {await minute.fill(value);await page.locator('#saveMatchButton').click();await expect(minute).toHaveAttribute('aria-invalid','true');}
  await minute.fill('');await minute.press('e');await page.locator('#saveMatchButton').click();await expect(minute).toHaveAttribute('aria-invalid','true');await minute.fill('12');
  const payload=await matchPayload();
  let response=await api(page,'rpc/save_league_match',{match_data:{...payload,player2_id:payload.player1_id},goal_events:[]});expect(response.ok()).toBe(false);expect(await response.text()).toContain('EFL_DIFFERENT_PLAYERS');
  const wrong=(await query("select id from public.squad_players where owner='Wael' limit 1"))[0].id;
  response=await api(page,'rpc/save_league_match',{match_data:payload,goal_events:[{owner_id:payload.player1_id,scorer_id:wrong,minute:12}]});expect(response.ok()).toBe(false);expect(await response.text()).toContain('EFL_SCORER_NOT_IN_SQUAD');
  await page.evaluate(()=>{const select=document.getElementById('matchPlayer2');select.add(new Option('عبد القادر','Abdul Qader'));select.value='Abdul Qader';});
  await page.locator('#saveMatchButton').click();await expect(page.locator('#matchPlayer2Error')).toHaveText('يجب اختيار لاعبين أو فريقين مختلفين للمباراة.');
  await page.locator('#matchPlayer2').selectOption('Mohammad');
  await page.locator('#newMatchButton').click();await expect(page.locator('#confirmModal')).toBeVisible();await page.keyboard.press('Escape');await expect(minute).toHaveValue('12');
  const rpc='**/rest/v1/rpc/save_league_match';let requests=0;
  await page.route(rpc,async route=>{requests++;await new Promise(resolve=>setTimeout(resolve,250));await route.fulfill({status:503,contentType:'application/json',body:'{"message":"test service unavailable"}'});});
  await page.locator('#saveMatchButton').click();
  await page.evaluate(()=>{window.League.confirmMatchSave();window.League.confirmMatchSave();});
  await expect(page.locator('#confirmMatchSaveButton')).toBeDisabled();await expect(page.locator('#confirmMatchSaveButton')).toHaveText('جارٍ الحفظ…');
  await expect(page.locator('#matchReviewError')).toBeVisible();expect(requests).toBe(1);expect(await query('select id from public.matches')).toHaveLength(0);
  await page.getByRole('button',{name:'تعديل البيانات',exact:true}).click();await expect(minute).toHaveValue('12');
  await page.unroute(rpc);await save(page);expect(await query('select id from public.matches')).toHaveLength(1);expect(await query('select id from public.match_goal_events')).toHaveLength(1);
});

test('ordinary Auth account cannot access admin tools or mutate matches through direct API requests',async({page})=>{
  await login(page,'Omar');await expect(page.locator('#page-dashboard')).toBeVisible();
  await page.evaluate(()=>window.League.navigateTo('settings'));
  await expect(page.locator('#page-settings .admin-only:visible')).toHaveCount(0);
  await expect(page.locator('a[href*="supabase.com/dashboard"]')).toBeHidden();
  await page.evaluate(()=>{window.League.exportData();window.League.confirmResetSeason();window.League.confirmResetAll();window.League.saveMatch();window.League.navigateTo('evenings');});
  await expect(page.locator('#confirmModal')).toBeHidden();await expect(page.locator('#page-dashboard')).toBeVisible();
  const payload=await matchPayload();
  const saveResponse=await api(page,'rpc/save_league_match',{match_data:payload,goal_events:[]});expect(saveResponse.status()).toBe(403);
  const insertResponse=await api(page,'matches',payload);expect(insertResponse.status()).toBe(403);
  const resetResponse=await api(page,'rpc/restore_league_competition',{backup:{seasons:[],matches:[],goalEvents:[],matchStats:[]}});expect(resetResponse.status()).toBe(403);
  const eveningResponse=await api(page,'rpc/start_league_evening',{evening_id:randomUUID(),evening_title:'اختبار',attendees:['Wael','Omar'],target_season:payload.season_id});expect(eveningResponse.status()).toBe(403);
  expect(await query('select id from public.matches')).toHaveLength(0);expect(await query('select id from public.seasons')).toHaveLength(1);
});
