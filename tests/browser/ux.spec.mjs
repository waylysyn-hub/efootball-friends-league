import {test,expect} from '@playwright/test';
import {ids} from '../helpers/fixture.mjs';
const routes=['dashboard','recordMatch','evenings','matchHistory','matchDetails','squads','playerProfile','footballStats','leagueTable','statistics','headToHead','rivalries','awards','achievements','seasons','questions','settings'];
async function fits(page){await page.evaluate(()=>document.fonts.ready);expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);}
async function picture(page,info,name){if([320,390,1366].includes(page.viewportSize().width)){await page.evaluate(async()=>{window.scrollTo({top:0,behavior:'instant'});await document.fonts.ready;await Promise.all(document.getAnimations().filter(a=>a.effect?.getComputedTiming().iterations!==Infinity).map(a=>a.finished.catch(()=>{})));});await page.screenshot({path:info.outputPath(name+'.png'),fullPage:true});}}

test('ux settings have safe scopes, typed confirmation, busy state and an inline result',async({page},info)=>{
 await page.goto('/league/index.html?fixture=admin#settings');
 await expect(page.locator('#page-settings')).toBeVisible();await fits(page);await picture(page,info,'settings-dark');
 expect(await page.locator('#page-settings').innerText()).not.toMatch(/\\[nr]/);
 await expect(page.getByRole('heading',{name:'منطقة الإجراءات الخطرة'})).toBeVisible();
 await page.locator('#resetAllButton').click();await expect(page.locator('#dangerConfirmExecute')).toBeDisabled();
 await page.locator('#dangerConfirmInput').fill('تصفير الموسم');await expect(page.locator('#dangerConfirmExecute')).toBeDisabled();
 expect(await page.evaluate(()=>window.EFLClient.get().calls.filter(c=>c.rpc==='restore_league_competition').length)).toBe(0);
 await page.locator('#dangerConfirmInput').fill('تصفير البطولة');await expect(page.locator('#dangerConfirmExecute')).toBeEnabled();
 await picture(page,info,'reset-review');
 await page.evaluate(()=>{window.EFLClient.get().hold=({rpc})=>rpc==='restore_league_competition'?new Promise(r=>window.releaseReset=r):undefined;});
 await page.locator('#dangerConfirmExecute').click();await expect(page.locator('#dangerConfirmExecute')).toHaveText('جارٍ التنفيذ…');
 await page.keyboard.press('Escape');await expect(page.locator('#dangerConfirmModal')).toBeVisible();
 await expect.poll(()=>page.evaluate(()=>!!window.releaseReset)).toBe(true);
 await page.evaluate(()=>{window.League.executeDangerConfirm();window.releaseReset();});
 await expect(page.locator('#dangerConfirmStatus')).toContainText('بنجاح');await expect(page.locator('#dangerConfirmExecute')).toBeDisabled();
 expect(await page.evaluate(()=>window.EFLClient.get().calls.filter(c=>c.rpc==='restore_league_competition').length)).toBe(1);
 expect(await page.evaluate(()=>window.EFLClient.get().db.players.length)).toBe(6);
 expect(await page.evaluate(()=>window.EFLClient.get().db.matches.length)).toBe(0);
 await page.locator('#dangerConfirmCancel').click();await expect(page.locator('#resetAllButton')).toBeFocused();
 await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));await fits(page);await picture(page,info,'settings-light');
});

