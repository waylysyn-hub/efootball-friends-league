import { test, expect } from '@playwright/test';

const allPlayers=page=>page.locator('#squadPlayers [data-squad-player]');
const identities=page=>allPlayers(page).evaluateAll(elements=>elements.map(el=>el.dataset.squadPlayer).sort());
async function safeLayout(page) {
  await page.evaluate(()=>document.fonts.ready);
  expect(await page.evaluate(()=>document.documentElement.scrollWidth<=document.documentElement.clientWidth+1)).toBe(true);
  const cards=await allPlayers(page).evaluateAll(elements=>elements.filter(el=>el.getClientRects().length).map(el=>{
    const box=el.getBoundingClientRect(),name=el.querySelector('strong');
    const parts=[...el.querySelectorAll('strong, .roster-avatar, .roster-rating, .roster-number, .roster-position-code, .roster-role-badge, .roster-player-actions button')]
      .filter(child=>child.getClientRects().length).map(child=>({label:child.className||child.tagName,...child.getBoundingClientRect().toJSON()}));
    const escaped=parts.filter(b=>b.left<box.left-1||b.right>box.right+1||b.top<box.top-1||b.bottom>box.bottom+1).map(b=>b.label);
    const overlap=parts.flatMap((a,i)=>parts.slice(i+1).filter(b=>a.right>b.left+1&&b.right>a.left+1&&a.bottom>b.top+1&&b.bottom>a.top+1).map(b=>[a.label,b.label]));
    return {id:el.dataset.squadPlayer,x:box.x,y:box.y,right:box.right,bottom:box.bottom,escaped,overlap,clipped:escaped.length>0||overlap.length>0||name.scrollHeight>name.clientHeight+1||name.scrollWidth>name.clientWidth+1};
  }));
  const clipped=cards.filter(card=>card.clipped);
  if(clipped.length) await page.screenshot({path:test.info().outputPath('squad-layout.png'),fullPage:true});
  expect(clipped).toEqual([]);
  for(let i=0;i<cards.length;i++) for(let j=i+1;j<cards.length;j++) {
    const a=cards[i],b=cards[j];expect(a.right<=b.x+1||b.right<=a.x+1||a.bottom<=b.y+1||b.bottom<=a.y+1).toBe(true);
  }
}
test('large squad keeps every identity across field/list, filters, sorting and collapsible sections',async({page},testInfo)=>{
  const errors=[];page.on('pageerror',e=>errors.push(e.message));
  await page.goto('/league/index.html?fixture=squads#squads');await expect(allPlayers(page)).toHaveCount(25);
  await expect(page.locator('[data-squad-group="GK"] [data-squad-player]')).toHaveCount(1);
  await expect(page.locator('[data-squad-group="DF"] [data-squad-player]')).toHaveCount(4);
  await expect(page.locator('[data-squad-group="MF"] [data-squad-player]')).toHaveCount(3);
  const pitch=await identities(page);expect(new Set(pitch).size).toBe(25);await safeLayout(page);
  const bounds=async code=>page.locator(`[data-pitch-position="${code}"] [data-squad-player]`).first().boundingBox();
  expect((await bounds('LWF')).x).toBeLessThan((await bounds('RWF')).x);
  expect((await bounds('LB')).x).toBeLessThan((await bounds('RB')).x);
  expect((await bounds('AMF')).y).toBeLessThan((await bounds('CMF')).y);
  expect((await bounds('CMF')).y).toBeLessThan((await bounds('DMF')).y);
  expect((await bounds('DMF')).y).toBeLessThan((await bounds('GK')).y);
  await page.screenshot({path:testInfo.outputPath('squad-pitch.png'),fullPage:true});
  await page.locator('#squadView-list').click();expect(await identities(page)).toEqual(pitch);await safeLayout(page);
  await page.screenshot({path:testInfo.outputPath('squad-list.png'),fullPage:true});
  await page.locator('#squadSearch').fill('إبراهيموفيتش');await expect(allPlayers(page)).toHaveCount(1);
  await page.locator('#squadView-pitch').click();await expect(allPlayers(page)).toHaveCount(1);
  await page.locator('#squadSearch').fill('');await page.locator('#squadPositionFilter').selectOption('RB');await expect(allPlayers(page)).toHaveCount(2);
  await page.locator('#squadPositionFilter').selectOption('');await page.locator('[data-squad-group="DF"] summary').click();
  await expect(page.locator('[data-squad-group="DF"] .roster-pitch-rows')).toBeHidden();
  await page.locator('[data-squad-group="DF"] summary').click();await expect(page.locator('[data-squad-group="DF"] .roster-pitch-rows')).toBeVisible();
  await page.locator('[data-squad-role-group="substitute"] summary').click();
  await expect(page.locator('[data-squad-role-group="substitute"] .roster-players')).toBeHidden();
  await page.locator('#squadView-list').click();await page.locator('#squadView-pitch').click();
  await expect(page.locator('[data-squad-role-group="substitute"] .roster-players')).toBeHidden();
  await page.locator('[data-squad-role-group="substitute"] summary').click();
  await page.locator('#squadView-list').click();await page.locator('#squadSort').selectOption('rating');
  const ratings=await allPlayers(page).evaluateAll(cards=>cards.map(card=>Number(card.querySelector('.roster-rating bdi')?.textContent??-1)));
  expect(ratings).toEqual([...ratings].sort((a,b)=>b-a));expect(errors).toEqual([]);
});

