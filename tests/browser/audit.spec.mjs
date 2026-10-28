import { test, expect } from '@playwright/test';
import { ids } from '../helpers/fixture.mjs';

async function fits(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.allSettled(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished));
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}

test('audit dashboard keeps every metric and owned scorer within the selected season', async ({ page }, info) => {
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/league/index.html?fixture=owner-stats#dashboard');
  await expect(page.locator('#sc-scorer-sub')).toContainText('3 هدف · فريق مصطفى');
  await page.evaluate(async () => {
    const c=window.EFLClient.get();
    c.db.seasons.push({id:'prior-season',name:'الموسم السابق',active:false,created:0});
    c.db.matches.push({...c.db.matches[0],id:'prior-match',season_id:'prior-season',player1:'Omar',player2:'Wael',goals1:9,goals2:0});
    await window.League.refresh();
  });
  await expect(page.locator('#sc-matches-val')).toHaveText('1');
  await page.locator('#dashboardSeasonFilter').selectOption('prior-season');
  await expect(page.locator('#sc-leader-val')).toHaveText('عمر');
  await expect(page.locator('#sc-attack-sub')).toHaveText('9 هدف مسجّل');
  await expect(page.locator('[data-recent-match]')).toHaveAttribute('data-recent-match','prior-match');
  await page.locator('#dashboardSeasonFilter').selectOption('all');
  await expect(page.locator('#sc-matches-val')).toHaveText('2');
  await page.evaluate(async()=>{window.League.navigateTo('settings');window.League.navigateTo('dashboard');await window.League.refresh();});
  await expect(page.locator('#dashboardSeasonFilter')).toHaveValue('all');
  await fits(page);
  if([1366,390,320].includes(page.viewportSize().width)) await page.screenshot({path:info.outputPath('dashboard-season-scope.png'),fullPage:true});
  expect(errors).toEqual([]);
});

test('audit same-route details survive back, forward and reload without changing identity', async ({ page }) => {
  const second='20000000-0000-4000-8000-000000000002';
  await page.goto('/league/index.html?fixture=admin#dashboard');
  await expect(page.locator('#mainApp')).toBeVisible();
  await page.evaluate(async id=>{
    const c=window.EFLClient.get(); c.db.matches.push({...c.db.matches[0],id,goals1:5});
    await window.League.refresh();
  },second);
  await page.evaluate(id=>window.League.openMatchDetails(id),ids.match);
  await page.evaluate(id=>window.League.openMatchDetails(id),second);
  await expect(page.locator('.md-score bdi').first()).toHaveText('5');
  await page.goBack(); await expect(page.locator('.md-score bdi').first()).toHaveText('2');
  await page.goForward(); await expect(page.locator('.md-score bdi').first()).toHaveText('5');
  await page.goBack(); await page.reload();
  await expect(page.locator('#page-matchDetails')).toBeVisible();
  await expect(page.locator('.md-score bdi').first()).toHaveText('2');
  await fits(page);
});

test('audit rankings include more than one API page and retain a complete snapshot on failure', async ({ page }) => {
  await page.goto('/league/index.html?fixture=admin#dashboard');
  await expect(page.locator('#mainApp')).toBeVisible();
  await page.evaluate(async()=>{
    const c=window.EFLClient.get(), base=c.db.matches[0];
    c.db.matches=Array.from({length:1105},(_,i)=>({...base,id:'page-match-'+i,goals1:1,goals2:0,timestamp:i}));
    c.db.match_goal_events=c.db.matches.map((m,i)=>({id:'page-goal-'+i,match_id:m.id,owner:'Wael',owner_id:m.player1_id,scorer:'Zlatan Ibrahimović',scorer_id:'s1',assist:'',minute:10,sort_order:0}));
    await window.League.refresh();
  });
  await expect(page.locator('#sc-matches-val')).toHaveText('1105');
  await expect(page.locator('#sc-scorer-sub')).toContainText('1105 هدف · فريق وائل');
  await page.evaluate(async()=>{
    const c=window.EFLClient.get();
    c.hold=({table,rangeStart})=>{if(table==='matches'&&rangeStart>0)throw {status:503};};
    await window.League.refresh();
  });
  await expect(page.locator('#page-dashboard .view-state-error')).toBeVisible();
  await expect(page.locator('#sc-matches-val')).toHaveText('1105');
  await fits(page);
});

