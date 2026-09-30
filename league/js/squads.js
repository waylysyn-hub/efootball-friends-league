import { displayName } from '../../shared/locale.js';
import { sb, state } from './state.js';
import { isAdmin } from './admin.js';
import { getPlayers } from './profiles.js';
import { collectGoalEventsFromForm, renderGoalEventsForm } from './goal-events.js';
import { closeDialog, errorMessage, escapeHtml as esc, isBusy, openDialog, showError, toast, withBusy } from '../../shared/ui.js';
import { SQUAD_GROUPS, SQUAD_ROLES, bindSquadPhotos, filterSquadMembers, safeSquadPhoto, squadArchiveHTML, squadInitials, squadPlayersHTML, squadSummary, uniqueSquad } from './squad-view.js';
import { removeSquadPhotoObject, uploadSquadPhoto, validateSquadPhotoFile } from './squad-images.js';

export const POSITIONS = Object.fromEntries(SQUAD_GROUPS.map(g => [g.key, g.short]));
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
    ? 'أضف لاعبي فريقك ليظهروا في قوائم الهدف والأسيست. إبعاد لاعب من التشكيلة لا يغيّر المباريات السابقة.'
    : 'يمكنك مشاهدة هذه التشكيلة. تعديلها متاح لصاحبها ومدير الدوري.';
  const container = document.getElementById('squadPlayers');
  document.getElementById('squadSummary').hidden = !state.squadsReady;
  document.getElementById('squadFilters').hidden = !state.squadsReady;
  document.getElementById('squadArchive').hidden = true;
  document.getElementById('squadArchivePlayers').replaceChildren();
  if (!state.squadsReady) {
    document.getElementById('squadCount').textContent = 'تعذّر تحميل التشكيلة';
    document.getElementById('squadUpdated').textContent = 'آخر تحديث: غير متاح';
    container.innerHTML = '<div class="empty-state">التشكيلات غير متاحة حاليًا. حدّث الصفحة أو تواصل مع مدير الدوري لإكمال الإعداد.</div>';
    return;
  }
  const members = uniqueSquad(state.db.squads.filter(p => p.owner === owner));
  const active = members.filter(p => p.active), summary = squadSummary(members);
  document.getElementById('squadCount').textContent = `${summary.total} لاعب في التشكيلة`;
  const updates = members.map(p => Date.parse(p.updated_at)).filter(Number.isFinite);
  document.getElementById('squadUpdated').textContent = updates.length
    ? `آخر تحديث: ${new Intl.DateTimeFormat('ar', { dateStyle: 'medium', timeStyle: 'short' }).format(Math.max(...updates))}`
    : 'آخر تحديث: لم يُسجّل بعد';
  document.getElementById('squadSummary').innerHTML = [
    ['إجمالي اللاعبين', summary.total, 'total'], ...SQUAD_GROUPS.map(g => [g.label, summary.counts[g.key], g.key]), ['الاحتياط', summary.substitutes, 'substitute'],
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
  bindSquadPhotos(container);
}
function renderSquadMembers(active = getSquad(state.selectedSquad), canEdit = canManageSquad(state.selectedSquad) && state.squadsReady) {
  const container = document.getElementById('squadPlayers'), visible = filterSquadMembers(active, presentation);
  container.className = `roster-${presentation.view}`;
  document.getElementById('squadResults').textContent = `${visible.length} من ${active.length} لاعب`;
  container.innerHTML = !active.length ? `<div class="roster-empty"><span aria-hidden="true">＋</span><h3>لم تتم إضافة لاعبين بعد</h3><p>ابدأ ببناء فريقك، وسيأخذ كل لاعب مكانه هنا.</p>${canEdit ? '<button class="btn-primary" type="button" data-squad-add>إضافة لاعب</button>' : ''}</div>`
    : !visible.length ? '<div class="roster-empty"><h3>لا يوجد لاعب يطابق البحث</h3><button class="btn-secondary" type="button" data-squad-reset>مسح البحث والفلترة</button></div>'
      : squadPlayersHTML(visible, { view: presentation.view, sort: presentation.sort, canEdit: canEdit && presentation.editing, collapsed: presentation.collapsed });
  container.querySelector('[data-squad-add]')?.addEventListener('click', () => openSquadPlayer());
  container.querySelector('[data-squad-reset]')?.addEventListener('click', resetSquadFilters);
  container.querySelectorAll('[data-squad-group]').forEach(group => {
    group.addEventListener('toggle', () => {
      if (!group.isConnected) return;
      if (group.open) presentation.collapsed.delete(group.dataset.squadGroup); else presentation.collapsed.add(group.dataset.squadGroup);
    });
  });
  bindMemberActions(container, state.selectedSquad);
}
export function setSquadView(view) {
  if (!['pitch', 'list'].includes(view)) return;
  presentation.view = view; renderSquads();
}
export function editSquad() { presentation.editing = !presentation.editing; renderSquads(); }
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
  if (!state.squadsReady) return toast('تعذّر تحميل التشكيلات. حدّث الصفحة وحاول مجددًا.', 'error');
  if (!canManageSquad(owner)) return toast('تعديل التشكيلة متاح لصاحبها ومدير الدوري فقط.', 'error');
  const member = id ? state.db.squads.find(p => p.id === id && p.owner === owner) : null;
  if (id && !member) return;
  state.squadEditor = {
    owner, id, pendingId: crypto.randomUUID(),
    selectedPhotoFile: null, photoObjectId: null, photoRemoved: false, previewUrl: '', pendingUploadedPath: '',
    originalPhotoUrl: member?.photo_url || '', originalPhotoPath: member?.photo_path || null,
  };
  document.getElementById('squadPlayerTitle').textContent = `${member ? 'تعديل لاعب' : 'إضافة لاعب'} · ${displayName(owner)}`;
  document.getElementById('squadPlayerName').value = member?.name || '';
  document.getElementById('squadPlayerPosition').value = member && POSITIONS[member.position] ? member.position : 'UNK';
  document.getElementById('squadPlayerRole').value = member?.lineup_role === 'substitute' ? 'substitute' : 'starter';
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
  image.hidden = true;
  image.removeAttribute('src');
  if (!url) { initials.hidden = false; return; }
  image.onload = () => { image.hidden = false; initials.hidden = true; };
  image.onerror = () => { image.hidden = true; initials.hidden = false; };
  image.src = url;
}
export function selectSquadPhoto(event) {
  const editor = state.squadEditor;
  const file = event?.target?.files?.[0];
  if (!editor || !file) return;
  const validation = validateSquadPhotoFile(file);
  if (validation) {
    event.target.value = '';
    return showError(document.getElementById('squadPlayerError'), validation);
  }
  if (editor.pendingUploadedPath) { removeSquadPhotoObject(sb, editor.pendingUploadedPath).catch(() => {}); editor.pendingUploadedPath = ''; }
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
  if (!editor) return;
  if (editor.pendingUploadedPath) { removeSquadPhotoObject(sb, editor.pendingUploadedPath).catch(() => {}); editor.pendingUploadedPath = ''; }
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
  if (!editor?.selectedPhotoFile) {
    const url = safeSquadPhoto(document.getElementById('squadPlayerPhoto').value.trim());
    renderSquadPhotoPreview(url, document.getElementById('squadPlayerName').value);
  }
}
export function refreshSquadPhotoInitials() {
  const editor = state.squadEditor;
  const image = document.getElementById('squadPhotoPreviewImage');
  if (editor && image?.hidden) document.getElementById('squadPhotoInitials').textContent = squadInitials(document.getElementById('squadPlayerName').value);
}
export function closeSquadPlayer() {
  if (isBusy('save-squad-player')) return;
  const editor = state.squadEditor;
  if (editor?.pendingUploadedPath) removeSquadPhotoObject(sb, editor.pendingUploadedPath).catch(() => {});
  revokeSquadPreview();
  closeDialog('squadPlayerModal');
}

