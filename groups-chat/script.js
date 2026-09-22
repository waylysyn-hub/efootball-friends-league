import { displayName, playerInitials, AR_LOCALE } from '../shared/locale.js';
import * as api from './api.js';
import { escapeHtml as esc, withBusy, errorMessage, toast, showError, openDialog, closeDialog, isBusy, setupDrawer, setupConnectivity, debounce } from '../shared/ui.js';

const el = id => document.getElementById(id);
const initials = playerInitials;
let currentUser = null, groups = [], invitations = [], currentGroup = null;
let messageChannel = null, inviteChannel = null;
let viewVersion = 0, dataVersion = 0;
let loadedMessages = new Map();
let messageDraft = null, groupDraftId = null;
let signingIn = false, messagesLoading = false;
const closeDrawer = setupDrawer({ sidebar: el('sidebar'), overlay: el('sidebarOverlay'), toggles: [el('chatMenuToggle')] });

function showLogin() {
  el('loginScreen').classList.remove('hidden');
  el('appRoot').classList.add('hidden');
  el('loginPassword').value = '';
  closeDrawer();
}
function clearSession() {
  viewVersion++; dataVersion++;
  currentUser = null; currentGroup = null; groups = []; invitations = [];
  loadedMessages.clear(); messageDraft = null; groupDraftId = null;
  api.chatUnsubscribe(messageChannel); api.chatUnsubscribe(inviteChannel);
  messageChannel = null; inviteChannel = null;
  el('messages').replaceChildren(); el('groupsGrid').replaceChildren(); el('invitesList').replaceChildren();
  el('messageInput').value = ''; closeDialog('createGroupModal'); showLogin();
}
async function handleLogin(event) {
  event.preventDefault();
  const username = el('loginUsername').value;
  const password = el('loginPassword');
  if (!username || !password.value) return showError(el('loginError'), "اختر حسابك وأدخل كلمة المرور.");
  return withBusy('chat-login', el('loginButton'), async () => {
    signingIn = true; el('loginError').hidden = true;
    try {
      currentUser = await api.chatLogin(username, password.value);
      password.value = ''; window.EFLAuth.remember(currentUser);
      await enterApp();
    } catch (error) { showError(el('loginError'), errorMessage(error, "تعذّر تسجيل الدخول. تحقق من حسابك وكلمة المرور ثم حاول مجددًا.")); }
    finally { signingIn = false; }
  }, "جارٍ تسجيل الدخول…");
}
async function handleLogout() {
  return withBusy('chat-logout', el('logoutBtn'), async () => {
    await window.EFLAuth.signOut(api.chatClient()); clearSession();
  }, '…');
}
async function populateLoginPlayers() {
  el('loginButton').disabled = true;
  el('loginUsername').disabled = true;
  try {
    const players = await api.chatFetchPlayers();
    el('loginUsername').innerHTML = "<option value=\"\">اختر حسابك</option>";
    players.forEach(player => {
      const option = document.createElement('option'); option.value = player.name; option.textContent = displayName(player.name);
      el('loginUsername').append(option);
    });
    el('loginUsername').value = window.EFLAuth.lastPlayer();
    el('loginButton').disabled = !players.length;
    el('loginError').hidden = true;
    if (!players.length) showError(el('loginError'), "لم يُسجّل لاعبون بعد. تواصل مع مدير الدوري.");
  } catch { showError(el('loginError'), "تعذّر تحميل اللاعبين. تحقق من اتصالك وحاول مجددًا."); }
  finally { el('loginUsername').disabled = false; }
}
function showView(name) {
  if (name !== 'chat') {
    viewVersion++; currentGroup = null; api.chatUnsubscribe(messageChannel); messageChannel = null;
  }
  document.querySelectorAll('.view').forEach(view => view.classList.toggle('active', view.id === 'view-' + name));
  document.querySelectorAll('[data-view]').forEach(link => {
    link.classList.toggle('active', link.dataset.view === name); link.setAttribute('aria-current', link.dataset.view === name ? 'page' : 'false');
  });
  closeDrawer();
}
async function enterApp() {
  el('meAvatar').textContent = initials(currentUser); el('meName').textContent = displayName(currentUser);
  el('loginScreen').classList.add('hidden'); el('appRoot').classList.remove('hidden');
  showView('groups');
  api.chatUnsubscribe(inviteChannel);
  inviteChannel = api.chatClient().channel('league-chat-invitations')
    .on('postgres_changes', { event: '*', schema: 'public', table: 'chat_invitations', filter: `invited_player=eq.${currentUser}` }, debounce(refreshAll, 300)).subscribe();
  await refreshAll();
}
async function refreshAll() {
  if (!currentUser) return;
  const ticket = ++dataVersion, player = currentUser;
  try {
    const [nextGroups, nextInvites] = await Promise.all([api.chatFetchGroups(player), api.chatFetchInvitations(player)]);
    if (ticket !== dataVersion || player !== currentUser) return;
    groups = nextGroups; invitations = nextInvites;
    if (currentGroup) {
      const fresh = groups.find(group => group.id === currentGroup.id);
      if (fresh) { currentGroup = fresh; el('chatGroupMeta').textContent = `عدد الأعضاء: ${fresh.members}`; el('memberNames').textContent = fresh.memberNames.map(displayName).join(' · '); }
    }
    renderGroups(); renderInvites(); el('chatDataError').hidden = true;
    if (currentGroup && !groups.some(group => group.id === currentGroup.id)) { showView('groups'); toast("تغيّرت صلاحية وصولك إلى هذه المجموعة.", 'warning'); }
  } catch (error) {
    if (ticket !== dataVersion) return;
    showError(el('chatDataError'), errorMessage(error, "تعذّر تحميل المحادثات. اضغط تحديث للمحاولة مجددًا."));
  }
}
function renderGroups() {
  const search = el('groupSearch').value.trim().toLowerCase();
  const list = groups.filter(group => group.name.toLowerCase().includes(search));
  el('groupsGrid').innerHTML = '';
  el('groupCount').textContent = `عدد المجموعات: ${groups.length}`;
  if (!list.length) {
    el('groupsGrid').innerHTML = `<div class="empty-inline"><h3>${search ? "لا توجد مجموعات مطابقة" : "ابدأ المحادثة"}</h3><p>${search ? "جرّب اسم مجموعة آخر." : "أنشئ مجموعة أو اقبل دعوة للدردشة مع لاعبي الدوري."}</p></div>`;
    return;
  }
  list.forEach(group => {
    const card = document.createElement('article'); card.className = 'group-card';
    card.innerHTML = `<div class="group-top"><div class="avatar group-avatar">${esc(group.emoji || '⚽')}</div><div><h2 class="group-name">${esc(group.name)}</h2><p class="members">عدد الأعضاء: ${group.members}</p></div></div>
      <p class="group-desc">${esc(group.description || "محادثة مع أصدقاء الدوري.")}</p>
      <div class="member-preview">${(group.memberNames || []).slice(0,4).map(name => `<span class="mini-avatar" title="${esc(displayName(name))}">${esc(initials(name))}</span>`).join('')}</div>
      <button type="button" class="open-btn">فتح الدردشة <span aria-hidden="true">←</span></button>`;
    card.querySelector('button').addEventListener('click', () => openChat(group));
    el('groupsGrid').append(card);
  });
}
async function openChat(group) {
  const ticket = ++viewVersion;
  currentGroup = group; loadedMessages = new Map();
  el('chatAvatar').textContent = group.emoji || '⚽';
  el('chatGroupName').textContent = group.name;
  el('chatGroupMeta').textContent = `عدد الأعضاء: ${group.members}`;
  el('memberNames').textContent = (group.memberNames || []).map(displayName).join(' · ');
  el('messageInput').value = ''; messageDraft = null;
  el('chatInviteBar').classList.remove('hidden');
  showView('chat');
  el('messages').innerHTML = "<p class=\"chat-loading loading-spinner\" role=\"status\">جارٍ تحميل المحادثة…</p>";
  el('messageError').hidden = true;
  api.chatUnsubscribe(messageChannel);
  messagesLoading = true;
  // Subscribe before fetching and deduplicate by row ID to close the initial-load gap.
  messageChannel = api.chatSubscribeMessages(group.id, row => {
    if (ticket !== viewVersion || row.group_id !== currentGroup?.id) return;
    loadedMessages.set(row.id, row);
    if (!messagesLoading) renderMessages();
  });
  try {
    const [messages, roster] = await Promise.all([api.chatFetchMessages(group.id), api.chatFetchRoster(currentUser)]);
    if (ticket !== viewVersion) return;
    messages.forEach(message => loadedMessages.set(message.id, message));
    el('loadOlder').hidden = messages.length < 100;
    el('invitePlayerSelect').innerHTML = "<option value=\"\">اختر لاعبًا لدعوته…</option>" + roster.filter(name => !group.memberNames?.includes(name)).map(name => `<option value="${esc(name)}">${esc(displayName(name))}</option>`).join('');
    messagesLoading = false; renderMessages(true);
  } catch (error) {
    if (ticket !== viewVersion) return;
    messagesLoading = false; renderMessages();
    showError(el('messageError'), errorMessage(error, "تعذّر تحميل المحادثة. افتح المجموعة مجددًا للمحاولة."));
  }
}
function orderedMessages() { return [...loadedMessages.values()].sort((a,b) => a.created_at.localeCompare(b.created_at) || a.id.localeCompare(b.id)); }
function renderMessages(forceScroll = false) {
  const box = el('messages');
  const nearBottom = box.scrollHeight - box.scrollTop - box.clientHeight < 100;
  const messages = orderedMessages();
  box.innerHTML = '';
  if (!messages.length) { box.innerHTML = "<div class=\"empty-inline\"><h3>الكلمة الأولى لك</h3><p>شارك نتيجة أو رتّب للمباراة القادمة.</p></div>"; return; }
  let day = '';
  const fragment = document.createDocumentFragment();
  for (const message of messages) {
    const date = new Date(message.created_at), label = date.toLocaleDateString(AR_LOCALE, { day:'numeric', month:'short', year:'numeric' });
    if (day !== label) { const sep = document.createElement('div'); sep.className = 'day-sep'; sep.textContent = label; fragment.append(sep); day = label; }
    const mine = message.author === currentUser;
    const row = document.createElement('div'); row.className = 'msg ' + (mine ? 'me' : 'them'); row.dataset.messageId = message.id;
    row.innerHTML = `${mine ? '' : `<span class="sender">${esc(displayName(message.author))}</span>`}<div class="bubble" dir="auto">${esc(message.body)}</div><time class="meta" datetime="${esc(message.created_at)}">${date.toLocaleTimeString(AR_LOCALE,{hour:'2-digit',minute:'2-digit'})}${mine ? " · تم الإرسال" : ''}</time>`;
    fragment.append(row);
  }
  box.append(fragment);
  if (nearBottom || forceScroll) box.scrollTop = box.scrollHeight;
}
async function sendMessage(event) {
  event.preventDefault();
  const body = el('messageInput').value.trim();
  const groupId = currentGroup?.id, author = currentUser, ticket = viewVersion;
  if (!body || !groupId || !author) return;
  if (!messageDraft || messageDraft.body !== body || messageDraft.groupId !== groupId) messageDraft = { id: crypto.randomUUID(), body, groupId };
  const draft = messageDraft;
  return withBusy('chat-send', el('sendBtn'), async () => {
    el('messageError').hidden = true;
    try {
      const message = await api.chatSendMessage(groupId, author, body, draft.id);
      if (ticket !== viewVersion) return;
      loadedMessages.set(message.id, message); renderMessages(true);
      if (el('messageInput').value.trim() === body) el('messageInput').value = '';
      messageDraft = null;
    } catch (error) { if (ticket === viewVersion) showError(el('messageError'), errorMessage(error, "لم يتأكد إرسال الرسالة. النص محفوظ؛ أعد الإرسال للمحاولة مجددًا.")); }
  }, '…');
}
function renderInvites() {
  el('invitesList').innerHTML = '';
  el('inviteBadge').textContent = invitations.length; el('inviteBadge').hidden = !invitations.length;
  el('invitesEmpty').hidden = !!invitations.length;
  for (const invitation of invitations) {
    const card = document.createElement('article'); card.className = 'invite-card';
    // A pending invite does not grant access to private group metadata under RLS.
    const group = invitation.chat_groups;
    card.innerHTML = `<div class="avatar group-avatar">${esc(group?.emoji || '✉')}</div><div class="invite-info"><h3>${esc(group?.name || "مجموعة خاصة بالدوري")}</h3><p>دعوة من ${esc(displayName(invitation.invited_by))}</p></div><div class="invite-actions"><button type="button" class="btn btn-accept">قبول</button><button type="button" class="btn btn-reject">رفض</button></div>`;
    for (const [selector, accepted] of [['.btn-accept', true], ['.btn-reject', false]]) {
      card.querySelector(selector).addEventListener('click', event => withBusy('invitation-' + invitation.id, event.currentTarget, async () => {
        await api.chatRespondInvite(invitation.id, accepted); await refreshAll();
        toast(accepted ? "تم قبول الدعوة. مجموعتك جاهزة." : "تم رفض الدعوة.");
      }));
    }
    el('invitesList').append(card);
  }
}
function applyTheme(theme) {
  const safe = theme === 'light' ? 'light' : 'dark';
  document.documentElement.dataset.theme = safe;
  el('themeToggle').textContent = safe === 'dark' ? '☼' : '☾';
  el('themeToggle').setAttribute('aria-label', safe === 'dark' ? "التبديل إلى المظهر الفاتح" : "التبديل إلى المظهر الداكن");
  try { localStorage.setItem('circle-theme', safe); } catch { /* Optional preference. */ }
}

