import { fieldError, clearFieldErrors } from '../../shared/ui.js';
import { emptyCompetition, stateHTML } from './view-states.js';
import { displayName } from '../../shared/locale.js';
import { sb, state } from './state.js';
import { isAdmin } from './admin.js';
import { getPlayers } from './profiles.js';
import { collectGoalEventsFromForm, renderGoalEventsForm } from './goal-events.js';
import { closeDialog, errorMessage, escapeHtml as esc, isBusy, openDialog, showError, toast, withBusy } from '../../shared/ui.js';
import { SQUAD_GROUPS, SQUAD_POSITIONS, SQUAD_ROLES, bindSquadPhotos, filterSquadMembers, safeSquadPhoto, squadArchiveHTML, squadInitials, squadLine, squadPlayersHTML, squadRole, squadSummary, uniqueSquad } from './squad-view.js';
import { normalizeExternalSquadPhotoUrl, removeUnusedSquadPhoto, uploadSquadPhoto, validateSquadPhotoFile, verifyExternalSquadPhotoUrl } from './squad-images.js';

export const POSITIONS = Object.fromEntries(SQUAD_POSITIONS.map(position => [position.key, position.label]));
const presentation = { view: 'pitch', search: '', position: '', role: '', sort: 'position', editing: false, collapsed: new Set() };
export function getSquad(owner) {
  return uniqueSquad(state.db.squads.filter(p => p.owner === owner && p.active))
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function canManageSquad(owner) { return !!state.user && (isAdmin() || owner === state.user); }

export function renderSquads() {
  const select = document.getElementById('squadOwner');
  const owner = getPlayers().includes(state.selectedSquad) ? state.selectedSquad : state.user;
  state.selectedSquad = owner;
  select.innerHTML = getPlayers().map(name => `<option value="${esc(name)}">${esc(displayName(name))}</option>`).join('');
  select.value = owner || '';
  const canEdit = canManageSquad(owner) && state.squadsReady;
  document.getElementById('addSquadPlayer').hidden = !canEdit;
  document.getElementById('editSquad').hidden = !canEdit;
  document.getElementById('editSquad').setAttribute('aria-pressed', String(presentation.editing && canEdit));
  document.getElementById('editSquad').textContent = presentation.editing && canEdit ? 'إنهاء التعديل' : 'تعديل التشكيلة';
  document.getElementById('squadTitle').textContent = `تشكيلة ${displayName(owner || '')}`;
  document.getElementById('squadPermission').textContent = canEdit
    ? 'استخدم «إلى الاحتياط» لإبقاء اللاعب على الدكة، و«خارج التشكيلة» لاستبعاده من الأساسي والاحتياط. اختر 11 أساسيًا بالضبط؛ السجل السابق محفوظ.'
    : 'يمكنك مشاهدة هذه التشكيلة. تعديلها متاح لصاحبها ومدير الدوري.';
  const container = document.getElementById('squadPlayers');
  document.getElementById('squadSummary').hidden = !state.squadsReady;
  document.getElementById('squadFilters').hidden = !state.squadsReady;
  document.getElementById('squadArchive').hidden = true;
  document.getElementById('squadArchivePlayers').replaceChildren();
  if (!state.squadsReady) {
    document.getElementById('squadCount').textContent = 'تعذّر تحميل التشكيلة';
    document.getElementById('squadUpdated').textContent = 'آخر تحديث: غير متاح';
    const lineupStatus = document.getElementById('squadLineupStatus');
    lineupStatus.textContent = 'حالة التشكيلة الأساسية غير متاحة';
    lineupStatus.className = 'roster-lineup-status is-incomplete';
    container.innerHTML = stateHTML({ kind: 'error', title: 'تعذر تحميل التشكيلات.', description: 'أعد المحاولة أو تواصل مع مدير الدوري لإكمال الإعداد.' });
    return;
  }
  const members = uniqueSquad(state.db.squads.filter(p => p.owner === owner));
  const active = members.filter(p => p.active), summary = squadSummary(members);
  document.getElementById('squadCount').textContent = `${summary.total} لاعب · ${summary.starters}/11 أساسي`;
  const lineupStatus = document.getElementById('squadLineupStatus');
  lineupStatus.textContent = summary.complete ? 'التشكيلة الأساسية مكتملة 11/11' : `التشكيلة الأساسية غير مكتملة: ${summary.starters}/11`;
  lineupStatus.className = `roster-lineup-status ${summary.complete ? 'is-complete' : 'is-incomplete'}`;
  const updates = members.map(p => Date.parse(p.updated_at)).filter(Number.isFinite);
  document.getElementById('squadUpdated').textContent = updates.length
    ? `آخر تحديث: ${new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(Math.max(...updates))}`
    : 'آخر تحديث: لم يُسجّل بعد';
  document.getElementById('squadSummary').innerHTML = [
    ['إجمالي اللاعبين', summary.total, 'total'], ['الأساسيون', `${summary.starters}/11`, 'starter'], ...SQUAD_GROUPS.map(g => [g.label, summary.counts[g.key], g.key]), ['الاحتياط', summary.substitutes, 'substitute'],
    ...(summary.average !== null ? [['متوسط التقييم', summary.average, 'rating']] : []),
  ].map(([label, value, key]) => `<div class="roster-stat position-${key}" data-squad-stat="${key}"><strong>${value}</strong><span>${label}</span></div>`).join('');
  for (const view of ['pitch', 'list']) document.getElementById('squadView-' + view).setAttribute('aria-pressed', String(presentation.view === view));
  renderSquadMembers(active, canEdit);
  const archived = members.filter(p => !p.active);
  document.getElementById('squadArchive').hidden = !archived.length;
  document.getElementById('squadArchiveCount').textContent = archived.length;
  document.getElementById('squadArchivePlayers').innerHTML = squadArchiveHTML(archived, canEdit);
  bindMemberActions(document.getElementById('squadArchivePlayers'), owner);
}

function bindMemberActions(container, owner) {
  container.querySelectorAll('[data-squad-edit]').forEach(button => { button.onclick = () => openSquadPlayer(owner, button.dataset.squadEdit); });
  container.querySelectorAll('[data-squad-toggle]').forEach(button => { button.onclick = () => toggleSquadPlayer(button.dataset.squadToggle, button); });
  container.querySelectorAll('[data-squad-lineup]').forEach(button => { button.onclick = () => setSquadPlayerRole(button.dataset.squadLineup, button.dataset.lineupRole, button); });
  container.querySelectorAll('[data-squad-delete]').forEach(button => { button.onclick = () => requestDeleteSquadPlayer(button.dataset.squadDelete, button); });
  bindSquadPhotos(container);
}
function renderSquadMembers(active = getSquad(state.selectedSquad), canEdit = canManageSquad(state.selectedSquad) && state.squadsReady) {
  const container = document.getElementById('squadPlayers'), visible = filterSquadMembers(active, presentation);
  container.className = `roster-${presentation.view}`;
  document.getElementById('squadResults').textContent = `${visible.length} من ${active.length} لاعب`;
  container.innerHTML = !active.length ? stateHTML({ title: 'لم تتم إضافة لاعبين بعد', description: 'ابدأ ببناء فريقك، وسيأخذ كل لاعب مكانه هنا.', ...(canEdit ? { action: 'squad-add', label: 'إضافة لاعب' } : {}) }).replace('data-state-action="squad-add"', 'data-squad-add')
    : !visible.length ? stateHTML({ kind: 'filtered', action: 'squad-reset', label: 'مسح الفلاتر' }).replace('data-state-action="squad-reset"', 'data-squad-reset')
      : squadPlayersHTML(visible, { view: presentation.view, sort: presentation.sort, canEdit: canEdit && presentation.editing, canManage: canEdit, hasArchived: state.db.squads.some(p => p.owner === state.selectedSquad && !p.active), collapsed: presentation.collapsed });
  container.querySelector('[data-squad-add]')?.addEventListener('click', () => openSquadPlayer());
  container.querySelector('[data-squad-reset]')?.addEventListener('click', resetSquadFilters);
  container.querySelector('[data-squad-show-archive]')?.addEventListener('click', () => {
    const archive = document.getElementById('squadArchive');
    archive.open = true;
    archive.querySelector('summary').focus();
    archive.scrollIntoView?.({ behavior: 'smooth', block: 'start' });
  });
  container.querySelectorAll('[data-squad-group], [data-squad-role-group]').forEach(group => {
    group.addEventListener('toggle', () => {
      if (!group.isConnected) return;
      const key = group.dataset.squadGroup || group.dataset.squadRoleGroup;
      if (group.open) presentation.collapsed.delete(key); else presentation.collapsed.add(key);
    });
  });
  bindMemberActions(container, state.selectedSquad);
}
export function setSquadView(view) {
  if (!['pitch', 'list'].includes(view)) return;
  presentation.view = view; renderSquads();
}
export function editSquad() {
  if (!presentation.editing) { presentation.editing = true; return renderSquads(); }
  const summary = squadSummary(state.db.squads.filter(p => p.owner === state.selectedSquad));
  if (!summary.complete) return toast(`لا يمكن إنهاء التعديل قبل اختيار 11 لاعبًا أساسيًا بالضبط. الحالي: ${summary.starters}/11.`, 'error');
  presentation.editing = false;
  renderSquads();
}
export function filterSquad() {
  presentation.search = document.getElementById('squadSearch').value;
  presentation.position = document.getElementById('squadPositionFilter').value;
  presentation.role = document.getElementById('squadRoleFilter').value;
  presentation.sort = document.getElementById('squadSort').value;
  renderSquadMembers();
}
function resetSquadFilters() {
  presentation.search = ''; presentation.position = ''; presentation.role = '';
  document.getElementById('squadSearch').value = ''; document.getElementById('squadPositionFilter').value = ''; document.getElementById('squadRoleFilter').value = '';
  renderSquadMembers();
}
export function selectSquad(owner) {
  state.selectedSquad = owner; presentation.editing = false; presentation.collapsed.clear();
  presentation.search = ''; presentation.position = ''; presentation.role = '';
  document.getElementById('squadSearch').value = ''; document.getElementById('squadPositionFilter').value = ''; document.getElementById('squadRoleFilter').value = '';
  renderSquads();
}
export function openSquadPlayer(owner = state.selectedSquad || state.user, id = null) {
  if (isBusy('save-squad-player')) return;
  if (!state.squadsReady) return toast('تعذّر تحميل التشكيلات. حدّث الصفحة وحاول مجددًا.', 'error');
  if (!canManageSquad(owner)) return toast('تعديل التشكيلة متاح لصاحبها ومدير الدوري فقط.', 'error');
  const member = id ? state.db.squads.find(p => p.id === id && p.owner === owner) : null;
  if (id && !member) return;
  state.squadEditor = {
    owner, id, pendingId: crypto.randomUUID(),
    selectedPhotoFile: null, photoObjectId: null, photoRemoved: false, previewUrl: '', pendingUploadedPath: '', pendingUploadedPhoto: null, writeAttempted: false,
    originalPhotoUrl: member?.photo_url || '', originalPhotoPath: member?.photo_path || null,
  };
  document.getElementById('squadPlayerTitle').textContent = `${member ? 'تعديل لاعب' : 'إضافة لاعب'} · ${displayName(owner)}`;
  document.getElementById('squadPlayerName').value = member?.name || '';
  document.getElementById('squadPlayerPosition').value = member && POSITIONS[member.position] ? member.position : 'CF';
  const roleSelect = document.getElementById('squadPlayerRole');
  const starterOption = roleSelect.querySelector('option[value="starter"]');
  const starterCount = state.db.squads.filter(p => p.owner === owner && p.active && p.lineup_role !== 'substitute').length;
  starterOption.disabled = member?.active !== false && starterCount >= 11 && member?.lineup_role !== 'starter';
  roleSelect.value = member?.lineup_role === 'substitute' || starterOption.disabled ? 'substitute' : 'starter';
  document.getElementById('squadPlayerNumber').value = member?.shirt_number ?? '';
  document.getElementById('squadPlayerRating').value = member?.rating ?? '';
  document.getElementById('squadPlayerPhoto').value = member?.photo_url || '';
  document.getElementById('squadPlayerPhotoFile').value = '';
  renderSquadPhotoPreview(member?.photo_url || '', member?.name || '');
  document.getElementById('squadPlayerError').classList.add('hidden');
  openDialog('squadPlayerModal', closeSquadPlayer);
  document.getElementById('squadPlayerName').focus();
}
function revokeSquadPreview() {
  const editor = state.squadEditor;
  if (editor?.previewUrl) URL.revokeObjectURL(editor.previewUrl);
  if (editor) editor.previewUrl = '';
}
function renderSquadPhotoPreview(url = '', name = document.getElementById('squadPlayerName')?.value || '') {
  const image = document.getElementById('squadPhotoPreviewImage');
  const initials = document.getElementById('squadPhotoInitials');
  initials.textContent = squadInitials(name);
  initials.hidden = false;
  image.hidden = true;
  image.removeAttribute('src');
  if (!url) return;
  image.onload = () => { image.hidden = false; initials.hidden = true; };
  image.onerror = () => { image.hidden = true; initials.hidden = false; };
  image.src = url;
}
export function selectSquadPhoto(event) {
  const editor = state.squadEditor;
  const file = event?.target?.files?.[0];
  if (!editor || !file || isBusy('save-squad-player')) return;
  const validation = validateSquadPhotoFile(file);
  if (validation) {
    event.target.value = '';
    return showError(document.getElementById('squadPlayerError'), validation);
  }
  discardPendingPhoto(editor);
  revokeSquadPreview();
  editor.selectedPhotoFile = file;
  editor.photoObjectId = crypto.randomUUID();
  editor.photoRemoved = false;
  editor.previewUrl = URL.createObjectURL(file);
  document.getElementById('squadPlayerPhoto').value = '';
  document.getElementById('squadPlayerError').classList.add('hidden');
  renderSquadPhotoPreview(editor.previewUrl, document.getElementById('squadPlayerName').value);
}
export function clearSquadPhoto() {
  const editor = state.squadEditor;
  if (!editor || isBusy('save-squad-player')) return;
  discardPendingPhoto(editor);
  revokeSquadPreview();
  editor.selectedPhotoFile = null;
  editor.photoObjectId = null;
  editor.photoRemoved = true;
  document.getElementById('squadPlayerPhotoFile').value = '';
  document.getElementById('squadPlayerPhoto').value = '';
  renderSquadPhotoPreview('', document.getElementById('squadPlayerName').value);
}
export function previewSquadPhotoLink() {
  const editor = state.squadEditor;
  if (!editor || isBusy('save-squad-player')) return;
  const raw = document.getElementById('squadPlayerPhoto').value.trim();
  if (raw && editor.selectedPhotoFile) {
    discardPendingPhoto(editor);
    revokeSquadPreview();
    editor.selectedPhotoFile = null;
    editor.photoObjectId = null;
    document.getElementById('squadPlayerPhotoFile').value = '';
  }
  editor.photoRemoved = !raw;
  renderSquadPhotoPreview(safeSquadPhoto(raw), document.getElementById('squadPlayerName').value);
}
export function refreshSquadPhotoInitials() {
  const editor = state.squadEditor;
  const image = document.getElementById('squadPhotoPreviewImage');
  if (editor && image?.hidden) document.getElementById('squadPhotoInitials').textContent = squadInitials(document.getElementById('squadPlayerName').value);
}
export function closeSquadPlayer() {
  if (isBusy('save-squad-player')) return;
  const editor = state.squadEditor;
  if (editor) discardPendingPhoto(editor);
  revokeSquadPreview();
  state.squadEditor = null;
  closeDialog('squadPlayerModal');
}

function discardPendingPhoto(editor) {
  // A lost response does not prove the write failed. Keep its object until a
  // confirmed save can safely retire it; never remove an uncertain upload.
  if (editor.pendingUploadedPath && !editor.writeAttempted) removeUnusedSquadPhoto(sb, editor.pendingUploadedPath).catch(() => {});
  editor.pendingUploadedPath = '';
  editor.pendingUploadedPhoto = null;
}

export function clearSquadSession() {
  revokeSquadPreview();
  state.squadEditor = null;
  presentation.editing = false;
  presentation.collapsed.clear();
}

async function reloadSquads() {
  const session = state.profile;
  const { data, error } = await sb.from('squad_players').select('*');
  if (!session || state.profile !== session) return;
  if (error) throw error;
  state.db.squads = data || [];
  if (state.page === 'squads') renderSquads();
  for (const id of ['goalEventsList', 'editGoalEventsList']) renderGoalEventsForm(id, collectGoalEventsFromForm(id));
}

export async function saveSquadPlayer() {
  const editor = state.squadEditor;
  if (!editor || !canManageSquad(editor.owner) || isBusy('save-squad-player')) return;
  const session = state.profile;
  const isCurrent = () => state.profile === session && state.squadEditor === editor && canManageSquad(editor.owner);
  const errorElement = document.getElementById('squadPlayerError');
  clearFieldErrors(document.getElementById('squadPlayerForm'));
  const invalid = (id, message) => fieldError(id, message, errorElement);
  const name = document.getElementById('squadPlayerName').value.trim();
  const position = document.getElementById('squadPlayerPosition').value;
  const lineupRole = document.getElementById('squadPlayerRole').value;
  const numberText = document.getElementById('squadPlayerNumber').value.trim();
  const ratingText = document.getElementById('squadPlayerRating').value.trim();
  const photo = document.getElementById('squadPlayerPhoto').value.trim();
  const normalizedPhoto = photo ? normalizeExternalSquadPhotoUrl(photo) : '';
  const selectedPhotoFile = editor.selectedPhotoFile;
  if (!name || name.length > 100) return invalid('squadPlayerName', 'أدخل اسم اللاعب من حرف واحد إلى 100 حرف.');
  if (!POSITIONS[position]) return invalid('squadPlayerPosition', 'اختر مركزًا صحيحًا للاعب.');
  if (!SQUAD_ROLES.some(role => role.key === lineupRole)) return invalid('squadPlayerRole', 'اختر حالة صحيحة للاعب.');
  if (numberText && (!Number.isInteger(Number(numberText)) || Number(numberText) < 0 || Number(numberText) > 99)) return invalid('squadPlayerNumber', 'رقم القميص عدد صحيح بين 0 و99.');
  if (ratingText && (!Number.isFinite(Number(ratingText)) || Number(ratingText) < 0 || Number(ratingText) > 120)) return invalid('squadPlayerRating', 'أدخل تقييمًا بين 0 و120.');
  const photoChanged = photo !== editor.originalPhotoUrl;
  if (photoChanged && photo && (photo.length > 2048 || !normalizedPhoto)) return invalid('squadPlayerPhoto', 'استخدم رابط صورة مباشر يبدأ بـ https://، وليس رابط صفحة بحث أو مشاركة.');
  if (selectedPhotoFile) { const photoError = validateSquadPhotoFile(selectedPhotoFile); if (photoError) return invalid('squadPlayerPhotoFile', photoError); }
  const id = editor.id || editor.pendingId;
  const existing = state.db.squads.find(p => p.id === id);
  const startersWithoutCurrent = state.db.squads.filter(p => p.owner === editor.owner && p.active && p.id !== id && p.lineup_role !== 'substitute').length;
  if (existing?.active !== false && lineupRole === 'starter' && startersWithoutCurrent >= 11) return invalid('squadPlayerRole', 'التشكيلة الأساسية مكتملة 11/11. حوّل لاعبًا أساسيًا إلى احتياط أولًا.');
  const duplicate = state.db.squads.find(p => p.owner === editor.owner && p.id !== id && p.name.toLowerCase() === name.toLowerCase());
  if (duplicate) return invalid('squadPlayerName', duplicate.active ? 'هذا اللاعب موجود في التشكيلة بالفعل.' : 'هذا اللاعب موجود خارج التشكيلة. استخدم «إعادة» بدل إضافته مجددًا.');
  return withBusy('save-squad-player', document.getElementById('saveSquadPlayer'), async () => {
    errorElement.classList.add('hidden');
    try {
      const ownerPlayerId = state.db.accounts[editor.owner]?.id;
      let verifiedPhoto = photoChanged ? normalizedPhoto : editor.originalPhotoUrl;
      if (photoChanged && photo && !selectedPhotoFile) {
        try { verifiedPhoto = await verifyExternalSquadPhotoUrl(photo); }
        catch { if (isCurrent()) showError(errorElement, 'تعذّر عرض الصورة من الرابط. استخدم رابط صورة مباشر أو ارفع الصورة من جهازك.'); return; }
        if (!isCurrent()) return;
      }
      let photoUrl = editor.photoRemoved || (photoChanged && !photo && !selectedPhotoFile) ? null : (verifiedPhoto || null);
      let photoPath = photoUrl && !photoChanged ? editor.originalPhotoPath : null;
      if (selectedPhotoFile) {
        if (!ownerPlayerId) throw new Error('تعذّر تحديد صاحب التشكيلة لرفع الصورة.');
        const uploadedPhoto = editor.pendingUploadedPhoto || await uploadSquadPhoto(sb, selectedPhotoFile, ownerPlayerId, id, editor.photoObjectId);
        if (!isCurrent()) return;
        editor.pendingUploadedPhoto = uploadedPhoto;
        editor.pendingUploadedPath = uploadedPhoto.path;
        photoUrl = uploadedPhoto.url;
        photoPath = uploadedPhoto.path;
      }
      const metadata = {
        shirt_number: numberText ? Number(numberText) : null,
        rating: ratingText ? Number(ratingText) : null,
        photo_url: photoUrl,
        photo_path: photoPath,
      };
      const values = { name, position, lineup_role: lineupRole, ...metadata };
      const matches = row => row?.owner === editor.owner && Object.entries(values).every(([key, value]) => row[key] === value);
      let saved = false;
      const oldManagedPaths = new Set([editor.originalPhotoPath]);
      if (editor.writeAttempted) {
        const previous = await sb.from('squad_players').select('*').eq('id', id).maybeSingle();
        if (!isCurrent()) return;
        if (previous.error) throw previous.error;
        if (previous.data) {
          if (previous.data.owner !== editor.owner) throw { code: '42501' };
          editor.id = id;
          oldManagedPaths.add(previous.data.photo_path);
          saved = matches(previous.data);
        }
      }
      if (!saved) {
        editor.writeAttempted = true;
        const query = editor.id
          ? sb.from('squad_players').update(values).eq('id', id).eq('owner', editor.owner)
          : sb.from('squad_players').insert({ id, owner: editor.owner, ...values, active: true });
        try {
          const { data, error } = await query.select('*');
          if (error) throw error;
          if (!data?.length) throw { code: '42501' };
        } catch (failure) {
          if (!isCurrent()) return;
          // Reconcile a committed write whose response was lost before retrying.
          const previous = await sb.from('squad_players').select('*').eq('id', id).maybeSingle();
          if (previous.error || !matches(previous.data)) throw failure;
        }
      }
      if (!isCurrent()) return;
      editor.writeAttempted = false;
      editor.pendingUploadedPath = '';
      revokeSquadPreview();
      state.squadEditor = null;
      closeDialog('squadPlayerModal');
      for (const path of oldManagedPaths) {
        if (path && path !== metadata.photo_path) removeUnusedSquadPhoto(sb, path).catch(() => {});
      }
      try { await reloadSquads(); if (state.profile === session) toast(selectedPhotoFile ? 'تم حفظ اللاعب ورفع صورته.' : 'تم حفظ اللاعب في التشكيلة.'); }
      catch { if (state.profile === session) toast('تم حفظ اللاعب، لكن تعذّر تحديث القائمة. اضغط تحديث قبل تسجيل المباراة.', 'error'); }
    } catch (error) {
      if (!isCurrent()) return;
      const rawMessage = String(error?.message || '');
      const message = /EFL_STARTER_LIMIT/.test(rawMessage)
        ? 'لا يمكن إضافة أكثر من 11 لاعبًا أساسيًا. حوّل لاعبًا أساسيًا إلى احتياط أولًا.'
        : error?.code === '23514' && /squad_players_photo_path_check/i.test(rawMessage)
          ? 'تعذّر ربط الصورة باللاعب بسبب مسار صورة غير صالح. أعد اختيار الصورة ثم حاول الحفظ.'
          : errorMessage(error, 'تعذّر حفظ اللاعب. بياناتك ما زالت موجودة؛ حاول مجددًا.');
      showError(errorElement, message);
    }
  }, 'جارٍ الحفظ…');
}

export async function setSquadPlayerRole(id, lineupRole, button) {
  if (isBusy('save-squad-player')) return;
  const member = state.db.squads.find(p => p.id === id);
  if (!member || !state.squadsReady || !canManageSquad(member.owner) || !SQUAD_ROLES.some(role => role.key === lineupRole)) return;
  if (!POSITIONS[member.position]) {
    openSquadPlayer(member.owner, id);
    document.getElementById('squadPlayerRole').value = lineupRole;
    return toast('حدّد مركز اللاعب واحفظه، ثم انقله إلى الأساسي أو الاحتياط.', 'error');
  }
  const starters = state.db.squads.filter(p => p.owner === member.owner && p.active && p.id !== id && squadRole(p) === 'starter').length;
  if (lineupRole === 'starter' && starters >= 11) return toast('الأساسيون مكتملون 11/11. انقل لاعبًا إلى الاحتياط أولًا.', 'error');
  const session = state.profile;
  const targetLabel = lineupRole === 'substitute' ? 'الاحتياط' : 'التشكيلة الأساسية';
  const isCurrent = () => !!session && state.profile === session && canManageSquad(member.owner);
  return withBusy('squad-player-' + id, button, async () => {
    try {
      // A bench player remains active. Update the same identity without touching photos or history.
      const { data, error } = await sb.from('squad_players').update({ lineup_role: lineupRole, active: true }).eq('id', id).eq('owner', member.owner).select('*');
      if (!isCurrent()) return;
      if (error) throw error;
      if (!data?.length) throw { code: '42501' };
      try {
        await reloadSquads();
        if (!isCurrent()) return;
        if (state.page === 'squads' && state.selectedSquad === member.owner) {
          presentation.collapsed.delete('substitute');
          presentation.collapsed.delete(squadLine(member));
          resetSquadFilters();
          const card = [...document.querySelectorAll('#squadPlayers [data-squad-player]')].find(el => el.dataset.squadPlayer === id);
          card?.scrollIntoView?.({ behavior: 'smooth', block: 'nearest' });
        }
        toast(`تم نقل «${member.name}» إلى ${targetLabel}.`);
      } catch {
        if (isCurrent()) toast(`تم النقل إلى ${targetLabel}، لكن تعذّر تحديث القائمة. حدّث الصفحة لعرض التغيير.`, 'error');
      }
    } catch (error) {
      if (!isCurrent()) return;
      toast(/EFL_STARTER_LIMIT/.test(String(error?.message || ''))
        ? 'الأساسيون مكتملون 11/11. انقل لاعبًا إلى الاحتياط أولًا.'
        : errorMessage(error, 'تعذّر نقل اللاعب. حاول مجددًا.'), 'error');
    }
  }, 'جارٍ النقل…');
}

export async function toggleSquadPlayer(id, button) {
  const member = state.db.squads.find(p => p.id === id);
  if (!member || !canManageSquad(member.owner)) return;
  if (!member.active && !POSITIONS[member.position]) {
    toast('حدّد مركز eFootball للاعب قبل إعادته إلى التشكيلة.', 'error');
    return openSquadPlayer(member.owner, member.id);
  }
  if (!member.active && member.lineup_role !== 'substitute') {
    const starters = state.db.squads.filter(p => p.owner === member.owner && p.active && p.lineup_role !== 'substitute').length;
    if (starters >= 11) return toast('الأساسيون مكتملون 11/11. عدّل هذا اللاعب إلى «احتياط» قبل إعادته.', 'error');
  }
  return withBusy('squad-player-' + id, button, async () => {
    const { data, error } = await sb.from('squad_players').update({ active: !member.active }).eq('id', id).eq('owner', member.owner).select('*');
    if (error) {
      if (/EFL_STARTER_LIMIT/.test(String(error.message || ''))) return toast('لا يمكن أن يتجاوز الأساسيون 11 لاعبًا.', 'error');
      throw error;
    }
    if (!data?.length) throw { code: '42501' };
    try { await reloadSquads(); toast(member.active ? 'تم نقل اللاعب خارج التشكيلة؛ لن يظهر ضمن الأساسي أو الاحتياط. سجله السابق محفوظ.' : 'تمت إعادة اللاعب للتشكيلة.'); }
    catch { toast('تم حفظ التغيير. اضغط تحديث لتحميل التشكيلة الجديدة.', 'error'); }
  }, 'جارٍ الحفظ…');
}

export function requestDeleteSquadPlayer(id, button) {
  const member = state.db.squads.find(p => p.id === id);
  if (!member || !canManageSquad(member.owner)) return;
  document.getElementById('confirmTitle').textContent = 'حذف اللاعب نهائيًا';
  document.getElementById('confirmMessage').textContent = `هل تريد حذف «${member.name}» نهائيًا؟ إذا كان له هدف أو أسيست في مباراة سابقة فلن يسمح النظام بالحذف، واستخدم «إبعاد» بدلًا منه.`;
  const confirm = document.getElementById('confirmYes');
  confirm.textContent = 'حذف نهائي';
  confirm.onclick = async () => {
    if (isBusy('delete-squad-player-' + id)) return;
    await withBusy('delete-squad-player-' + id, confirm, async () => {
      const { data, error } = await sb.rpc('delete_squad_player', { target: id });
      if (error) {
        if (/EFL_SQUAD_PLAYER_HISTORY/.test(String(error.message || ''))) {
          closeDialog('confirmModal');
          return toast('لا يمكن حذف هذا اللاعب نهائيًا لأن له هدفًا أو أسيست محفوظًا في السجل. استخدم «إبعاد».', 'error');
        }
        throw error;
      }
      closeDialog('confirmModal');
      if (data) removeUnusedSquadPhoto(sb, data).catch(() => {});
      try { await reloadSquads(); toast('تم حذف اللاعب نهائيًا.'); }
      catch { toast('تم الحذف، لكن تعذّر تحديث القائمة. اضغط تحديث.', 'error'); }
    }, 'جارٍ الحذف…');
  };
  openDialog('confirmModal');
  confirm.focus();
}