test('ux clear form confirms, preserves cancellation and returns keyboard focus',async({page})=>{
 await page.goto('/league/index.html?fixture=admin#recordMatch');
 await expect(page.getByLabel('اللاعب الأول',{exact:true})).toBeVisible();
 await page.locator('#matchPlayer1').selectOption('Wael');await page.locator('#matchPlayer2').selectOption('Omar');
 await page.locator('#matchGoals1').fill('3');
 await page.getByRole('button',{name:'مسح النموذج',exact:true}).click();
 await expect(page.locator('#confirmMessage')).toHaveText('لديك بيانات غير محفوظة. هل تريد مسح النموذج؟');
 await expect(page.getByRole('button',{name:'متابعة التعديل',exact:true})).toBeFocused();await page.keyboard.press('Enter');
 await expect(page.locator('#matchGoals1')).toHaveValue('3');
 await page.locator('#newMatchButton').click();await page.locator('#confirmYes').press('Enter');
 await expect(page.locator('#matchPlayer1')).toBeFocused();await expect(page.locator('#matchGoals1')).toHaveValue('0');
 await page.evaluate(id=>window.League.openEditModal(id),ids.match);await page.locator('#editGoals1').fill('4');
 await page.locator('#editMatchModal .modal-close').click();await expect(page.locator('#confirmModal')).toBeVisible();
 await page.keyboard.press('Escape');await expect(page.locator('#editMatchModal')).toBeVisible();await expect(page.locator('#editGoals1')).toHaveValue('4');
});

test('ux direct routes, browser history, groups and mobile drawer remain usable',async({page},info)=>{
 test.setTimeout(60000);const errors=[];page.on('pageerror',e=>errors.push(e.message));
 for(const route of routes){
  await page.goto('/league/index.html?fixture=admin#'+route);await expect(page.locator('#page-'+route)).toBeVisible();
  await expect(page.locator('.nav-item[data-page="'+route+'"]')).toHaveAttribute('aria-current','page');
  expect(await page.locator('#page-'+route+' .page-title').evaluate(el=>el.getBoundingClientRect().top>=document.querySelector('.topbar').getBoundingClientRect().bottom)).toBe(true);
  await fits(page);
 }
 if(page.viewportSize().width<=1024){
  const opener=page.getByRole('button',{name:'فتح القائمة',exact:true});await opener.click();await expect(page.locator('#sidebarToggle')).toBeFocused();
  await picture(page,info,'navigation');await page.keyboard.press('Escape');await expect(opener).toBeFocused();
  await opener.click();await page.locator('.nav-item[data-page=matchHistory]').click();await expect(page.locator('#page-matchHistory')).toBeVisible();
  await expect(opener).toBeFocused();await expect(page.locator('body')).not.toHaveClass(/drawer-open/);
 } else {await page.locator('.nav-item[data-page=matchHistory]').click();}
 await page.goBack();await expect(page.locator('#page-settings')).toBeVisible();
 await page.goForward();await expect(page.locator('#page-matchHistory')).toBeVisible();expect(errors).toEqual([]);
});

test('ux pending refresh and network failure retain drafts and allow retry on every data page',async({page},info)=>{
 await page.goto('/league/index.html?fixture=admin#recordMatch');await page.locator('#matchGoals1').fill('7');
 await page.evaluate(()=>{const c=window.EFLClient.get();c.hold=({table})=>table==='matches'?new Promise(r=>window.releaseRefresh=r):undefined;window.League.refresh();});
 await expect(page.locator('#page-recordMatch')).toHaveAttribute('aria-busy','true');
 await expect(page.locator('#page-recordMatch .view-state-loading')).toContainText('جارٍ تحميل البيانات');
 await page.evaluate(()=>{window.EFLClient.get().fail='matches';window.releaseRefresh();});
 await expect(page.locator('#page-recordMatch .view-state-error')).toBeVisible();await expect(page.locator('#matchGoals1')).toHaveValue('7');
 await picture(page,info,'retry-state');
 await page.evaluate(()=>{window.EFLClient.get().hold=null;window.EFLClient.get().fail=null;});
 await page.locator('#page-recordMatch [data-state-action=refresh]').click();
 await expect(page.locator('#page-recordMatch .page-data-status')).toBeHidden();await expect(page.locator('#matchGoals1')).toHaveValue('7');
 await page.evaluate(()=>{window.EFLClient.get().fail='matches';window.League.refresh();});
 await expect(page.locator('#page-recordMatch .view-state-error')).toBeVisible();
 for(const name of routes.filter(x=>x!=='settings')){await page.evaluate(x=>window.League.navigateTo(x),name);await expect(page.locator('#page-'+name+' .view-state-error')).toBeVisible();}
});