test('editing controls, two starting keepers and light theme stay contained',async({page},testInfo)=>{
  await page.goto('/league/index.html?fixture=squads#squads');await expect(allPlayers(page)).toHaveCount(25);
  await page.evaluate(async()=>{
    const client=window.EFLClient.get();
    client.db.squad_players.find(p=>p.id==='qa-roster-10').lineup_role='substitute';
    client.db.squad_players.find(p=>p.id==='qa-roster-11').lineup_role='starter';
    Object.assign(client.db.squad_players.find(p=>p.id==='qa-roster-0'),{rating:103.5,shirt_number:99});
    await window.League.refresh();
  });
  await expect(page.locator('[data-pitch-position="GK"] [data-squad-player]')).toHaveCount(2);
  await page.locator('#editSquad').click();await safeLayout(page);
  await page.screenshot({path:testInfo.outputPath('squad-edit-controls.png'),fullPage:true});
  await page.evaluate(()=>document.documentElement.setAttribute('data-theme','light'));
  await safeLayout(page);await page.screenshot({path:testInfo.outputPath('squad-light.png'),fullPage:true});
});
test('add second keeper, reject duplicate, edit into midfield, archive and refetch without changing matches',async({page},testInfo)=>{
  await page.goto('/league/index.html?fixture=squads#squads');await expect(allPlayers(page)).toHaveCount(25);
  await page.locator('#addSquadPlayer').click();await page.locator('#squadPlayerName').fill('حارس اختبار ثانٍ باسم طويل');await page.locator('#squadPlayerPosition').selectOption('GK');await page.locator('#squadPlayerRole').selectOption('substitute');
  await page.locator('#squadPlayerNumber').fill('99');await page.locator('#squadPlayerRating').fill('105');await page.locator('#saveSquadPlayer').click();await expect(page.locator('#squadPlayerModal')).toBeHidden();
  await expect(page.locator('[data-squad-player].position-GK')).toHaveCount(3);await expect(page.locator('.position-GK[data-squad-role="substitute"]')).toHaveCount(2);await safeLayout(page);
  await page.reload();await expect(allPlayers(page)).toHaveCount(26);await expect(page.locator('[data-squad-player].position-GK')).toHaveCount(3);await expect(page.locator('.position-GK[data-squad-role="substitute"]')).toHaveCount(2);
  await page.locator('#addSquadPlayer').click();await page.locator('#squadPlayerName').fill('حارس اختبار ثانٍ باسم طويل');await page.locator('#saveSquadPlayer').click();await expect(page.locator('#squadPlayerError')).toContainText('موجود');await page.keyboard.press('Escape');
  await page.locator('#editSquad').click();const keeper=allPlayers(page).filter({hasText:'حارس اختبار ثانٍ باسم طويل'});
  await keeper.getByRole('button',{name:'تعديل حارس اختبار ثانٍ باسم طويل',exact:true}).click();await page.locator('#squadPlayerPosition').selectOption('AMF');await page.locator('#saveSquadPlayer').click();await expect(page.locator('#squadPlayerModal')).toBeHidden();
  await expect(keeper).toHaveAttribute('data-squad-position','AMF');
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


test('external photo links require a real image and Google imgres is normalized before save',async({page})=>{
  const servedImage=Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAQAAAAECAIAAAAmkwkpAAAAFElEQVR4nGM8kWLEAANMDEgANwcARfYBZhhDpbAAAAAASUVORK5CYII=','base64');
  await page.route('https://cdn.example.test/**',route=>route.fulfill({status:200,contentType:'image/png',body:servedImage}));
  await page.goto('/league/index.html?fixture=squads#squads');

  await page.locator('#addSquadPlayer').click();
  await page.locator('#squadPlayerName').fill('لاعب برابط خارجي');
  await page.locator('#squadPlayerPosition').selectOption('CF');
  await page.locator('.squad-photo-link').evaluate(el=>{el.open=true;});
  const googleResult='https://www.google.com/imgres?imgurl=https%3A%2F%2Fcdn.example.test%2Fplayer.jpg&imgrefurl=https%3A%2F%2Fexample.test';
  await page.locator('#squadPlayerPhoto').fill(googleResult);
  await page.locator('#saveSquadPlayer').click();
  await expect(page.locator('#squadPlayerModal')).toBeHidden();

  const saved=await page.evaluate(()=>window.EFLClient.get().db.squad_players.find(p=>p.name==='لاعب برابط خارجي'));
  expect(saved.photo_url).toBe('https://cdn.example.test/player.jpg');
  const card=allPlayers(page).filter({hasText:'لاعب برابط خارجي'});
  await expect(card.locator('.roster-avatar')).toHaveClass(/has-photo/);

  await page.locator('#addSquadPlayer').click();
  await page.locator('#squadPlayerName').fill('رابط مشاركة');
  await page.locator('#squadPlayerPosition').selectOption('CMF');
  await page.locator('.squad-photo-link').evaluate(el=>{el.open=true;});
  await page.locator('#squadPlayerPhoto').fill('https://share.google/not-an-image');
  await page.locator('#saveSquadPlayer').click();
  await expect(page.locator('#squadPlayerError')).toContainText('رابط صورة مباشر');
  await expect(page.locator('#squadPlayerModal')).toBeVisible();
});


test('starting XI stays exactly eleven and unused players can be deleted',async({page})=>{
  await page.goto('/league/index.html?fixture=squads#squads');
  await expect(page.locator('#squadLineupStatus')).toContainText('11/11');

  await page.locator('#addSquadPlayer').click();
  await expect(page.locator('#squadPlayerRole option[value="starter"]')).toBeDisabled();
  await expect(page.locator('#squadPlayerRole')).toHaveValue('substitute');
  await page.keyboard.press('Escape');

  await page.locator('#editSquad').click();
  const messi=page.locator('[data-squad-player="qa-roster-10"]');
  await messi.getByRole('button',{name:/تعديل/}).click();
  await page.locator('#squadPlayerRole').selectOption('substitute');
  await page.locator('#saveSquadPlayer').click();
  await expect(page.locator('#squadLineupStatus')).toContainText('10/11');

  await page.locator('#addSquadPlayer').click();
  await page.locator('#squadPlayerName').fill('أساسي جديد');
  await page.locator('#squadPlayerPosition').selectOption('SS');
  await page.locator('#squadPlayerRole').selectOption('starter');
  await page.locator('#saveSquadPlayer').click();
  await expect(page.locator('#squadLineupStatus')).toContainText('11/11');

  const added=allPlayers(page).filter({hasText:'أساسي جديد'});
  await added.getByRole('button',{name:'حذف أساسي جديد',exact:true}).click();
  await expect(page.locator('#confirmModal')).toBeVisible();
  await page.locator('#confirmYes').click();
  await expect(added).toHaveCount(0);
  await expect(page.locator('#squadLineupStatus')).toContainText('10/11');

  await page.locator('#editSquad').click();
  await expect(page.locator('#editSquad')).toHaveAttribute('aria-pressed','true');
  await expect(page.locator('#toast')).toContainText('11 لاعبًا أساسيًا');
});