el('loginForm').addEventListener('submit', handleLogin);
el('retryLogin').addEventListener('click', populateLoginPlayers);
el('logoutBtn').addEventListener('click', handleLogout);
el('groupSearch').addEventListener('input', renderGroups);
el('refreshChats').addEventListener('click', refreshAll);
el('backToGroups').addEventListener('click', () => showView('groups'));
el('composer').addEventListener('submit', sendMessage);
el('themeToggle').addEventListener('click', () => applyTheme(document.documentElement.dataset.theme === 'dark' ? 'light' : 'dark'));
document.querySelectorAll('[data-view]').forEach(button => button.addEventListener('click', () => { showView(button.dataset.view); refreshAll(); }));
el('createGroupBtn').addEventListener('click', () => { el('groupError').hidden = true; openDialog('createGroupModal', () => { if (!isBusy('create-group')) closeDialog('createGroupModal'); }); });
el('cancelCreateGroup').addEventListener('click', () => { if (!isBusy('create-group')) closeDialog('createGroupModal'); });
el('createGroupForm').addEventListener('submit', event => {
  event.preventDefault();
  const name = el('newGroupName').value.trim();
  if (!name || !currentUser) return;
  const player = currentUser;
  withBusy('create-group', el('saveGroupButton'), async () => {
    try {
      const group = await api.chatCreateGroup(name, el('newGroupDesc').value.trim(), el('newGroupEmoji').value.trim() || '⚽', groups.length % 6, currentUser, groupDraftId ||= crypto.randomUUID());
      if (currentUser !== player) return;
      groupDraftId = null; closeDialog('createGroupModal'); el('createGroupForm').reset();
      await refreshAll(); await openChat(groups.find(item => item.id === group.id) || { ...group, members:1, memberNames:[currentUser] });
      toast("تم إنشاء المجموعة.");
    } catch (error) { showError(el('groupError'), errorMessage(error, "تعذّر إنشاء المجموعة. حاول مجددًا.")); }
  });
});
el('sendInviteBtn').addEventListener('click', () => {
  const player = el('invitePlayerSelect').value, group = currentGroup;
  if (!player || !group) return;
  withBusy('send-invitation', el('sendInviteBtn'), async () => {
    await api.chatInvitePlayer(group.id, player, currentUser);
    if (currentGroup?.id === group.id) el('invitePlayerSelect').value = '';
    toast(`تم إرسال الدعوة إلى ${displayName(player)}.`);
  });
});
el('loadOlder').addEventListener('click', () => withBusy('load-older', el('loadOlder'), async () => {
  const ticket = viewVersion, groupId = currentGroup?.id;
  if (!groupId) return;
  const messages = await api.chatFetchMessages(groupId, orderedMessages()[0]);
  if (ticket !== viewVersion) return;
  const box = el('messages'), oldHeight = box.scrollHeight, oldTop = box.scrollTop;
  messages.forEach(message => loadedMessages.set(message.id, message)); renderMessages();
  box.scrollTop = oldTop + box.scrollHeight - oldHeight; el('loadOlder').hidden = messages.length < 100;
}, "جارٍ التحميل…"));
setupConnectivity(refreshAll);
window.addEventListener('pagehide', () => { api.chatUnsubscribe(messageChannel); api.chatUnsubscribe(inviteChannel); });

async function init() {
  let theme = 'dark'; try { theme = localStorage.getItem('circle-theme') || 'dark'; } catch { /* Optional preference. */ }
  applyTheme(theme);
  if (!api.chatClient()) { showLogin(); showError(el('loginError'), "دردشة الدوري غير متاحة مؤقتًا. حاول بعد قليل."); el('loginButton').disabled = true; return; }
  const [, restored] = await Promise.allSettled([populateLoginPlayers(), window.EFLAuth.restore(api.chatClient())]);
  if (restored.status === 'fulfilled' && restored.value) { currentUser = restored.value.name; await enterApp(); }
  else showLogin();
  const unsubscribe = window.EFLAuth.subscribe(api.chatClient(), async profile => {
    if (!profile) { clearSession(); return; }
    if (profile.name !== currentUser && !signingIn) { clearSession(); currentUser = profile.name; await enterApp(); }
  });
  window.addEventListener('pagehide', unsubscribe, { once: true });
}
init().catch(() => { showLogin(); showError(el('loginError'), "تعذّر فتح الدردشة. حدّث الصفحة."); });