test('ux mobile history, filters, rank columns and 200 percent layout keep names visible',async({page},info)=>{
 await page.goto('/league/index.html?fixture=admin#matchHistory');
 await page.evaluate(async()=>{const c=window.EFLClient.get();const a='عبد القادر عبد الرحمن الطويل',b='عبد الرحيم محمد الطويل';c.db.players[0].name=a;c.db.players[1].name=b;c.db.matches[0].player1=a;c.db.matches[0].player2=b;await window.League.refresh();});
 await expect(page.locator('.match-card')).toHaveCount(1);await expect(page.locator('.match-player').first()).toContainText('عبد القادر عبد الرحمن الطويل');
 expect(await page.locator('.match-score bdi').evaluateAll(s=>s[0].getBoundingClientRect().left>s[1].getBoundingClientRect().left)).toBe(true);
 await fits(page);await picture(page,info,'history');
 await page.locator('#historySearch').fill('لا يوجد');await expect(page.locator('#matchList')).toContainText('لا توجد مباريات مطابقة.');
 await page.getByRole('button',{name:'مسح الفلاتر',exact:true}).click();await expect(page.locator('.match-card')).toHaveCount(1);
 await page.evaluate(()=>window.League.navigateTo('leagueTable'));await fits(page);
 const region=page.getByRole('region',{name:'جدول ترتيب الدوري',exact:true});
 if(page.viewportSize().width<=600){
  await region.evaluate(el=>el.scrollLeft=-el.scrollWidth);
  expect(await region.evaluate(el=>{const r=el.getBoundingClientRect();return [1,2].every(n=>{const c=el.querySelector('tbody td:nth-child('+n+')').getBoundingClientRect();return c.left>=r.left&&c.right<=r.right+1;});})).toBe(true);
 }
 await picture(page,info,'standings');
 if(page.viewportSize().width>=1024){
  // A 200% browser zoom halves the CSS layout viewport. Verify that reflow and
  // then increase text size for the additional text-only zoom case.
  await page.setViewportSize({width:Math.floor(page.viewportSize().width/2),height:844});
  await page.evaluate(()=>document.documentElement.style.fontSize='200%');
  await fits(page);await page.evaluate(()=>window.League.navigateTo('settings'));await fits(page);
 }
});

test('ux empty states preserve zero counts and protected settings explain available actions',async({page},info)=>{
 await page.goto('/league/index.html?fixture=admin#dashboard');
 await page.evaluate(async()=>{const c=window.EFLClient.get();c.db.matches=[];c.db.match_goal_events=[];c.db.achievements=[];await window.League.refresh();});
 await expect(page.locator('#sc-matches-val')).toHaveText('0');
 for(const name of ['dashboard','matchHistory','leagueTable','footballStats','statistics','awards','rivalries','achievements','playerProfile']){
  await page.evaluate(x=>window.League.navigateTo(x),name);await expect(page.locator('#page-'+name+' .view-state').first()).toBeVisible();await fits(page);
 }
 await page.evaluate(()=>window.League.navigateTo('matchHistory'));await picture(page,info,'empty-history');
 await page.goto('/league/index.html?fixture=player#settings');await expect(page.locator('#settingsPermission')).toContainText('هذه العملية متاحة للمدير فقط.');
 await expect(page.locator('#resetAllButton')).toBeHidden();
 expect(await page.evaluate(()=>window.EFLClient.get().calls.some(c=>c.rpc==='restore_league_competition'||c.operation==='delete'))).toBe(false);
});

test('ux login form preserves requested route and links validation to its fields',async({page})=>{
 await page.goto('/league/index.html?fixture=public#settings');await expect(page.locator('#loginButton')).toBeEnabled();
 await page.locator('#loginButton').click();await expect(page.locator('#loginUsername')).toHaveAttribute('aria-invalid','true');await expect(page.locator('#loginUsername')).toBeFocused();
 await page.locator('#loginUsername').selectOption('Wael');await page.locator('#loginPassword').fill('fixture-test-only');await page.locator('#loginButton').click();
 await expect(page.locator('#page-settings')).toBeVisible();await expect(page.locator('#sidebarPlayerName')).toHaveText('وائل');
});
