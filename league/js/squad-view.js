import { normalizeExternalSquadPhotoUrl } from './squad-images.js';
import { escapeHtml as esc } from '../../shared/ui.js';

export const SQUAD_LINES = [
  { key: 'GK', label: 'حراسة المرمى', short: 'حارس', code: 'GK' },
  { key: 'DF', label: 'الدفاع', short: 'دفاع', code: 'DEF' },
  { key: 'MF', label: 'الوسط', short: 'وسط', code: 'MID' },
  { key: 'FW', label: 'الهجوم', short: 'هجوم', code: 'ATT' },
];
export const SQUAD_POSITIONS = [
  { key: 'GK',  label: 'حارس مرمى', line: 'GK', order: 0 },
  { key: 'LB',  label: 'ظهير أيسر', line: 'DF', order: 10 },
  { key: 'CB',  label: 'قلب دفاع', line: 'DF', order: 20 },
  { key: 'RB',  label: 'ظهير أيمن', line: 'DF', order: 30 },
  { key: 'LMF', label: 'وسط أيسر', line: 'MF', order: 40 },
  { key: 'DMF', label: 'وسط دفاعي', line: 'MF', order: 50 },
  { key: 'CMF', label: 'وسط مركزي', line: 'MF', order: 60 },
  { key: 'AMF', label: 'وسط هجومي', line: 'MF', order: 70 },
  { key: 'RMF', label: 'وسط أيمن', line: 'MF', order: 80 },
  { key: 'LWF', label: 'جناح أيسر', line: 'FW', order: 90 },
  { key: 'SS',  label: 'مهاجم ثانٍ', line: 'FW', order: 100 },
  { key: 'CF',  label: 'رأس حربة', line: 'FW', order: 110 },
  { key: 'RWF', label: 'جناح أيمن', line: 'FW', order: 120 },
];
export const SQUAD_GROUPS = SQUAD_LINES;
export const SQUAD_ROLES = [
  { key: 'starter', label: 'أساسي' },
  { key: 'substitute', label: 'احتياط' },
];
const positionByKey = new Map(SQUAD_POSITIONS.map(position => [position.key, position]));
const lineByKey = new Map(SQUAD_LINES.map(line => [line.key, line]));
lineByKey.set('UNK', { key: 'UNK', label: 'غير محدد المركز', code: '—' });
const nameOrder = new Intl.Collator('ar', { numeric: true, sensitivity: 'base' });

