import { closeDialog, errorMessage, isBusy, openDialog, withBusy } from '../../shared/ui.js';
import { displaySeason } from '../../shared/locale.js';
import { sb, state } from './state.js';
import { esc, navigateTo, renderPage, showToast } from './ui.js';
import { getActiveSeason, populateSeasonDropdowns } from './seasons.js';
import { updateSidebarPlayer } from './auth-ui.js';
import { getPlayers } from './profiles.js';
import { validateGoalEvents } from './goal-events.js';
import { fetchAllData } from './api.js';
import { clearEvenings } from './evenings.js';

export function applyAdminUI() {
  const admin = isAdmin();
  document.querySelectorAll('.admin-only').forEach(el => {
    el.classList.toggle('hidden', !admin);
  });
  document.body.classList.toggle('is-admin', admin);
  document.body.classList.toggle('is-viewer', !admin);
  const badge = document.getElementById('viewerBadge');
  if (badge) badge.classList.toggle('hidden', admin);
  if (!admin) {
    clearSettingsSession();
    clearEvenings();
    if (state.page === 'evenings') navigateTo('dashboard');
  }
}

export function isAdmin() { return state.profile?.role === 'admin'; }

export function requireAdmin() { if (isAdmin()) return true; showToast("هذه العملية تتطلب صلاحية مدير الدوري.", true); return false; }

export function normalizeBackup(data, players = getPlayers()) {
  if (!data || !Array.isArray(data.seasons) || !Array.isArray(data.matches)) throw new Error("صيغة النسخة الاحتياطية غير صحيحة.");
  const mapIds = rows => {
    const result = new Map();
    for (const row of rows) {
      if (!row || row.id == null || result.has(String(row.id))) throw new Error("تحتوي النسخة الاحتياطية على معرّفات ناقصة أو مكررة.");
      result.set(String(row.id), crypto.randomUUID());
    }
    return result;
  };
  const seasonIds = mapIds(data.seasons), matchIds = mapIds(data.matches);
  const requireNumber = (value, min, max) => {
    if (!Number.isInteger(value) || value < min || value > max) throw new Error("تحتوي النسخة الاحتياطية على رقم غير صالح.");
    return value;
  };
  const requirePlayer = name => { if (!players.includes(name)) throw new Error("تحتوي النسخة الاحتياطية على لاعب غير مسجّل في هذا الدوري."); return name; };
  const optionalId = value => {
    if (value == null) return null;
    if (typeof value !== 'string' || !/^[\da-f]{8}-[\da-f]{4}-[\da-f]{4}-[\da-f]{4}-[\da-f]{12}$/i.test(value)) throw new Error("تحتوي النسخة الاحتياطية على معرّف لاعب غير صالح.");
    return value;
  };
  const seasons = data.seasons.map(row => {
    if (typeof row.name !== 'string' || !row.name.trim() || row.name.length > 80) throw new Error("اسم الموسم غير صالح.");
    return { id: seasonIds.get(String(row.id)), name: row.name.trim(), active: !!row.active, created: Number(row.created) || 0 };
  });
  if (seasons.filter(s => s.active).length > 1) throw new Error("تحتوي النسخة الاحتياطية على أكثر من موسم نشط.");
  const matches = data.matches.map(row => {
    const seasonKey = row.season ?? row.season_id;
    const season = seasonKey == null ? null : seasonIds.get(String(seasonKey));
    if (seasonKey != null && !season) throw new Error("إحدى المباريات مرتبطة بموسم غير موجود.");
    if (row.player1 === row.player2 || typeof row.date !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(row.date) || Number.isNaN(Date.parse(row.date))) throw new Error("بيانات المباراة غير صحيحة.");
    return { id: matchIds.get(String(row.id)), player1: requirePlayer(row.player1), player2: requirePlayer(row.player2),
      player1Id: optionalId(row.player1Id ?? row.player1_id), player2Id: optionalId(row.player2Id ?? row.player2_id),
      goals1: requireNumber(row.goals1, 0, 99), goals2: requireNumber(row.goals2, 0, 99), date: row.date, season, timestamp: Number(row.timestamp) || 0 };
  });
  const list = key => { if (data[key] != null && !Array.isArray(data[key])) throw new Error("إحدى قوائم النسخة الاحتياطية غير صالحة."); return data[key] || []; };
  const goalEvents = list('goalEvents').map(row => {
    const matchId = matchIds.get(String(row.matchId ?? row.match_id));
    const match = matches.find(m => m.id === matchId);
    if (!match || ![match.player1, match.player2].includes(row.owner) || typeof row.scorer !== 'string' || !row.scorer.trim()) throw new Error("تفاصيل أحد الأهداف غير صحيحة.");
    return { matchId, owner: row.owner, scorer: row.scorer.trim(), assist: String(row.assist || ''),
      ownerId: optionalId(row.ownerId ?? row.owner_id), scorerId: optionalId(row.scorerId ?? row.scorer_id), assistId: optionalId(row.assistId ?? row.assist_id),
      minute: requireNumber(row.minute ?? 0, 0, 120), sortOrder: requireNumber(row.sortOrder ?? row.sort_order ?? 0, 0, 1000) };
  });
  for (const match of matches) {
    const error = validateGoalEvents(goalEvents.filter(e => e.matchId === match.id), match.player1, match.player2, match.goals1, match.goals2);
    if (error) throw new Error(error);
  }
  const matchStats = list('matchStats').map(row => {
    const matchId = matchIds.get(String(row.matchId ?? row.match_id));
    const match = matches.find(m => m.id === matchId);
    if (!match || ![match.player1, match.player2].includes(row.player)) throw new Error("إحصائيات المباراة غير صحيحة.");
    return { matchId, player: requirePlayer(row.player), characterName: String(row.characterName ?? row.character_name ?? ''),
      goals: requireNumber(row.goals, 0, 99), assists: requireNumber(row.assists, 0, 99) };
  });
  return { seasons, matches, goalEvents, matchStats };
 }

