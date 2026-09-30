import { test, expect } from '@playwright/test';

const allPlayers=page=>page.locator('#squadPlayers [data-squad-player]');
const identities=page=>allPlayers(page).evaluateAll(elements=>elements.map(el=>el.dataset.squadPlayer).sort());
async function safeLayout(page) {
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  const cards=await allPlayers(page).evaluateAll(elements=>elements.filter(el=>el.getClientRects().length).map(el=>{
    const box=el.getBoundingClientRect(),name=el.querySelector('strong');
    return {x:box.x,y:box.y,right:box.right,bottom:box.bottom,clipped:name.scrollHeight>name.clientHeight+1||name.scrollWidth>name.clientWidth+1};
  }));
  expect(cards.every(card=>!card.clipped)).toBe(true);
  for(let i=0;i<cards.length;i++) for(let j=i+1;j<cards.length;j++) {
    const a=cards[i],b=cards[j];expect(a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1).toBe(true);
  }
}
test('large squad keeps every identity across field/list, filters, sorting and collapsible sections',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/league/index.html?fixture=squads#squads');await expect(allPlayers(page)).toHaveCount(25);
  await expect(page.locator('[data-squad-group="GK"] [data-squad-player]')).toHaveCount(1);
  await expect(page.locator('[data-squad-group="DF"] [data-squad-player]')).toHaveCount(9);
  await expect(page.locator('[data-squad-group="MF"] [data-squad-player]')).toHaveCount(8);
  const pitch=await identities(page);expect(new Set(pitch).size).toBe(25);await safeLayout(page);
  await page.screenshot({path:testInfo.outputPath('squad-pitch.png'),fullPage:true});
  await page.locator('#squadView-list').click();expect(await identities(page)).toEqual(pitch);await safeLayout(page);
  await page.screenshot({path:testInfo.outputPath('squad-list.png'),fullPage:true});
  await page.locator('#squadSearch').fill('إبراهيموفيتش');await expect(allPlayers(page)).toHaveCount(1);
  await page.locator('#squadView-pitch').click();await expect(allPlayers(page)).toHaveCount(1);
  await page.locator('#squadSearch').fill('');await page.locator('#squadPositionFilter').selectOption('UNK');await expect(allPlayers(page)).toHaveCount(1);
  await page.locator('#squadPositionFilter').selectOption('');await page.locator('[data-squad-group="DF"] summary').click();
  await expect(page.locator('[data-squad-group="DF"] .roster-players')).toBeHidden();
  await page.locator('[data-squad-group="DF"] summary').click();await expect(page.locator('[data-squad-group="DF"] .roster-players')).toBeVisible();
  await page.locator('#squadView-list').click();await page.locator('#squadSort').selectOption('rating');
  const ratings=await allPlayers(page).evaluateAll(cards=>cards.map(card=>Number(card.querySelector('.roster-rating bdi')?.textContent??-1)));
  expect(ratings).toEqual([...ratings].sort((a,b)=>b-a));expect(errors).toEqual([]);
});
test('add second keeper, reject duplicate, edit into midfield, archive and refetch without changing matches',async({page},testInfo)=>{
  await page.goto('/league/index.html?fixture=squads#squads');await expect(allPlayers(page)).toHaveCount(25);
  await page.locator('#addSquadPlayer').click();await page.locator('#squadPlayerName').fill('حارس اختبار ثانٍ باسم طويل');await page.locator('#squadPlayerPosition').selectOption('GK');await page.locator('#squadPlayerRole').selectOption('substitute');
  await page.locator('#squadPlayerNumber').fill('99');await page.locator('#squadPlayerRating').fill('105');await page.locator('#saveSquadPlayer').click();await expect(page.locator('#squadPlayerModal')).toBeHidden();
  await expect(page.locator('[data-squad-player].position-GK')).toHaveCount(2);await expect(page.locator('.position-GK[data-squad-role="substitute"]')).toHaveCount(1);await safeLayout(page);
  await page.reload();await expect(allPlayers(page)).toHaveCount(26);await expect(page.locator('[data-squad-player].position-GK')).toHaveCount(2);await expect(page.locator('.position-GK[data-squad-role="substitute"]')).toHaveCount(1);
  await page.locator('#addSquadPlayer').click();await page.locator('#squadPlayerName').fill('حارس اختبار ثانٍ باسم طويل');await page.locator('#saveSquadPlayer').click();await expect(page.locator('#squadPlayerError')).toContainText('موجود');await page.keyboard.press('Escape');
  await page.locator('#editSquad').click();const keeper=allPlayers(page).filter({hasText:'حارس اختبار ثانٍ باسم طويل'});
  await keeper.getByRole('button',{name:'تعديل حارس اختبار ثانٍ باسم طويل',exact:true}).click();await page.locator('#squadPlayerPosition').selectOption('MF');await page.locator('#squadPlayerRole').selectOption('starter');await page.locator('#saveSquadPlayer').click();await expect(page.locator('#squadPlayerModal')).toBeHidden();
  await expect(page.locator('[data-squad-group="GK"] [data-squad-player]')).toHaveCount(1);await expect(page.locator('[data-squad-group="MF"] [data-squad-player]')).toHaveCount(9);
  await keeper.getByRole('button',{name:'إبعاد حارس اختبار ثانٍ باسم طويل',exact:true}).click();await expect(allPlayers(page)).toHaveCount(25);
  await page.reload();await expect(allPlayers(page)).toHaveCount(25);await page.locator('#squadArchive summary').click();await expect(page.locator('#squadArchivePlayers')).toContainText('حارس اختبار ثانٍ باسم طويل');
  await page.locator('#squadView-list').click();await expect(allPlayers(page)).toHaveCount(25);await safeLayout(page);
  await page.screenshot({path:testInfo.outputPath('squad-edited.png'),fullPage:true});
  await page.goto('/league/index.html?fixture=squads#matchHistory');await expect(page.locator('.match-card')).toHaveCount(1);await expect(page.locator('.match-card')).toContainText('2');
});


