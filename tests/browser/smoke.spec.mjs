import { test,expect } from '@playwright/test';
import { players,ids } from '../helpers/fixture.mjs';
const arabicPlayers=['وائل','عمر','عبد الرحيم','محمد','مصطفى','عبد القادر'];
const leaguePages=['dashboard','leagueTable','matchHistory','matchDetails','recordMatch','evenings','squads','playerProfile','statistics','footballStats','headToHead','rivalries','seasons','awards','achievements','questions','settings'];
async function noOverflow(page){await page.evaluate(()=>document.fonts.ready);await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);}
function watchErrors(page){const errors=[];page.on('pageerror',error=>errors.push(error.message));return errors;}
for(const app of ['league','groups-chat'])test(app+' login exposes all six players',async({page})=>{
 const errors=watchErrors(page);await page.goto('/'+app+'/index.html?fixture=public');
 await expect(page.locator('#loginUsername option')).toHaveCount(7);
 expect(await page.locator('#loginUsername option').allTextContents()).toEqual(expect.arrayContaining(arabicPlayers));
 expect(await page.locator('#loginUsername option').evaluateAll(options=>options.map(option=>option.value).filter(Boolean))).toEqual(expect.arrayContaining(players));
 await expect(page.locator('html')).toHaveAttribute('lang','ar');await expect(page.locator('html')).toHaveAttribute('dir','rtl');
 await expect(page.locator('#loginButton')).toBeEnabled();await noOverflow(page);expect(errors).toEqual([]);
});
test('League major views, result editor and modal fit the viewport',async({page})=>{
 const errors=watchErrors(page);await page.goto('/league/index.html?fixture=admin');await expect(page.locator('#mainApp')).toBeVisible();
 for(const name of leaguePages){await page.evaluate(name=>window.League.navigateTo(name),name);await expect(page.locator('#page-'+name)).toBeVisible();await noOverflow(page);}
 await page.evaluate(id=>window.League.openMatchDetails(id),ids.match);await expect(page.locator('.match-details-score')).toBeVisible();
 await expect(page.locator('.md-score bdi')).toHaveText(['2','1']);
 expect(await page.locator('.md-score bdi').evaluateAll(scores=>scores[0].getBoundingClientRect().left>scores[1].getBoundingClientRect().left)).toBe(true);
 await page.evaluate(()=>window.League.navigateTo('matchHistory'));await page.locator('#historySearch').fill('وائل');await expect(page.locator('.match-card')).toHaveCount(1);
 await page.evaluate(id=>window.League.openEditModal(id),ids.match);await expect(page.locator('#editMatchModal')).toBeVisible();await noOverflow(page);await page.keyboard.press('Escape');await expect(page.locator('#editMatchModal')).toBeHidden();expect(errors).toEqual([]);
});
test('Hub public views load and keep tables inside safe scroll areas',async({page})=>{
 const errors=watchErrors(page);await page.goto('/index.html?fixture=public');await expect(page.locator('#hubContent')).toBeVisible();await noOverflow(page);
 for(const name of ['matches','standings','players','statistics']){
  if(await page.locator('#menuToggle').isVisible())await page.locator('#menuToggle').click();
  await page.locator(`.hub-nav-link[data-page="${name}"]`).click();await noOverflow(page);
 }
 expect(errors).toEqual([]);
});
test('Chat conversation, invitation view and group dialog remain usable',async({page})=>{
 const errors=watchErrors(page);await page.goto('/groups-chat/index.html?fixture=admin');await expect(page.locator('#appRoot')).toBeVisible();await page.locator('.open-btn').click();await expect(page.locator('.msg')).toHaveCount(2);await expect(page.locator('#composer')).toBeVisible();await noOverflow(page);
 await page.locator('#messageInput').fill('A synthetic browser test message');await page.locator('#sendBtn').click();await expect(page.locator('.msg')).toHaveCount(3);await expect(page.locator('#messageInput')).toHaveValue('');
 await page.locator('#backToGroups').click();await page.locator('#createGroupBtn').click();await expect(page.locator('#createGroupModal')).toBeVisible();await noOverflow(page);await page.keyboard.press('Escape');await expect(page.locator('#createGroupModal')).toBeHidden();expect(errors).toEqual([]);
});

test('Squad goal cards select teammates, add a missing player and save without an assist',async({page})=>{
 const errors=watchErrors(page);await page.goto('/league/index.html?fixture=admin');await expect(page.locator('#mainApp')).toBeVisible();
 await page.evaluate(()=>window.League.navigateTo('recordMatch'));
 await page.locator('#matchPlayer1').selectOption('Wael');await page.locator('#matchPlayer2').selectOption('Omar');await page.locator('#matchGoals1').fill('1');
 await page.locator('#page-recordMatch .btn-ge-add').click();
 const row=page.locator('#goalEventsList .ge-row').first();
 await row.locator('.ge-scorer').selectOption('Ronaldinho');
 await expect(row.locator('.ge-assist option[value="Ronaldinho"]')).toHaveCount(0);
 await row.locator('.ge-owner').selectOption('Omar');await expect(row.locator('.ge-scorer')).toHaveValue('');await expect(row.locator('.ge-assist')).toHaveValue('');
 await expect(row.locator('.ge-scorer option[value="Ronaldinho"]')).toHaveCount(0);
 await row.locator('.ge-owner').selectOption('Wael');await row.locator('.ge-manage').click();
 await page.locator('#squadPlayerName').fill('Test striker');await page.locator('#saveSquadPlayer').click();await expect(page.locator('#squadPlayerModal')).toBeHidden();
 await expect(page.locator('#matchGoals1')).toHaveValue('1');await expect(page.locator('#goalEventsList .ge-row')).toHaveCount(1);
 await page.locator('#goalEventsList .ge-scorer').selectOption('Test striker');await expect(page.locator('#goalEventsList .ge-assist')).toHaveValue('');
 await noOverflow(page);await page.locator('#saveMatchButton').click();await expect(page.locator('#toast')).toContainText('تم تسجيل المباراة');
 await page.evaluate(()=>window.League.navigateTo('squads'));await expect(page.locator('#squadPlayers')).toContainText('Test striker');await noOverflow(page);
 expect(errors).toEqual([]);
});

