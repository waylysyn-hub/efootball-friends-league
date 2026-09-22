import { displaySeason } from '../../shared/locale.js';
import { sb, state } from './state.js';
import { navigateTo, renderPage, showConfirm, showToast } from './ui.js';
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
    clearEvenings();
    if (state.page === 'evenings') navigateTo('dashboard');
  }
}

export function exportData() {
  const { seasons, matches, goalEvents, matchStats } = state.db;
  const backup = { version: 2, exportedAt: new Date().toISOString(), seasons, matches, goalEvents, matchStats };
  const url = URL.createObjectURL(new Blob([JSON.stringify(backup, null, 2)], { type: 'application/json' }));
  const link = document.createElement('a');
  link.href = url; link.download = 'efootball-competition-' + new Date().toISOString().slice(0, 10) + '.json';
  link.click(); setTimeout(() => URL.revokeObjectURL(url), 1000);
  showToast("تم تنزيل النسخة الاحتياطية للبطولة.");
 }

export function confirmResetSeason() {
  if (!requireAdmin()) return;
  const active = getActiveSeason();
  if (!active) return showToast("لا يوجد موسم نشط لتصفيره.", true);
  const count = state.db.matches.filter(m => m.season === active.id).length;
  showConfirm("تصفير الموسم", `هل تريد حذف كل مباريات «${displaySeason(active.name)}» (${count})؟ لا يمكن التراجع عن الحذف.`, async () => {
    if (!sb) return showToast("الاتصال بالخادم غير جاهز. تواصل مع مدير الدوري.", true);
    const { error } = await sb.from('matches').delete().eq('season_id', active.id);
    if (error) throw error;
    // Standings and achievements are recalculated by database triggers.
    await fetchAllData();
    populateSeasonDropdowns();
    updateSidebarPlayer();
    renderPage(state.page);
    showToast("تم تصفير الموسم.");
  });
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
      goals1: requireNumber(row.goals1, 0, 99), goals2: requireNumber(row.goals2, 0, 99), date: row.date, season, timestamp: Number(row.timestamp) || 0 };
  });
  const list = key => { if (data[key] != null && !Array.isArray(data[key])) throw new Error("إحدى قوائم النسخة الاحتياطية غير صالحة."); return data[key] || []; };
  const goalEvents = list('goalEvents').map(row => {
    const matchId = matchIds.get(String(row.matchId ?? row.match_id));
    const match = matches.find(m => m.id === matchId);
    if (!match || ![match.player1, match.player2].includes(row.owner) || typeof row.scorer !== 'string' || !row.scorer.trim()) throw new Error("تفاصيل أحد الأهداف غير صحيحة.");
    return { matchId, owner: row.owner, scorer: row.scorer.trim(), assist: String(row.assist || ''),
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

export async function importData(event) {
  const input = event.target;
  if (!requireAdmin()) { input.value = ''; return; }
  const file = input.files[0]; input.value = '';
  if (!file) return;
  if (file.size > 5 * 1024 * 1024) return showToast("اختر نسخة احتياطية أصغر من 5 ميغابايت.", true);
  let backup;
  try { backup = normalizeBackup(JSON.parse(await file.text())); }
  catch (error) { return showToast(error instanceof SyntaxError ? 'تعذّر قراءة الملف. اختر نسخة احتياطية صالحة.' : error.message || 'النسخة الاحتياطية للبطولة غير صالحة.', true); }
  showConfirm("استعادة البطولة",
    `هل تريد استبدال البطولة الحالية بنسخة تحتوي على ${backup.seasons.length} من المواسم و${backup.matches.length} من المباريات؟ ستبقى حسابات اللاعبين والمحادثات محفوظة.`,
    async () => {
      if (!requireAdmin()) return;
      const { error } = await sb.rpc('restore_league_competition', { backup });
      if (error) throw error;
      await fetchAllData(); populateSeasonDropdowns(); updateSidebarPlayer();
      navigateTo('dashboard'); showToast("تمت استعادة البطولة.");
    });
 }

export function confirmResetAll() {
  if (!requireAdmin()) return;
  showConfirm("تصفير البطولة", "هل تريد حذف كل المواسم والمباريات والأهداف نهائيًا؟ ستبقى حسابات اللاعبين والمحادثات محفوظة.", async () => {
    if (!requireAdmin()) return;
    const backup = { seasons: [{ id: crypto.randomUUID(), name: "الموسم الأول", active: true, created: Date.now() }], matches: [], goalEvents: [], matchStats: [] };
    const { error } = await sb.rpc('restore_league_competition', { backup });
    if (error) throw error;
    await fetchAllData(); populateSeasonDropdowns(); updateSidebarPlayer();
    showToast("تم تصفير البطولة.");
  });
 }
