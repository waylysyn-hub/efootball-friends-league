import { displayName, displaySeason } from '../../shared/locale.js';
import { closeDialog, errorMessage, isBusy, openDialog, withBusy } from '../../shared/ui.js';
import { sb, state } from './state.js';
import { isAdmin, requireAdmin } from './admin.js';
import { esc, formatDate, navigateTo, renderPage, showConfirm, showError, showToast } from './ui.js';
import { getActiveSeason, populateSeasonDropdowns } from './seasons.js';
import { playerId, populateMatchPlayerDropdowns } from './profiles.js';
import { collectGoalEventsFromForm, countGoalsByOwner, getMatchGoalEvents, isSelfAssist, renderGoalEventsForm, updateGoalEventsUI, validateGoalEvents } from './goal-events.js';
import { fetchAllData } from './api.js';
import { updateSidebarPlayer } from './auth-ui.js';
import { setSyncStatus } from './realtime.js';
import { openMatchDetails } from './match-details.js';

// Drafts stay in this page, including when switching entry modes or refreshing data.
const drafts = { match: null, edit: null };
let review = null;
const el = id => document.getElementById(id);
const listId = prefix => prefix === 'edit' ? 'editGoalEventsList' : 'goalEventsList';
const region = prefix => el(prefix === 'edit' ? 'editMatchModal' : 'matchEntryForm');
const errorEl = prefix => el(prefix === 'edit' ? 'editError' : 'matchFormError');
const busy = () => isBusy('save-match') || isBusy('edit-match');
const today = () => { const d = new Date(); return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`; };
const read = prefix => Object.fromEntries(['Player1', 'Player2', 'Goals1', 'Goals2', 'Date', 'Season'].map(key => [key, el(prefix + key).value]));
const validScore = value => value !== '' && Number.isInteger(Number(value)) && Number(value) >= 0 && Number(value) <= 99;
const validPair = data => !!playerId(data.Player1) && !!playerId(data.Player2) && playerId(data.Player1) !== playerId(data.Player2);
const snapshot = prefix => JSON.stringify({ ...read(prefix), events: collectGoalEventsFromForm(listId(prefix)), mode: drafts[prefix]?.mode, defer: el(prefix + 'DeferDetails').checked });
const dirty = prefix => drafts[prefix] && drafts[prefix].baseline !== snapshot(prefix);

function clearErrors(prefix) {
  errorEl(prefix).classList.add('hidden');
  region(prefix).querySelectorAll('.entry-field-error').forEach(node => { node.textContent = ''; });
  region(prefix).querySelectorAll('[aria-invalid]').forEach(node => node.removeAttribute('aria-invalid'));
}
function fieldError(id, message) {
  el(id)?.setAttribute('aria-invalid', 'true');
  if (el(id + 'Error')) el(id + 'Error').textContent = message;
}
function focusError(prefix) {
  const first = region(prefix).querySelector('[aria-invalid="true"]');
  if (first?.closest('details')) first.closest('details').open = true;
  first?.focus();
}
function filterOpponents(prefix) {
  for (const [side, other] of [[1, 2], [2, 1]]) {
    const opponent = el(prefix + 'Player' + other).value;
    for (const option of el(prefix + 'Player' + side).options) {
      option.hidden = option.disabled = !!option.value && !!playerId(opponent) && playerId(option.value) === playerId(opponent);
    }
  }
}
function scoreHTML(data) {
  return `<span>${esc(displayName(data.Player1) || 'الفريق الأول')}</span> <bdi>${esc(data.Goals1 || '—')}</bdi> — <bdi>${esc(data.Goals2 || '—')}</bdi> <span>${esc(displayName(data.Player2) || 'الفريق الثاني')}</span>`;
}
function goalCountText(count) {
  if (count === 1) return 'هدف واحد مسجّل';
  if (count === 2) return 'هدفان مسجّلان';
  return `${count} ${count <= 10 ? 'أهداف مسجلة' : 'هدفًا مسجلًا'}`;
}
function paint(prefix) {
  const data = read(prefix), draft = drafts[prefix];
  if (!draft) return;
  filterOpponents(prefix);
  el(prefix === 'match' ? 'previewResult' : 'editPreviewResult').innerHTML = scoreHTML(data);
  for (const side of [1, 2]) {
    el(prefix + 'ScoreLabel' + side).textContent = 'أهداف ' + (displayName(data['Player' + side]) || (side === 1 ? 'الفريق الأول' : 'الفريق الثاني'));
  }
  const detailed = draft.mode === 'detailed';
  el(prefix + 'QuickTab').setAttribute('aria-pressed', String(!detailed));
  el(prefix + 'DetailedTab').setAttribute('aria-pressed', String(detailed));
  el(prefix + 'DetailsPanel').hidden = !detailed;
  el(prefix + 'AddDetails').hidden = detailed;
  el(prefix + 'QuickHint').hidden = detailed;
  el(prefix + 'DeferWrap').hidden = !detailed;
  el(prefix + 'DetailsFields').disabled = !validPair(data) || el(prefix + 'DeferDetails').checked || !state.goalsReady || !state.squadsReady;
  el(prefix + 'Season').disabled = !isAdmin();
  el(prefix + 'EntryHint').textContent = !validPair(data) ? 'اختر فريقين مختلفين للمتابعة.' : '';
  updateGoalEventsUI(listId(prefix));
}
function reset(prefix, match = null) {
  populateSeasonDropdowns(); populateMatchPlayerDropdowns();
  const values = match ? { Player1: match.player1, Player2: match.player2, Goals1: match.goals1, Goals2: match.goals2, Date: match.date, Season: match.season }
    : { Player1: '', Player2: '', Goals1: 0, Goals2: 0, Date: today(), Season: getActiveSeason()?.id || '' };
  for (const [key, value] of Object.entries(values)) el(prefix + key).value = value;
  const events = match ? getMatchGoalEvents(match.id) : [];
  if (prefix === 'edit') el('editMatchId').value = match?.id || '';
  else state.pendingMatchId = null;
  drafts[prefix] = { mode: events.length ? 'detailed' : 'quick', last: read(prefix), baseline: '', pending: false };
  el(prefix + 'DeferDetails').checked = false;
  el(prefix + 'DetailsPanel').open = true;
  const data = read(prefix), counts = countGoalsByOwner(events, data.Player1, data.Player2);
  const fillMissing = events.length && validPair(data) && events.every(event => [data.Player1,data.Player2].includes(event.owner))
    && counts.c1 <= Number(data.Goals1) && counts.c2 <= Number(data.Goals2);
  renderGoalEventsForm(listId(prefix), fillMissing ? reconcile(events, data) : events);
  clearErrors(prefix); paint(prefix);
  drafts[prefix].baseline = snapshot(prefix);
}
export function updateGoalEventsSetupBanner() {
  const banner = el('goalEventsSetupBanner');
  banner.classList.toggle('hidden', state.goalsReady && state.squadsReady);
  banner.textContent = 'تعذّر تحميل تفاصيل الأهداف أو التشكيلات. يمكنك حفظ النتيجة الآن وإضافة التفاصيل لاحقًا.';
}
export function initRecordForm() {
  if (!isAdmin()) return;
  if (!drafts.match) reset('match');
  updateGoalEventsSetupBanner(); paint('match');
}
export function clearMatchEntry() {
  review = null; drafts.match = drafts.edit = null; state.pendingMatchId = null;
  closeDialog('matchReviewModal');
}
export function clearMatchForm() {
  if (busy() || !requireAdmin()) return;
  const clear = () => { reset('match'); el('matchEntrySuccess').hidden = true; el('matchPlayer1').focus(); };
  if (dirty('match')) showConfirm('بدء مباراة جديدة', 'هل تريد مسح بيانات المباراة الحالية؟ ستفقد المعلومات التي أدخلتها.', clear);
  else clear();
}
export function cancelMatchEntry() {
  if (busy()) return;
  const cancel = () => { reset('match'); navigateTo('matchHistory'); };
  if (dirty('match')) showConfirm('إلغاء تسجيل المباراة', 'هل تريد مسح بيانات المباراة الحالية؟ ستفقد المعلومات التي أدخلتها.', cancel);
  else cancel();
}
export function beginMatchWithPlayers(p1, p2, season) {
  if (!requireAdmin() || busy()) return;
  const start = () => {
    reset('match'); el('matchEntrySuccess').hidden = true;
    el('matchPlayer1').value = p1; el('matchPlayer2').value = p2;
    if (state.db.seasons.some(row => row.id === season)) el('matchSeason').value = season;
    onMatchEntryChange('match'); navigateTo('recordMatch');
    showToast('المواجهة جاهزة. أدخل النتيجة بعد اللعب ثم احفظ المباراة.');
  };
  if (dirty('match')) showConfirm('بدء مواجهة السهرة', 'هل تريد مسح بيانات المباراة الحالية؟ ستفقد المعلومات التي أدخلتها.', start);
  else start();
}

function reconcile(events, data) {
  const counts = { [data.Player1]: Number(data.Goals1), [data.Player2]: Number(data.Goals2) };
  const kept = events.filter(event => counts[event.owner] > 0 && counts[event.owner]--);
  for (const owner of [data.Player1, data.Player2]) {
    for (let i = 0; i < counts[owner]; i++) kept.push({ owner, scorer: '', assist: '', minute: 0 });
  }
  return kept;
}
function syncRows(prefix, events, previous, onCancel = null) {
  const draft = drafts[prefix], data = read(prefix);
  if (draft.mode !== 'detailed' || !validPair(data) || !validScore(data.Goals1) || !validScore(data.Goals2)) return paint(prefix);
  const next = reconcile(events, data);
  const discarded = events.some(event => !next.includes(event));
  if (discarded) {
    // Keep the committed score and every field intact until the user confirms.
    el(prefix + 'Goals1').value = previous.Goals1;
    el(prefix + 'Goals2').value = previous.Goals2;
    draft.last = read(prefix); draft.pending = true; paint(prefix);
    showConfirm('تقليل عدد الأهداف', 'تغيير النتيجة سيحذف بعض تفاصيل الأهداف المدخلة. هل تريد المتابعة؟', () => {
      if (drafts[prefix] !== draft) return;
      el(prefix + 'Goals1').value = data.Goals1; el(prefix + 'Goals2').value = data.Goals2;
      draft.last = read(prefix); draft.pending = false;
      renderGoalEventsForm(listId(prefix), next); paint(prefix);
    }, () => { draft.pending = false; onCancel?.(); paint(prefix); }, 'متابعة التغيير');
  } else {
    renderGoalEventsForm(listId(prefix), next); draft.last = read(prefix); paint(prefix);
  }
}
export function onMatchEntryChange(prefix = 'match') {
  const draft = drafts[prefix];
  if (!draft || busy() || draft.pending) return;
  const previous = draft.last, data = read(prefix);
  let events = collectGoalEventsFromForm(listId(prefix));
  if (data.Player1 !== previous.Player1 || data.Player2 !== previous.Player2) {
    events = events.map(event => {
      const side = event.owner === previous.Player1 ? 1 : event.owner === previous.Player2 ? 2 : null;
      const owner = side ? data['Player' + side] : event.owner;
      return owner === event.owner ? event : { owner, scorer: '', assist: '', minute: event.minute, minuteInput: event.minuteInput };
    });
    renderGoalEventsForm(listId(prefix), events);
  }
  clearErrors(prefix);
  if (data.Player1 && playerId(data.Player1) === playerId(data.Player2)) fieldError(prefix + 'Player2', 'يجب اختيار لاعبين مختلفين للمباراة.');
  for (const side of [1, 2]) if (!validScore(data['Goals' + side])) fieldError(prefix + 'Goals' + side, 'أدخل عددًا صحيحًا من 0 إلى 99.');
  draft.last = data;
  syncRows(prefix, events, previous);
}
export function updateMatchPreview() { onMatchEntryChange('match'); }
export function onEditMatchPlayersChange() { onMatchEntryChange('edit'); }
export function changeMatchScore(prefix, side, amount) {
  if (busy() || drafts[prefix]?.pending) return;
  const input = el(prefix + 'Goals' + side);
  input.value = Math.max(0, Math.min(99, (validScore(input.value) ? Number(input.value) : 0) + amount));
  onMatchEntryChange(prefix);
}
export function setMatchEntryMode(prefix, mode) {
  const draft = drafts[prefix];
  if (!draft || busy() || draft.pending || !['quick', 'detailed'].includes(mode)) return;
  const previousMode = draft.mode;
  draft.mode = mode; clearErrors(prefix);
  syncRows(prefix, collectGoalEventsFromForm(listId(prefix)), draft.last, () => { draft.mode = previousMode; });
}
export function toggleDeferredDetails(prefix) { if (!busy()) paint(prefix); }
// Called only by deliberate row additions/removals/team changes, never by rendering/realtime.
export function onGoalRowsChange(containerId) {
  const prefix = containerId === 'editGoalEventsList' ? 'edit' : 'match';
  const draft = drafts[prefix], data = read(prefix);
  if (!draft || busy() || !validPair(data)) return;
  const events = collectGoalEventsFromForm(containerId);
  const { c1, c2 } = countGoalsByOwner(events, data.Player1, data.Player2);
  el(prefix + 'Goals1').value = c1; el(prefix + 'Goals2').value = c2;
  draft.last = read(prefix); clearErrors(prefix); paint(prefix);
}

export function openEditModal(id) {
  if (!requireAdmin() || busy()) return;
  const match = state.db.matches.find(row => row.id === id);
  if (!match) return;
  const open = () => { reset('edit', match); openDialog('editMatchModal', closeEditModal); };
  if (!el('editMatchModal').classList.contains('hidden') && dirty('edit')) showConfirm('تعديل مباراة أخرى', 'هل تريد مسح بيانات المباراة الحالية؟ ستفقد المعلومات التي أدخلتها.', open);
  else open();
}
export function closeEditModal() {
  if (busy()) return;
  const close = () => { closeDialog('editMatchModal'); drafts.edit = null; };
  if (dirty('edit')) showConfirm('إلغاء التعديلات', 'هل تريد مسح بيانات المباراة الحالية؟ ستفقد المعلومات التي أدخلتها.', close);
  else close();
}
function validate(prefix) {
  const data = read(prefix); clearErrors(prefix);
  for (const side of [1, 2]) {
    if (!playerId(data['Player' + side])) fieldError(prefix + 'Player' + side, 'اختر الفريق من قائمة لاعبي الدوري.');
    if (!validScore(data['Goals' + side])) fieldError(prefix + 'Goals' + side, 'أدخل عددًا صحيحًا من 0 إلى 99، دون كسور.');
  }
  if (data.Player1 && playerId(data.Player1) === playerId(data.Player2)) fieldError(prefix + 'Player2', 'يجب اختيار لاعبين مختلفين للمباراة.');
  if (!/^\d{4}-\d{2}-\d{2}$/.test(data.Date) || Number.isNaN(Date.parse(data.Date))) fieldError(prefix + 'Date', 'اختر تاريخًا صحيحًا للمباراة.');
  if (!state.db.seasons.some(row => row.id === data.Season)) fieldError(prefix + 'Season', 'اختر موسمًا موجودًا قبل الحفظ.');
  const detailed = drafts[prefix]?.mode === 'detailed' && !el(prefix + 'DeferDetails').checked;
  const events = detailed ? collectGoalEventsFromForm(listId(prefix)) : [];
  if (detailed) {
    if (!state.squadsReady || !state.goalsReady) { showError(errorEl(prefix), 'تعذّر تحميل تفاصيل الأهداف. اختر حفظ النتيجة فقط أو أعد المحاولة بعد عودة الاتصال.'); return null; }
    const rows = region(prefix).querySelectorAll('.ge-row');
    rows.forEach((row, i) => {
      if (!events[i].owner || ![data.Player1, data.Player2].includes(events[i].owner)) fieldError(row.querySelector('.ge-owner').id, 'اختر صاحب الفريق.');
      if (!events[i].scorer) fieldError(row.querySelector('.ge-scorer').id, 'اختر المسجّل من تشكيلة صاحب الفريق.');
      const minute = row.querySelector('.ge-minute');
      if (minute.validity.badInput || (minute.value !== '' && (!Number.isInteger(Number(minute.value)) || Number(minute.value) < 1 || Number(minute.value) > 120))) fieldError(minute.id, 'اترك الدقيقة فارغة أو أدخل عددًا صحيحًا من 1 إلى 120.');
      if (isSelfAssist(events[i])) fieldError(row.querySelector('.ge-assist').id, 'اختر زميلًا أو «بدون أسيست».');
    });
  }
  if (region(prefix).querySelector('[aria-invalid="true"]')) {
    showError(errorEl(prefix), 'راجع الحقول المحددة قبل متابعة الحفظ.'); focusError(prefix); return null;
  }
  if (detailed) {
    const invalid = validateGoalEvents(events, data.Player1, data.Player2, Number(data.Goals1), Number(data.Goals2), { requireSquad: true, matchId: prefix === 'edit' ? el('editMatchId').value : null });
    if (invalid) { showError(errorEl(prefix), invalid); return null; }
  }
  return { data, events: events.map(({ owner, scorer, assist, ownerId, scorerId, assistId, sourceEventId, legacyScorerEventId, legacyAssistEventId, minute }, sortOrder) => ({ owner, scorer, assist, ownerId, scorerId, assistId, sourceEventId, legacyScorerEventId, legacyAssistEventId, minute, sortOrder })) };
}
export function saveMatch() { return saveMatchForm(false); }
export function saveEditMatch() { return saveMatchForm(true); }
export function saveMatchForm(editing) {
  if (!requireAdmin() || busy()) return;
  const prefix = editing ? 'edit' : 'match';
  if (!drafts[prefix] || drafts[prefix].pending) return;
  const values = validate(prefix); if (!values) return;
  const { data, events } = values;
  const season = state.db.seasons.find(row => row.id === data.Season);
  const missing = Number(data.Goals1) + Number(data.Goals2) > events.length;
  const replaces = editing && getMatchGoalEvents(el('editMatchId').value).length > 0 && missing;
  review = { prefix, draft: drafts[prefix], ...values };
  el('matchReviewSummary').innerHTML = `<p class="entry-review-score" dir="rtl">${scoreHTML(data)}</p>
    <dl class="entry-review-list"><div><dt>الموسم</dt><dd>${esc(displaySeason(season.name))}</dd></div><div><dt>التاريخ</dt><dd>${esc(formatDate(data.Date))}</dd></div>
    <div><dt>عدد الأهداف</dt><dd>${Number(data.Goals1) + Number(data.Goals2)}</dd></div><div><dt>تفاصيل الأهداف</dt><dd>${events.length ? goalCountText(events.length) : missing ? 'لم تتم الإضافة' : 'لا توجد أهداف في هذه المباراة.'}</dd></div><div><dt>الأسيست المسجّل</dt><dd>${events.filter(row => row.assist).length}</dd></div></dl>
    ${missing ? `<p class="entry-note">سيُحفظ اللقاء بنتيجته فقط، ويمكن إضافة تفاصيل الأهداف لاحقًا من سجل المباريات.${replaces ? ' تفاصيل الأهداف المحفوظة سابقًا ستُحذف عند تأكيد الحفظ.' : ''}</p>` : ''}`;
  el('matchReviewError').classList.add('hidden');
  openDialog('matchReviewModal', closeMatchReview);
}
export function closeMatchReview() {
  if (busy()) return;
  review = null; closeDialog('matchReviewModal');
}
export async function confirmMatchSave() {
  if (!review || !requireAdmin() || busy()) return;
  const current = review, { prefix, data, events, draft } = current;
  const editing = prefix === 'edit', user = state.user;
  if (drafts[prefix] !== draft) return;
  const id = editing ? el('editMatchId').value : (state.pendingMatchId ||= crypto.randomUUID());
  const match = { id, player1: data.Player1, player2: data.Player2, goals1: Number(data.Goals1), goals2: Number(data.Goals2), date: data.Date, season_id: data.Season, timestamp: Date.now() };
  return withBusy(editing ? 'edit-match' : 'save-match', el('confirmMatchSaveButton'), async () => {
    el('matchReviewError').classList.add('hidden');
    try {
      const { player1, player2, ...fields } = match;
      const { error } = await sb.rpc('save_league_match', {
        match_data: { ...fields, player1_id: playerId(player1), player2_id: playerId(player2) },
        goal_events: events.map(event => ({ owner_id: event.ownerId, scorer_id: event.scorerId, assist_id: event.assistId,
          source_event_id: event.sourceEventId, legacy_scorer_event_id: event.legacyScorerEventId, legacy_assist_event_id: event.legacyAssistEventId, minute: event.minute })),
      });
      if (error) throw error;
      if (state.user !== user || drafts[prefix] !== draft) return;
      // Keep the committed result visible even if the subsequent refresh is offline.
      const saved = { ...match, player1Id: playerId(player1), player2Id: playerId(player2), season: match.season_id };
      state.db.matches = [...state.db.matches.filter(row => row.id !== id), saved];
      state.db.goalEvents = [...state.db.goalEvents.filter(row => row.matchId !== id), ...events.map(row => ({ ...row, id: row.sourceEventId || null, matchId: id }))];
      state.pendingMatchId = null;
      try { await fetchAllData(); } catch { setSyncStatus('تم حفظ المباراة. تعذّر تحديث بعض الإحصاءات؛ أعد المزامنة عند عودة الاتصال.'); }
      if (state.user !== user || drafts[prefix] !== draft) return;
      review = null; closeDialog('matchReviewModal');
      if (editing) { closeDialog('editMatchModal'); drafts.edit = null; renderPage(state.page); }
      else {
        reset('match');
        const success = el('matchEntrySuccess'); success.hidden = false;
        el('matchEntrySuccessScore').innerHTML = scoreHTML(data);
        el('viewSavedMatch').onclick = () => openMatchDetails(id);
        el('matchEntrySuccess').focus();
      }
      updateSidebarPlayer(); showToast(editing ? 'تم تحديث المباراة بنجاح' : 'تم تسجيل المباراة بنجاح');
    } catch (error) {
      if (state.user === user && drafts[prefix] === draft) showError(el('matchReviewError'), errorMessage(error, 'تعذّر حفظ المباراة. بياناتك محفوظة؛ أعد المحاولة دون تكرار المباراة.'));
    }
  }, 'جارٍ الحفظ…');
}
