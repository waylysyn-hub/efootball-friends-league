import { displaySeason } from '../../shared/locale.js';
import { sb, state } from './state.js';
import { isAdmin, requireAdmin } from './admin.js';
import { esc, showConfirm, showToast } from './ui.js';
import { withBusy } from '../../shared/ui.js';
import { fetchAllData } from './api.js';
import { updateSidebarPlayer } from './auth-ui.js';

export function getActiveSeason() {
  return state.db.seasons.find(s => s.active) || state.db.seasons[state.db.seasons.length - 1] || null;
}

export function populateSeasonDropdowns() {
  const dropdowns = ['matchSeason', 'historyFilterSeason', 'tableSeasonFilter',
                     'awardsSeasonFilter', 'statsSeasonFilter', 'fbStatsSeasonFilter', 'editSeason'];
  dropdowns.forEach(id => {
    const el = document.getElementById(id);
    if (!el) return;
    const prev = el.value;
    el.innerHTML = '';

    if (id === 'historyFilterSeason' || id === 'tableSeasonFilter' ||
        id === 'awardsSeasonFilter' || id === 'statsSeasonFilter' || id === 'fbStatsSeasonFilter') {
      const all = document.createElement('option');
      all.value = 'all';
      all.textContent = id === 'tableSeasonFilter' || id === 'statsSeasonFilter' ? "كل المواسم" : "كل المواسم (الإجمالي)";
      el.appendChild(all);
    }

    state.db.seasons.forEach(s => {
      const opt = document.createElement('option');
      opt.value = s.id;
      opt.textContent = displaySeason(s.name) + (s.active ? ' ★' : '');
      el.appendChild(opt);
    });

    if ([...el.options].some(option => option.value === prev)) el.value = prev;
    else if (id === 'matchSeason' || id === 'editSeason') el.value = getActiveSeason()?.id || '';
  });
}

export async function createSeason() {
  if (!requireAdmin()) return;
  const input = document.getElementById('newSeasonName');
  const name = input.value.trim();
  if (!name || name.length > 80) return showToast("أدخل اسمًا للموسم لا يتجاوز 80 حرفًا.", true);
  if (state.db.seasons.some(season => season.name.toLowerCase() === name.toLowerCase())) return showToast("يوجد موسم بهذا الاسم بالفعل.", true);
  return withBusy('create-season', document.getElementById('createSeasonButton'), async () => {
    if (state.pendingSeason?.name !== name) state.pendingSeason = { id: crypto.randomUUID(), name, active: false, created: Date.now() };
    const draft = state.pendingSeason;
    const { error } = await sb.from('seasons').insert(draft);
    if (error) {
      if (error.code !== '23505') throw error;
      const existing = await sb.from('seasons').select('id,name').eq('id', draft.id).single();
      if (existing.error || existing.data?.name !== name) throw error;
    }
    state.pendingSeason = null;
    input.value = '';
    await fetchAllData(); populateSeasonDropdowns(); renderSeasons(); showToast("تم إنشاء الموسم.");
  });
 }

export async function setActiveSeason(id) {
  if (!requireAdmin()) return;
  return withBusy('active-season', document.activeElement, async () => {
    const { error } = await sb.rpc('set_league_active_season', { target: id });
    if (error) throw error;
    await fetchAllData(); populateSeasonDropdowns(); renderSeasons(); updateSidebarPlayer();
    document.getElementById('topbarSeason').textContent = displaySeason(getActiveSeason()?.name) || "لا يوجد موسم نشط";
    showToast("تم تحديث الموسم النشط.");
  });
 }

export function deleteSeason(id) {
  if (!requireAdmin()) return;
  const season = state.db.seasons.find(s => s.id === id);
  if (!season) return;
  const matchCount = state.db.matches.filter(m => m.season === id).length;
  showConfirm(
    "حذف الموسم",
    `هل تريد حذف «${displaySeason(season.name)}»؟ سيُحذف معه ${matchCount} من المباريات.`,
    async () => {
      if (!sb) return showToast("الاتصال بالخادم غير جاهز. تواصل مع مدير الدوري.", true);
      const { error } = await sb.from('seasons').delete().eq('id', id);
      if (error) return showToast("تعذّر حذف الموسم.", true);

      state.db.matches = state.db.matches.filter(m => m.season !== id);
      const keptIds = new Set(state.db.matches.map(m => m.id));
      state.db.goalEvents = state.db.goalEvents.filter(e => keptIds.has(e.matchId));
      state.db.matchStats = state.db.matchStats.filter(s => keptIds.has(s.matchId));
      state.db.seasons = state.db.seasons.filter(s => s.id !== id);
      if (state.db.seasons.length > 0 && !state.db.seasons.find(s => s.active)) {
        const last = state.db.seasons[state.db.seasons.length - 1];
        const { error: activationError } = await sb.rpc('set_league_active_season', { target: last.id });
        if (activationError) showToast("تم حذف الموسم. اختر موسمًا نشطًا جديدًا.", true);
        else last.active = true;
      }


      populateSeasonDropdowns();
      renderSeasons();
      updateSidebarPlayer();
      showToast("تم حذف الموسم.");
    }
  );
}

export function renderSeasons() {
  const cont = document.getElementById('seasonsList');
  if (!cont) return;
  if (state.db.seasons.length === 0) {
    cont.innerHTML = "<div class=\"empty-state\">لا توجد مواسم بعد. يمكن لمدير الدوري إنشاء موسم جديد.</div>";
    return;
  }
  cont.innerHTML = state.db.seasons.map(s => {
    const matchCount = state.db.matches.filter(m => m.season === s.id).length;
    return `
      <div class="season-card">
        <div class="season-card-info">
          <h4>${esc(displaySeason(s.name))}</h4>
          <p>عدد المباريات المسجّلة: ${matchCount}</p>
        </div>
        <div class="season-card-actions">
          ${s.active ? "<span class=\"season-badge-active\">نشط</span>" :
            (isAdmin() ? `<button class="btn-sm" onclick="League.setActiveSeason('${s.id}')">تعيين كنشط</button>` : '')}
          ${isAdmin() ? `<button class="btn-sm delete" onclick="League.deleteSeason('${s.id}')">حذف</button>` : ''}
        </div>
      </div>`;
  }).join('');
}
