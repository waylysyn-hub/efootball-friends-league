import { escapeHtml as esc } from '../../shared/ui.js';

export const SQUAD_GROUPS = [
  { key: 'GK', label: 'حراس المرمى', short: 'حارس', code: 'GK' },
  { key: 'DF', label: 'الدفاع', short: 'دفاع', code: 'DF' },
  { key: 'MF', label: 'الوسط', short: 'وسط', code: 'MF' },
  { key: 'FW', label: 'الهجوم', short: 'هجوم', code: 'FW' },
  { key: 'UNK', label: 'غير محدد المركز', short: 'غير محدد', code: '—' },
];
export const SQUAD_ROLES = [
  { key: 'starter', label: 'أساسي' },
  { key: 'substitute', label: 'احتياط' },
];
const nameOrder = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });
export const squadPosition = player => SQUAD_GROUPS.some(g => g.key === player.position) ? player.position : 'UNK';
export const squadRole = player => player.lineup_role === 'substitute' ? 'substitute' : 'starter';

export function uniqueSquad(players) {
  const seen = new Set();
  return players.filter(player => {
    const key = player.id || `${player.owner}:${player.name.trim().toLocaleLowerCase()}`;
    if (seen.has(key)) return false;
    seen.add(key); return true;
  });
}
export function squadRating(player) {
  const value = player.rating;
  return value !== null && value !== undefined && value !== '' && Number.isFinite(Number(value)) && Number(value) >= 0 && Number(value) <= 120 ? Number(value) : null;
}
export function squadSummary(players) {
  const active = uniqueSquad(players).filter(p => p.active);
  const ratings = active.map(squadRating).filter(r => r !== null);
  return {
    total: active.length,
    counts: Object.fromEntries(SQUAD_GROUPS.map(g => [g.key, active.filter(p => squadPosition(p) === g.key).length])),
    substitutes: active.filter(p => squadRole(p) === 'substitute').length,
    average: ratings.length ? (ratings.reduce((a, b) => a + b, 0) / ratings.length).toFixed(1) : null,
    rated: ratings.length,
  };
}
function searchable(value) { return String(value).normalize('NFKD').replace(/[\u064B-\u065F\u0670\u0640]/g, '').toLocaleLowerCase('ar'); }
export function filterSquadMembers(players, { search = '', position = '', role = '', sort = 'position' } = {}) {
  const query = searchable(search.trim());
  return uniqueSquad(players).filter(p =>
    (!position || squadPosition(p) === position) &&
    (!role || squadRole(p) === role) &&
    searchable(p.name).includes(query)
  ).sort((a, b) => {
    if (sort === 'rating') { const difference = (squadRating(b) ?? -1) - (squadRating(a) ?? -1); if (difference) return difference; }
    if (sort === 'position') {
      const difference = SQUAD_GROUPS.findIndex(g => g.key === squadPosition(a)) - SQUAD_GROUPS.findIndex(g => g.key === squadPosition(b));
      if (difference) return difference;
      const roleDifference = (squadRole(a) === 'substitute') - (squadRole(b) === 'substitute');
      if (roleDifference) return roleDifference;
    }
    return nameOrder.compare(a.name, b.name) || String(a.id).localeCompare(String(b.id));
  });
}
export function squadInitials(name) {
  const words = name.trim().split(/\s+/).filter(Boolean);
  return words.slice(0, 2).map(word => Array.from(word)[0]).join('').toLocaleUpperCase('ar') || '؟';
}
export function safeSquadPhoto(value) {
  if (!value) return '';
  try { const url = new URL(value); return url.protocol === 'https:' && !url.username && !url.password ? url.href : ''; }
  catch { return ''; }
}
function playerCard(player, canEdit) {
  const group = SQUAD_GROUPS.find(g => g.key === squadPosition(player));
  const role = squadRole(player);
  const photo = safeSquadPhoto(player.photo_url), rating = squadRating(player);
  const number = player.shirt_number;
  const hasNumber = number !== null && number !== undefined && number !== '' && Number.isInteger(Number(number)) && Number(number) >= 0 && Number(number) <= 99;
  return `<article class="roster-player position-${group.key}${role === 'substitute' ? ' roster-player-substitute' : ''}${player.active ? '' : ' roster-player-archived'}" data-squad-player="${esc(player.id)}" data-squad-role="${role}">
    <div class="roster-avatar"><span aria-hidden="true">${esc(squadInitials(player.name))}</span>${photo ? `<img src="${esc(photo)}" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" hidden>` : ''}</div>
    <div class="roster-player-copy"><strong dir="auto">${esc(player.name)}</strong><span class="roster-player-position">${group.short}${hasNumber ? ` <bdi class="roster-number">#${Number(number)}</bdi>` : ''}</span></div>
    ${role === 'substitute' ? '<span class="roster-role-badge">احتياط</span>' : ''}
    ${rating !== null ? `<span class="roster-rating" aria-label="التقييم ${rating}"><span aria-hidden="true">★</span> <bdi>${rating}</bdi></span>` : ''}
    ${canEdit ? `<div class="roster-player-actions"><button class="btn-sm" data-squad-edit="${esc(player.id)}" type="button" aria-label="تعديل ${esc(player.name)}">تعديل</button><button class="btn-sm" data-squad-toggle="${esc(player.id)}" type="button" aria-label="${player.active ? 'إبعاد' : 'إعادة'} ${esc(player.name)}">${player.active ? 'إبعاد' : 'إعادة'}</button></div>` : ''}
  </article>`;
}
function positionSection(key, players, canEdit, collapsed) {
  const group = SQUAD_GROUPS.find(g => g.key === key), members = players.filter(p => squadPosition(p) === key);
  return `<details class="roster-group position-${key}" data-squad-group="${key}" ${collapsed.has(key) ? '' : 'open'}>
    <summary><span class="roster-group-heading"><span class="roster-dot" aria-hidden="true"></span>${group.label}<span class="roster-group-count">${members.length}</span></span><span class="roster-group-code" aria-hidden="true">${group.code}</span></summary>
    <div class="roster-players">${members.length ? members.map(p => playerCard(p, canEdit)).join('') : '<p class="roster-group-empty">لا يوجد لاعبون في هذا القسم</p>'}</div>
  </details>`;
}
export function squadPlayersHTML(players, { view = 'pitch', sort = 'position', canEdit = false, collapsed = new Set() } = {}) {
  if (view === 'list' && sort !== 'position') return `<div class="roster-players">${players.map(p => playerCard(p, canEdit)).join('')}</div>`;
  if (view === 'list') return SQUAD_GROUPS.map(group => positionSection(group.key, players, canEdit, collapsed)).join('');

  const starters = players.filter(p => squadRole(p) === 'starter');
  const substitutes = players.filter(p => squadRole(p) === 'substitute');
  const field = ['FW', 'MF', 'DF', 'GK'].map(key => positionSection(key, starters, canEdit, collapsed)).join('');
  const unknown = positionSection('UNK', starters, canEdit, collapsed);
  const reserveKey = 'substitute';
  const reserve = `<details class="roster-group role-substitute" data-squad-role-group="substitute" ${collapsed.has(reserveKey) ? '' : 'open'}>
    <summary><span class="roster-group-heading"><span class="roster-dot" aria-hidden="true"></span>الاحتياط<span class="roster-group-count">${substitutes.length}</span></span><span class="roster-group-code" aria-hidden="true">SUB</span></summary>
    <div class="roster-players">${substitutes.length ? substitutes.map(p => playerCard(p, canEdit)).join('') : '<p class="roster-group-empty">لا يوجد لاعبون احتياط</p>'}</div>
  </details>`;
  return `<div class="roster-field" aria-label="ملعب التشكيلة">${field}</div>${unknown}${reserve}`;
}
export function squadArchiveHTML(players, canEdit) {
  return players.map(p => playerCard(p, canEdit)).join('');
}
export function bindSquadPhotos(container) {
  container.querySelectorAll('.roster-avatar img').forEach(img => {
    const show = () => { if (img.naturalWidth) { img.hidden = false; img.previousElementSibling.hidden = true; } };
    img.onload = show;
    img.onerror = () => { img.previousElementSibling.hidden = false; img.remove(); };
    if (img.complete) { if (img.naturalWidth) show(); else img.remove(); }
  });
}