async function reloadSquads() {
  const { data, error } = await sb.from('squad_players').select('*');
  if (error) throw error;
  state.db.squads = data || [];
  if (state.page === 'squads') renderSquads();
  for (const id of ['goalEventsList', 'editGoalEventsList']) renderGoalEventsForm(id, collectGoalEventsFromForm(id));
}

export async function saveSquadPlayer() {
  const editor = state.squadEditor;
  if (!editor || !canManageSquad(editor.owner)) return;
  const errorElement = document.getElementById('squadPlayerError');
  const name = document.getElementById('squadPlayerName').value.trim();
  const position = document.getElementById('squadPlayerPosition').value;
  const lineupRole = document.getElementById('squadPlayerRole').value;
  const numberText = document.getElementById('squadPlayerNumber').value.trim();
  const ratingText = document.getElementById('squadPlayerRating').value.trim();
  const photo = document.getElementById('squadPlayerPhoto').value.trim();
  const selectedPhotoFile = editor.selectedPhotoFile;
  if (!name || name.length > 100) return showError(errorElement, 'أدخل اسم اللاعب من حرف واحد إلى 100 حرف.');
  if (!POSITIONS[position]) return showError(errorElement, 'اختر مركزًا صحيحًا للاعب.');
  if (!SQUAD_ROLES.some(role => role.key === lineupRole)) return showError(errorElement, 'اختر حالة صحيحة للاعب.');
  if (numberText && (!Number.isInteger(Number(numberText)) || Number(numberText) < 0 || Number(numberText) > 99)) return showError(errorElement, 'رقم القميص عدد صحيح بين 0 و99.');
  if (ratingText && (!Number.isFinite(Number(ratingText)) || Number(ratingText) < 0 || Number(ratingText) > 120)) return showError(errorElement, 'أدخل تقييمًا بين 0 و120.');
  if (photo && (photo.length > 2048 || !safeSquadPhoto(photo))) return showError(errorElement, 'أدخل رابط صورة صالحًا يبدأ بـ https://.');
  if (selectedPhotoFile) { const photoError = validateSquadPhotoFile(selectedPhotoFile); if (photoError) return showError(errorElement, photoError); }
  const duplicate = state.db.squads.find(p => p.owner === editor.owner && p.id !== editor.id && p.name.toLowerCase() === name.toLowerCase());
  if (duplicate) return showError(errorElement, duplicate.active ? 'هذا اللاعب موجود في التشكيلة بالفعل.' : 'هذا اللاعب موجود خارج التشكيلة. استخدم «إعادة» بدل إضافته مجددًا.');
  return withBusy('save-squad-player', document.getElementById('saveSquadPlayer'), async () => {
    errorElement.classList.add('hidden');
    try {
      const id = editor.id || editor.pendingId;
      const existing = state.db.squads.find(p => p.id === editor.id);
      const ownerPlayerId = state.db.accounts[editor.owner]?.id;
      let uploadedPhoto = null;
      let photoUrl = editor.photoRemoved ? null : (photo || editor.originalPhotoUrl || null);
      let photoPath = editor.photoRemoved ? null : (photo && photo !== editor.originalPhotoUrl ? null : editor.originalPhotoPath);
      if (selectedPhotoFile) {
        if (!ownerPlayerId) throw new Error('تعذّر تحديد صاحب التشكيلة لرفع الصورة.');
        uploadedPhoto = await uploadSquadPhoto(sb, selectedPhotoFile, ownerPlayerId, id, editor.photoObjectId);
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
      const query = editor.id
        ? sb.from('squad_players').update(values).eq('id', id).eq('owner', editor.owner)
        : sb.from('squad_players').insert({ id, owner: editor.owner, ...values, active: true });
      const { data, error } = await query.select('*');
      if (error?.code === '23505' && !editor.id) {
        const previous = await sb.from('squad_players').select('*').eq('id', id).maybeSingle();
        if (previous.error || previous.data?.owner !== editor.owner || Object.entries(values).some(([key, value]) => previous.data?.[key] !== value)) throw error;
      } else if (error) throw error;
      else if (!data?.length) throw { code: '42501' };
      const oldManagedPath = editor.originalPhotoPath;
      editor.pendingUploadedPath = '';
      revokeSquadPreview();
      closeDialog('squadPlayerModal');
      if (oldManagedPath && oldManagedPath !== metadata.photo_path) {
        removeSquadPhotoObject(sb, oldManagedPath).catch(() => {});
      }
      try { await reloadSquads(); toast(selectedPhotoFile ? 'تم حفظ اللاعب ورفع صورته.' : 'تم حفظ اللاعب في التشكيلة.'); }
      catch { toast('تم حفظ اللاعب، لكن تعذّر تحديث القائمة. اضغط تحديث قبل تسجيل المباراة.', 'error'); }
    } catch (error) {
      showError(errorElement, errorMessage(error, 'تعذّر حفظ اللاعب. بياناتك ما زالت موجودة؛ حاول مجددًا.'));
    }
  }, 'جارٍ الحفظ…');
}

export async function toggleSquadPlayer(id, button) {
  const member = state.db.squads.find(p => p.id === id);
  if (!member || !canManageSquad(member.owner)) return;
  return withBusy('squad-player-' + id, button, async () => {
    const { data, error } = await sb.from('squad_players').update({ active: !member.active }).eq('id', id).eq('owner', member.owner).select('*');
    if (error) throw error;
    if (!data?.length) throw { code: '42501' };
    try { await reloadSquads(); toast(member.active ? 'تم إبعاد اللاعب. سجله السابق محفوظ.' : 'تمت إعادة اللاعب للتشكيلة.'); }
    catch { toast('تم حفظ التغيير. اضغط تحديث لتحميل التشكيلة الجديدة.', 'error'); }
  }, 'جارٍ الحفظ…');
}
