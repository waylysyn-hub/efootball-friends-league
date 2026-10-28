import { test, expect } from '@playwright/test';

async function refreshToken(page) {
  await page.evaluate(async () => {
    window.EFLClient.get().emitAuth('TOKEN_REFRESHED');
    // Auth defers its profile read outside the SDK callback. The synthetic
    // request settles before the next task, as a separate HTTP response would.
    await new Promise(resolve => setTimeout(resolve, 0));
  });
}

test('review token renewal preserves a valid typed confirmation and still revokes changed roles', async ({ page }) => {
  await page.goto('/league/index.html?fixture=admin#settings');
  await page.locator('#resetSeasonButton').click();
  await refreshToken(page);
  await page.locator('#dangerConfirmInput').fill('تصفير الموسم');
  await page.locator('#dangerConfirmExecute').click();
  await expect(page.locator('#dangerConfirmStatus')).toContainText('بنجاح');
  expect(await page.evaluate(() => window.EFLClient.get().calls.filter(c => c.table === 'matches' && c.operation === 'delete').length)).toBe(1);
  await page.locator('#dangerConfirmCancel').click();
  await page.locator('#resetAllButton').click();
  await page.locator('#dangerConfirmInput').fill('تصفير البطولة');
  await page.evaluate(() => { window.EFLClient.get().db.players.find(p => p.name === 'Wael').role = 'player'; });
  await refreshToken(page);
  await expect(page.locator('#dangerConfirmModal')).toBeHidden();
  await expect(page.locator('#resetAllButton')).toBeHidden();
  await page.evaluate(() => window.League.executeDangerConfirm());
  expect(await page.evaluate(() => window.EFLClient.get().calls.filter(c => c.rpc === 'restore_league_competition').length)).toBe(0);
});

test('review token renewal completes an in-flight squad save without a second insert', async ({ page }) => {
  await page.goto('/league/index.html?fixture=admin#squads');
  await page.locator('#addSquadPlayer').click();
  await page.locator('#squadPlayerName').fill('Refresh substitute');
  await page.locator('#squadPlayerRole').selectOption('substitute');
  await page.evaluate(() => {
    window.EFLClient.get().hold = ({ table, operation }) => table === 'squad_players' && operation === 'insert'
      ? new Promise(resolve => { window.releaseSave = resolve; }) : undefined;
  });
  await page.locator('#saveSquadPlayer').click();
  await expect.poll(() => page.evaluate(() => typeof window.releaseSave)).toBe('function');
  await refreshToken(page);
  await page.evaluate(() => window.releaseSave());
  await expect(page.locator('#squadPlayerModal')).toBeHidden();
  await expect(page.locator('[data-squad-player]').filter({ hasText: 'Refresh substitute' })).toHaveCount(1);
  expect(await page.evaluate(() => window.EFLClient.get().calls.filter(c => c.table === 'squad_players' && c.operation === 'insert').length)).toBe(1);
});

test('review a previous-account realtime response cannot block or replace current results', async ({ page }) => {
  await page.goto('/league/index.html?fixture=admin#matchHistory');
  await expect(page.locator('.match-card')).toHaveCount(1);
  await page.evaluate(() => {
    let held = false;
    window.EFLClient.get().after = ({ table }) => {
      if (table === 'matches' && !held) {
        held = true;
        return new Promise(resolve => { window.releasePrevious = resolve; });
      }
    };
    window.previousRefresh = window.League.refresh();
  });
  await expect.poll(() => page.evaluate(() => typeof window.releasePrevious)).toBe('function');
  await page.evaluate(() => window.EFLClient.get().emitAuth('SIGNED_OUT', null));
  await expect(page.locator('#loginScreen')).toBeVisible();
  await page.evaluate(() => {
    const c = window.EFLClient.get();
    c.db.matches = []; c.db.match_goal_events = [];
    c.emitAuth('SIGNED_IN', 'Omar');
  });
  await expect(page.locator('#sidebarPlayerName')).toHaveText('عمر');
  await expect(page.locator('#mainApp')).toBeVisible();
  await page.evaluate(async () => {
    const c = window.EFLClient.get();
    c.db.matches.push({ id: 'next-account-result', player1: 'Omar', player2: 'Wael', goals1: 1, goals2: 0, season_id: c.db.seasons[0].id, date: '2026-10-28', timestamp: 1 });
    await window.League.refresh();
    window.League.navigateTo('matchHistory');
  });
  await expect(page.locator('.match-card')).toHaveCount(1);
  await expect(page.locator('.match-score')).toContainText('1');
  await page.evaluate(async () => { window.releasePrevious(); await window.previousRefresh; });
  await expect(page.locator('.match-card')).toHaveCount(1);
  await expect(page.locator('#sidebarPlayerName')).toHaveText('عمر');
});

test('review failed match and season deletions retain their confirmation and retry safely', async ({ page }) => {
  for (const [route, selector, table] of [
    ['matchHistory', '.match-delete', 'matches'],
    ['seasons', '#seasonsList .delete', 'seasons'],
  ]) {
    await page.goto('/league/index.html?fixture=admin#' + route);
    await page.locator(selector).first().click();
    await page.evaluate(() => { window.EFLClient.get().fail = 'delete'; });
    await page.locator('#confirmYes').click();
    await expect(page.locator('#confirmModal')).toBeVisible();
    await expect(page.locator('#toast')).toHaveClass(/error/);
    await expect(page.locator('#confirmYes')).toBeEnabled();
    expect(await page.evaluate(table => window.EFLClient.get().db[table].length, table)).toBe(1);
    await page.evaluate(() => { window.EFLClient.get().fail = null; });
    await page.locator('#confirmYes').click();
    await expect(page.locator('#confirmModal')).toBeHidden();
    expect(await page.evaluate(table => window.EFLClient.get().db[table].length, table)).toBe(0);
  }
});
