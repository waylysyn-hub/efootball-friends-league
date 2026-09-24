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
  await expect(page.locator('#editGoalEventsList .ge-row')).toHaveCount(1);await page.locator('#editGoalEventsList .ge-scorer').selectOption('Zlatan Ibrahimović');
  await fit(page,'#editMatchModal .modal');await page.locator('#saveEditButton').click();await page.locator('#confirmMatchSaveButton').click();
  await expect(page.locator('#editMatchModal')).toBeHidden();await expect(page.locator('#matchDetailsContent .entry-missing-badge')).toHaveCount(0);
  expect(errors).toEqual([]);
});
test('detailed 3–2 preserves inputs, validates minutes and confirms score reductions',async({page},info)=>{
  await ready(page);await page.locator('#matchGoals1').fill('3');await page.locator('#matchGoals2').fill('2');await page.locator('#matchDetailedTab').click();
  const rows=page.locator('#goalEventsList .ge-row');await expect(rows).toHaveCount(5);
  for(let i=0;i<5;i++)await rows.nth(i).locator('.ge-scorer').selectOption(i<3?'Zlatan Ibrahimović':'Didier Drogba');
  await rows.first().locator('.ge-assist').selectOption('Ronaldinho');await rows.first().locator('.ge-minute').fill('121');
  await page.locator('#saveMatchButton').click();await expect(rows.first().locator('.ge-minute')).toHaveAttribute('aria-invalid','true');
  await rows.first().locator('.ge-minute').fill('44');await page.locator('#matchQuickTab').click();await page.locator('#matchDetailedTab').click();await expect(rows.first().locator('.ge-minute')).toHaveValue('44');
  await page.locator('#matchGoals1').fill('1');await expect(page.locator('#confirmModal')).toBeVisible();await page.keyboard.press('Escape');
  await expect(page.locator('#matchGoals1')).toHaveValue('3');await expect(rows).toHaveCount(5);
  await page.locator('#matchDetailsPanel summary').click();await expect(rows.first()).toBeHidden();await page.locator('#matchDetailsPanel summary').click();
  await fit(page,'#matchEntryForm');
  if([320,375,414,1366].includes(page.viewportSize().width))await page.screenshot({path:info.outputPath('detailed-entry.png'),fullPage:true});
  await page.locator('#saveMatchButton').click();await expect(page.locator('#matchReviewSummary')).toContainText('تفاصيل أهداف مكتملة5');
  await page.locator('#confirmMatchSaveButton').click();await expect(page.locator('#matchEntrySuccess')).toBeVisible();
});
