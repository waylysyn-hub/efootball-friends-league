import { sb, state } from './state.js';
import { isAdmin, requireAdmin } from './admin.js';
import { getPlayers } from './profiles.js';
import { getActiveSeason } from './seasons.js';
import { navigateTo, showConfirm, formatDate } from './ui.js';
import { updateMatchPreview } from './matches.js';
import { displayName, displaySeason, AR_LOCALE } from '../../shared/locale.js';
import { escapeHtml as esc, errorMessage, showError, toast, withBusy, isBusy } from '../../shared/ui.js';

let draft = null;
let request = null;
let owner = null;

export function clearEvenings() {
  draft = null; request = null; owner = null;
  state.db.evenings = []; state.eveningsReady = false;
  document.getElementById('eveningContent')?.replaceChildren();
}

// Pair the persisted order, so refreshes never perform another draw.
export function eveningPairs(order = []) {
  const pairs = [];
  for (let i = 0; i < order.length; i += 2) pairs.push([order[i], order[i + 1] || null]);
  return pairs;
}

function rememberDraft() {
  if (!draft || !document.getElementById('eveningForm')) return;
  draft.title = document.getElementById('eveningTitle').value;
  draft.players = [...document.querySelectorAll('[name="eveningAttendee"]:checked')].map(input => input.value);
  // Editing after a failed request starts a new, distinguishable operation.
  request = null;
  updateCount();
}

function updateCount() {
  const count = draft?.players.length || 0;
  document.getElementById('eveningCount').textContent = `${count} من الحاضرين · ${Math.floor(count / 2)} مواجهة${count % 2 ? ' · لاعب باستراحة' : ''}`;
  document.getElementById('drawEveningButton').disabled = count < 2;
}

function drawMarkup(evening, active) {
  return `<ol class="evening-pairs">${eveningPairs(evening.drawn_order).map(([first, second], index) => `<li class="evening-pair ${second ? '' : 'evening-bye'}">
    <span class="evening-pair-number">${second ? `المواجهة ${index + 1}` : 'استراحة'}</span>
    <div class="evening-pair-players"><bdi>${esc(displayName(first))}</bdi>${second ? `<span class="evening-vs">ضد</span><bdi>${esc(displayName(second))}</bdi>` : '<span class="evening-vs">بدون منافس في هذه القرعة</span>'}</div>
    ${active && second ? `<button type="button" class="btn-ghost" data-evening-match="${index}">تجهيز المباراة</button>` : ''}
  </li>`).join('')}</ol>`;
}

export function renderEvenings() {
  const content = document.getElementById('eveningContent');
  if (!isAdmin()) { clearEvenings(); return; }
  if (isBusy('start-evening') || isBusy('confirm')) return;
  if (!state.eveningsReady) {
    content.innerHTML = '<div class="empty-state">تعذّر تحميل السهرات. اضغط تحديث للمحاولة مجددًا.</div>';
    return;
  }
  if (owner !== state.user) { draft = null; request = null; owner = state.user; }
  const evenings = [...state.db.evenings].sort((a, b) => b.created_at.localeCompare(a.created_at));
  const active = evenings.find(row => !row.ended_at);
  const season = active ? state.db.seasons.find(row => row.id === active.season_id) : getActiveSeason();
  const seasonLabel = season ? displaySeason(season.name) : 'بدون موسم';
  if (active) {
    draft = null; request = null;
    content.innerHTML = `<section class="panel evening-active" aria-labelledby="activeEveningTitle">
      <div class="evening-heading"><div><span class="evening-status">السهرة جارية</span><h3 id="activeEveningTitle" tabindex="-1">${esc(active.title)}</h3><p>${formatDate(active.created_at)} · ${active.participants.length} من الحاضرين · ${esc(seasonLabel)}</p></div><button type="button" class="btn-ghost" id="endEveningButton">إنهاء السهرة</button></div>
      <p class="evening-note">القرعة محفوظة. اضغط «تجهيز المباراة» لفتح نموذج النتيجة باللاعبين المختارين، ثم سجّل النتيجة بعد اللعب.</p>
      ${drawMarkup(active, true)}</section>`;
    document.getElementById('endEveningButton').onclick = () => finishEvening(active.id);
    content.querySelectorAll('[data-evening-match]').forEach(button => { button.onclick = () => prepareEveningMatch(active.id, Number(button.dataset.eveningMatch)); });
  } else {
    draft ||= { title: `سهرة ${new Date().toLocaleDateString(AR_LOCALE, { day: 'numeric', month: 'long' })}`, players: [] };
    draft.players = draft.players.filter(name => getPlayers().includes(name));
    content.innerHTML = `<form id="eveningForm" class="panel evening-form" data-busy-region aria-labelledby="newEveningTitle">
      <h3 id="newEveningTitle">مين حاضر الليلة؟</h3><p class="evening-note">اختر لاعبين على الأقل، ثم ابدأ السهرة لإجراء قرعة عشوائية. إذا كان العدد فرديًا، يحصل لاعب واحد على استراحة.</p>
      <div class="form-group"><label for="eveningTitle">اسم السهرة</label><input id="eveningTitle" maxlength="80" required value="${esc(draft.title)}" autocomplete="off"></div>
      <fieldset class="evening-attendees"><legend>اللاعبون الحاضرون</legend><div class="evening-selection-actions"><button type="button" class="btn-ghost" id="eveningSelectAll">اختيار الكل</button><button type="button" class="btn-ghost" id="eveningClear">إلغاء الاختيار</button></div>
      <div class="evening-roster">${getPlayers().map(name => `<label class="evening-player"><input type="checkbox" name="eveningAttendee" value="${esc(name)}" ${draft.players.includes(name) ? 'checked' : ''}><span>${esc(displayName(name))}</span><span class="evening-present" aria-hidden="true">حاضر</span></label>`).join('')}</div></fieldset>
      <div id="eveningCount" class="evening-note" role="status" aria-live="polite"></div><p class="evening-note">الموسم: ${esc(seasonLabel)}</p>
      <div id="eveningError" class="form-error hidden" role="alert"></div><button id="drawEveningButton" class="btn-primary" type="submit">ابدأ السهرة واعمل القرعة</button>
    </form>`;
    document.getElementById('eveningForm').onsubmit = event => { event.preventDefault(); startEvening(); };
    document.getElementById('eveningTitle').oninput = rememberDraft;
    content.querySelectorAll('[name="eveningAttendee"]').forEach(input => { input.onchange = rememberDraft; });
    for (const [id, checked] of [['eveningSelectAll', true], ['eveningClear', false]]) document.getElementById(id).onclick = () => {
      content.querySelectorAll('[name="eveningAttendee"]').forEach(input => { input.checked = checked; });
      rememberDraft();
    };
    updateCount();
  }
  const past = evenings.filter(row => row.ended_at);
  if (past.length) content.insertAdjacentHTML('beforeend', `<section class="evening-history" aria-labelledby="eveningHistoryTitle"><h3 id="eveningHistoryTitle">السهرات السابقة</h3>${past.map(row => `<details class="panel"><summary><span>${esc(row.title)}</span><span>${formatDate(row.created_at)} · ${row.participants.length} من الحاضرين</span></summary>${drawMarkup(row, false)}</details>`).join('')}</section>`);
}