test('upload, persist and remove a managed player image without using manual URLs',async({page})=>{
  const servedImage=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGM8kWLEAANMDEgANwcARfYBZhhDpbAAAAAASUVORK5CYII=','base64');
  await page.route('https://storage.example.test/**',route=>route.fulfill({status:200,contentType:'image/png',body:servedImage}));
  await page.goto('/league/index.html?fixture=squads#squads');
  await expect(allPlayers(page)).toHaveCount(25);
  await page.locator('#addSquadPlayer').click();
  await page.locator('#squadPlayerName').fill('حارس بصورة');
  await page.locator('#squadPlayerPosition').selectOption('GK');
  await page.locator('#squadPlayerRole').selectOption('substitute');
  const png=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGM8kWLEAANMDEgANwcARfYBZhhDpbAAAAAASUVORK5CYII=','base64');
  await page.locator('#squadPlayerPhotoFile').setInputFiles({name:'keeper.png',mimeType:'image/png',buffer:png});
  await expect(page.locator('#squadPhotoPreviewImage')).toHaveAttribute('src',/^blob:/);await expect(page.locator('#squadPhotoPreviewImage')).toBeVisible();
  await page.locator('#saveSquadPlayer').click();
  await expect(page.locator('#squadPlayerModal')).toBeHidden();

  const saved=await page.evaluate(()=>{
    const client=window.EFLClient.get();
    const player=client.db.squad_players.find(p=>p.name==='حارس بصورة');
    return {player,calls:client.calls.filter(call=>call.storage)};
  });
  expect(saved.player.position).toBe('GK');
  expect(saved.player.lineup_role).toBe('substitute');
  expect(saved.player.photo_url).toContain('/squad-player-images/');
  expect(saved.player.photo_path).toMatch(/^[0-9a-f-]{36}\/[0-9a-f-]{36}\/[0-9a-f-]{36}\.webp$/);
  expect(saved.calls.some(call=>call.storage==='upload'&&call.type==='image/webp'&&call.size>0)).toBe(true);

  const savedCard=allPlayers(page).filter({hasText:'حارس بصورة'});
  await expect(savedCard.locator('.roster-avatar img')).toHaveCount(1);
  await expect(savedCard.locator('.roster-avatar')).toHaveClass(/has-photo/);
  await expect(savedCard.locator('.roster-avatar img')).toHaveCSS('opacity','1');

  await page.locator('#editSquad').click();
  const card=allPlayers(page).filter({hasText:'حارس بصورة'});
  await card.getByRole('button',{name:'تعديل حارس بصورة',exact:true}).click();
  await page.locator('#removeSquadPhoto').click();
  await page.locator('#saveSquadPlayer').click();
  await expect(page.locator('#squadPlayerModal')).toBeHidden();

  const removed=await page.evaluate(()=>{
    const client=window.EFLClient.get();
    const player=client.db.squad_players.find(p=>p.name==='حارس بصورة');
    return {player,calls:client.calls.filter(call=>call.storage)};
  });
  expect(removed.player.photo_url).toBeNull();
  expect(removed.player.photo_path).toBeNull();
  expect(removed.calls.some(call=>call.storage==='remove')).toBe(true);
});