test('audit score reduction removes blank rows directly and protects entered minutes', async ({ page }) => {
  await page.goto('/league/index.html?fixture=admin#recordMatch');
  await page.locator('#matchPlayer1').selectOption('Wael');
  await page.locator('#matchPlayer2').selectOption('Omar');
  await page.locator('#matchGoals1').fill('3');
  await page.locator('#matchDetailedTab').click();
  await page.getByRole('button',{name:'إنقاص أهداف اللاعب الأول',exact:true}).click();
  await expect(page.locator('#goalEventsList .ge-row')).toHaveCount(2);
  await expect(page.locator('#confirmModal')).toBeHidden();
  await page.locator('#goalEventsList .ge-minute').last().fill('45');
  await page.getByRole('button',{name:'إنقاص أهداف اللاعب الأول',exact:true}).click();
  await expect(page.locator('#confirmModal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('#matchGoals1')).toHaveValue('2');
  await expect(page.locator('#goalEventsList .ge-minute').last()).toHaveValue('45');
  await fits(page);
});

test('audit Q&A validation keeps focus on an enabled invalid field and blocks admin routes', async ({ page }) => {
  await page.goto('/league/index.html?fixture=player#questions');
  await page.locator('#postQuestionButton').click();
  await expect(page.locator('#qaAskBody')).toBeFocused();
  await expect(page.locator('#qaAskBody')).toBeEnabled();
  await expect(page.locator('#qaAskBody')).toHaveAttribute('aria-invalid','true');
  expect(await page.evaluate(()=>window.EFLClient.get().calls.some(c=>c.table==='questions'&&c.operation==='insert'))).toBe(false);
  await page.evaluate(()=>window.League.navigateTo('recordMatch'));
  await expect(page.locator('#page-dashboard')).toBeVisible();
  await fits(page);
});

test('audit squad deletion supports Escape and a failed request keeps its confirmation', async ({ page }) => {
  await page.goto('/league/index.html?fixture=admin#squads');
  await page.locator('#editSquad').click();
  await page.locator('[data-squad-delete="s2"]').click();
  await expect(page.locator('#confirmCancel')).toBeFocused();
  await page.keyboard.press('Escape');
  await expect(page.locator('#confirmModal')).toBeHidden();
  expect(await page.evaluate(()=>window.EFLClient.get().calls.some(c=>c.rpc==='delete_squad_player'))).toBe(false);
  await page.locator('[data-squad-delete="s2"]').click();
  await page.evaluate(()=>window.EFLClient.get().fail='rpc');
  await page.locator('#confirmYes').click();
  await expect(page.locator('#toast')).toHaveClass(/error/);
  await expect(page.locator('#confirmModal')).toBeVisible();
  await page.keyboard.press('Escape');
  await expect(page.locator('[data-squad-player="s2"]')).toHaveCount(1);
  await fits(page);
});

test('audit hub navigation releases the mobile drawer and returns focus to its opener', async ({ page }) => {
  await page.goto('/index.html?fixture=public');
  await expect(page.locator('#hubContent')).toBeVisible();
  const mobile=page.viewportSize().width<=1024;
  if(mobile) await page.locator('#menuToggle').click();
  await page.locator('.hub-nav-link[data-page="matches"]').click();
  await expect(page.locator('.hub-nav-link[data-page="matches"]')).toHaveAttribute('aria-pressed','true');
  if(mobile){
    await expect(page.locator('#menuToggle')).toBeFocused();
    await expect(page.locator('body')).not.toHaveClass(/drawer-open/);
    expect(await page.locator('#mainContent').evaluate(el=>el.inert)).toBe(false);
  }
  await fits(page);
});

test('audit QA remains isolated through ordinary links without fixture parameters', async ({ page }) => {
  const live=[];
  await page.route('**/*.supabase.co/**',route=>{live.push(route.request().url());return route.abort();});
  const response=await page.goto('/league/index.html#dashboard');
  expect(response.headers()['x-efl-environment']).toBe('isolated-qa');
  await expect(page.locator('#loginScreen')).toBeVisible();
  await page.locator('#loginUsername').selectOption('Wael');
  await page.locator('#loginPassword').fill('fixture-test-only');
  await page.locator('#loginButton').click();
  await expect(page.locator('#mainApp')).toBeVisible();
  if(page.viewportSize().width<=1024) await page.getByRole('button',{name:'فتح القائمة',exact:true}).click();
  await page.locator('#sidebar a[href="../index.html"]').click();
  await expect(page.locator('#hubContent')).toBeVisible();
  await page.getByRole('link',{name:'دخول الدوري'}).click();
  await expect(page.locator('#loginUsername option')).toHaveCount(7);
  expect(live).toEqual([]);
});

test('audit restored epoch-zero records do not trigger a false changed-scope warning', async ({ page }) => {
  await page.goto('/league/index.html?fixture=admin#settings');
  await expect(page.locator('#page-settings')).toBeVisible();
  await page.evaluate(async()=>{
    const c=window.EFLClient.get();c.db.seasons[0].created=0;c.db.matches[0].timestamp=0;
    await window.League.refresh();
  });
  await page.locator('#resetSeasonButton').click();
  await page.locator('#dangerConfirmInput').fill('تصفير الموسم');
  await page.locator('#dangerConfirmExecute').click();
  await expect(page.locator('#dangerConfirmStatus')).toContainText('بنجاح');
  expect(await page.evaluate(()=>window.EFLClient.get().calls.filter(c=>c.table==='matches'&&c.operation==='delete').length)).toBe(1);
});