const legacyPosition = { DF: 'CB', MF: 'CMF', FW: 'CF' };
export const squadPosition = player => positionByKey.has(player.position) ? player.position : (legacyPosition[player.position] || 'UNK');
export const squadPositionMeta = player => positionByKey.get(squadPosition(player)) || { key: 'UNK', label: 'غير محدد', line: 'UNK', order: 999 };
export const squadLine = player => squadPositionMeta(player).line;
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
  const starters = active.filter(p => squadRole(p) === 'starter');
  return {
    total: active.length,
    starters: starters.length,
    complete: starters.length === 11,
    counts: Object.fromEntries(SQUAD_LINES.map(line => [line.key, active.filter(p => squadLine(p) === line.key).length])),
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
    if (sort === 'rating') {
      const difference = (squadRating(b) ?? -1) - (squadRating(a) ?? -1);
      if (difference) return difference;
    }
    if (sort === 'position') {
      const difference = squadPositionMeta(a).order - squadPositionMeta(b).order;
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
export function safeSquadPhoto(value) { return normalizeExternalSquadPhotoUrl(value); }

function playerCard(player, canEdit) {
  const position = squadPositionMeta(player);
  const line = lineByKey.get(position.line) || { key: 'UNK' };
  const role = squadRole(player);
  const photo = safeSquadPhoto(player.photo_url), rating = squadRating(player);
  const number = player.shirt_number;
  const hasNumber = number !== null && number !== undefined && number !== '' && Number.isInteger(Number(number)) && Number(number) >= 0 && Number(number) <= 99;
  return `<article class="roster-player position-${line.key} position-code-${position.key}${role === 'substitute' ? ' roster-player-substitute' : ''}${player.active ? '' : ' roster-player-archived'}" data-squad-player="${esc(player.id)}" data-squad-role="${role}" data-squad-position="${position.key}">
    <div class="roster-player-top">
      <div class="roster-avatar"><span aria-hidden="true">${esc(squadInitials(player.name))}</span>${photo ? `<img src="${esc(photo)}" alt="" decoding="async" referrerpolicy="no-referrer">` : ''}</div>
      ${hasNumber ? `<bdi class="roster-number" aria-label="رقم القميص ${Number(number)}">#${Number(number)}</bdi>` : ''}
      ${rating !== null ? `<span class="roster-rating" aria-label="التقييم ${rating}"><span aria-hidden="true">★</span><bdi>${rating}</bdi></span>` : ''}
    </div>
    <div class="roster-player-copy"><strong dir="auto">${esc(player.name)}</strong><span class="roster-player-position"><bdi class="roster-position-code">${position.key}</bdi><span>${esc(position.label)}</span></span></div>
    ${role === 'substitute' ? '<span class="roster-role-badge">احتياط</span>' : ''}
    ${canEdit ? `<div class="roster-player-actions"><button class="btn-sm" data-squad-edit="${esc(player.id)}" type="button" aria-label="تعديل ${esc(player.name)}">تعديل</button><button class="btn-sm" data-squad-toggle="${esc(player.id)}" type="button" aria-label="${player.active ? 'إبعاد' : 'إعادة'} ${esc(player.name)}">${player.active ? 'إبعاد' : 'إعادة'}</button><button class="btn-sm btn-danger" data-squad-delete="${esc(player.id)}" type="button" aria-label="حذف ${esc(player.name)}">حذف</button></div>` : ''}
  </article>`;
}
const PITCH_LAYOUT = {
  FW: [
    ['LWF', 'CF', 'RWF'],
    [null, 'SS', null],
  ],
  MF: [
    ['LMF', 'AMF', 'RMF'],
    [null, 'CMF', null],
    [null, 'DMF', null],
  ],
  DF: [
    ['LB', 'CB', 'RB'],
  ],
  GK: [
    [null, 'GK', null],
  ],
};

function pitchSlot(position, players, canEdit, side) {
  if (!position) return '<div class="roster-pitch-slot is-empty" aria-hidden="true"></div>';
  const members = players.filter(p => squadPosition(p) === position);
  return `<div class="roster-pitch-slot pitch-${side}" data-pitch-position="${position}">${members.map(p => playerCard(p, canEdit)).join('')}</div>`;
}

function pitchLineSection(key, players, canEdit, collapsed) {
  const group = lineByKey.get(key);
  const members = players.filter(p => squadLine(p) === key);
  const rows = (PITCH_LAYOUT[key] || []).filter(row => row.some(position => members.some(p => squadPosition(p) === position)));
  return `<details class="roster-group roster-pitch-line position-${key}" data-squad-group="${key}" ${collapsed.has(key) ? '' : 'open'}>
    <summary><span class="roster-group-heading"><span class="roster-dot" aria-hidden="true"></span>${group.label}<span class="roster-group-count">${members.length}</span></span><span class="roster-group-code" aria-hidden="true">${group.code}</span></summary>
    <div class="roster-pitch-rows">${rows.length ? rows.map(row => `<div class="roster-pitch-row">${pitchSlot(row[0], members, canEdit, 'left')}${pitchSlot(row[1], members, canEdit, 'center')}${pitchSlot(row[2], members, canEdit, 'right')}</div>`).join('') : '<p class="roster-group-empty">لا يوجد لاعبون في هذا الخط</p>'}</div>
  </details>`;
}

function lineSection(key, players, canEdit, collapsed) {
  const group = lineByKey.get(key);
  const members = players.filter(p => squadLine(p) === key).sort((a,b)=>squadPositionMeta(a).order-squadPositionMeta(b).order || nameOrder.compare(a.name,b.name));
  return `<details class="roster-group position-${key}" data-squad-group="${key}" ${collapsed.has(key) ? '' : 'open'}>
    <summary><span class="roster-group-heading"><span class="roster-dot" aria-hidden="true"></span>${group.label}<span class="roster-group-count">${members.length}</span></span><span class="roster-group-code" aria-hidden="true">${group.code}</span></summary>
    <div class="roster-players">${members.length ? members.map(p => playerCard(p, canEdit)).join('') : '<p class="roster-group-empty">لا يوجد لاعبون في هذا الخط</p>'}</div>
  </details>`;
}
export function squadPlayersHTML(players, { view = 'pitch', sort = 'position', canEdit = false, collapsed = new Set() } = {}) {
  players = uniqueSquad(players);
  if (view === 'list' && sort !== 'position') return `<div class="roster-players">${players.map(p => playerCard(p, canEdit)).join('')}</div>`;
  const unknown = players.filter(p => squadLine(p) === 'UNK');
  if (view === 'list') return [...SQUAD_LINES.map(line => line.key), ...(unknown.length ? ['UNK'] : [])].map(key => lineSection(key, players, canEdit, collapsed)).join('');

  const starters = players.filter(p => squadRole(p) === 'starter');
  const substitutes = players.filter(p => squadRole(p) === 'substitute');
  const field = ['FW', 'MF', 'DF', 'GK'].map(key => pitchLineSection(key, starters, canEdit, collapsed)).join('');
  const reserveKey = 'substitute';
  const reserve = `<details class="roster-group role-substitute" data-squad-role-group="substitute" ${collapsed.has(reserveKey) ? '' : 'open'}>
    <summary><span class="roster-group-heading"><span class="roster-dot" aria-hidden="true"></span>الاحتياط<span class="roster-group-count">${substitutes.length}</span></span><span class="roster-group-code" aria-hidden="true">SUB</span></summary>
    <div class="roster-players">${substitutes.length ? substitutes.sort((a,b)=>squadPositionMeta(a).order-squadPositionMeta(b).order).map(p => playerCard(p, canEdit)).join('') : '<p class="roster-group-empty">لا يوجد لاعبون احتياط</p>'}</div>
  </details>`;
  const unknownStarters = unknown.filter(p => squadRole(p) === 'starter');
  return `<div class="roster-pitch-layout"><section class="roster-starters" aria-label="اللاعبون الأساسيون">
    <div class="roster-field-heading"><h4>التشكيلة الأساسية</h4><span>${starters.length} لاعب</span></div>
    <div class="roster-field" aria-label="ملعب التشكيلة"><div class="roster-field-goals" aria-hidden="true"></div>${field}</div>
    ${unknownStarters.length ? lineSection('UNK', unknownStarters, canEdit, collapsed) : ''}
  </section>${reserve}</div>`;
}
export function squadArchiveHTML(players, canEdit) {
  return players.map(p => playerCard(p, canEdit)).join('');
}
export function bindSquadPhotos(container) {
  container.querySelectorAll('.roster-avatar img').forEach(img => {
    const avatar = img.parentElement;
    const show = () => {
      if (!img.naturalWidth) return;
      avatar.classList.add('has-photo');
    };
    img.onload = show;
    img.onerror = () => { avatar.classList.remove('has-photo'); img.remove(); };
    if (img.complete) {
      if (img.naturalWidth) show();
      else img.remove();
    }
  });
}
