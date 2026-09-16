import { test,expect } from '@playwright/test';
import { players,ids } from '../helpers/fixture.mjs';
const leaguePages=['dashboard','leagueTable','matchHistory','matchDetails','recordMatch','playerProfile','statistics','footballStats','headToHead','rivalries','seasons','awards','achievements','questions','settings'];
async function noOverflow(page){await expect.poll(()=>page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);}
function watchErrors(page){const errors=[];page.on('pageerror',error=>errors.push(error.message));return errors;}
for(const app of ['league','groups-chat'])test(app+' login exposes all six players',async({page})=>{
 const errors=watchErrors(page);await page.goto('/'+app+'/index.html?fixture=public');
 await expect(page.locator('#loginUsername option')).toHaveCount(7);
 expect(await page.locator('#loginUsername option').allTextContents()).toEqual(expect.arrayContaining(players));
 await expect(page.locator('#loginButton')).toBeEnabled();await noOverflow(page);expect(errors).toEqual([]);
});
test('League major views, result editor and modal fit the viewport',async({page})=>{
 const errors=watchErrors(page);await page.goto('/league/index.html?fixture=admin');await expect(page.locator('#mainApp')).toBeVisible();
 for(const name of leaguePages){await page.evaluate(name=>window.League.navigateTo(name),name);await expect(page.locator('#page-'+name)).toBeVisible();await noOverflow(page);}
 await page.evaluate(id=>window.League.openMatchDetails(id),ids.match);await expect(page.locator('.match-details-score')).toBeVisible();
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