test('Admin starts an odd evening, prepares its match and archives the saved draw',async({page})=>{
 const errors=watchErrors(page);await page.goto('/league/index.html?fixture=admin#evenings');await expect(page.locator('#eveningForm')).toBeVisible();
 await expect(page.locator('#drawEveningButton')).toBeDisabled();
 await page.locator('#eveningTitle').fill('سهرة الأصدقاء');
 for(const name of ['Wael','Omar','Mustafa'])await page.locator(`input[name="eveningAttendee"][value="${name}"]`).check();
 await expect(page.locator('#eveningCount')).toContainText('3 من الحاضرين');await noOverflow(page);
 await page.locator('#drawEveningButton').click();await expect(page.locator('#activeEveningTitle')).toHaveText('سهرة الأصدقاء');
 await expect(page.locator('.evening-bye')).toHaveCount(1);await expect(page.locator('[data-evening-match]')).toHaveCount(1);await noOverflow(page);
 const order=await page.locator('.evening-pair:first-child bdi').allTextContents();
 await page.locator('[data-evening-match]').click();await expect(page.locator('#page-recordMatch')).toBeVisible();
 const names={'وائل':'Wael','عمر':'Omar','مصطفى':'Mustafa'};
 await expect(page.locator('#matchPlayer1')).toHaveValue(names[order[0]]);await expect(page.locator('#matchPlayer2')).toHaveValue(names[order[1]]);
 await page.evaluate(()=>window.League.navigateTo('evenings'));await page.locator('#endEveningButton').click();await page.locator('#confirmYes').click();
 await expect(page.locator('#eveningForm')).toBeVisible();await page.locator('.evening-history summary').click();await expect(page.locator('.evening-history .evening-bye')).toBeVisible();await noOverflow(page);
 expect(errors).toEqual([]);
});

test('Same-name footballers stay separate in rankings, details and awards',async({page})=>{
 const errors=watchErrors(page);await page.goto('/league/index.html?fixture=owner-stats#footballStats');await expect(page.locator('#fbStatsTable tbody tr')).toHaveCount(4);
 const goals=page.locator('[data-football-ranking="goals"] li');await expect(goals).toHaveCount(2);
 await expect(goals.nth(0)).toContainText('فريق مصطفى');await expect(goals.nth(0).locator('.fb-lb-val')).toHaveText('3');
 await expect(goals.nth(1)).toContainText('فريق وائل');await expect(goals.nth(1).locator('.fb-lb-val')).toHaveText('1');
 await noOverflow(page);
 await page.locator('[data-football-player="Zlatan Ibrahimović"][data-football-owner="Mustafa"]').click();
 await expect(page.locator('#fbPlayerDetail .panel-header')).toContainText('فريق مصطفى');await expect(page.locator('.fb-detail-stats')).toContainText('الأهداف: 3');
 await page.locator('[data-football-player="Zlatan Ibrahimović"][data-football-owner="Wael"]').press('Enter');
 await expect(page.locator('#fbPlayerDetail .panel-header')).toContainText('فريق وائل');await expect(page.locator('.fb-detail-stats')).toContainText('الأهداف: 1');
 await page.locator('#fbPlayerSearch').fill('مصطفى');await expect(page.locator('#fbStatsTable tbody tr')).toHaveCount(2);await expect(page.locator('#fbPlayerDetail')).toBeHidden();await noOverflow(page);
 await page.evaluate(()=>window.League.navigateTo('awards'));
 await expect(page.locator('[data-football-award="goals"]')).toContainText('Zlatan Ibrahimović');await expect(page.locator('[data-football-award="goals"]')).toContainText('فريق مصطفى');await expect(page.locator('[data-football-award="goals"] .award-desc')).toHaveText('3 هدف');
 await expect(page.locator('[data-football-award="assists"]')).toContainText('Ronaldinho');await expect(page.locator('[data-football-award="assists"] .award-desc')).toHaveText('2 أسيست');await noOverflow(page);
 await page.evaluate(id=>window.League.openMatchDetails(id),ids.match);await expect(page.locator('.match-awards')).toContainText('Zlatan Ibrahimović');await expect(page.locator('.match-awards')).toContainText('مصطفى');await noOverflow(page);
 expect(errors).toEqual([]);
});