function acceptEvening(row) {
  state.db.evenings = state.db.evenings.filter(item => item.id !== row.id).concat(row);
}

export async function startEvening() {
  if (!requireAdmin() || !state.eveningsReady || isBusy('start-evening')) return;
  const errorEl = document.getElementById('eveningError');
  if (!draft || !errorEl) return;
  const title = draft.title.trim();
  if (!title || title.length > 80) return showError(errorEl, 'أدخل اسمًا للسهرة من حرف واحد إلى 80 حرفًا.');
  if (draft.players.length < 2) return showError(errorEl, 'اختر لاعبين على الأقل لإجراء القرعة.');
  request ||= { evening_id: crypto.randomUUID(), evening_title: title, attendees: [...draft.players], target_season: getActiveSeason()?.id || null };
  const submitted = request, user = state.user;
  await withBusy('start-evening', document.getElementById('drawEveningButton'), async () => {
    errorEl.classList.add('hidden');
    try {
      const { data, error } = await sb.rpc('start_league_evening', submitted);
      if (error) throw error;
      if (!isAdmin() || state.user !== user) return;
      if (!data?.id) throw new Error('Empty evening response');
      acceptEvening(data); draft = null; request = null;
      toast('بدأت السهرة وتم حفظ القرعة.');
    } catch (error) {
      if (isAdmin() && state.user === user) showError(errorEl, errorMessage(error, 'تعذّر بدء السهرة. اختياراتك محفوظة؛ حاول مجددًا.'));
    }
  }, 'جارٍ إجراء القرعة…');
  if (isAdmin() && state.user === user && state.db.evenings.some(row => !row.ended_at) && state.page === 'evenings') {
    renderEvenings(); document.getElementById('activeEveningTitle')?.focus();
  }
}

export function finishEvening(id) {
  if (!requireAdmin()) return;
  const evening = state.db.evenings.find(row => row.id === id && !row.ended_at);
  if (!evening) return;
  showConfirm('إنهاء السهرة', `إنهاء «${evening.title}»؟ ستبقى القرعة محفوظة ضمن السهرات السابقة، ويمكنك بدء سهرة جديدة.`, async () => {
    if (!requireAdmin()) return;
    const user = state.user;
    const { data, error } = await sb.rpc('end_league_evening', { target: id });
    if (error) throw error;
    if (!isAdmin() || state.user !== user) return;
    if (!data?.id) throw new Error('Empty evening response');
    acceptEvening(data);
    toast('انتهت السهرة. القرعة محفوظة في السجل.');
    // The confirmation helper releases its busy state after this callback.
    setTimeout(() => { if (isAdmin() && state.page === 'evenings') renderEvenings(); }, 0);
  });
}

export function prepareEveningMatch(id, index) {
  if (!requireAdmin()) return;
  const evening = state.db.evenings.find(row => row.id === id && !row.ended_at);
  const pair = evening && Number.isInteger(index) && eveningPairs(evening.drawn_order)[index];
  if (!pair?.[1]) return;
  navigateTo('recordMatch');
  document.getElementById('matchPlayer1').value = pair[0];
  document.getElementById('matchPlayer2').value = pair[1];
  if (evening.season_id && state.db.seasons.some(row => row.id === evening.season_id)) document.getElementById('matchSeason').value = evening.season_id;
  updateMatchPreview();
  toast('المواجهة جاهزة. أدخل النتيجة بعد اللعب ثم احفظ المباراة.');
}
