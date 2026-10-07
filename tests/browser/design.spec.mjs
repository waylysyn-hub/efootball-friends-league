import { test, expect } from '@playwright/test';
import { ids } from '../helpers/fixture.mjs';

async function fits(page) {
  await page.evaluate(async () => {
    await document.fonts.ready;
    await Promise.all(document.getAnimations().filter(a => a.effect?.getComputedTiming().iterations !== Infinity).map(a => a.finished.catch(() => {})));
  });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= document.documentElement.clientWidth + 1)).toBe(true);
}
async function picture(page, info, name) {
  if ([1366, 390, 320].includes(page.viewportSize().width)) {
    await page.screenshot({ path: info.outputPath(name + '.png'), fullPage: true });
  }
}
async function contrast(page, foreground, background) {
  return page.evaluate(({ foreground, background }) => {
    const color = (selector, property) => getComputedStyle(document.querySelector(selector))[property];
    const luminance = value => {
      const context = document.createElement('canvas').getContext('2d');
      context.fillStyle = value; context.fillRect(0, 0, 1, 1);
      const rgb = [...context.getImageData(0, 0, 1, 1).data].slice(0, 3).map(v => {
        const n = v / 255; return n <= .04045 ? n / 12.92 : ((n + .055) / 1.055) ** 2.4;
      });
      return rgb[0] * .2126 + rgb[1] * .7152 + rgb[2] * .0722;
    };
    const a = luminance(color(foreground, 'color')), b = luminance(color(background, 'backgroundColor'));
    return (Math.max(a, b) + .05) / (Math.min(a, b) + .05);
  }, { foreground, background });
}

test('dashboard shortcuts and recent results open the correct views in both themes', async ({ page }, info) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/league/index.html?fixture=admin#dashboard');
  await expect(page.locator('#mainApp')).toBeVisible();
  // Populate this isolated fixture to exercise long names and multiple score rows.
  await page.evaluate(async () => {
    const client = window.EFLClient.get(), base = client.db.matches[0];
    client.db.matches.push(
      { ...base, id: 'design-match-2', player1: 'Abdul Qader', player2: 'Abdul Rahim', player1_id: client.db.players.find(p => p.name === 'Abdul Qader').id, player2_id: client.db.players.find(p => p.name === 'Abdul Rahim').id, goals1: 4, goals2: 2, date: '2026-09-09', timestamp: 2000 },
      { ...base, id: 'design-match-3', player1: 'Mustafa', player2: 'Mohammad', player1_id: client.db.players.find(p => p.name === 'Mustafa').id, player2_id: client.db.players.find(p => p.name === 'Mohammad').id, goals1: 1, goals2: 1, date: '2026-09-10', timestamp: 3000 }
    );
    await window.League.refresh();
  });
  await expect(page.locator('[data-recent-match]')).toHaveCount(3);
  await expect(page.locator('.recent-match-score').first().locator('bdi')).toHaveText(['1', '1']);
  await fits(page); await picture(page, info, 'dashboard-dark');
  for (const theme of ['dark', 'light']) {
    await page.evaluate(theme => document.documentElement.setAttribute('data-theme', theme), theme);
    await fits(page);
    expect(await contrast(page, '.nav-item.active', '.nav-item.active')).toBeGreaterThanOrEqual(4.5);
    expect(await contrast(page, '.stat-card:first-child .stat-card-sub', '.stat-card:first-child')).toBeGreaterThanOrEqual(4.5);
  }
  await picture(page, info, 'dashboard-light');
  await page.locator(`[data-recent-match="${ids.match}"]`).press('Enter');
  await expect(page.locator('#page-matchDetails')).toBeVisible();
  await expect(page.locator('.md-score bdi')).toHaveText(['2', '1']);
  await page.evaluate(() => window.League.navigateTo('dashboard'));
  await page.locator('.dashboard-shortcuts a[href="#squads"]').click();
  await expect(page.locator('#page-squads')).toBeVisible();
  await page.evaluate(() => window.League.navigateTo('dashboard'));
  await page.locator('.dashboard-shortcuts a[href="#recordMatch"]').click();
  await expect(page.locator('#matchQuickTab')).toBeVisible();
  await page.evaluate(() => window.League.navigateTo('dashboard'));
  await page.locator('#page-dashboard a[href="#matchHistory"]').click();
  await expect(page.locator('.match-card')).toHaveCount(3);
  expect(errors).toEqual([]);
});

test('player navigation and scrollable standings stay accessible on narrow screens', async ({ page }, info) => {
  await page.goto('/league/index.html?fixture=player#dashboard');
  await expect(page.locator('#mainApp')).toBeVisible();
  await expect(page.locator('.dashboard-shortcuts .admin-only')).toBeHidden();
  if (page.viewportSize().width <= 1024) {
    const menu = page.getByRole('button', { name: 'فتح القائمة', exact: true });
    await menu.click();
    await expect(page.locator('#sidebarToggle')).toBeFocused();
    await expect(menu).toHaveAttribute('aria-expanded', 'true');
    await picture(page, info, 'league-navigation');
    await page.getByRole('button', { name: 'إغلاق القائمة', exact: true }).click();
    await expect(menu).toBeFocused();
    await expect(page.locator('body')).not.toHaveClass(/drawer-open/);
  }
  await page.locator('#page-dashboard a[href="#leagueTable"]').click();
  await expect(page.locator('#page-leagueTable')).toBeVisible();
  const table = page.getByRole('region', { name: 'جدول ترتيب الدوري' });
  await table.focus();
  await expect(table).toBeFocused();
  await fits(page);
  if (page.viewportSize().width <= 600) {
    await expect(page.locator('#page-leagueTable .table-scroll-hint')).toBeVisible();
    await table.evaluate(el => { el.scrollLeft = -el.scrollWidth; });
    expect(await table.evaluate(el => {
      const box = el.getBoundingClientRect(), cell = el.querySelector('tbody td:nth-child(2)').getBoundingClientRect();
      return el.scrollLeft < 0 && cell.left >= box.left && cell.right <= box.right + 1;
    })).toBe(true);
  }
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  expect(await contrast(page, '.league-table .rank-1 td:nth-child(2)', '.league-table .rank-1 td:nth-child(2)')).toBeGreaterThanOrEqual(4.5);
  await fits(page); await picture(page, info, 'standings-light');
});

test('public hub summary, season selection and league entry fit both themes', async ({ page }, info) => {
  const errors = []; page.on('pageerror', e => errors.push(e.message));
  await page.goto('/index.html?fixture=public');
  await expect(page.locator('#hubContent')).toBeVisible();
  await expect(page.locator('.hub-summary-item')).toHaveCount(3);
  await expect(page.locator('.hub-summary-item').nth(1)).toContainText('6');
  await expect(page.locator('.hub-tab.active')).toHaveAttribute('aria-pressed', 'true');
  await fits(page); await picture(page, info, 'hub-dark');
  await page.evaluate(() => document.documentElement.setAttribute('data-theme', 'light'));
  expect(await contrast(page, '.hub-summary-item:first-child strong', '.hub-summary-item:first-child')).toBeGreaterThanOrEqual(4.5);
  expect(await contrast(page, '.hub-standings .rank-1 td:nth-child(2)', '.hub-standings .rank-1 td:nth-child(2)')).toBeGreaterThanOrEqual(4.5);
  await fits(page); await picture(page, info, 'hub-light');
  await expect(page.getByRole('link', { name: 'دخول الدوري' })).toHaveAttribute('href', 'league/latest.html');
  expect(errors).toEqual([]);
});
