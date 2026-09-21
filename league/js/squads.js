import { sb, state } from './state.js';
import { isAdmin } from './admin.js';
import { getPlayers } from './profiles.js';
import { collectGoalEventsFromForm, renderGoalEventsForm } from './goal-events.js';
import { closeDialog, errorMessage, escapeHtml as esc, isBusy, openDialog, showError, toast, withBusy } from '../../shared/ui.js';

export const POSITIONS = { GK: 'حارس', DF: 'دفاع', MF: 'وسط', FW: 'هجوم' };
export function getSquad(owner) {
  return state.db.squads.filter(p => p.owner === owner && p.active)
    .sort((a, b) => a.name.localeCompare(b.name));
}
export function canManageSquad(owner) { return !!state.user && (isAdmin() || owner === state.user); }

export function renderSquads() {
  const select = document.getElementById('squadOwner');
  const owner = getPlayers().includes(state.selectedSquad) ? state.selectedSquad : state.user;
  state.selectedSquad = owner;
  select.innerHTML = getPlayers().map(name => `<option value="${esc(name)}">${esc(name)}</option>`).join('');
  select.value = owner || '';
  const canEdit = canManageSquad(owner) && state.squadsReady;
  document.getElementById('addSquadPlayer').hidden = !canEdit;
  document.getElementById('squadPermission').textContent = canEdit
    ? 'أضف لاعبي فريقك ليظهروا في قوائم الهدف والأسيست. إبعاد لاعب من التشكيلة لا يغيّر المباريات السابقة.'
    : 'يمكنك مشاهدة هذه التشكيلة. تعديلها متاح لصاحبها ومدير الدوري.';
  const container = document.getElementById('squadPlayers');
  if (!state.squadsReady) {
    container.innerHTML = '<div class="empty-state">التشكيلات غير متاحة حاليًا. حدّث الصفحة أو تواصل مع مدير الدوري لإكمال الإعداد.</div>';
    return;
  }
  const members = state.db.squads.filter(p => p.owner === owner)
    .sort((a, b) => Number(b.active) - Number(a.active) || a.name.localeCompare(b.name));
  document.getElementById('squadCount').textContent = `${members.filter(p => p.active).length} لاعب في التشكيلة`;
  container.innerHTML = members.length ? members.map(p => `<article class="squad-card ${p.active ? '' : 'squad-archived'}">
    <span class="squad-position">${esc(p.position)}</span>
    <div class="squad-player-name"><strong dir="auto">${esc(p.name)}</strong><span>${POSITIONS[p.position] || ''}${p.active ? '' : ' · خارج التشكيلة'}</span></div>
    ${canEdit ? `<div class="squad-actions"><button class="btn-sm" data-squad-edit="${esc(p.id)}" type="button">تعديل</button><button class="btn-sm" data-squad-toggle="${esc(p.id)}" type="button">${p.active ? 'إبعاد' : 'إعادة'}</button></div>` : ''}
  </article>`).join('') : '<div class="empty-state">التشكيلة فارغة. ابدأ بإضافة أسماء لاعبي الفريق.</div>';
  container.querySelectorAll('[data-squad-edit]').forEach(button => { button.onclick = () => openSquadPlayer(owner, button.dataset.squadEdit); });
  container.querySelectorAll('[data-squad-toggle]').forEach(button => { button.onclick = () => toggleSquadPlayer(button.dataset.squadToggle, button); });
}

export function selectSquad(owner) { state.selectedSquad = owner; renderSquads(); }
export function openSquadPlayer(owner = state.selectedSquad || state.user, id = null) {
  if (!state.squadsReady) return toast('تعذّر تحميل التشكيلات. حدّث الصفحة وحاول مجددًا.', 'error');
  if (!canManageSquad(owner)) return toast('تعديل التشكيلة متاح لصاحبها ومدير الدوري فقط.', 'error');
  const member = id ? state.db.squads.find(p => p.id === id && p.owner === owner) : null;
  if (id && !member) return;
  state.squadEditor = { owner, id, pendingId: crypto.randomUUID() };
  document.getElementById('squadPlayerTitle').textContent = `${member ? 'تعديل لاعب' : 'إضافة لاعب'} · ${owner}`;
  document.getElementById('squadPlayerName').value = member?.name || '';
  document.getElementById('squadPlayerPosition').value = member?.position || 'FW';
  document.getElementById('squadPlayerError').classList.add('hidden');
  openDialog('squadPlayerModal', closeSquadPlayer);
  document.getElementById('squadPlayerName').focus();
}
export function closeSquadPlayer() { if (!isBusy('save-squad-player')) closeDialog('squadPlayerModal'); }

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
  if (!name || name.length > 100) return showError(errorElement, 'أدخل اسم اللاعب من حرف واحد إلى 100 حرف.');
  if (!POSITIONS[position]) return showError(errorElement, 'اختر مركزًا صحيحًا للاعب.');
  const duplicate = state.db.squads.find(p => p.owner === editor.owner && p.id !== editor.id && p.name.toLowerCase() === name.toLowerCase());
  if (duplicate) return showError(errorElement, duplicate.active ? 'هذا اللاعب موجود في التشكيلة بالفعل.' : 'هذا اللاعب موجود خارج التشكيلة. استخدم «إعادة» بدل إضافته مجددًا.');
  return withBusy('save-squad-player', document.getElementById('saveSquadPlayer'), async () => {
    errorElement.classList.add('hidden');
    try {
      const id = editor.id || editor.pendingId;
      const query = editor.id
        ? sb.from('squad_players').update({ name, position }).eq('id', id).eq('owner', editor.owner)
        : sb.from('squad_players').insert({ id, owner: editor.owner, name, position, active: true });
      const { data, error } = await query.select('*');
      if (error?.code === '23505' && !editor.id) {
        const previous = await sb.from('squad_players').select('*').eq('id', id).maybeSingle();
        if (previous.error || previous.data?.owner !== editor.owner || previous.data?.name !== name || previous.data?.position !== position) throw error;
      } else if (error) throw error;
      else if (!data?.length) throw { code: '42501' };
      closeDialog('squadPlayerModal');
      try { await reloadSquads(); toast('تم حفظ اللاعب في التشكيلة.'); }
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
