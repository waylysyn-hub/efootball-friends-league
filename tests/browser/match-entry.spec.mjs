import { test, expect } from '@playwright/test';

async function ready(page) {
  await page.goto('/league/index.html?fixture=admin#recordMatch');
  await expect(page.locator('#page-recordMatch')).toBeVisible();
  await page.locator('#matchPlayer1').selectOption('Wael');
  await page.locator('#matchPlayer2').selectOption('Omar');
}
async function fit(page, selector) {
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  const box=await page.locator(selector).boundingBox();
  expect(box.x).toBeGreaterThanOrEqual(0); expect(box.x+box.width).toBeLessThanOrEqual(page.viewportSize().width+1);
  expect(await page.locator(selector+' button:visible').evaluateAll(buttons=>buttons.every(button=>button.getBoundingClientRect().height>=44))).toBe(true);
}
test('quick result review, success, history and later edit fit at every entry viewport',async({page},info)=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));
  await ready(page);await expect(page.locator('#matchQuickTab')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#matchDetailsPanel')).toBeHidden();
  await page.getByRole('button',{name:'زيادة أهداف الفريق الأول',exact:true}).click();
  await expect(page.locator('#matchGoals1')).toHaveValue('1');await fit(page,'#matchEntryForm');
  if([320,375,414,1366].includes(page.viewportSize().width))await page.screenshot({path:info.outputPath('quick-entry.png'),fullPage:true});
  await page.locator('#saveMatchButton').click();await expect(page.locator('#matchReviewModal')).toBeVisible();
  await expect(page.locator('#matchReviewSummary')).toContainText('بنتيجته فقط');await fit(page,'#matchReviewModal .modal');
  await page.getByRole('button',{name:'تعديل البيانات',exact:true}).click();await expect(page.locator('#matchGoals1')).toHaveValue('1');
  await page.locator('#saveMatchButton').click();await page.locator('#confirmMatchSaveButton').click();await expect(page.locator('#matchEntrySuccess')).toContainText('تم تسجيل المباراة بنجاح');
  await expect(page.locator('#matchGoals1')).toHaveValue('0');await page.locator('#viewSavedMatch').click();
  await expect(page.locator('#matchDetailsContent .entry-missing-badge')).toBeVisible();
  await page.locator('#matchDetailsContent .edit').click();await page.locator('#editDetailedTab').click();
  await expect(page.locator('#editGoalEventsList .ge-row')).toHaveCount(1);await page.locator('#editGoalEventsList .ge-scorer').selectOption('s1');
  await fit(page,'#editMatchModal .modal');await page.locator('#saveEditButton').click();await page.locator('#confirmMatchSaveButton').click();
  await expect(page.locator('#editMatchModal')).toBeHidden();await expect(page.locator('#matchDetailsContent .entry-missing-badge')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('detailed 3–2 preserves inputs, validates minutes and confirms score reductions',async({page},info)=>{
  await ready(page);await page.locator('#matchGoals1').fill('3');await page.locator('#matchGoals2').fill('2');await page.locator('#matchDetailedTab').click();
  const rows=page.locator('#goalEventsList .ge-row');await expect(rows).toHaveCount(5);
  for(let i=0;i<5;i++)await rows.nth(i).locator('.ge-scorer').selectOption(i<3?'s1':'s4');
  await rows.first().locator('.ge-assist').selectOption('s2');await rows.first().locator('.ge-minute').fill('121');
  await page.locator('#saveMatchButton').click();await expect(rows.first().locator('.ge-minute')).toHaveAttribute('aria-invalid','true');
  await rows.first().locator('.ge-minute').fill('44');await page.locator('#matchQuickTab').click();await page.locator('#matchDetailedTab').click();await expect(rows.first().locator('.ge-minute')).toHaveValue('44');
  await page.locator('#matchGoals1').fill('1');await expect(page.locator('#confirmModal')).toBeVisible();await page.keyboard.press('Escape');
  await expect(page.locator('#matchGoals1')).toHaveValue('3');await expect(rows).toHaveCount(5);
  await page.locator('#matchDetailsPanel summary').click();await expect(rows.first()).toBeHidden();await page.locator('#matchDetailsPanel summary').click();
  await fit(page,'#matchEntryForm');
  if([320,375,414,1366].includes(page.viewportSize().width))await page.screenshot({path:info.outputPath('detailed-entry.png'),fullPage:true});
  await page.locator('#saveMatchButton').click();await expect(page.locator('#matchReviewSummary')).toContainText('تفاصيل الأهداف5 أهداف مسجلة');
  await page.locator('#confirmMatchSaveButton').click();await expect(page.locator('#matchEntrySuccess')).toBeVisible();
});

test('opponents are excluded both ways and malformed numeric input cannot reach review',async({page})=>{
  const errors=[];page.on('pageerror',error=>errors.push(error.message));await ready(page);
  await expect(page.locator('#matchPlayer2 option[value="Wael"]')).toBeDisabled();
  await expect(page.locator('#matchPlayer1 option[value="Omar"]')).toBeDisabled();
  expect(await page.locator('#matchPlayer2 option[value="Wael"]').evaluate(option=>option.hidden)).toBe(true);
  await page.locator('#matchPlayer1').selectOption('Mustafa');await expect(page.locator('#matchPlayer2 option[value="Wael"]')).toBeEnabled();
  await page.locator('#matchPlayer2').selectOption('Wael');await expect(page.locator('#matchPlayer1 option[value="Wael"]')).toBeDisabled();
  await page.locator('#matchPlayer2').selectOption('Omar');await page.locator('#matchPlayer1').selectOption('Wael');
  await page.locator('#matchGoals1').fill('1');await page.locator('#matchAddDetails').click();await page.locator('#goalEventsList .ge-scorer').selectOption('s1');
  const minute=page.locator('#goalEventsList .ge-minute');await minute.focus();await minute.press('e');
  expect(await minute.evaluate(input=>input.validity.badInput)).toBe(true);
  await page.locator('#saveMatchButton').click();await expect(minute).toHaveAttribute('aria-invalid','true');await expect(page.locator('#matchReviewModal')).toBeHidden();
  await minute.fill('-1');await page.locator('#saveMatchButton').click();await expect(minute).toHaveAttribute('aria-invalid','true');
  await minute.fill('12');await page.locator('#saveMatchButton').click();await expect(page.locator('#matchReviewSummary')).toContainText('هدف واحد مسجّل');
  await page.getByRole('button',{name:'تعديل البيانات',exact:true}).click();await expect(minute).toHaveValue('12');
  await page.locator('#newMatchButton').click();await expect(page.locator('#confirmMessage')).toContainText('ستفقد المعلومات');await page.keyboard.press('Escape');
  await expect(minute).toHaveValue('12');expect(errors).toEqual([]);
});


test('Abdul Qader cannot be selected twice and forced duplicate values are rejected before review', async ({page}) => {
  await page.goto('/league/index.html?fixture=admin#recordMatch');
  await expect(page.locator('#page-recordMatch')).toBeVisible();
  await page.locator('#matchPlayer1').selectOption('Abdul Qader');
  await expect(page.locator('#matchPlayer2 option[value="Abdul Qader"]')).toBeDisabled();
  await page.locator('#matchPlayer1').selectOption('Mustafa');
  await expect(page.locator('#matchPlayer2 option[value="Abdul Qader"]')).toBeEnabled();
  await page.evaluate(() => {
    document.getElementById('matchPlayer1').value = 'Abdul Qader';
    document.getElementById('matchPlayer2').value = 'Abdul Qader';
  });
  await page.locator('#saveMatchButton').click();
  await expect(page.locator('#matchPlayer2Error')).toHaveText('يجب اختيار لاعبين أو فريقين مختلفين للمباراة.');
  await expect(page.locator('#matchReviewModal')).toBeHidden();
});

test('quick 0-0 saves successfully without goal rows', async ({page}) => {
  await ready(page);
  await expect(page.locator('#matchGoals1')).toHaveValue('0');
  await expect(page.locator('#matchGoals2')).toHaveValue('0');
  await page.locator('#saveMatchButton').click();
  await expect(page.locator('#matchReviewSummary')).toContainText('لا توجد أهداف في هذه المباراة.');
  await page.locator('#confirmMatchSaveButton').click();
  await expect(page.locator('#matchEntrySuccess')).toContainText('تم تسجيل المباراة بنجاح');
  await page.locator('#viewSavedMatch').click();
  await expect(page.locator('#matchDetailsContent')).toContainText('لا توجد أهداف في هذه المباراة.');
  await expect(page.locator('#matchDetailsContent .entry-missing-badge')).toHaveCount(0);
});

test('detailed 3-2 saves five real timeline rows and editing updates the same match', async ({page}) => {
  await ready(page);
  await page.locator('#matchGoals1').fill('3');
  await page.locator('#matchGoals2').fill('2');
  await page.locator('#matchDetailedTab').click();
  const rows = page.locator('#goalEventsList .ge-row');
  await expect(rows).toHaveCount(5);
  const minutes = ['12','28','41','55','78'];
  for (let i = 0; i < 5; i++) {
    await rows.nth(i).locator('.ge-scorer').selectOption(i < 3 ? 's1' : 's4');
    if (i === 0) await rows.nth(i).locator('.ge-assist').selectOption('s2');
    await rows.nth(i).locator('.ge-minute').fill(minutes[i]);
  }
  await page.locator('#saveMatchButton').click();
  await expect(page.locator('#matchReviewSummary')).toContainText('5 أهداف مسجلة');
  await expect(page.locator('#matchReviewSummary')).toContainText('الأسيست المسجّل1');
  await page.locator('#confirmMatchSaveButton').click();
  await expect(page.locator('#matchEntrySuccess')).toBeVisible();
  await page.locator('#viewSavedMatch').click();
  await expect(page.locator('#matchDetailsContent .goal-timeline-item')).toHaveCount(5);
  for (const minute of minutes) await expect(page.locator('#matchDetailsContent')).toContainText(minute + "'");
  await expect(page.locator('#matchDetailsContent')).toContainText('Ronaldinho');
  const before = await page.locator('.match-card').count().catch(() => 0);
  await page.locator('#matchDetailsContent .edit').click();
  await page.locator('#editGoals1').fill('2');
  await expect(page.locator('#confirmModal')).toBeVisible();
  await page.locator('#confirmYes').click();
  await expect(page.locator('#editGoalEventsList .ge-row')).toHaveCount(4);
  await page.locator('#saveEditButton').click();
  await page.locator('#confirmMatchSaveButton').click();
  await expect(page.locator('#editMatchModal')).toBeHidden();
  await expect(page.locator('#matchDetailsContent .match-details-score')).toContainText('2 — 2');
  await expect(page.locator('#matchDetailsContent .goal-timeline-item')).toHaveCount(4);
  await page.evaluate(() => window.League.navigateTo('matchHistory'));
  const after = await page.locator('.match-card').count();
  if (before) expect(after).toBe(before);
});


test('real login-form lifecycle lands on the modern authenticated recordMatch route', async ({page}) => {
  const errors=[]; page.on('pageerror',error=>errors.push(error.message));
  await page.goto('/league/latest.html?fixture=public#recordMatch');
  await expect(page).toHaveURL(/league\/index\.html\?ui=20260928-modern-v2&fixture=public#recordMatch/);
  await expect(page.locator('#loginScreen')).toBeVisible();
  await page.locator('#loginUsername').selectOption('Wael');
  await page.locator('#loginPassword').fill('qa-only-password');
  await page.locator('#loginButton').click();
  await expect(page.locator('#mainApp')).toBeVisible();
  await expect(page.locator('#page-recordMatch')).toBeVisible();
  await expect(page.locator('#matchEntryForm')).toHaveAttribute('data-entry-version','20260928-modern-v2');
  await expect(page.locator('#matchQuickTab')).toBeVisible();
  await expect(page.locator('#matchDetailedTab')).toBeVisible();
  await expect(page.getByRole('button',{name:'إضافة هدف',exact:true})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/احتساب النتيجة من الأهداف/})).toHaveCount(0);
  await expect(page.getByRole('button',{name:/مسح الحقول/})).toHaveCount(0);
  await fit(page,'#matchEntryForm');
  expect(errors).toEqual([]);
});