// Confirmation state is page-local. No operation runs merely by opening settings.
let danger = null;
const node = id => document.getElementById(id);
function operationStatus(id, message, kind = 'status') {
  const el = node(id);
  if (!el) return;
  el.textContent = message; el.setAttribute('role', kind === 'error' ? 'alert' : 'status');
  el.dataset.state = kind;
}
function allowed(status) {
  if (isAdmin() && state.user) return true;
  operationStatus(status, 'لا تملك صلاحية تنفيذ هذه العملية.', 'error');
  requireAdmin(); return false;
}
export function openAccounts(event) {
  if (!allowed('accountsStatus')) { event?.preventDefault(); return; }
  operationStatus('accountsStatus', 'تم فتح رابط إدارة الحسابات في نافذة جديدة. أكمل الإدارة هناك.');
}
export async function exportData() {
  if (!allowed('exportStatus')) return;
  return withBusy('settings', node('exportDataButton'), async () => {
    operationStatus('exportStatus', 'جارٍ إنشاء النسخة الاحتياطية…', 'loading');
    try {
      await fetchAllData();
      if (!allowed('exportStatus')) return;
      const { seasons, matches, goalEvents, matchStats } = state.db;
      const backup = { version: 3, exportedAt: new Date().toISOString(), seasons, matches, goalEvents, matchStats };
      const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
      const link = document.createElement('a');
      link.href = url; link.download = 'efootball-competition-' + new Date().toISOString().slice(0, 10) + '.json';
      link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
      operationStatus('exportStatus', 'تم إنشاء النسخة الاحتياطية بنجاح.', 'success');
    } catch (error) {
      operationStatus('exportStatus', errorMessage(error, 'تعذر إنشاء النسخة الاحتياطية. حاول مرة أخرى.'), 'error');
    }
  }, 'جارٍ إنشاء النسخة الاحتياطية…');
}
export function selectImportFile() {
  if (!allowed('importStatus') || isBusy('settings')) return;
  node('importDataButton').disabled = !node('importFile').files.length;
  node('importFile').removeAttribute('aria-invalid');
  operationStatus('importStatus', node('importFile').files[0] ? 'الملف محدد. اضغط مراجعة النسخة للتحقق من محتواها.' : 'اختر ملف JSON للمراجعة.');
}
export async function importData(event) {
  if (!allowed('importStatus') || isBusy('settings') || danger) return;
  const input = event?.target || node('importFile'), file = input.files[0];
  if (!file) return;
  return withBusy('settings', node('importDataButton'), async () => {
    operationStatus('importStatus', 'جارٍ التحقق من النسخة الاحتياطية…', 'loading');
    try {
      if (file.size > 5 * 1024 * 1024) throw new Error('اختر نسخة احتياطية أصغر من 5 ميغابايت.');
      const backup = normalizeBackup(JSON.parse(await file.text()));
      operationStatus('importStatus', 'النسخة جاهزة للمراجعة. لم يتم استيراد أي بيانات.');
      openDanger('import', null, backup);
    } catch (error) {
      input.setAttribute('aria-invalid', 'true'); input.focus();
      operationStatus('importStatus', error instanceof SyntaxError ? 'تعذر قراءة الملف. اختر نسخة احتياطية صالحة.' : error.message, 'error');
    }
  }, 'جارٍ التحقق…');
}
function scopeFor(kind, seasonId) {
  const seasons = kind === 'season' ? state.db.seasons.filter(s => s.id === seasonId) : state.db.seasons;
  const matches = kind === 'season' ? state.db.matches.filter(m => m.season === seasonId) : state.db.matches;
  const ids = new Set(matches.map(m => m.id));
  const goals = state.db.goalEvents.filter(e => ids.has(e.matchId));
  const stats = state.db.matchStats.filter(e => ids.has(e.matchId));
  const ordered = rows => [...rows].sort((a,b) => String(a.id).localeCompare(String(b.id)));
  return { seasons, matches, goals, stats, signature: JSON.stringify([ordered(seasons), ordered(matches), ordered(goals), ordered(stats)]) };
}
function paintDanger() {
  const { kind, seasonId, backup } = danger;
  const scope = scopeFor(kind, seasonId); danger.signature = scope.signature;
  const season = scope.seasons[0];
  const title = kind === 'season' ? 'تصفير الموسم الحالي' : kind === 'all' ? 'تصفير البطولة بالكامل' : 'استيراد نسخة احتياطية';
  danger.phrase = kind === 'season' ? 'تصفير الموسم' : kind === 'all' ? 'تصفير البطولة' : 'استيراد النسخة';
  node('dangerConfirmTitle').textContent = title;
  node('dangerConfirmLabel').textContent = 'للتأكيد، اكتب: ' + danger.phrase;
  node('dangerConfirmExecute').textContent = danger.phrase;
  node('dangerConfirmInput').value = ''; node('dangerConfirmInput').disabled = false;
  node('dangerConfirmCancel').textContent = 'إلغاء والعودة';
  node('dangerConfirmScope').innerHTML = `<p class="danger-scope">النطاق: <strong>${esc(kind === 'season' ? displaySeason(season?.name || 'موسم غير متاح') : 'جميع بيانات البطولة')}</strong></p>
    <dl class="entry-review-list"><div><dt>المواسم</dt><dd>${scope.seasons.length}</dd></div><div><dt>المباريات</dt><dd>${scope.matches.length}</dd></div><div><dt>تفاصيل الأهداف</dt><dd>${scope.goals.length}</dd></div><div><dt>سجلات إحصائيات المباريات</dt><dd>${scope.stats.length}</dd></div></dl>
    <p>سيتم حذف ${kind === 'season' ? 'مباريات هذا الموسم وتفاصيل أهدافها وإحصائياتها. سيبقى الموسم محفوظًا.' : 'المواسم والمباريات وتفاصيل الأهداف وإحصائيات المباريات الحالية.'}</p>
    <p>يُعاد احتساب الترتيب والإنجازات من المباريات المتبقية. تبقى حسابات اللاعبين والتشكيلات والأسئلة والمحادثات محفوظة.</p>
    ${kind === 'all' ? '<p>سيتم إنشاء موسم أول جديد وفارغ.</p>' : ''}
    ${backup ? `<p>النسخة المختارة تحتوي على ${backup.seasons.length} موسم و${backup.matches.length} مباراة و${backup.goalEvents.length} تفاصيل أهداف.</p>` : ''}
    <p class="text-muted">الأعداد بحسب آخر بيانات محملة، ويُعاد التحقق منها قبل التنفيذ.</p>`;
  updateDangerConfirm();
}
function openDanger(kind, seasonId = null, backup = null) {
  if (danger || !isAdmin()) return;
  danger = { kind, seasonId, backup, session: state.profile, complete: false, running: false,
    status: kind === 'season' ? 'resetSeasonStatus' : kind === 'all' ? 'resetAllStatus' : 'importStatus' };
  paintDanger(); operationStatus('dangerConfirmStatus', 'راجع النطاق ثم اكتب عبارة التأكيد.');
  openDialog('dangerConfirmModal', closeDangerConfirm);
}
export function confirmResetSeason() {
  if (!allowed('resetSeasonStatus') || isBusy('settings')) return;
  const active = getActiveSeason();
  if (!active) return operationStatus('resetSeasonStatus', 'لا يوجد موسم متاح لتصفيره.', 'error');
  openDanger('season', active.id);
}
export function confirmResetAll() {
  if (!allowed('resetAllStatus') || isBusy('settings')) return;
  openDanger('all');
}
export function updateDangerConfirm() {
  node('dangerConfirmExecute').disabled = !danger || danger.running || danger.complete || node('dangerConfirmInput').value.trim() !== danger.phrase;
}
export function closeDangerConfirm() {
  if (danger?.running) return;
  danger = null; closeDialog('dangerConfirmModal');
}
export function clearSettingsSession() {
  danger = null; closeDialog('dangerConfirmModal');
  node('importFile').value = ''; node('importDataButton').disabled = true;
}
export async function executeDangerConfirm() {
  const current = danger;
  if (!current || current.running || current.complete || isBusy('settings') || node('dangerConfirmInput').value.trim() !== current.phrase) return;
  if (!allowed(current.status) || state.profile !== current.session) {
    operationStatus('dangerConfirmStatus', 'لا تملك صلاحية تنفيذ هذه العملية.', 'error'); return;
  }
  current.running = true; node('dangerConfirmInput').disabled = true;
  await withBusy('settings', node('dangerConfirmExecute'), async () => {
    operationStatus('dangerConfirmStatus', 'جارٍ التحقق من النطاق وتنفيذ العملية…', 'loading');
    operationStatus(current.status, 'جارٍ التنفيذ…', 'loading');
    try {
      await fetchAllData();
      if (danger !== current || state.profile !== current.session || !isAdmin()) throw { userMessage: 'لا تملك صلاحية تنفيذ هذه العملية.' };
      if (current.kind === 'season' && getActiveSeason()?.id !== current.seasonId) throw { userMessage: 'تغيّر الموسم الحالي. أغلق التأكيد وراجع الموسم قبل المحاولة.' };
      if (scopeFor(current.kind, current.seasonId).signature !== current.signature) {
        paintDanger(); throw { userMessage: 'تغيّرت البيانات. راجع الأعداد الجديدة واكتب عبارة التأكيد من جديد.' };
      }
      let result;
      if (current.kind === 'season') result = await sb.from('matches').delete().eq('season_id', current.seasonId);
      else {
        const backup = current.backup || { seasons: [{ id: crypto.randomUUID(), name: 'الموسم الأول', active: true, created: Date.now() }], matches: [], goalEvents: [], matchStats: [] };
        result = await sb.rpc('restore_league_competition', { backup });
      }
      if (result.error) throw result.error;
      current.complete = true;
      if (danger !== current || state.profile !== current.session) return;
      if (current.kind === 'import') { node('importFile').value = ''; node('importDataButton').disabled = true; }
      let message = current.kind === 'import' ? 'تم استيراد النسخة الاحتياطية بنجاح.' : 'تمت عملية ' + current.phrase + ' بنجاح.';
      try { await fetchAllData(); populateSeasonDropdowns(); updateSidebarPlayer(); renderPage(state.page); }
      catch { message += ' تعذر تحديث العرض؛ استخدم إعادة المحاولة لتحديث البيانات.'; }
      operationStatus('dangerConfirmStatus', message, 'success'); operationStatus(current.status, message, 'success');
      node('dangerConfirmCancel').textContent = 'إغلاق';
    } catch (error) {
      if (danger !== current) return;
      const message = error.userMessage || errorMessage(error, 'تعذر تنفيذ العملية. البيانات أو الملف المحدد محفوظان للمراجعة.');
      operationStatus('dangerConfirmStatus', message, 'error'); operationStatus(current.status, message, 'error');
    }
  }, 'جارٍ التنفيذ…');
  current.running = false;
  if (danger === current) { node('dangerConfirmInput').disabled = current.complete; updateDangerConfirm(); }
}
